// node --test miniprogram/test/
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const { fakeWx, load } = require('./helpers');

const BASE = config.SUPABASE_URL;
const now = () => Math.floor(Date.now() / 1000);
const session = (n, extra = {}) => ({
  access_token: `AT${n}`, refresh_token: `RT${n}`, token_type: 'bearer', expires_in: 3600,
  expires_at: now() + 3600, user: { id: 'u1' }, ...extra,
});
const path = (url) => url.slice(BASE.length);

// Function login → AT1, refresh → AT<n>, REST answers with the token it saw
function server({ login = () => ({ statusCode: 200, data: { ...session(1), is_new: true } }), refresh, rest } = {}) {
  let refreshed = 1;
  return (req) => {
    if (req.url.endsWith('/functions/v1/wechat-login')) return login(req);
    if (req.url.includes('/auth/v1/token?grant_type=refresh_token')) {
      return refresh ? refresh(req) : { statusCode: 200, data: session(++refreshed) };
    }
    if (req.url.includes('/rest/v1/')) {
      return rest ? rest(req) : { statusCode: 200, data: [{ token: req.header.Authorization }] };
    }
    return { statusCode: 404, data: {} };
  };
}

test('first request signs in with the wx.login code and keeps the session', async () => {
  const wx = fakeWx({ routes: server() });
  const sb = load('utils/supabase.js', wx);
  const rows = await sb.from('places').select('*').eq('org_id', 7);
  assert.deepEqual(rows, [{ token: 'Bearer AT1' }]);

  const [login, get] = wx.calls;
  assert.equal(login.url, `${BASE}/functions/v1/wechat-login`);
  assert.equal(login.method, 'POST');
  assert.deepEqual(login.data, { code: 'CODE1' });
  assert.equal(login.header.apikey, config.SUPABASE_ANON_KEY);
  assert.equal(login.header.Authorization, `Bearer ${config.SUPABASE_ANON_KEY}`);
  assert.equal(path(get.url), '/rest/v1/places?select=*&org_id=eq.7');
  assert.equal(get.method, 'GET');
  assert.equal(get.header.apikey, config.SUPABASE_ANON_KEY);
  assert.equal(sb.wasNewAccount(), true);
  assert.equal(wx.store['sm.session'].refresh_token, 'RT1');
  assert.equal(await sb.userId(), 'u1');
});

test('a stored session is used without signing in', async () => {
  const wx = fakeWx({ storage: { 'sm.session': session(5) }, routes: server() });
  const sb = load('utils/supabase.js', wx);
  assert.deepEqual(await sb.from('events').select('id'), [{ token: 'Bearer AT5' }]);
  assert.equal(wx.calls.length, 1);
});

test('requests at the same time share one sign-in', async () => {
  const wx = fakeWx({ routes: server() });
  const sb = load('utils/supabase.js', wx);
  await Promise.all([sb.from('a').select(), sb.from('b').select(), sb.rpc('f'), sb.userId()]);
  assert.equal(wx.calls.filter((c) => c.url.includes('wechat-login')).length, 1);
});

test('an expiring token is refreshed first, and the new refresh token is kept', async () => {
  const wx = fakeWx({ storage: { 'sm.session': session(1, { expires_at: now() + 30 }) }, routes: server() });
  const sb = load('utils/supabase.js', wx);
  assert.deepEqual(await sb.from('events').select('id'), [{ token: 'Bearer AT2' }]);
  const [refresh] = wx.calls;
  assert.equal(path(refresh.url), '/auth/v1/token?grant_type=refresh_token');
  assert.deepEqual(refresh.data, { refresh_token: 'RT1' });
  assert.equal(wx.store['sm.session'].refresh_token, 'RT2');
});

test('a refresh token that is no longer good means signing in with WeChat again', async () => {
  const wx = fakeWx({
    storage: { 'sm.session': session(1, { expires_at: now() - 10 }) },
    routes: server({ refresh: () => ({ statusCode: 400, data: { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' } }) }),
  });
  const sb = load('utils/supabase.js', wx);
  await sb.from('events').select('id');
  assert.deepEqual(wx.calls.map((c) => path(c.url).split('?')[0]), ['/auth/v1/token', '/functions/v1/wechat-login', '/rest/v1/events']);
});

test('offline during a refresh keeps the session (no new sign-in)', async () => {
  const wx = fakeWx({
    storage: { 'sm.session': session(1, { expires_at: now() - 10 }) },
    routes: server({ refresh: () => 'network' }),
  });
  const sb = load('utils/supabase.js', wx);
  await assert.rejects(sb.from('events').select('id'), (e) => e.status === 0 && e.code === 'network');
  assert.equal(wx.store['sm.session'].refresh_token, 'RT1');
  assert.ok(!wx.calls.some((c) => c.url.includes('wechat-login')));
});

test('a 401 from the database renews the token and tries once more', async () => {
  let n = 0;
  const wx = fakeWx({
    storage: { 'sm.session': session(1) },
    routes: server({ rest: (req) => (++n === 1 ? { statusCode: 401, data: { code: 'PGRST301', message: 'JWT expired' } } : { statusCode: 200, data: [req.header.Authorization] }) }),
  });
  const sb = load('utils/supabase.js', wx);
  assert.deepEqual(await sb.from('events').select('id'), ['Bearer AT2']);

  const wx2 = fakeWx({ storage: { 'sm.session': session(1) }, routes: server({ rest: () => ({ statusCode: 401, data: { message: 'JWT expired' } }) }) });
  const sb2 = load('utils/supabase.js', wx2);
  await assert.rejects(sb2.from('events').select('id'), (e) => e.status === 401);
  assert.equal(wx2.calls.filter((c) => c.url.includes('/rest/')).length, 2);
});

test('sign-in errors carry the function\'s message', async () => {
  const wx = fakeWx({ routes: server({ login: () => ({ statusCode: 401, data: { error: 'WeChat: invalid code (40029)', code: 'wechat_40029' } }) }) });
  const sb = load('utils/supabase.js', wx);
  await assert.rejects(sb.userId(), (e) => e.status === 401 && e.code === 'wechat_40029' && /40029/.test(e.message));
  const wx2 = fakeWx({ loginFails: true, routes: server() });
  await assert.rejects(load('utils/supabase.js', wx2).userId(), (e) => e.code === 'wx_login');
});

test('queries are written the way PostgREST reads them', async () => {
  const wx = fakeWx({ storage: { 'sm.session': session(1) }, routes: server({ rest: () => ({ statusCode: 200, data: [] }) }) });
  const sb = load('utils/supabase.js', wx);
  const last = () => wx.calls[wx.calls.length - 1];

  await sb.from('org_members').select('role, joined_at, organizations(id, name, invite_code)').eq('user_id', 'u-1');
  assert.equal(path(last().url), '/rest/v1/org_members?select=role%2Cjoined_at%2Corganizations(id%2Cname%2Cinvite_code)&user_id=eq.u-1');

  await sb.from('categories').select('*').eq('org_id', 3).order('sort_order').order('name');
  assert.equal(path(last().url), '/rest/v1/categories?select=*&org_id=eq.3&order=sort_order.asc%2Cname.asc');

  await sb.from('event_participant_status').select('*').in('event_id', [1, 2, 3]).order('position');
  assert.equal(path(last().url), '/rest/v1/event_participant_status?select=*&event_id=in.(1%2C2%2C3)&order=position.asc');

  await sb.from('events').select('id').gte('starts_at', '2026-10-22T00:00:00.000Z').lt('starts_at', '2026-11-01T00:00:00.000Z')
    .order('starts_at', { ascending: false }).limit(5);
  assert.equal(path(last().url),
    '/rest/v1/events?select=id&starts_at=gte.2026-10-22T00%3A00%3A00.000Z&starts_at=lt.2026-11-01T00%3A00%3A00.000Z&limit=5&order=starts_at.desc');

  await sb.from('event_log').select('*').or('event_id.is.null,event_id.eq.5').is('title', null).in('action', ['joined', 'left']);
  assert.equal(path(last().url), '/rest/v1/event_log?select=*&or=(event_id.is.null%2Cevent_id.eq.5)&title=is.null&action=in.(%22joined%22%2C%22left%22)');
});

test('writes: insert, insert + select, upsert, delete, rpc', async () => {
  const wx = fakeWx({ storage: { 'sm.session': session(1) }, routes: server({ rest: (req) => ({ statusCode: req.method === 'DELETE' ? 204 : 201, data: req.method === 'DELETE' ? '' : [{ id: 9 }] }) }) });
  const sb = load('utils/supabase.js', wx);
  const last = () => wx.calls[wx.calls.length - 1];

  await sb.from('event_participants').insert({ event_id: 4 });
  assert.equal(path(last().url), '/rest/v1/event_participants');
  assert.equal(last().method, 'POST');
  assert.deepEqual(last().data, { event_id: 4 });
  assert.equal(last().header.Prefer, 'return=minimal');

  assert.deepEqual(await sb.from('event_participants').insert({ event_id: 4 }).select().maybeSingle(), { id: 9 });
  assert.equal(last().header.Prefer, 'return=representation');

  await sb.from('profiles').upsert({ id: 'u1', display_name: 'Tom' }, { onConflict: 'id' }).select();
  assert.equal(path(last().url), '/rest/v1/profiles?on_conflict=id&select=*');
  assert.equal(last().header.Prefer, 'resolution=merge-duplicates,return=representation');

  assert.equal(await sb.from('event_participants').delete().eq('id', 12), null);
  assert.equal(path(last().url), '/rest/v1/event_participants?id=eq.12');
  assert.equal(last().method, 'DELETE');

  await sb.rpc('join_organization', { p_code: 'ABCD2345' });
  assert.equal(path(last().url), '/rest/v1/rpc/join_organization');
  assert.deepEqual(last().data, { p_code: 'ABCD2345' });
  assert.ok(!wx.calls.some((c) => c.method === 'PATCH'), 'wx.request has no PATCH');
});

test('maybeSingle gives the first row or null; database errors become ApiError', async () => {
  let answer = [];
  const wx = fakeWx({ storage: { 'sm.session': session(1) }, routes: server({ rest: () => answer }) });
  const sb = load('utils/supabase.js', wx);
  answer = { statusCode: 200, data: [] };
  assert.equal(await sb.from('events').select('*').eq('id', 1).maybeSingle(), null);
  answer = { statusCode: 200, data: [{ id: 1 }, { id: 2 }] };
  assert.deepEqual(await sb.from('events').select('*').maybeSingle(), { id: 1 });
  answer = { statusCode: 400, data: { code: 'P0001', message: 'BANNED_FROM_ORG', details: null, hint: null } };
  await assert.rejects(sb.rpc('join_organization', { p_code: 'X' }), (e) => e instanceof sb.ApiError && e.status === 400 && e.code === 'P0001' && e.message === 'BANNED_FROM_ORG');
});
