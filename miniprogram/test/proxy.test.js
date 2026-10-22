// The "supabase" cloud function, and the mini program sending its requests through it.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const config = require('../config');
const { fakeWx, fakeCloud, load } = require('./helpers');

const FN = path.join(__dirname, '..', 'cloudfunctions', 'supabase', 'index.js');
const fresh = () => { delete require.cache[FN]; return require(FN); };
const now = () => Math.floor(Date.now() / 1000);

// A stand-in for Supabase on localhost that records what it receives
async function fakeSupabase(answer) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      const [status, type, text] = answer(req);
      res.writeHead(status, type ? { 'Content-Type': type } : {});
      res.end(text);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { seen, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

test('forwards a request to Supabase with its own token, and passes the answer back', async () => {
  const sb = await fakeSupabase(() => [200, 'application/json; charset=utf-8', '[{"id":1,"name":"港区体育中心"}]']);
  process.env.SUPABASE_URL = sb.url + '/';
  try {
    const fn = fresh();
    const out = await fn.main({
      path: '/rest/v1/places?select=*&org_id=eq.7', method: 'GET',
      header: { apikey: 'ANON', Authorization: 'Bearer USER', 'Content-Type': 'application/json', Host: 'evil', 'X-Forwarded-For': '1.2.3.4' },
      userInfo: { openId: 'o1', appId: 'wx1' },
    });
    assert.deepEqual(out, { statusCode: 200, data: [{ id: 1, name: '港区体育中心' }] });
    const [req] = sb.seen;
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/rest/v1/places?select=*&org_id=eq.7');
    assert.equal(req.headers.apikey, 'ANON');
    assert.equal(req.headers.authorization, 'Bearer USER');
    assert.equal(req.headers['x-forwarded-for'], undefined);
    assert.notEqual(req.headers.host, 'evil');
    assert.equal(req.body, '');
  } finally {
    delete process.env.SUPABASE_URL;
    await sb.close();
  }
});

test('POST bodies, Prefer, errors, empty answers and plain text go through unchanged', async () => {
  const sb = await fakeSupabase((req) => (req.method === 'DELETE' ? [204, '', '']
    : req.url.startsWith('/rest/v1/rpc/') ? [400, 'application/json', '{"code":"P0001","message":"BANNED_FROM_ORG"}']
    : req.url.startsWith('/functions/') ? [502, 'text/plain', 'Bad gateway']
    : [201, 'application/json', '[{"id":9}]']));
  process.env.SUPABASE_URL = sb.url;
  try {
    const fn = fresh();
    const ins = await fn.main({ path: '/rest/v1/event_participants', method: 'POST', header: { Prefer: 'return=representation' }, data: { event_id: 4, guest_name: 'Ann' } });
    assert.deepEqual(ins, { statusCode: 201, data: [{ id: 9 }] });
    assert.deepEqual(JSON.parse(sb.seen[0].body), { event_id: 4, guest_name: 'Ann' });
    assert.equal(sb.seen[0].headers.prefer, 'return=representation');
    assert.equal(sb.seen[0].headers['content-type'], 'application/json');

    assert.deepEqual(await fn.main({ path: '/rest/v1/event_participants?id=eq.12', method: 'DELETE', header: {} }), { statusCode: 204, data: '' });
    assert.deepEqual(await fn.main({ path: '/rest/v1/rpc/join_organization', method: 'POST', data: { p_code: 'X' } }),
      { statusCode: 400, data: { code: 'P0001', message: 'BANNED_FROM_ORG' } });
    assert.deepEqual(await fn.main({ path: '/functions/v1/wechat-login', method: 'POST', data: { code: 'c' } }), { statusCode: 502, data: 'Bad gateway' });
    assert.equal(sb.seen.length, 4);
  } finally {
    delete process.env.SUPABASE_URL;
    await sb.close();
  }
});

test('only this project and only the paths the mini program uses', () => {
  const { allowed } = fresh();
  for (const [m, p] of [
    ['GET', '/rest/v1/events?select=*&org_id=eq.1&order=starts_at.asc'], ['POST', '/rest/v1/event_participants'],
    ['DELETE', '/rest/v1/series_subscribers?series_id=eq.1&user_id=eq.u'], ['POST', '/rest/v1/profiles?on_conflict=id&select=*'],
    ['POST', '/rest/v1/rpc/join_organization'], ['POST', '/auth/v1/token?grant_type=refresh_token'], ['POST', '/functions/v1/wechat-login'],
  ]) assert.ok(allowed(m, p), `${m} ${p}`);
  for (const [m, p] of [
    ['PATCH', '/rest/v1/events?id=eq.1'], ['GET', '/auth/v1/admin/users'], ['POST', '/auth/v1/admin/generate_link'],
    ['POST', '/auth/v1/token?grant_type=password'], ['GET', '/rest/v1/rpc/join_organization'], ['POST', '/functions/v1/resolve-map'],
    ['GET', '/rest/v1/events/../../auth/v1/admin/users'], ['GET', '@evil.example.com/rest/v1/events'], ['GET', '//evil.example.com/x'],
    ['GET', 'https://evil.example.com/rest/v1/events'], ['GET', '/storage/v1/object/x'], ['GET', undefined], ['GET', '/rest/v1/'],
  ]) assert.ok(!allowed(m, p), `${m} ${p}`);
});

test('a refused path never leaves the function; an unreachable Supabase is statusCode 0', async () => {
  const fn = fresh();
  let sent = 0;
  const out = await fn.proxy({ path: '/auth/v1/admin/users', method: 'GET' }, async () => { sent++; return {}; });
  assert.equal(out.statusCode, 403);
  assert.equal(sent, 0);
  const down = await fn.proxy({ path: '/rest/v1/events', method: 'GET' }, async () => { throw new Error('getaddrinfo ENOTFOUND'); });
  assert.deepEqual(down, { statusCode: 0, data: { message: 'getaddrinfo ENOTFOUND' } });
});

// ------------------------------------------------------------- the mini program, through the cloud
const session = { access_token: 'AT1', refresh_token: 'RT1', expires_at: now() + 3600, user: { id: 'u1' } };

test('with CLOUD_ENV set, every request goes through the cloud function (wx.request is never used)', async () => {
  const wx = fakeCloud(fakeWx({ routes: () => { throw new Error('wx.request used'); } }), (name, data) => {
    if (data.path === '/functions/v1/wechat-login') return { statusCode: 200, data: { ...session, is_new: false } };
    return { statusCode: 200, data: [{ token: data.header.Authorization }] };
  });
  const sb = load('utils/supabase.js', wx, { CLOUD_ENV: 'sharemap-1a2b3c' });
  assert.deepEqual(await sb.from('places').select('*').eq('org_id', 7), [{ token: 'Bearer AT1' }]);
  assert.deepEqual(await sb.from('places').select('id'), [{ token: 'Bearer AT1' }]);
  assert.deepEqual(wx.cloud.inits, [{ env: 'sharemap-1a2b3c', traceUser: false }]);
  const [login, get] = wx.calls;
  assert.equal(login.cloud, 'supabase');
  assert.deepEqual(login.data, {
    path: '/functions/v1/wechat-login', method: 'POST', data: { code: 'CODE1' },
    header: { apikey: config.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${config.SUPABASE_ANON_KEY}` },
  });
  assert.deepEqual(Object.keys(get.data).sort(), ['header', 'method', 'path']);
  assert.equal(get.data.path, '/rest/v1/places?select=*&org_id=eq.7');
});

test('cloud errors: Supabase unreachable and a failed call keep the session; database errors come back as usual', async () => {
  let answer;
  const wx = fakeCloud(fakeWx({ storage: { 'sm.session': session } }), () => answer);
  const sb = load('utils/supabase.js', wx, { CLOUD_ENV: 'env-1' });
  answer = { statusCode: 0, data: { message: 'Supabase did not answer in time' } };
  await assert.rejects(sb.from('events').select('id'), (e) => e.status === 0 && e.code === 'network' && /in time/.test(e.message));
  answer = 'fail';
  await assert.rejects(sb.from('events').select('id'), (e) => e.status === 0 && /callFunction:fail/.test(e.message));
  answer = { statusCode: 400, data: { code: 'P0001', message: 'BANNED_FROM_ORG' } };
  await assert.rejects(sb.rpc('join_organization', { p_code: 'X' }), (e) => e.status === 400 && e.message === 'BANNED_FROM_ORG');
  answer = { statusCode: 204, data: '' };
  assert.equal(await sb.from('event_participants').delete().eq('id', 3), null);
  assert.equal(wx.store['sm.session'].refresh_token, 'RT1');
});

test('the client and the cloud function together, end to end', async () => {
  const sb = await fakeSupabase((req) => (req.url.startsWith('/functions/v1/wechat-login')
    ? [200, 'application/json', JSON.stringify({ ...session, access_token: 'FROM_LOGIN' })]
    : [200, 'application/json', JSON.stringify([{ auth: req.headers.authorization, url: req.url }])]));
  process.env.SUPABASE_URL = sb.url;
  try {
    const fn = fresh();
    const wx = fakeCloud(fakeWx(), (name, data) => fn.main(JSON.parse(JSON.stringify(data))));
    const api = load('utils/api.js', wx, { CLOUD_ENV: 'env-1' });
    const rows = await api.upcoming(3);
    assert.equal(rows[0].auth, 'Bearer FROM_LOGIN');
    assert.match(rows[0].url, /^\/rest\/v1\/events\?select=id%2Cplace_id%2Ctitle%2Cstarts_at&org_id=eq\.3&cancelled=eq\.false&starts_at=gte\./);
    assert.deepEqual(JSON.parse(sb.seen[0].body), { code: 'CODE1' });
  } finally {
    delete process.env.SUPABASE_URL;
    await sb.close();
  }
});
