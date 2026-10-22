// Sign in from the WeChat mini program: a wx.login() code → a Supabase session for the ShareMap
// account tied to that WeChat user (made on their first visit). There is no email or password:
// the account's email is made up from the openid and ends in .invalid, which Supabase never sends
// mail to, and the session comes from a one-time magic-link token that is used right away.
// These accounts are full members, not guests (guests are the web's anonymous sign-ins).

// WeChat's own name for someone who hasn't picked one; the mini program asks for a nickname
export const DEFAULT_NAME = '微信用户';
export const EMAIL_DOMAIN = 'wechat.invalid';

export type Config = {
  appId: string;
  appSecret: string;
  supabaseUrl: string;
  serviceKey: string;   // service role: creates the account and its one-time token
  anonKey: string;      // public key: exchanges the token for a session, like any sign-in
};

export type LoginResult = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: { id: string };
  is_new: boolean;      // the account was made just now
};

export class LoginError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'login_failed') {
    super(message);
  }
}

type Fetch = typeof fetch;

// wx.login codes are 32 letters and digits; anything else never reaches WeChat
const CODE = /^[A-Za-z0-9_-]{8,128}$/;

// The openid is case-sensitive and emails are not, so the address uses a hash of it
export async function accountEmail(openid: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(openid));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `wx-${hex.slice(0, 40)}@${EMAIL_DOMAIN}`;
}

// code → openid (WeChat's id for this user in this mini program)
export async function codeToOpenid(code: string, cfg: Config, fetchFn: Fetch = fetch): Promise<string> {
  const q = new URLSearchParams({
    appid: cfg.appId, secret: cfg.appSecret, js_code: code, grant_type: 'authorization_code',
  });
  const res = await fetchFn(`https://api.weixin.qq.com/sns/jscode2session?${q}`);
  let body: { openid?: string; errcode?: number; errmsg?: string };
  try {
    body = JSON.parse(await res.text());   // JSON, but sent as text/plain
  } catch {
    throw new LoginError(`WeChat answered ${res.status}`, 502, 'wechat_unavailable');
  }
  if (body.errcode) {
    // 40029 invalid code, 40163 code already used, 40226 account blocked as high-risk, 45011 too many tries
    const status = body.errcode === 45011 ? 429 : [40029, 40163, 40226].includes(body.errcode) ? 401 : 502;
    throw new LoginError(`WeChat: ${body.errmsg || 'error'} (${body.errcode})`, status, `wechat_${body.errcode}`);
  }
  if (!body.openid) throw new LoginError('WeChat sent no openid', 502, 'wechat_no_openid');
  return body.openid;
}

async function authCall(cfg: Config, fetchFn: Fetch, path: string, body: unknown, admin = true) {
  const key = admin ? cfg.serviceKey : cfg.anonKey;
  const res = await fetchFn(`${cfg.supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: key, ...(admin ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const authMessage = (data: Record<string, unknown>) =>
  String(data?.msg || data?.message || data?.error_description || data?.error || 'error');

export async function wechatLogin(code: string, cfg: Config, fetchFn: Fetch = fetch): Promise<LoginResult> {
  if (!CODE.test(code)) throw new LoginError('Send the code from wx.login()', 400, 'bad_code');
  const openid = await codeToOpenid(code, cfg, fetchFn);
  const email = await accountEmail(openid);

  // First visit: make the account. Afterwards this answers "already registered", which is fine.
  const made = await authCall(cfg, fetchFn, 'admin/users', {
    email, email_confirm: true,
    user_metadata: { display_name: DEFAULT_NAME },
    app_metadata: { wechat: true },
  });
  const exists = made.status === 422 || made.data?.code === 'email_exists';
  if (made.status !== 200 && !exists) {
    throw new LoginError(`Could not create the account: ${authMessage(made.data)}`, 502, 'create_failed');
  }

  // A one-time token for the account (no email is sent), exchanged for a session straight away
  const link = await authCall(cfg, fetchFn, 'admin/generate_link', {
    type: 'magiclink', email, data: { display_name: DEFAULT_NAME },
  });
  if (link.status !== 200 || !link.data?.hashed_token) {
    throw new LoginError(`Could not sign in: ${authMessage(link.data)}`, 502, 'link_failed');
  }
  const session = await authCall(cfg, fetchFn, 'verify', {
    // 'signup' only if the account vanished in between and the link made it again
    type: link.data.verification_type || 'magiclink', token_hash: link.data.hashed_token,
  }, false);
  if (session.status !== 200 || !session.data?.access_token) {
    throw new LoginError(`Could not sign in: ${authMessage(session.data)}`, 502, 'verify_failed');
  }
  const s = session.data;
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    token_type: s.token_type || 'bearer',
    expires_in: s.expires_in,
    expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + Number(s.expires_in || 3600),
    user: { id: s.user?.id },
    is_new: !exists,
  };
}

// ---------------------------------------------------------------------
// HTTP: POST { code } → the session above, or { error, code } with a status
// ---------------------------------------------------------------------
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export async function handle(req: Request, env: (name: string) => string | undefined, fetchFn: Fetch = fetch) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const cfg: Config = {
    appId: env('WECHAT_APPID') || '',
    appSecret: env('WECHAT_APPSECRET') || '',
    supabaseUrl: (env('SUPABASE_URL') || '').replace(/\/+$/, ''),
    serviceKey: env('SUPABASE_SERVICE_ROLE_KEY') || '',
    anonKey: env('SUPABASE_ANON_KEY') || '',
  };
  if (!cfg.appId || !cfg.appSecret) {
    return json({ error: 'Set the WECHAT_APPID and WECHAT_APPSECRET secrets', code: 'not_configured' }, 500);
  }
  let code = '';
  try {
    code = String((await req.json())?.code || '').trim();
  } catch {
    return json({ error: 'Send JSON: { "code": "…" }', code: 'bad_code' }, 400);
  }
  try {
    return json(await wechatLogin(code, cfg, fetchFn));
  } catch (err) {
    if (err instanceof LoginError) return json({ error: err.message, code: err.code }, err.status);
    console.error(err);
    return json({ error: 'Login failed', code: 'login_failed' }, 500);
  }
}
