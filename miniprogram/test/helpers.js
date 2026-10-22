// A fake `wx` for running mini program modules under Node, and a way to load them afresh.
const path = require('path');

const MP = path.join(__dirname, '..') + path.sep;
const TEST = __dirname + path.sep;

// routes(req) → { statusCode, data } or a promise of it; every request is recorded in calls
function fakeWx({ storage = {}, routes = () => ({ statusCode: 404, data: {} }), loginFails = false } = {}) {
  const calls = [];
  let codes = 0;
  const store = { ...storage };
  const wx = {
    calls, store,
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); },
    removeStorageSync: (k) => { delete store[k]; },
    login: ({ success, fail }) => setTimeout(() => (loginFails ? fail({ errMsg: 'login:fail' }) : success({ code: `CODE${++codes}` })), 1),
    request: ({ url, method = 'GET', data, header, success, fail }) => {
      const req = { url, method, data, header };
      calls.push(req);
      Promise.resolve().then(() => routes(req)).then((res) => {
        if (res === 'network') fail({ errMsg: 'request:fail timeout' });
        else success({ statusCode: res.statusCode, data: res.data === undefined ? '' : res.data, header: {} });
      });
    },
  };
  return wx;
}

// require() a mini program module with a fresh copy of everything it loads (module state is per test);
// config: values to put in config.js for this load (e.g. { CLOUD_ENV: 'env-1' })
function load(mod, wx, config = {}) {
  global.wx = wx;
  for (const k of Object.keys(require.cache)) if (k.startsWith(MP) && !k.startsWith(TEST)) delete require.cache[k];
  Object.assign(require(path.join(MP, 'config.js')), config);
  return require(path.join(MP, mod));
}

// wx.cloud for fakeWx: callFunction answers with handler(name, data) → result, or 'fail'
function fakeCloud(wx, handler) {
  wx.cloud = {
    inits: [],
    init: (opts) => wx.cloud.inits.push(opts),
    callFunction: ({ name, data, success, fail }) => {
      wx.calls.push({ cloud: name, data });
      Promise.resolve().then(() => handler(name, data)).then((result) => {
        if (result === 'fail') fail({ errMsg: 'cloud.callFunction:fail Error: timeout' });
        else success({ result, errMsg: 'cloud.callFunction:ok' });
      });
    },
  };
  return wx;
}

module.exports = { fakeWx, fakeCloud, load };
