// State shared by the pages: who is signed in, their groups, and the open group's categories,
// places and members (the website keeps the same in its `state`).
const sb = require('./supabase');
const api = require('./api');

const DEFAULT_NAME = '微信用户';   // what the wechat-login function names new accounts

const storage = {
  get(k) { try { return wx.getStorageSync(k); } catch (e) { return ''; } },
  set(k, v) { try { if (v == null) wx.removeStorageSync(k); else wx.setStorageSync(k, v); } catch (e) { /* ignore */ } },
};

const state = {
  userId: null,
  profile: null,
  orgs: [],          // [{ id, name, invite_code, role, joined_at }]
  orgId: null,
  base: null,        // { orgId, categories, places, members }
  version: 0,        // bumped on any change other pages should pick up
  nameAsked: false,  // the nickname page was shown in this run
};

let starting = null;
// Sign in (with WeChat) and load my profile and groups; shared by every page
function init(force = false) {
  if (!starting || force) {
    starting = (async () => {
      state.userId = await sb.userId();
      let profile = await api.profile(state.userId);
      if (!profile) profile = await api.saveName(state.userId, DEFAULT_NAME);
      state.profile = profile;
      await loadOrgs();
    })();
    starting.catch(() => { starting = null; });   // a failed start can be tried again
  }
  return starting;
}

async function loadOrgs() {
  state.orgs = await api.orgs(state.userId);
  if (!state.orgs.some((o) => o.id === state.orgId)) {
    const saved = Number(storage.get('sm.org'));
    setOrg(state.orgs.some((o) => o.id === saved) ? saved : (state.orgs[0] ? state.orgs[0].id : null));
  }
}

function setOrg(id) {
  if (id === state.orgId) return;
  state.orgId = id;
  state.base = null;
  storage.set('sm.org', id);
  state.version++;
}

async function loadBase(force = false) {
  const org = state.orgId;
  if (!org) return null;
  if (!force && state.base && state.base.orgId === org) return state.base;
  const b = await api.base(org);
  if (org === state.orgId) state.base = b;
  return b;
}

// Join a group with its invite code and open it; returns the group
async function joinByCode(code) {
  const org = await api.joinOrg(code);
  await loadOrgs();
  setOrg(org.id);
  state.version++;
  return org;
}

async function saveName(name) {
  state.profile = await api.saveName(state.userId, name);
  state.base = null;   // member lists show the new name
  state.version++;
}

// New accounts are named 微信用户 until they choose a nickname (asked once per run, skippable)
const needsName = () => !!state.profile && state.profile.display_name === DEFAULT_NAME
  && !state.nameAsked && !storage.get('sm.nameSkipped');

const currentOrg = () => state.orgs.find((o) => o.id === state.orgId) || null;
const isAdmin = () => (currentOrg() || {}).role === 'owner';
const myMember = () => (state.base ? state.base.members.find((m) => m.user_id === state.userId) : null);
const canJoin = () => (myMember() || {}).can_join !== false;
const memberName = (id) => {
  const m = state.base && state.base.members.find((x) => x.user_id === id);
  return (m && m.profiles && m.profiles.display_name) || '—';
};

module.exports = {
  state, storage, DEFAULT_NAME, init, loadOrgs, setOrg, loadBase, joinByCode, saveName, needsName,
  currentOrg, isAdmin, myMember, canJoin, memberName,
};
