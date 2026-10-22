// Read-only check against the real Supabase project: LIVE=1 node --test "miniprogram/test/*.test.js"
// Every read the mini program makes is sent with only the public anon key. Row Level Security
// returns no rows to it, but PostgREST still refuses a wrong column, relation or filter, so this
// shows the queries fit the database. Nothing is written.
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const { fakeWx, fakeCloud, load } = require('./helpers');

const LIVE = process.env.LIVE === '1';
const NOBODY = '00000000-0000-0000-0000-000000000000';

// wx.request backed by real HTTPS
async function realRequest(req) {
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.header,
    body: req.method === 'GET' || req.data === undefined ? undefined : JSON.stringify(req.data),
  });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : ''; } catch (e) { /* not JSON */ }
  return { statusCode: res.status, data };
}
// Signed in as "anon": the anon key stands in for a user's token
const anonSession = { access_token: config.SUPABASE_ANON_KEY, refresh_token: 'none', expires_at: 4102444800, user: { id: NOBODY } };
const live = () => {
  const wx = fakeWx({ storage: { 'sm.session': anonSession }, routes: realRequest });
  return { wx, api: load('utils/api.js', wx), sb: require('../utils/supabase') };
};

test('every read the mini program makes is accepted by the database', { skip: !LIVE && 'set LIVE=1' }, async () => {
  const { wx, api } = live();
  assert.equal(await api.profile(NOBODY), null);
  assert.deepEqual(await api.orgs(NOBODY), []);
  const base = await api.base(1);
  assert.deepEqual([base.categories, base.places, base.members], [[], [], []]);
  assert.deepEqual(await api.upcoming(1), []);
  const month = await api.events(1, new Date('2026-09-27T00:00:00Z'), new Date('2026-11-22T00:00:00Z'), NOBODY);
  assert.deepEqual(month.events, []);
  assert.equal(month.parts.size, 0);
  assert.equal(await api.event(1), null);
  const d = await api.eventDetail({ id: 1, series_id: 1 }, NOBODY);
  assert.deepEqual(d, { parts: [], series: null, subscribed: false });
  // Participant view with ids, and an "in" filter on series
  const { sb } = { sb: require('../utils/supabase') };
  assert.deepEqual(await sb.from('event_participant_status').select('*').in('event_id', [1, 2, 3]).order('position'), []);
  assert.deepEqual(await sb.from('event_series').select('*').in('id', [1, 2]), []);
  for (const c of wx.calls) assert.ok(c.method === 'GET', `${c.method} ${c.url}`);
  console.log(`  ${wx.calls.length} queries, all answered 200`);
});

test('the same reads through the cloud function reach the database', { skip: !LIVE && 'set LIVE=1' }, async () => {
  const fnPath = require.resolve('../cloudfunctions/supabase/index.js');
  delete require.cache[fnPath];
  const fn = require(fnPath);
  const wx = fakeCloud(fakeWx({ storage: { 'sm.session': anonSession } }), (name, data) => fn.main(JSON.parse(JSON.stringify(data))));
  const api = load('utils/api.js', wx, { CLOUD_ENV: 'live-test' });
  assert.deepEqual(await api.orgs(NOBODY), []);
  const base = await api.base(1);
  assert.deepEqual([base.categories, base.places, base.members], [[], [], []]);
  assert.deepEqual((await api.events(1, new Date('2026-09-27T00:00:00Z'), new Date('2026-11-22T00:00:00Z'), NOBODY)).events, []);
  assert.deepEqual(await api.eventDetail({ id: 1, series_id: 1 }, NOBODY), { parts: [], series: null, subscribed: false });
  const login = await fn.main({
    path: '/functions/v1/wechat-login', method: 'POST', data: { code: 'x'.repeat(32) },
    header: { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${config.SUPABASE_ANON_KEY}` },
  });
  console.log(`  ${wx.calls.length} queries through the cloud function; wechat-login: ${login.statusCode}`);
  assert.ok(wx.calls.every((c) => c.cloud === 'supabase'));
});

test('a column that does not exist is refused (so the check above means something)', { skip: !LIVE && 'set LIVE=1' }, async () => {
  const { sb } = live();
  await assert.rejects(sb.from('events').select('no_such_column'), (e) => e.status === 400 && e.code === '42703');
  await assert.rejects(sb.from('org_members').select('nope(id)'), (e) => e.status === 400 && /PGRST2/.test(e.code));
});

// Straight to the API: for anon, PostgREST answers "permission denied" with 401, which the client
// (rightly, for a real user) treats as an expired token and signs in again
const anonCall = (path, data) => realRequest({
  url: `${config.SUPABASE_URL}/rest/v1/${path}`, method: 'POST', data,
  header: { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
});

test('RPCs and writes need a signed-in user', { skip: !LIVE && 'set LIVE=1' }, async () => {
  // join_organization exists and is closed to anon (revoked in schema.sql)
  const rpc = await anonCall('rpc/join_organization', { p_code: 'ABCD2345' });
  assert.equal(rpc.statusCode, 401);
  assert.equal(rpc.data.code, '42501');
  // RLS: no insert policy for anon
  const ins = await anonCall('event_participants', { event_id: 1 });
  assert.equal(ins.statusCode, 401);
  assert.equal(ins.data.code, '42501');
});

test('the wechat-login function answers (404 until it is deployed)', { skip: !LIVE && 'set LIVE=1' }, async () => {
  const res = await realRequest({
    url: `${config.SUPABASE_URL}/functions/v1/wechat-login`, method: 'POST', data: { code: 'x'.repeat(32) },
    header: { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
  });
  console.log(`  wechat-login: ${res.statusCode} ${JSON.stringify(res.data).slice(0, 120)}`);
  // deployed: 500 not_configured (no secrets yet) or 401 / 502 from WeChat for this made-up code
  assert.ok([404, 500, 401, 502].includes(res.statusCode));
});
