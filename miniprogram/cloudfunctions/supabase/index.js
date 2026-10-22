// Cloud function "supabase": forwards the mini program's requests to Supabase.
// A mini program may only call addresses with an ICP filing, which supabase.co can't have; cloud
// functions on WeChat Cloud Development (云开发) aren't limited that way. This one reaches only
// this Supabase project and only the paths the mini program uses (tables and views, RPCs, token
// refresh, the wechat-login function). It adds no rights of its own: every request carries the
// person's own sign-in token, so Row Level Security applies exactly as on the website.
// No dependencies. Deploy from WeChat DevTools: right-click this folder → 上传并部署.
const http = require('http');
const https = require('https');

// The same project as miniprogram/config.js (or set SUPABASE_URL on the function in the console)
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://lkbhyzsyfevhaxwlzbwu.supabase.co').replace(/\/+$/, '');
const TIMEOUT_MS = 15000;   // set the function's own timeout (console, default 3 s) above this

const ROUTES = [
  { methods: ['GET', 'POST', 'DELETE'], path: /^\/rest\/v1\/[a-z_]+(\?[^#]*)?$/ },
  { methods: ['POST'], path: /^\/rest\/v1\/rpc\/[a-z_]+$/ },
  { methods: ['POST'], path: /^\/auth\/v1\/token\?grant_type=refresh_token$/ },
  { methods: ['POST'], path: /^\/functions\/v1\/wechat-login$/ },
];
const HEADERS = ['apikey', 'authorization', 'content-type', 'prefer'];

const allowed = (method, path) => typeof path === 'string'
  && ROUTES.some((r) => r.methods.includes(method) && r.path.test(path));

// One HTTPS request → { status, type, text }
function send(url, { method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith('https:') ? https : http).request(url, { method, headers, timeout: TIMEOUT_MS }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: String(res.headers['content-type'] || ''), text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Supabase did not answer in time')));
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// { path, method, header, data } → { statusCode, data }; statusCode 0 = Supabase couldn't be reached
async function proxy(event, sendFn = send) {
  const method = String((event && event.method) || 'GET').toUpperCase();
  const path = event && event.path;
  if (!allowed(method, path)) return { statusCode: 403, data: { message: `Not forwarded: ${method} ${String(path).slice(0, 80)}` } };
  const headers = {};
  for (const [k, v] of Object.entries((event && event.header) || {})) {
    if (HEADERS.includes(k.toLowerCase()) && typeof v === 'string') headers[k.toLowerCase()] = v;
  }
  let body;
  if (method !== 'GET' && event.data !== undefined) {
    body = JSON.stringify(event.data);
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(Buffer.byteLength(body));
  }
  let res;
  try {
    res = await sendFn(SUPABASE_URL + path, { method, headers, body });
  } catch (err) {
    console.error(method, path.split('?')[0], err && err.message);
    return { statusCode: 0, data: { message: (err && err.message) || 'Supabase could not be reached' } };
  }
  let data = res.text;
  if (/json/i.test(res.type) && res.text) {
    try { data = JSON.parse(res.text); } catch (e) { /* keep the text */ }
  }
  return { statusCode: res.status, data };
}

exports.main = (event) => proxy(event);
exports.proxy = proxy;
exports.allowed = allowed;
