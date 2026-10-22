// A small Supabase client for the mini program. supabase-js needs fetch, which mini programs
// don't have, so this talks to the same REST (PostgREST) and RPC endpoints with wx.request, or,
// when config.CLOUD_ENV is set, through the "supabase" cloud function (cloudfunctions/supabase),
// since a released mini program may only call addresses with an ICP filing, and supabase.co has none.
// Signing in: wx.login() → the wechat-login Edge Function → a normal Supabase session, kept in
// storage and refreshed like supabase-js does. Row Level Security applies exactly as on the web.
// wx.request has no PATCH, so rows are changed with upsert (POST) or an RPC instead of update.
const config = require('../config');

const BASE = config.SUPABASE_URL.replace(/\/+$/, '');
const ANON = config.SUPABASE_ANON_KEY;
const KEY = 'sm.session';
const EARLY = 60;   // refresh this many seconds before the token expires

class ApiError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.status = status;   // HTTP status, 0 = no answer (offline, blocked domain…)
    this.code = code;       // PostgREST / Postgres / function error code
  }
}

function http({ url, method = 'GET', data, header = {} }) {
  header = { apikey: ANON, 'Content-Type': 'application/json', ...header };
  if (config.CLOUD_ENV) return viaCloud(url.slice(BASE.length), method, data, header);
  return new Promise((resolve, reject) => {
    wx.request({
      url, method, data, header,
      success: resolve,
      fail: (err) => reject(new ApiError((err && err.errMsg) || 'request:fail', 0, 'network')),
    });
  });
}

// The same request, sent by the cloud function; it answers { statusCode, data } like wx.request
let cloudReady = false;
function viaCloud(path, method, data, header) {
  if (!cloudReady) {
    wx.cloud.init({ env: config.CLOUD_ENV, traceUser: false });
    cloudReady = true;
  }
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'supabase',
      data: { path, method, header, ...(data === undefined ? {} : { data }) },
      success: ({ result }) => {
        const res = result || {};
        if (!res.statusCode) {
          reject(new ApiError((res.data && res.data.message) || 'Supabase could not be reached', 0, 'network'));
        } else {
          resolve({ statusCode: res.statusCode, data: res.data === undefined ? '' : res.data });
        }
      },
      fail: (err) => reject(new ApiError((err && err.errMsg) || 'cloud.callFunction:fail', 0, 'network')),
    });
  });
}
function errorFrom(res) {
  const d = res.data && typeof res.data === 'object' ? res.data : {};
  const msg = d.message || d.msg || d.error_description || d.error || (typeof res.data === 'string' && res.data) || `HTTP ${res.statusCode}`;
  return new ApiError(String(msg), res.statusCode, d.code || d.error_code || '');
}
const now = () => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------
let session = null;
try { session = wx.getStorageSync(KEY) || null; } catch (e) { session = null; }
let renewing = null;   // one sign-in / refresh at a time; everyone else waits for it

function save(s) {
  session = s ? {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at || now() + Number(s.expires_in || 3600),
    user: { id: s.user && s.user.id },
  } : null;
  try {
    if (session) wx.setStorageSync(KEY, session); else wx.removeStorageSync(KEY);
  } catch (e) { /* storage full: the session still works until the app closes */ }
  return session;
}

function wxLogin() {
  return new Promise((resolve, reject) => wx.login({
    success: (r) => (r.code ? resolve(r.code) : reject(new ApiError('wx.login gave no code', 0, 'wx_login'))),
    fail: (err) => reject(new ApiError((err && err.errMsg) || 'wx.login:fail', 0, 'wx_login')),
  }));
}

// WeChat identity → session (the account is made on the first visit)
async function signIn() {
  const code = await wxLogin();
  const res = await http({
    url: `${BASE}/functions/v1/wechat-login`, method: 'POST', data: { code },
    header: { Authorization: `Bearer ${ANON}` },
  });
  if (res.statusCode !== 200 || !res.data || !res.data.access_token) throw errorFrom(res);
  lastLoginNew = !!res.data.is_new;
  return save(res.data);
}
let lastLoginNew = false;

async function refresh() {
  const res = await http({
    url: `${BASE}/auth/v1/token?grant_type=refresh_token`, method: 'POST',
    data: { refresh_token: session.refresh_token },
  });
  if (res.statusCode !== 200 || !res.data || !res.data.access_token) throw errorFrom(res);
  return save(res.data);
}

// Refresh, or sign in again when the refresh token is no longer good (never when just offline)
function renew() {
  if (!renewing) {
    renewing = (async () => {
      if (!session) return signIn();
      try {
        return await refresh();
      } catch (err) {
        if (err.status === 0) throw err;
        save(null);
        return signIn();
      }
    })();
    renewing.then(() => { renewing = null; }, () => { renewing = null; });
  }
  return renewing;
}

async function getSession() {
  if (renewing) await renewing;
  if (!session || session.expires_at - EARLY <= now()) await renew();
  return session;
}

// ---------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------
async function rest(method, path, { body, prefer } = {}, retried = false) {
  const s = await getSession();
  const res = await http({
    url: `${BASE}/rest/v1/${path}`, method, data: body,
    header: { Authorization: `Bearer ${s.access_token}`, ...(prefer ? { Prefer: prefer } : {}) },
  });
  // Token expired early or was revoked: renew once and try again
  if (res.statusCode === 401 && !retried) {
    if (session && session.access_token === s.access_token) session.expires_at = 0;
    return rest(method, path, { body, prefer }, true);
  }
  if (res.statusCode >= 400) throw errorFrom(res);
  return res.statusCode === 204 || res.data === '' ? null : res.data;
}

const enc = encodeURIComponent;

// supabase-js style query: await from('events').select('*').eq('org_id', 1).order('starts_at')
class Query {
  constructor(table) {
    this.table = table;
    this.params = [];
    this.orders = [];
    this.method = 'GET';
    this.body = undefined;
    this.prefer = [];
    this.one = false;
  }
  select(cols = '*') {
    this.params.push(['select', String(cols).replace(/\s+/g, '')]);
    if (this.method !== 'GET') this.prefer.push('return=representation');
    return this;
  }
  filter(col, op, value) { this.params.push([col, `${op}.${value}`]); return this; }
  eq(col, v) { return this.filter(col, 'eq', v); }
  neq(col, v) { return this.filter(col, 'neq', v); }
  gt(col, v) { return this.filter(col, 'gt', v); }
  gte(col, v) { return this.filter(col, 'gte', v); }
  lt(col, v) { return this.filter(col, 'lt', v); }
  lte(col, v) { return this.filter(col, 'lte', v); }
  is(col, v) { return this.filter(col, 'is', v === null ? 'null' : v); }
  in(col, values) {
    const list = values.map((v) => (typeof v === 'number' ? v : `"${String(v).replace(/"/g, '\\"')}"`));
    return this.filter(col, 'in', `(${list.join(',')})`);
  }
  or(expr) { this.params.push(['or', `(${expr})`]); return this; }
  order(col, { ascending = true } = {}) { this.orders.push(`${col}.${ascending ? 'asc' : 'desc'}`); return this; }
  limit(n) { this.params.push(['limit', n]); return this; }
  insert(row) { this.method = 'POST'; this.body = row; return this; }
  // Insert, or change the row with the same key (only the columns given)
  upsert(row, { onConflict } = {}) {
    this.method = 'POST';
    this.body = row;
    this.prefer.push('resolution=merge-duplicates');
    if (onConflict) this.params.push(['on_conflict', onConflict]);
    return this;
  }
  delete() { this.method = 'DELETE'; return this; }
  // First row or null (instead of a list)
  maybeSingle() { this.one = true; return this; }
  path() {
    const params = this.orders.length ? [...this.params, ['order', this.orders.join(',')]] : this.params;
    const q = params.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
    return this.table + (q ? `?${q}` : '');
  }
  run() {
    const prefer = this.method === 'GET' ? '' : (this.prefer.length ? this.prefer : ['return=minimal']).join(',');
    return rest(this.method, this.path(), { body: this.body, prefer })
      .then((rows) => (this.one ? (Array.isArray(rows) ? rows[0] ?? null : rows) : rows));
  }
  then(resolve, reject) { return this.run().then(resolve, reject); }
  catch(reject) { return this.run().catch(reject); }
  finally(fn) { return this.run().finally(fn); }
}

module.exports = {
  ApiError,
  from: (table) => new Query(table),
  rpc: (fn, args = {}) => rest('POST', `rpc/${fn}`, { body: args }),
  // Signed-in user's id, signing in first if needed
  async userId() { return (await getSession()).user.id; },
  getSession,
  wasNewAccount: () => lastLoginNew,
  signOut() { save(null); },
};
