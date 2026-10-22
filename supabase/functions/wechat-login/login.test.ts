// Run: deno test supabase/functions/wechat-login/   (or: npx deno test …)
// WeChat and Supabase Auth are replaced by a fake fetch that records every call.
import assert from 'node:assert/strict';
import { accountEmail, DEFAULT_NAME, handle, LoginError, wechatLogin, type Config } from './login.ts';

const cfg: Config = {
  appId: 'wxAPPID', appSecret: 'APPSECRET', supabaseUrl: 'https://proj.supabase.co',
  serviceKey: 'SERVICE', anonKey: 'ANON',
};
const CODE = '0a3Bc4dE5fG6hI7jK8lM9nO0pQ1rS2tU';
const SESSION = {
  access_token: 'AT', refresh_token: 'RT', token_type: 'bearer', expires_in: 3600, expires_at: 2000000000,
  user: { id: 'user-1', email: 'x' },
};

type Call = { url: string; method: string; headers: Record<string, string>; body: any };

// answers: path → (call) => [status, body]
function fakeFetch(answers: Record<string, (c: Call) => [number, unknown]>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const call: Call = {
      url, method: init?.method || 'GET', headers: (init?.headers || {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    const key = Object.keys(answers).find((k) => url.includes(k));
    if (!key) throw new Error('unexpected fetch ' + url);
    const [status, body] = answers[key](call);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fn, calls };
}

const wechatOk = (): [number, unknown] => [200, '{"session_key":"SK","openid":"oAbC-123_xYz"}'];
const happy = (overrides: Record<string, (c: Call) => [number, unknown]> = {}) => fakeFetch({
  'api.weixin.qq.com/sns/jscode2session': wechatOk,
  '/auth/v1/admin/users': () => [200, { id: 'user-1' }],
  '/auth/v1/admin/generate_link': () => [200, { id: 'user-1', hashed_token: 'HASH', verification_type: 'magiclink' }],
  '/auth/v1/verify': () => [200, SESSION],
  ...overrides,
});

Deno.test('first visit makes a non-guest account and returns a session', async () => {
  const { fn, calls } = happy();
  const out = await wechatLogin(CODE, cfg, fn);
  assert.deepEqual(out, {
    access_token: 'AT', refresh_token: 'RT', token_type: 'bearer', expires_in: 3600, expires_at: 2000000000,
    user: { id: 'user-1' }, is_new: true,
  });
  assert.equal(calls.length, 4);

  // WeChat gets the AppID, AppSecret and code
  const wx = new URL(calls[0].url);
  assert.equal(wx.searchParams.get('appid'), 'wxAPPID');
  assert.equal(wx.searchParams.get('secret'), 'APPSECRET');
  assert.equal(wx.searchParams.get('js_code'), CODE);
  assert.equal(wx.searchParams.get('grant_type'), 'authorization_code');

  // The account: made-up confirmed email, the default nickname, made with the service key
  const email = await accountEmail('oAbC-123_xYz');
  const [, create, link, verify] = calls;
  assert.equal(create.method, 'POST');
  assert.deepEqual(create.body, {
    email, email_confirm: true, user_metadata: { display_name: DEFAULT_NAME }, app_metadata: { wechat: true },
  });
  assert.equal(create.headers.apikey, 'SERVICE');
  assert.equal(create.headers.Authorization, 'Bearer SERVICE');
  assert.deepEqual(link.body, { type: 'magiclink', email, data: { display_name: DEFAULT_NAME } });
  assert.equal(link.headers.Authorization, 'Bearer SERVICE');

  // The token is exchanged with the public key, like any other sign-in
  assert.equal(verify.url, 'https://proj.supabase.co/auth/v1/verify');
  assert.deepEqual(verify.body, { type: 'magiclink', token_hash: 'HASH' });
  assert.equal(verify.headers.apikey, 'ANON');
  assert.equal(verify.headers.Authorization, undefined);

  // Neither the AppSecret nor the openid is sent to Supabase
  for (const c of calls.slice(1)) {
    const text = JSON.stringify(c);
    assert.ok(!text.includes('APPSECRET') && !text.includes('oAbC-123_xYz'), c.url);
  }
});

Deno.test('returning visit signs in to the same account', async () => {
  const { fn, calls } = happy({
    '/auth/v1/admin/users': () => [422, { code: 'email_exists', msg: 'A user with this email address has already been registered' }],
  });
  const out = await wechatLogin(CODE, cfg, fn);
  assert.equal(out.is_new, false);
  assert.equal(out.access_token, 'AT');
  assert.equal(calls[2].body.email, await accountEmail('oAbC-123_xYz'));
});

Deno.test('older Auth versions say "already registered" without a code', async () => {
  const { fn } = happy({ '/auth/v1/admin/users': () => [422, { msg: 'already registered' }] });
  assert.equal((await wechatLogin(CODE, cfg, fn)).is_new, false);
});

Deno.test('a link that had to make the account again is verified as a signup', async () => {
  const { fn, calls } = happy({
    '/auth/v1/admin/generate_link': () => [200, { hashed_token: 'H2', verification_type: 'signup' }],
  });
  await wechatLogin(CODE, cfg, fn);
  assert.deepEqual(calls[3].body, { type: 'signup', token_hash: 'H2' });
});

Deno.test('the email is stable, lowercase, never deliverable, and tells openids apart by case', async () => {
  const a = await accountEmail('oAbC-123_xYz');
  assert.equal(a, await accountEmail('oAbC-123_xYz'));
  assert.match(a, /^wx-[0-9a-f]{40}@wechat\.invalid$/);
  assert.notEqual(a, await accountEmail('oabc-123_xyz'));
});

Deno.test('a bad code never reaches WeChat', async () => {
  for (const code of ['', 'short', 'a'.repeat(200), 'abc def ghi jkl', '../../etc/passwd']) {
    const { fn, calls } = happy();
    await assert.rejects(wechatLogin(code, cfg, fn), (e: LoginError) => e.status === 400 && e.code === 'bad_code');
    assert.equal(calls.length, 0);
  }
});

Deno.test('WeChat errors stop before Supabase, with a fitting status', async () => {
  const cases: [number, number][] = [[40029, 401], [40163, 401], [40226, 401], [45011, 429], [-1, 502]];
  for (const [errcode, status] of cases) {
    const { fn, calls } = happy({
      'api.weixin.qq.com/sns/jscode2session': () => [200, JSON.stringify({ errcode, errmsg: 'nope' })],
    });
    await assert.rejects(wechatLogin(CODE, cfg, fn),
      (e: LoginError) => e.status === status && e.code === `wechat_${errcode}` && e.message.includes(String(errcode)));
    assert.equal(calls.length, 1);
  }
  const { fn } = happy({ 'api.weixin.qq.com/sns/jscode2session': () => [502, '<html>bad gateway</html>'] });
  await assert.rejects(wechatLogin(CODE, cfg, fn), (e: LoginError) => e.code === 'wechat_unavailable');
});

Deno.test('Supabase Auth failures are reported, not turned into a session', async () => {
  const create = happy({ '/auth/v1/admin/users': () => [500, { msg: 'Database error creating new user' }] });
  await assert.rejects(wechatLogin(CODE, cfg, create.fn), (e: LoginError) => e.code === 'create_failed' && /Database error/.test(e.message));
  assert.equal(create.calls.length, 2);

  const link = happy({ '/auth/v1/admin/generate_link': () => [200, {}] });
  await assert.rejects(wechatLogin(CODE, cfg, link.fn), (e: LoginError) => e.code === 'link_failed');

  const verify = happy({ '/auth/v1/verify': () => [403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }] });
  await assert.rejects(wechatLogin(CODE, cfg, verify.fn), (e: LoginError) => e.code === 'verify_failed' && /expired/.test(e.message));
});

// ---------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------
const env = (extra: Record<string, string> = {}) => (name: string) => ({
  WECHAT_APPID: 'wxAPPID', WECHAT_APPSECRET: 'APPSECRET', SUPABASE_URL: 'https://proj.supabase.co/',
  SUPABASE_SERVICE_ROLE_KEY: 'SERVICE', SUPABASE_ANON_KEY: 'ANON', ...extra,
} as Record<string, string>)[name];
const post = (body: string) => new Request('https://x/functions/v1/wechat-login', { method: 'POST', body });

Deno.test('handler: POST { code } → session JSON', async () => {
  const { fn, calls } = happy();
  const res = await handle(post(JSON.stringify({ code: CODE })), env(), fn);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  const body = await res.json();
  assert.equal(body.refresh_token, 'RT');
  assert.equal(body.is_new, true);
  assert.ok(calls[1].url.startsWith('https://proj.supabase.co/auth/v1/'), 'trailing slash on SUPABASE_URL is dropped');
});

Deno.test('handler: preflight, wrong method, bad JSON, missing secrets, WeChat error', async () => {
  const { fn } = happy();
  assert.equal((await handle(new Request('https://x', { method: 'OPTIONS' }), env(), fn)).status, 200);
  assert.equal((await handle(new Request('https://x'), env(), fn)).status, 405);

  const bad = await handle(post('not json'), env(), fn);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'bad_code');

  const unset = await handle(post(JSON.stringify({ code: CODE })), env({ WECHAT_APPSECRET: '' }), fn);
  assert.equal(unset.status, 500);
  assert.equal((await unset.json()).code, 'not_configured');

  const used = happy({ 'api.weixin.qq.com/sns/jscode2session': () => [200, '{"errcode":40163,"errmsg":"code been used"}'] });
  const res = await handle(post(JSON.stringify({ code: CODE })), env(), used.fn);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'WeChat: code been used (40163)', code: 'wechat_40163' });
});

Deno.test('handler: unexpected errors are hidden from the caller', async () => {
  const boom = (() => { throw new Error('socket hang up'); }) as unknown as typeof fetch;
  const orig = console.error;
  console.error = () => {};
  try {
    const res = await handle(post(JSON.stringify({ code: CODE })), env(), boom);
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'Login failed', code: 'login_failed' });
  } finally {
    console.error = orig;
  }
});
