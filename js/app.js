(() => {
'use strict';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const cfg = window.APP_CONFIG || {};
const { i18n } = window;
const t = i18n.t;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const closeBtn = () => `<button type="button" class="ghost icon" data-close aria-label="${esc(t('cancel'))}">${ic('x')}</button>`;
const avatar = (name, cls = '') => `<span class="avatar ${cls}" aria-hidden="true">${esc(([...String(name || '?').trim()][0] || '?').toUpperCase())}</span>`;
const skeletons = (cls, n) => Array.from({ length: n }, () => `<div class="skeleton ${cls}"></div>`).join('');
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';

// Localized short weekday names, Sunday first (2023-01-01 was a Sunday).
const WD = () => [0, 1, 2, 3, 4, 5, 6].map((i) =>
  new Date(2023, 0, 1 + i).toLocaleDateString(i18n.locale, { weekday: 'short' }));

const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtTime = (d) => d.toLocaleTimeString(i18n.locale, { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d) => d.toLocaleDateString(i18n.locale, { month: 'short', day: 'numeric', weekday: 'short' });
const fmtDateLong = (d) => d.toLocaleDateString(i18n.locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
const fmtYmd = (s) => new Date(s + 'T00:00').toLocaleDateString(i18n.locale, { year: 'numeric', month: 'short', day: 'numeric' });

function safeUrl(u) {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; }
}
function isGoogleMapsUrl(u) {
  try {
    const x = new URL(u);
    const h = x.hostname.toLowerCase();
    return h === 'maps.app.goo.gl'
      || (h === 'goo.gl' && x.pathname.startsWith('/maps'))
      || /^maps\.google\./.test(h)
      || (/^(www\.)?google\./.test(h) && x.pathname.startsWith('/maps'));
  } catch { return false; }
}
// Google Maps "Share" often copies "Place name\naddress\nhttps://maps.app.goo.gl/xxx"
function parseShareText(text) {
  const m = text.match(/https?:\/\/\S+/);
  if (!m) return null;
  const before = text.slice(0, m.index).split('\n').map((s) => s.trim()).filter(Boolean);
  return { url: m[0], name: before[0] || '' };
}

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, isError ? 5000 : 2500);
}
function check({ error, data }) {
  if (error) {
    const msg = error.message || '';
    const limit = /PLACE_DAILY_LIMIT (\d+)/.exec(msg);
    toast(limit ? t('place.limit', { n: Number(limit[1]) })
      : msg.includes('BANNED_FROM_ORG') ? t('org.banned') : msg, true);
    throw error;
  }
  return data;
}

const modal = $('#modal');
function openModal(html) { $('#modal-body').innerHTML = html; if (!modal.open) modal.showModal(); return $('#modal-body'); }
function closeModal() { modal.close(); }
modal.addEventListener('click', (e) => {
  if (e.target === modal || e.target.closest('[data-close]')) closeModal();
});

// ---------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------
function applyLanguage() {
  i18n.apply();
  const title = cfg.APP_TITLE || t('appTitle');
  document.title = title;
  $$('.app-title').forEach((el) => { el.textContent = title; });
  $('#setup-body').innerHTML = t('setup.body');
  setAuthMode(authMode);
  if (state.profile) renderOrgSelect();
}
document.addEventListener('change', (e) => {
  if (!e.target.matches('select.lang-select')) return;
  i18n.set(e.target.value);
  applyLanguage();
  if (modal.open) closeModal();
  if (state.orgId) render();
  else if (state.profile) renderOnboarding($('#onboard-card'));
});

function showOnly(id) {
  $$('.view').forEach((v) => { v.hidden = v.id !== id; });
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// An invite link looks like https://…/?join=CODE. Remember the code until the user is signed in.
const urlJoin = new URLSearchParams(location.search).get('join');
if (urlJoin) {
  store.set('fsm.pendingJoin', urlJoin);
  history.replaceState(null, '', location.pathname);
}

const state = {
  user: null,
  profile: null,
  orgs: [],             // [{ id, name, invite_code, role }]
  orgId: null,
  view: store.get('fsm.view') || 'places',
  categories: [],
  places: [],
  members: [],
  selectedCat: 'root',  // 'root' (category tiles) | 'all' | 'none' | category id
  search: '',
  month: startOfMonth(new Date()),
  events: [],
  parts: new Map(),     // event_id -> participant rows (ordered)
  series: new Map(),    // series_id -> series row
  mySubs: new Set(),    // series ids I auto-join
  next: new Map(),      // place_id -> next upcoming event (for place covers)
  nextCount: new Map(), // place_id -> number of upcoming events
  nextSig: '',
  nextAt: 0,
};
let authMode = 'in';   // sign-in form: 'in' | 'up' | 'reset'
const MIN_PASSWORD = 8;

applyLanguage();

// ---------------------------------------------------------------------
// Setup / client
// ---------------------------------------------------------------------
if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR_') || !window.supabase) {
  showOnly('view-setup');
  return;
}
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------
// Auth: email + password (sign in / create account / reset)
// ---------------------------------------------------------------------
function setAuthMode(mode) {
  authMode = mode;
  $$('#auth-tabs button').forEach((b) => {
    const on = b.dataset.auth === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('#auth-tabs').hidden = mode === 'reset';
  $('#auth-form [data-up]').hidden = mode !== 'up';
  $('#auth-form [data-pw]').hidden = mode === 'reset';
  const pw = $('#auth-password');
  pw.required = mode !== 'reset';
  pw.autocomplete = mode === 'up' ? 'new-password' : 'current-password';
  if (mode === 'up') pw.minLength = MIN_PASSWORD; else pw.removeAttribute('minlength');
  pw.placeholder = mode === 'up' ? t('auth.short') : '';
  $('#auth-submit').textContent = t(mode === 'in' ? 'auth.signIn' : mode === 'up' ? 'auth.signUp' : 'auth.sendReset');
  $('#auth-forgot').textContent = t(mode === 'reset' ? 'auth.back' : 'auth.forgot');
  $('#auth-forgot').hidden = mode === 'up';
  authNote('');
}
function authNote(msg, kind = 'error') {
  const el = $('#auth-note');
  el.textContent = msg;
  el.className = `form-note ${kind}`;
  el.hidden = !msg;
}
// Supabase's messages are English-only; map the common ones
function authMessage(error) {
  const byCode = {
    invalid_credentials: 'auth.badLogin', user_already_exists: 'auth.exists', email_exists: 'auth.exists',
    weak_password: 'auth.weak', email_not_confirmed: 'auth.notConfirmed',
  };
  let key = byCode[error?.code];
  if (!key && /invalid login/i.test(error?.message)) key = 'auth.badLogin';
  if (!key && /already registered/i.test(error?.message)) key = 'auth.exists';
  if (!key && /at least \d+ characters/i.test(error?.message)) key = 'auth.short';
  return key ? t(key) : (error?.message || String(error));
}

$('#auth-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-auth]');
  if (b) setAuthMode(b.dataset.auth);
});
$('#auth-forgot').addEventListener('click', () => setAuthMode(authMode === 'reset' ? 'in' : 'reset'));

// Show / hide password (any .pw field)
document.addEventListener('click', (e) => {
  const b = e.target.closest('.pw-toggle');
  if (!b) return;
  const input = b.parentElement.querySelector('input');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.querySelector('use').setAttribute('href', show ? '#i-eye-off' : '#i-eye');
  b.title = t(show ? 'auth.hide' : 'auth.show');
  b.setAttribute('aria-label', b.title);
});

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#auth-email').value.trim().toLowerCase();
  const password = $('#auth-password').value;
  const btn = $('#auth-submit');
  btn.disabled = true;
  authNote('');
  try {
    if (authMode === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) authNote(authMessage(error));
    } else if (authMode === 'up') {
      if (password.length < MIN_PASSWORD) return authNote(t('auth.short'));
      const name = $('#auth-name').value.trim();
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: name ? { display_name: name } : {}, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) return authNote(authMessage(error));
      // With "Confirm email" on, an existing address comes back as a user without identities
      if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) return authNote(t('auth.exists'));
      if (!data.session) { setAuthMode('in'); authNote(t('auth.confirmSent'), 'info'); }
    } else {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) return authNote(authMessage(error));
      setAuthMode('in');
      authNote(t('auth.resetSent'), 'info');
    }
  } finally {
    btn.disabled = false;
  }
});
$('#signout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

// Opened from a "reset password" email: ask for the new password
function newPasswordModal() {
  const body = openModal(`
    <div class="modal-head"><h2>${esc(t('auth.setNew'))}</h2>${closeBtn()}</div>
    <form id="recover-form" class="stack">
      <div class="pw">
        <input type="password" name="password" required minlength="${MIN_PASSWORD}" autocomplete="new-password" placeholder="${esc(t('auth.short'))}">
        <button type="button" class="ghost icon pw-toggle" title="${esc(t('auth.show'))}" aria-label="${esc(t('auth.show'))}">${ic('eye')}</button>
      </div>
      <p class="form-note error" role="alert" hidden></p>
      <button class="primary">${esc(t('save'))}</button>
    </form>`);
  const f = $('#recover-form', body);
  f.password.focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = $('.form-note', f);
    const btn = $('button.primary', f);
    btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: f.password.value });
    btn.disabled = false;
    if (error) { note.textContent = authMessage(error); note.hidden = false; return; }
    closeModal();
    toast(t('auth.pwSaved'));
  });
}

// ---------------------------------------------------------------------
// "Add to home screen" guide (iPhone: Safari share sheet; Android: Chrome menu
// or the browser's own install prompt when it offers one)
// ---------------------------------------------------------------------
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; refreshInstallButtons(); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function refreshInstallButtons() {
  $$('.install-btn').forEach((b) => { b.hidden = isStandalone(); });
}
function phoneKind() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'ios';
}
function installGuide(kind = phoneKind()) {
  const steps = {
    ios: [['compass', 'install.ios1'], ['share-ios', 'install.ios2'], ['plus-square', 'install.ios3'], ['check', 'install.ios4']],
    android: [['compass', 'install.and1'], ['dots', 'install.and2'], ['plus-square', 'install.and3'], ['check', 'install.and4']],
  };
  const tab = (k) => `<button type="button" role="tab" data-kind="${k}" class="${k === kind ? 'on' : ''}" aria-selected="${k === kind}">${esc(t('install.' + k))}</button>`;
  const body = openModal(`
    <div class="modal-head"><h2>${esc(t('install.title'))}</h2>${closeBtn()}</div>
    ${installPrompt ? `<button class="primary install-now">${ic('phone-add')}${esc(t('install.now'))}</button>` : ''}
    <div class="seg" role="tablist">${tab('ios')}${tab('android')}</div>
    <ol class="steps">${steps[kind].map(([icon, key], i) => `
      <li><span class="step-n">${i + 1}</span><span class="step-ic">${ic(icon)}</span><span>${esc(t(key))}</span></li>`).join('')}
    </ol>
    ${kind === 'ios' ? `<p class="muted small steps-note">${esc(t('install.iosNote'))}</p>` : ''}`);
  body.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => installGuide(b.dataset.kind)));
  $('.install-now', body)?.addEventListener('click', async () => {
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    closeModal();
  });
}
document.addEventListener('click', (e) => { if (e.target.closest('.install-btn')) installGuide(); });
refreshInstallButtons();

let booted = false;
sb.auth.onAuthStateChange((event, session) => {
  if (session?.user && !booted) { booted = true; setTimeout(() => boot(session.user), 0); }
  if (event === 'PASSWORD_RECOVERY') setTimeout(newPasswordModal, 400);
  if (!session) { booted = false; $('#topbar').hidden = true; showOnly('view-auth'); }
});

async function boot(user) {
  state.user = user;
  const emailName = user.email.split('@')[0];
  const chosenName = String(user.user_metadata?.display_name || '').trim();
  let { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile) {
    profile = check(await sb.from('profiles')
      .insert({ id: user.id, display_name: chosenName || emailName }).select().single());
  } else if (chosenName && profile.display_name === emailName) {
    // Name typed at sign-up (the database trigger only knows the email)
    profile = check(await sb.from('profiles').update({ display_name: chosenName }).eq('id', user.id).select().single());
  }
  state.profile = profile;
  $('#topbar').hidden = false;

  const pending = store.get('fsm.pendingJoin');
  if (pending) {
    store.set('fsm.pendingJoin', null);
    if (confirm(t('onb.pending', { code: pending.toUpperCase() }))) await joinOrg(pending, false);
  }
  await loadOrgs();
  enterOrg(state.orgId);
}

async function loadOrgs() {
  const rows = check(await sb.from('org_members')
    .select('role, organizations(id, name, invite_code)').eq('user_id', state.user.id));
  state.orgs = rows.filter((r) => r.organizations)
    .map((r) => ({ ...r.organizations, role: r.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const saved = Number(store.get('fsm.org'));
  if (!state.orgs.some((o) => o.id === state.orgId)) {
    state.orgId = state.orgs.some((o) => o.id === saved) ? saved : state.orgs[0]?.id ?? null;
  }
}

const currentOrg = () => state.orgs.find((o) => o.id === state.orgId);
const isAdmin = () => currentOrg()?.role === 'owner';
const myMember = () => state.members.find((m) => m.user_id === state.user.id);
const canCreate = () => myMember()?.can_create !== false;
const canJoin = () => myMember()?.can_join !== false;
const memberName = (id) => state.members.find((m) => m.user_id === id)?.profiles?.display_name || '—';
const canEditPlace = (p) => p.created_by === state.user.id || isAdmin();
// Places I may still add today (Japan time, as the database counts); null = no limit
const tokyoDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
function placesLeftToday() {
  if (isAdmin()) return null;
  const today = tokyoDay(Date.now());
  const used = state.places.filter((p) => p.created_by === state.user.id && tokyoDay(p.created_at) === today).length;
  return Math.max(0, (myMember()?.organizer ? 2 : 1) - used);
}
const fmtStamp = (s) => new Date(s).toLocaleString(i18n.locale,
  { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Show the chosen organization, or the create/join screen when there is none.
async function enterOrg(id) {
  state.orgId = id;
  store.set('fsm.org', id);
  state.selectedCat = 'root';
  state.search = '';
  $('#place-search').value = '';
  renderOrgSelect();
  if (!id) {
    $('#tabs').hidden = true;
    $('#org-select').hidden = true;
    renderOnboarding($('#onboard-card'));
    showOnly('view-onboard');
    return;
  }
  $('#tabs').hidden = false;
  $('#org-select').hidden = false;
  $('#place-list').innerHTML = skeletons('card-sk', 6);
  $('#upcoming').innerHTML = skeletons('row-sk', 3);
  $('#cal-grid').innerHTML = '';
  await loadBase();
  switchView(state.view);
}

function renderOrgSelect() {
  $('#org-select').innerHTML = state.orgs.map((o) =>
    `<option value="${o.id}" ${o.id === state.orgId ? 'selected' : ''}>${esc(o.name)}</option>`).join('')
    + `<option value="__add">+ ${esc(t('org.createJoin'))}</option>`;
}
$('#org-select').addEventListener('change', (e) => {
  if (e.target.value === '__add') {
    e.target.value = String(state.orgId);
    const body = openModal(`<div class="modal-head"><span></span>${closeBtn()}</div><div id="onb-modal"></div>`);
    renderOnboarding($('#onb-modal', body));
    return;
  }
  enterOrg(Number(e.target.value));
});

function renderOnboarding(el) {
  const L = (k) => esc(t(k));
  el.innerHTML = `
    <h2>${L('onb.title')}</h2>
    <form class="stack" data-onb="join">
      <h3>${L('onb.joinTitle')}</h3>
      <input name="code" required placeholder="${L('onb.codePh')}" autocomplete="off">
      <button class="primary">${L('onb.join')}</button>
    </form>
    <div class="onb-or">${L('onb.or')}</div>
    <form class="stack" data-onb="create">
      <h3>${L('onb.createTitle')}</h3>
      <input name="name" required placeholder="${L('onb.namePh')}">
      <button>${L('onb.create')}</button>
    </form>`;
  el.querySelectorAll('form').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    try {
      if (f.dataset.onb === 'join') await joinOrg(f.code.value, true);
      else await createOrg(f.name.value);
    } catch (err) { console.error(err); } finally { btn.disabled = false; }
  }));
}

async function joinOrg(code, enter) {
  const org = check(await sb.rpc('join_organization', { p_code: code }));
  toast(t('onb.joined', { name: org.name }));
  if (!enter) { state.orgId = org.id; return; }
  if (modal.open) closeModal();
  await loadOrgs();
  enterOrg(org.id);
}
async function createOrg(name) {
  const org = check(await sb.rpc('create_organization', { p_name: name.trim() }));
  toast(t('onb.created', { name: org.name }));
  if (modal.open) closeModal();
  await loadOrgs();
  state.view = 'org';
  enterOrg(org.id);
}

async function loadBase() {
  const org = state.orgId;
  const [cats, places, members] = await Promise.all([
    sb.from('categories').select('*').eq('org_id', org).order('sort_order').order('name'),
    sb.from('places').select('*').eq('org_id', org).order('name'),
    sb.from('org_members').select('user_id, role, joined_at, organizer, can_create, can_join, profiles(display_name)').eq('org_id', org).order('joined_at'),
  ]);
  if (org !== state.orgId) return;   // switched organization meanwhile
  state.categories = check(cats);
  state.places = check(places);
  state.members = check(members);
  await loadNext().catch(() => {});
}
// Place covers show the next event; refetch after any change to events
const eventsChanged = () => { state.nextAt = 0; };

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (b) switchView(b.dataset.view);
});
function switchView(v) {
  if (!['places', 'calendar', 'categories', 'org', 'admin'].includes(v)) v = 'places';
  // Only the owner manages categories and permissions; others don't see these tabs
  $$('#tabs [data-owner-only]').forEach((b) => { b.hidden = !isAdmin(); });
  if ((v === 'categories' || v === 'admin') && !isAdmin()) v = 'places';
  state.view = v;
  store.set('fsm.view', v);
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  showOnly('view-' + v);
  return render();
}
async function render() {
  if (state.view === 'places') renderPlaces();
  else if (state.view === 'calendar') await renderCalendar();
  else if (state.view === 'categories') renderCategories();
  else if (state.view === 'org') renderOrgPage();
  else if (state.view === 'admin') await renderAdmin();
}
// Pick up others' changes when coming back to the tab, but not on every click into the window
let lastRefresh = Date.now();
window.addEventListener('focus', async () => {
  if (!state.orgId || modal.open || Date.now() - lastRefresh < 60_000) return;
  lastRefresh = Date.now();
  await loadBase();
  render();
});

// ---------------------------------------------------------------------
// Categories helpers
// ---------------------------------------------------------------------
const catById = (id) => state.categories.find((c) => c.id === id);
const parents = () => state.categories.filter((c) => !c.parent_id);
const childrenOf = (id) => state.categories.filter((c) => c.parent_id === id);
function catPath(id) {
  const c = catById(id);
  if (!c) return '';
  const p = c.parent_id ? catById(c.parent_id) : null;
  return p ? `${p.name} › ${c.name}` : c.name;
}
function categoryOptions(selected) {
  let h = `<option value="">${esc(t('place.noCategory'))}</option>`;
  for (const p of parents()) {
    h += `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`;
    for (const c of childrenOf(p.id)) {
      h += `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>&nbsp;&nbsp;└ ${esc(c.name)}</option>`;
    }
  }
  return h;
}
function placeOptions(selected) {
  const groups = new Map();
  for (const p of state.places) {
    const key = catPath(p.category_id) || t('places.none');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  let h = `<option value="">${esc(t('ev.selectPlace'))}</option>`;
  for (const [g, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    h += `<optgroup label="${esc(g)}">`;
    for (const p of list) h += `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`;
    h += '</optgroup>';
  }
  return h;
}

// ---------------------------------------------------------------------
// Places view
// ---------------------------------------------------------------------
$('#place-search').addEventListener('input', (e) => { state.search = e.target.value.trim().toLowerCase(); renderPlaceList(); });
$('#add-place').addEventListener('click', () => placeForm());
// Category navigation: side tree, tiles and breadcrumb all use data-cat
function selectCat(key) {
  state.selectedCat = String(key);
  renderPlaces();
  const top = $('#view-places').getBoundingClientRect().top + window.scrollY - 80;
  if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
}
$('#cat-tree').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  // Clicking an open main category folds it again
  if (b.dataset.main && b.getAttribute('aria-expanded') === 'true' && state.selectedCat === b.dataset.cat) return selectCat('root');
  selectCat(b.dataset.cat);
});
$('#place-crumbs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (b) selectCat(b.dataset.cat);
});

function placesInCat(sel) {
  if (sel === 'all' || sel === 'root') return state.places;
  if (sel === 'none') return state.places.filter((p) => !p.category_id);
  const id = Number(sel);
  const ids = new Set([id, ...childrenOf(id).map((c) => c.id)]);
  return state.places.filter((p) => ids.has(p.category_id));
}

// Which main category is unfolded (the selected one, or the parent of the selected sub-category)
function openMainId() {
  const c = catById(Number(state.selectedCat));
  if (!c) return null;
  return c.parent_id || c.id;
}

function renderPlaces() {
  // A deleted or unknown category falls back to the start screen
  const sel = state.selectedCat;
  if (!['root', 'all', 'none'].includes(sel) && !catById(Number(sel))) state.selectedCat = 'root';
  const open = openMainId();
  const count = (key) => `<span class="count">${placesInCat(String(key)).length}</span>`;
  const cls = (key) => (state.selectedCat === String(key) ? 'active' : '');
  let h = `<button data-cat="all" class="${cls('all')}"><span>${esc(t('places.all'))}</span>${count('all')}</button>`;
  for (const p of parents()) {
    const kids = childrenOf(p.id);
    const expanded = open === p.id;
    h += `<button data-cat="${p.id}" data-main="1" class="main ${cls(p.id)}" aria-expanded="${expanded}">
        <span class="lbl">${kids.length ? ic('right', 'sm chev') : `<span class="chev-gap"></span>`}<span>${esc(p.name)}</span></span>${count(p.id)}</button>`;
    if (expanded && kids.length) {
      h += `<div class="kids">${kids.map((c) =>
        `<button data-cat="${c.id}" class="child ${cls(c.id)}"><span>${esc(c.name)}</span>${count(c.id)}</button>`).join('')}</div>`;
    }
  }
  if (state.places.some((p) => !p.category_id)) {
    h += `<button data-cat="none" class="${cls('none')}"><span>${esc(t('places.none'))}</span>${count('none')}</button>`;
  }
  $('#cat-tree').innerHTML = h;
  renderPlaceList();
}

function catTile(cat, kind) {
  const n = kind === 'none' ? placesInCat('none').length : placesInCat(String(cat.id)).length;
  const kids = kind === 'none' ? [] : childrenOf(cat.id);
  const subs = kids.slice(0, 3).map((c) => c.name).join(t('listSep')) + (kids.length > 3 ? ` +${kids.length - 3}` : '');
  const hue = kind === 'none' ? 'hue-n' : catHue(cat);
  return `<button type="button" class="cat-tile cover ${hue}" data-cat="${kind === 'none' ? 'none' : cat.id}">
      ${coverArt({ name: `cat:${cat.name}` })}
      <span class="cover-top"><span class="cover-cat">${esc(t('cats.placesCount', { n }))}</span>${ic('right', 'go')}</span>
      <span class="tile-name">${esc(cat.name)}</span>
      <span class="tile-subs">${esc(subs)}</span>
    </button>`;
}

function crumbs(trail) {
  const sep = ic('right', 'sm sep');
  const parts = trail.map((c, i) => (i === trail.length - 1
    ? `<span class="crumb current" aria-current="page">${esc(c.label)}</span>`
    : `<button type="button" class="crumb" data-cat="${c.key}">${esc(c.label)}</button>`));
  return parts.join(sep);
}

function renderPlaceList() {
  const root = { key: 'root', label: t('nav.places') };
  const sel = state.selectedCat;
  const cat = catById(Number(sel));
  let trail = [root];
  let tiles = '';
  let lists = [];          // [{ title?, places }]

  if (state.search) {
    const hits = state.places.filter((p) => [p.name, p.note, catPath(p.category_id)].join(' ').toLowerCase().includes(state.search));
    trail = [root, { label: t('places.results') }];
    lists = [{ places: hits }];
  } else if (sel === 'all' || (sel === 'root' && !parents().length)) {
    trail = parents().length ? [root, { label: t('places.all') }] : [root];
    lists = [{ places: state.places }];
  } else if (sel === 'none') {
    trail = [root, { label: t('places.none') }];
    lists = [{ places: placesInCat('none') }];
  } else if (sel === 'root') {
    tiles = parents().map((p) => catTile(p)).join('');
    if (state.places.some((p) => !p.category_id)) tiles += catTile({ name: t('places.none') }, 'none');
  } else if (cat && !cat.parent_id) {
    trail = [root, { label: cat.name }];
    const kids = childrenOf(cat.id);
    const direct = state.places.filter((p) => p.category_id === cat.id);
    if (kids.length) {
      tiles = kids.map((c) => catTile(c)).join('');
      if (direct.length) lists = [{ title: t('places.direct', { name: cat.name }), places: direct }];
    } else {
      lists = [{ places: direct }];
    }
  } else if (cat) {
    const main = catById(cat.parent_id);
    trail = [root, { key: main.id, label: main.name }, { label: cat.name }];
    lists = [{ places: state.places.filter((p) => p.category_id === cat.id) }];
  }

  // On the start screen, offer "All places" next to the breadcrumb (the side list is hidden on phones)
  const allLink = sel === 'root' && parents().length && state.places.length && !state.search
    ? `<button type="button" class="crumb-all" data-cat="all">${esc(t('places.all'))} <span class="count">${state.places.length}</span></button>` : '';
  $('#place-crumbs').innerHTML = `<div class="crumb-trail">${crumbs(trail)}</div>${allLink}`;

  let html = tiles ? `<div class="cat-tiles">${tiles}</div>` : '';
  for (const l of lists) {
    if (l.title) html += `<h2 class="list-head">${esc(l.title)}</h2>`;
    html += `<div class="place-grid">${l.places.map(placeCard).join('')}</div>`;
  }
  const shown = lists.reduce((n, l) => n + l.places.length, 0);
  if (!state.places.length) {
    html = `<div class="empty">${ic('map')}<strong>${esc(t('places.emptyTitle'))}</strong><p>${esc(t('places.emptyAll'))}</p>
           <button class="primary" data-act="add">${ic('plus')}${esc(t('places.add'))}</button></div>`;
  } else if (!tiles && !shown) {
    html = `<div class="empty compact">${ic(state.search ? 'search' : 'folder')}<span>${esc(t('places.empty'))}</span></div>`;
  }
  $('#place-list').innerHTML = html;
  // Pick up events created since the last look (at most every 10 s)
  if (Date.now() - state.nextAt > 10_000) {
    loadNext().then((changed) => { if (changed && state.view === 'places') renderPlaceList(); }).catch(() => {});
  }
}

// ---------------------------------------------------------------------
// Place cover: a small generated "map" in the category's colour, with the
// place name and the next time something is planned there.
// ---------------------------------------------------------------------
function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seeded(seed) {   // mulberry32
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t2 = Math.imul(a ^ (a >>> 15), 1 | a);
    t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
}
const COVER_HUES = 6;
// Colour follows the main category, so a category's tile and its places match
function catHue(cat) {
  const root = cat?.parent_id ? catById(cat.parent_id) : cat;
  return root ? `hue-${hashStr(root.id + ':' + root.name) % COVER_HUES}` : 'hue-n';
}
const coverHue = (place) => catHue(catById(place.category_id));
// Contour lines + a pin, deterministic per place name
function coverArt(place) {
  const rnd = seeded(hashStr(place.name));
  const W = 400, H = 200;
  let lines = '';
  const layers = 7;
  for (let i = 0; i < layers; i++) {
    const base = 14 + i * (H / (layers - 1)) + (rnd() - .5) * 10;
    const amp = 5 + rnd() * 16, freq = .008 + rnd() * .014, phase = rnd() * Math.PI * 2;
    const amp2 = rnd() * 6, freq2 = .03 + rnd() * .02;
    let d = '';
    for (let x = -10; x <= W + 10; x += 10) {
      const y = base + amp * Math.sin(x * freq + phase) + amp2 * Math.sin(x * freq2 + phase * 2);
      d += `${d ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
    }
    lines += `<path d="${d}" opacity="${(.35 + rnd() * .5).toFixed(2)}"/>`;
  }
  const px = (W * .55 + rnd() * W * .35).toFixed(0), py = (H * .22 + rnd() * H * .3).toFixed(0);
  return `<svg class="topo" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.1">${lines}</g>
      <circle class="pin-halo" cx="${px}" cy="${py}" r="30"/><circle class="pin-ring" cx="${px}" cy="${py}" r="15"/>
      <circle class="pin-dot" cx="${px}" cy="${py}" r="5"/>
    </svg>`;
}

function nextChip(place) {
  const ev = state.next.get(place.id);
  if (!ev) return `<span class="when none">${ic('calendar', 'sm')}${esc(t('cover.none'))}</span>`;
  const d = new Date(ev.starts_at);
  const more = (state.nextCount.get(place.id) || 1) - 1;
  const label = t('cover.next', { title: ev.title });
  return `<button type="button" class="when" data-act="open-event" data-id="${ev.id}" data-at="${esc(ev.starts_at)}"
      title="${esc(label)}" aria-label="${esc(`${label} · ${fmtDate(d)} ${fmtTime(d)}`)}">
      ${ic('calendar', 'sm')}<time datetime="${esc(ev.starts_at)}">${esc(fmtDate(d))} · ${esc(fmtTime(d))}</time>${
      more > 0 ? `<span class="when-more">+${more}</span>` : ''}</button>`;
}

function placeCard(p) {
  const cat = p.category_id ? catPath(p.category_id) : '';
  return `
    <article class="place-card">
      <div class="cover ${coverHue(p)}">
        ${coverArt(p)}
        <div class="cover-top">
          ${cat ? `<span class="cover-cat">${esc(cat)}</span>` : '<span></span>'}
          ${ic('out', 'go')}
        </div>
        <a class="card-link" href="${esc(safeUrl(p.map_url))}" target="_blank" rel="noopener" title="${esc(t('places.open'))}">
          <span class="name">${esc(p.name)}</span>
        </a>
        ${nextChip(p)}
      </div>
      ${p.note ? `<span class="note">${esc(p.note)}</span>` : ''}
      <span class="actions">
        <button class="small" data-act="event" data-id="${p.id}">${ic('calendar', 'sm')}${esc(t('places.event'))}</button>
        ${canEditPlace(p) ? `<button class="small" data-act="edit" data-id="${p.id}">${ic('pencil', 'sm')}${esc(t('edit'))}</button>` : ''}
      </span>
    </article>`;
}

// Next upcoming (not cancelled) event per place, for the covers
async function loadNext() {
  const org = state.orgId;
  const rows = check(await sb.from('events').select('id, place_id, title, starts_at')
    .eq('org_id', org).eq('cancelled', false).gte('starts_at', new Date().toISOString())
    .order('starts_at').limit(500));
  if (org !== state.orgId) return false;
  const next = new Map();
  const count = new Map();
  for (const r of rows) {
    if (!next.has(r.place_id)) next.set(r.place_id, r);
    count.set(r.place_id, (count.get(r.place_id) || 0) + 1);
  }
  const sig = JSON.stringify([...next.values()].map((r) => [r.id, r.title, r.starts_at]).concat([...count]));
  const changed = sig !== state.nextSig;
  Object.assign(state, { next, nextCount: count, nextSig: sig, nextAt: Date.now() });
  return changed;
}

async function openEventFromCover(id, startsAt) {
  state.month = startOfMonth(new Date(startsAt));
  await switchView('calendar');
  eventDetail(id);
}

$('#place-list').addEventListener('click', (e) => {
  const tile = e.target.closest('button[data-cat]');
  if (tile) return selectCat(tile.dataset.cat);
  const b = e.target.closest('button[data-act]');
  if (!b) return;           // the card's own link opens Google Maps
  e.preventDefault();
  if (b.dataset.act === 'add') return placeForm();
  if (b.dataset.act === 'open-event') return openEventFromCover(Number(b.dataset.id), b.dataset.at);
  const place = state.places.find((p) => p.id === Number(b.dataset.id));
  if (b.dataset.act === 'edit') placeForm(place);
  if (b.dataset.act === 'event') eventForm({ placeId: place.id });
});

function placeForm(place = null) {
  const left = place ? null : placesLeftToday();
  if (left === 0) return toast(t('place.limit', { n: myMember()?.organizer ? 2 : 1 }), true);
  const preCat = place ? place.category_id
    : (/^\d+$/.test(String(state.selectedCat)) ? Number(state.selectedCat) : null);
  const body = openModal(`
    <div class="modal-head"><h2>${esc(t(place ? 'place.editTitle' : 'place.addTitle'))}</h2>${closeBtn()}</div>
    ${left != null ? `<p class="muted small">${esc(t('place.quota', { n: left }))}</p>` : ''}
    <form id="place-form">
      <div class="field">
        <label>${esc(t('place.link'))}</label>
        <textarea name="map_url" rows="2" required placeholder="${esc(t('place.linkPh'))}">${esc(place?.map_url || '')}</textarea>
      </div>
      <div class="field"><label>${esc(t('place.name'))}</label><input name="name" required value="${esc(place?.name || '')}"></div>
      <div class="field"><label>${esc(t('place.category'))}</label><select name="category_id">${categoryOptions(preCat)}</select></div>
      <div class="field"><label>${esc(t('place.note'))}</label><textarea name="note" placeholder="${esc(t('place.notePh'))}">${esc(place?.note || '')}</textarea></div>
      <div class="modal-foot">
        ${place ? `<button type="button" class="danger" id="del-place">${esc(t('delete'))}</button><span class="spacer"></span>` : ''}
        <button type="button" data-close>${esc(t('cancel'))}</button>
        <button class="primary">${esc(t('save'))}</button>
      </div>
    </form>`);
  const f = $('#place-form', body);
  f.map_url.addEventListener('input', () => {
    const parsed = parseShareText(f.map_url.value);
    if (!parsed) return;
    if (parsed.url !== f.map_url.value.trim()) f.map_url.value = parsed.url;
    if (parsed.name && !f.name.value) f.name.value = parsed.name;
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = (parseShareText(f.map_url.value)?.url || '').trim();
    if (!url) return toast(t('place.needUrl'), true);
    if (!isGoogleMapsUrl(url) && !confirm(t('place.notGoogle'))) return;
    const row = {
      name: f.name.value.trim(),
      map_url: url,
      category_id: f.category_id.value ? Number(f.category_id.value) : null,
      note: f.note.value.trim(),
    };
    if (place) check(await sb.from('places').update(row).eq('id', place.id));
    else check(await sb.from('places').insert({ ...row, org_id: state.orgId }));
    closeModal();
    toast(t('saved'));
    await loadBase();
    render();
  });
  $('#del-place', body)?.addEventListener('click', async () => {
    if (!confirm(t('place.confirmDelete', { name: place.name }))) return;
    check(await sb.from('places').delete().eq('id', place.id));
    closeModal();
    await loadBase();
    render();
  });
}

// ---------------------------------------------------------------------
// Categories view
// ---------------------------------------------------------------------
$('#add-parent-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#new-parent-name').value.trim();
  if (!name) return;
  check(await sb.from('categories').insert({ org_id: state.orgId, name }));
  $('#new-parent-name').value = '';
  await loadBase();
  renderCategories();
});

function renderCategories() {
  const list = parents();
  if (!list.length) {
    $('#cat-manage').innerHTML = `<div class="empty compact">${ic('folder')}<span>${esc(t('cats.none'))}</span></div>`;
    return;
  }
  const actions = (id) => `
    <button class="ghost icon" data-act="rename" data-id="${id}" title="${esc(t('rename'))}" aria-label="${esc(t('rename'))}">${ic('pencil', 'sm')}</button>
    <button class="ghost icon danger" data-act="delete" data-id="${id}" title="${esc(t('delete'))}" aria-label="${esc(t('delete'))}">${ic('x', 'sm')}</button>`;
  $('#cat-manage').innerHTML = list.map((p) => `
    <div class="cat-block">
      <div class="cat-line parent">
        <span class="nm">${esc(p.name)}</span>
        <span class="cnt">${esc(t('cats.placesCount', { n: placesInCat(String(p.id)).length }))}</span>
        ${actions(p.id)}
      </div>
      <div class="cat-children">
        ${childrenOf(p.id).map((c) => `
          <div class="cat-line">
            <span class="nm">${esc(c.name)}</span>
            <span class="cnt">${placesInCat(String(c.id)).length}</span>
            ${actions(c.id)}
          </div>`).join('')}
        <form class="inline" data-parent="${p.id}">
          <input placeholder="${esc(t('cats.newChildPh', { name: p.name }))}" required>
          <button class="small">${ic('plus', 'sm')}${esc(t('add'))}</button>
        </form>
      </div>
    </div>`).join('');
}
$('#cat-manage').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const name = f.querySelector('input').value.trim();
  if (!name) return;
  check(await sb.from('categories').insert({ org_id: state.orgId, name, parent_id: Number(f.dataset.parent) }));
  await loadBase();
  renderCategories();
});
$('#cat-manage').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const c = catById(Number(b.dataset.id));
  if (b.dataset.act === 'rename') {
    const name = prompt(t('cats.renamePrompt'), c.name);
    if (!name?.trim()) return;
    check(await sb.from('categories').update({ name: name.trim() }).eq('id', c.id));
  } else {
    if (!confirm(t(c.parent_id ? 'cats.deleteChild' : 'cats.deleteParent', { name: c.name }))) return;
    check(await sb.from('categories').delete().eq('id', c.id));
    if (String(state.selectedCat) === String(c.id)) state.selectedCat = 'root';
  }
  await loadBase();
  renderCategories();
});

// ---------------------------------------------------------------------
// Organization / members view
// ---------------------------------------------------------------------
const inviteLink = (code) => `${location.origin}${location.pathname}?join=${code}`;
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(t('org.copied')); }
  catch { prompt('', text); }
}

function memberBadges(m) {
  if (m.role === 'owner') return `<span class="role">${esc(t('org.owner'))}</span>`;
  return (m.organizer ? `<span class="role">${esc(t('perm.organizer'))}</span>` : '')
    + (m.can_create ? '' : `<span class="badge wait">${esc(t('perm.noCreate'))}</span>`)
    + (m.can_join ? '' : `<span class="badge wait">${esc(t('perm.noJoin'))}</span>`);
}

function renderOrgPage() {
  const org = currentOrg();
  const owner = org.role === 'owner';
  $('#org-name').textContent = org.name;
  $('#org-rename').hidden = !owner;
  $('#new-code').hidden = !owner;
  $('#org-delete').hidden = !owner;
  $('#invite-code').textContent = org.invite_code;
  $('#display-name').value = state.profile.display_name;
  $('#member-title').textContent = t('org.members', { n: state.members.length });
  $('#member-list').innerHTML = state.members.map((m) => {
    const me = m.user_id === state.user.id;
    const name = m.profiles?.display_name || '?';
    return `<li><span class="who-line">${avatar(name)}<span>${esc(name)}${me ? ` <span class="muted">${esc(t('fam.you'))}</span>` : ''}${
        memberBadges(m)}</span></span></li>`;
  }).join('');
  $('#my-orgs').innerHTML = state.orgs.map((o) => `
    <li><span class="who-line">${avatar(o.name)}<span>${esc(o.name)}${o.role === 'owner' ? `<span class="role">${esc(t('org.owner'))}</span>` : ''}</span></span>
      ${o.id === state.orgId ? `<span class="badge ok">${ic('check', 'sm')}${esc(t('org.current'))}</span>`
        : `<button class="ghost icon" data-switch-org="${o.id}" aria-label="${esc(o.name)}">${ic('right')}</button>`}</li>`).join('');
}

$('#copy-code').addEventListener('click', () => copy(currentOrg().invite_code));
$('#copy-link').addEventListener('click', () => copy(inviteLink(currentOrg().invite_code)));
$('#new-code').addEventListener('click', async () => {
  if (!confirm(t('org.newCodeConfirm'))) return;
  currentOrg().invite_code = check(await sb.rpc('regenerate_invite_code', { p_org: state.orgId }));
  renderOrgPage();
});
$('#org-rename').addEventListener('click', async () => {
  const org = currentOrg();
  const name = prompt(t('org.renamePrompt'), org.name);
  if (!name?.trim()) return;
  check(await sb.from('organizations').update({ name: name.trim() }).eq('id', org.id));
  org.name = name.trim();
  renderOrgSelect();
  renderOrgPage();
});
$('#org-add').addEventListener('click', () => {
  const body = openModal(`<div class="modal-head"><span></span>${closeBtn()}</div><div id="onb-modal"></div>`);
  renderOnboarding($('#onb-modal', body));
});
$('#my-orgs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-switch-org]');
  if (b) enterOrg(Number(b.dataset.switchOrg));
});
// ---------------------------------------------------------------------
// Permissions page (owner only)
// ---------------------------------------------------------------------
async function renderAdmin() {
  const L = (k, v) => esc(t(k, v));
  const perm = (m, k, label) => `<label class="checkline small"><input type="checkbox" data-perm="${k}" data-user="${m.user_id}" ${m[k] ? 'checked' : ''}> ${L(label)}</label>`;
  $('#admin-list').innerHTML = state.members.map((m) => {
    const name = m.profiles?.display_name || '?';
    const head = `<span class="who-line">${avatar(name)}<span>${esc(name)}${memberBadges(m)}
      <span class="muted small block">${L('admin.joined', { date: fmtYmd(m.joined_at.slice(0, 10)) })}</span></span></span>`;
    if (m.role === 'owner') return `<li>${head}</li>`;
    return `<li>${head}
      <span class="perms">${perm(m, 'organizer', 'perm.organizer')}${perm(m, 'can_create', 'perm.create')}${perm(m, 'can_join', 'perm.join')}</span>
      <span class="btn-row tight">
        <button class="small" data-kick="${m.user_id}">${L('admin.kick')}</button>
        <button class="small danger" data-ban="${m.user_id}">${L('admin.ban')}</button>
      </span></li>`;
  }).join('');
  $('#ban-list').innerHTML = skeletons('row-sk', 1);
  const org = state.orgId;
  const bans = check(await sb.from('org_bans').select('*').eq('org_id', org).order('banned_at', { ascending: false }));
  if (org !== state.orgId || state.view !== 'admin') return;
  $('#ban-list').innerHTML = bans.map((b) => `
    <li><span class="who-line">${avatar(b.display_name)}<span>${esc(b.display_name || '?')}
      <span class="muted small block">${L('admin.bannedAt', { time: fmtStamp(b.banned_at) })}</span></span></span>
      <button class="small" data-unban="${b.user_id}">${L('admin.unban')}</button></li>`).join('')
    || `<li class="muted">${L('admin.noBans')}</li>`;
}

$('#admin-list').addEventListener('change', async (e) => {
  const box = e.target.closest('[data-perm]');
  if (!box) return;
  const m = state.members.find((x) => x.user_id === box.dataset.user);
  const next = { organizer: m.organizer, can_create: m.can_create, can_join: m.can_join, [box.dataset.perm]: box.checked };
  box.disabled = true;
  try {
    check(await sb.rpc('set_member_permissions', { p_org: state.orgId, p_user: m.user_id,
      p_organizer: next.organizer, p_can_create: next.can_create, p_can_join: next.can_join }));
    Object.assign(m, next);
    toast(t('perm.saved'));
    renderAdmin();
  } catch (err) {
    box.checked = !box.checked;
    console.error(err);
  } finally {
    box.disabled = false;
  }
});
$('#admin-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-kick], [data-ban]');
  if (!b) return;
  const id = b.dataset.kick || b.dataset.ban;
  const name = state.members.find((x) => x.user_id === id)?.profiles?.display_name || '';
  if (b.dataset.kick) {
    if (!confirm(t('org.removeConfirm', { name }))) return;
    check(await sb.from('org_members').delete().eq('org_id', state.orgId).eq('user_id', id));
  } else {
    if (!confirm(t('admin.banConfirm', { name }))) return;
    check(await sb.rpc('ban_member', { p_org: state.orgId, p_user: id }));
  }
  await loadBase();
  renderAdmin();
});
$('#ban-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-unban]');
  if (!b) return;
  check(await sb.rpc('unban_member', { p_org: state.orgId, p_user: b.dataset.unban }));
  toast(t('admin.unbanned'));
  renderAdmin();
});
$('#org-leave').addEventListener('click', async () => {
  const org = currentOrg();
  if (!confirm(t('org.leaveConfirm', { name: org.name }))) return;
  check(await sb.from('org_members').delete().eq('org_id', org.id).eq('user_id', state.user.id));
  state.orgId = null;
  await loadOrgs();
  enterOrg(state.orgId);
});
$('#org-delete').addEventListener('click', async () => {
  const org = currentOrg();
  if (prompt(t('org.deleteConfirm', { name: org.name }))?.trim() !== org.name) return;
  check(await sb.from('organizations').delete().eq('id', org.id));
  state.orgId = null;
  await loadOrgs();
  enterOrg(state.orgId);
});
$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#new-password');
  const btn = $('button.primary', e.target);
  btn.disabled = true;
  const { error } = await sb.auth.updateUser({ password: input.value });
  btn.disabled = false;
  if (error) return toast(authMessage(error), true);
  input.value = '';
  toast(t('auth.pwSaved'));
});
$('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const display_name = $('#display-name').value.trim();
  state.profile = check(await sb.from('profiles').update({ display_name }).eq('id', state.user.id).select().single());
  await loadBase();
  renderOrgPage();
  toast(t('saved'));
});

// ---------------------------------------------------------------------
// Calendar data
// ---------------------------------------------------------------------
function gridRange() {
  const first = state.month;
  const start = addDays(first, -first.getDay());
  return { start, end: addDays(start, 42) };
}

let loadSeq = 0;
async function loadEvents() {
  const mySeq = ++loadSeq;
  const { start, end } = gridRange();
  const today = new Date(new Date().toDateString());
  const from = start < today ? start : today;
  const upTo = addDays(today, 31);
  const to = end > upTo ? end : upTo;

  const events = check(await sb.from('events').select('*').eq('org_id', state.orgId)
    .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at'));
  const parts = new Map();
  const ids = events.map((e) => e.id);
  const seriesIds = [...new Set(events.map((e) => e.series_id))];

  const chunks = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  const [partResults, series, subs] = await Promise.all([
    Promise.all(chunks.map((c) => sb.from('event_participant_status').select('*').in('event_id', c).order('position'))),
    seriesIds.length ? sb.from('event_series').select('*').in('id', seriesIds) : { data: [] },
    sb.from('series_subscribers').select('series_id').eq('user_id', state.user.id),
  ]);
  for (const r of partResults) {
    for (const p of check(r)) {
      if (!parts.has(p.event_id)) parts.set(p.event_id, []);
      parts.get(p.event_id).push(p);
    }
  }
  if (mySeq !== loadSeq) return false;   // a newer load started; drop this one
  state.events = events;
  state.parts = parts;
  state.series = new Map(check(series).map((s) => [s.id, s]));
  state.mySubs = new Set(check(subs).map((s) => s.series_id));
  return true;
}

function eventStats(ev) {
  const parts = state.parts.get(ev.id) || [];
  const confirmed = parts.filter((p) => p.status === 'confirmed');
  const waitlist = parts.filter((p) => p.status === 'waitlist');
  const mine = parts.find((p) => p.user_id === state.user.id && !p.guest_name);
  return { parts, confirmed, waitlist, mine, full: ev.capacity != null && confirmed.length >= ev.capacity };
}

function repeatText(s) {
  if (!s || s.freq === 'none') return t('rt.none');
  const n = s.interval_n;
  let txt;
  if (s.freq === 'daily') txt = n === 1 ? t('rt.daily1') : t('rt.dailyN', { n });
  if (s.freq === 'weekly') {
    const wd = WD();
    const days = (s.weekdays?.length ? s.weekdays : [new Date(s.start_date + 'T00:00').getDay()])
      .slice().sort().map((d) => wd[d]).join(t('listSep'));
    txt = n === 1 ? t('rt.weekly1', { days }) : t('rt.weeklyN', { n, days });
  }
  if (s.freq === 'monthly') {
    const d = Number(s.start_date.slice(8));
    txt = n === 1 ? t('rt.monthly1', { d }) : t('rt.monthlyN', { n, d });
  }
  return txt + (s.until_date ? t('rt.until', { date: fmtYmd(s.until_date) }) : '') + (s.active ? '' : t('rt.stopped'));
}

// ---------------------------------------------------------------------
// Calendar view
// ---------------------------------------------------------------------
$('#cal-prev').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
$('#cal-next').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });
$('#cal-today').addEventListener('click', () => { state.month = startOfMonth(new Date()); renderCalendar(); });
$('#add-event').addEventListener('click', () => eventForm());
$('#cal-history').addEventListener('click', () => orgHistory());

async function renderCalendar() {
  $('#cal-title').textContent = state.month.toLocaleDateString(i18n.locale, { year: 'numeric', month: 'long' });
  if (!$('#cal-grid').children.length) $('#upcoming').innerHTML = skeletons('row-sk', 3);
  if (!(await loadEvents())) return;
  const { start } = gridRange();
  const todayKey = dateKey(new Date());
  const byDay = new Map();
  for (const ev of state.events) {
    const k = dateKey(new Date(ev.starts_at));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(ev);
  }

  let h = WD().map((d) => `<div class="cal-head">${esc(d)}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const k = dateKey(d);
    const evs = byDay.get(k) || [];
    const cls = ['cal-day', d.getMonth() !== state.month.getMonth() && 'other', k === todayKey && 'today'].filter(Boolean).join(' ');
    const chips = evs.slice(0, 3).map((ev) => {
      const st = eventStats(ev);
      const c = ['chip', st.full && 'full', st.mine && 'mine', ev.cancelled && 'cancelled'].filter(Boolean).join(' ');
      return `<button class="${c}" data-ev="${ev.id}" title="${esc(ev.title)}"><span class="t">${fmtTime(new Date(ev.starts_at))} </span>${esc(ev.title)}</button>`;
    }).join('');
    const more = evs.length > 3 ? `<span class="more">${esc(t('cal.more', { n: evs.length - 3 }))}</span>` : '';
    h += `<div class="${cls}" data-date="${k}"><span class="num">${d.getDate()}</span>${chips}${more}</div>`;
  }
  $('#cal-grid').innerHTML = h;
  renderUpcoming();
}

$('#cal-grid').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-ev]');
  if (chip) return eventDetail(Number(chip.dataset.ev));
  const day = e.target.closest('[data-date]');
  if (!day) return;
  const evs = state.events.filter((ev) => dateKey(new Date(ev.starts_at)) === day.dataset.date);
  if (evs.length > 3) dayList(day.dataset.date, evs);
  else eventForm({ date: day.dataset.date });
});

function dayList(key, evs) {
  const body = openModal(`
    <div class="modal-head"><h2>${esc(fmtDateLong(new Date(key + 'T00:00')))}</h2>${closeBtn()}</div>
    <div class="upcoming">${evs.map(upItem).join('')}</div>
    <div class="modal-foot"><button class="primary" id="day-new">${ic('plus')}${esc(t('day.newHere'))}</button></div>`);
  $('#day-new', body).addEventListener('click', () => eventForm({ date: key }));
  body.querySelectorAll('[data-ev]').forEach((el) => el.addEventListener('click', () => eventDetail(Number(el.dataset.ev))));
}

function myBadge(ev) {
  const st = eventStats(ev);
  if (ev.cancelled) return `<span class="badge off">${esc(t('badge.cancelled'))}</span>`;
  if (!st.mine) return '';
  if (st.mine.status === 'confirmed') return `<span class="badge ok">${esc(t('badge.joined'))}</span>`;
  return `<span class="badge wait">${esc(t('badge.waitlist', { n: st.waitlist.indexOf(st.mine) + 1 }))}</span>`;
}
function countHtml(ev) {
  const st = eventStats(ev);
  const cap = ev.capacity != null ? `${st.confirmed.length}/${ev.capacity}` : `${st.confirmed.length}`;
  return `<span>${ic('users', 'sm')}${cap}</span>${st.waitlist.length
    ? `<span>${ic('hourglass', 'sm')}${esc(t('count.waiting', { n: st.waitlist.length }))}</span>` : ''}`;
}
// Right side of an upcoming row: my status, or a one-tap Join button
function upAction(ev) {
  const st = eventStats(ev);
  if (!ev.cancelled && st.mine?.status === 'confirmed') return `<span class="badge ok">${ic('check', 'sm')}${esc(t('badge.joined'))}</span>`;
  if (ev.cancelled || st.mine) return myBadge(ev);
  if (!canJoin()) return '';
  return `<button class="small ${st.full ? '' : 'primary'}" data-join="${ev.id}">${esc(t(st.full ? 'ev.joinWait' : 'ev.join'))}</button>`;
}
function spotsHtml(ev) {
  if (ev.cancelled || ev.capacity == null) return '';
  const left = ev.capacity - eventStats(ev).confirmed.length;
  return left > 0 ? `<span class="spots">${esc(t('up.left', { n: left }))}</span>`
    : `<span class="spots full">${esc(t('up.full'))}</span>`;
}
function upItem(ev) {
  const d = new Date(ev.starts_at);
  const place = state.places.find((p) => p.id === ev.place_id);
  return `<div class="up-item" data-ev="${ev.id}">
    <div class="up-date">${esc(fmtDate(d))}<div class="muted small">${esc(fmtTime(d))}</div></div>
    <div class="up-main"><b>${esc(ev.title)}</b>
      <div class="up-meta"><span>${ic('pin', 'sm')}${esc(place?.name || '')}</span>${countHtml(ev)}${spotsHtml(ev)}</div></div>
    <div class="up-act">${upAction(ev)}${ic('right', 'sm chev')}</div>
  </div>`;
}
function renderUpcoming() {
  const now = new Date();
  const until = addDays(now, 30);
  const list = state.events.filter((ev) => new Date(ev.ends_at) >= now && new Date(ev.starts_at) <= until);
  $('.up-guide').hidden = !list.length;
  $('#upcoming').innerHTML = list.length ? list.map(upItem).join('')
    : `<div class="empty compact">${ic('calendar')}<span>${esc(t('cal.noUpcoming'))}</span></div>`;
}
$('#upcoming').addEventListener('click', async (e) => {
  const join = e.target.closest('[data-join]');
  if (join) {
    const ev = state.events.find((x) => x.id === Number(join.dataset.join));
    const full = eventStats(ev).full;
    join.disabled = true;
    try {
      check(await sb.from('event_participants').insert({ event_id: ev.id }));
      toast(t(full ? 'ev.addedWait' : 'ev.joined'));
      await renderCalendar();
    } catch (err) { console.error(err); join.disabled = false; }
    return;
  }
  const it = e.target.closest('[data-ev]');
  if (it) eventDetail(Number(it.dataset.ev));
});

// ---------------------------------------------------------------------
// Event form (create a one-off or repeating event)
// ---------------------------------------------------------------------
function eventForm({ placeId = null, date = null } = {}) {
  if (!canCreate()) return toast(t('ban.noCreate'), true);
  if (!state.places.length) return toast(t('ev.needPlace'), true);
  const d = date || dateKey(new Date());
  const place = state.places.find((p) => p.id === placeId);
  const L = (k) => esc(t(k));
  const body = openModal(`
    <div class="modal-head"><h2>${L('ev.new')}</h2>${closeBtn()}</div>
    <form id="event-form">
      <div class="field"><label>${L('ev.place')}</label><select name="place_id" required>${placeOptions(placeId)}</select></div>
      <div class="field"><label>${L('ev.title')}</label><input name="title" required value="${esc(place?.name || '')}"></div>
      <div class="row">
        <div class="field"><label>${L('ev.date')}</label><input type="date" name="start_date" required value="${d}"></div>
        <div class="field"><label>${L('ev.start')}</label><input type="time" name="start_time" required value="10:00"></div>
        <div class="field"><label>${L('ev.end')}</label><input type="time" name="end_time" required value="12:00"></div>
      </div>
      <div class="row">
        <div class="field"><label>${L('ev.repeat')}</label>
          <select name="freq">
            <option value="none">${L('rep.none')}</option>
            <option value="weekly">${L('rep.weekly')}</option>
            <option value="daily">${L('rep.daily')}</option>
            <option value="monthly">${L('rep.monthly')}</option>
          </select></div>
        <div class="field rep"><label>${L('ev.every')}</label><input type="number" name="interval_n" min="1" max="52" value="1"></div>
      </div>
      <div class="field rep weekly"><label>${L('ev.on')}</label>
        <div class="checks">${WD().map((w, i) => `<label><input type="checkbox" name="wd" value="${i}">${esc(w)}</label>`).join('')}</div></div>
      <div class="field rep"><label>${L('ev.until')}</label><input type="date" name="until_date"></div>
      <div class="field"><label>${L('ev.limit')}</label>
        <input type="number" name="capacity" min="1" placeholder="${L('ev.limitPh')}"></div>
      <div class="field"><label>${L('ev.details')}</label><textarea name="description" placeholder="${L('ev.detailsPh')}"></textarea></div>
      <div class="field"><label class="checkline"><input type="checkbox" name="autojoin" checked> ${L('ev.joining')} <span class="rep">${L('ev.everyTime')}</span></label></div>
      <div class="modal-foot"><button type="button" data-close>${L('cancel')}</button><button class="primary">${L('create')}</button></div>
    </form>`);
  const f = $('#event-form', body);
  const sync = () => {
    const freq = f.freq.value;
    $$('.rep', f).forEach((el) => { el.hidden = freq === 'none'; });
    $$('.weekly', f).forEach((el) => { el.hidden = freq !== 'weekly'; });
    if (freq === 'weekly' && !$$('input[name=wd]:checked', f).length && f.start_date.value) {
      const dow = new Date(f.start_date.value + 'T00:00').getDay();
      $(`input[name=wd][value="${dow}"]`, f).checked = true;
    }
  };
  f.freq.addEventListener('change', sync);
  f.start_date.addEventListener('change', sync);
  // Minutes from start to end; an end earlier than the start means the next day.
  const toMin = (v) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  const duration = () => (toMin(f.end_time.value) - toMin(f.start_time.value) + 1440) % 1440;
  // Moving the start keeps the same length by moving the end with it.
  let lastStart = f.start_time.value;
  f.start_time.addEventListener('change', () => {
    if (!f.start_time.value || !f.end_time.value || !lastStart) { lastStart = f.start_time.value; return; }
    const len = (toMin(f.end_time.value) - toMin(lastStart) + 1440) % 1440;
    const end = (toMin(f.start_time.value) + len) % 1440;
    f.end_time.value = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
    lastStart = f.start_time.value;
  });
  f.place_id.addEventListener('change', () => {
    const p = state.places.find((x) => x.id === Number(f.place_id.value));
    if (p && (!f.title.value || state.places.some((x) => x.name === f.title.value))) f.title.value = p.name;
  });
  sync();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const freq = f.freq.value;
    const weekdays = $$('input[name=wd]:checked', f).map((x) => Number(x.value));
    if (freq === 'weekly' && !weekdays.length) return toast(t('ev.pickWeekday'), true);
    if (freq !== 'none' && f.until_date.value && f.until_date.value < f.start_date.value) {
      return toast(t('ev.untilBefore'), true);
    }
    if (!duration()) return toast(t('ev.sameTime'), true);
    const row = {
      org_id: state.orgId,
      place_id: Number(f.place_id.value),
      title: f.title.value.trim(),
      description: f.description.value.trim(),
      start_date: f.start_date.value,
      start_time: f.start_time.value,
      duration_minutes: duration(),
      timezone: TZ,
      freq,
      interval_n: freq === 'none' ? 1 : Number(f.interval_n.value || 1),
      weekdays: freq === 'weekly' ? weekdays : [],
      until_date: freq !== 'none' && f.until_date.value ? f.until_date.value : null,
      capacity: f.capacity.value ? Number(f.capacity.value) : null,
    };
    e.submitter.disabled = true;
    try {
      const series = check(await sb.from('event_series').insert(row).select().single());
      if (f.autojoin.checked) check(await sb.from('series_subscribers').insert({ series_id: series.id }));
      eventsChanged();
      closeModal();
      toast(t(freq === 'none' ? 'ev.created' : 'ev.createdRepeat'));
      state.month = startOfMonth(new Date(row.start_date + 'T00:00'));
      if (state.view !== 'calendar') switchView('calendar'); else renderCalendar();
    } finally {
      e.submitter.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------
// Event detail (join / leave / waitlist / manage)
// ---------------------------------------------------------------------
function googleCalendarUrl(ev, place) {
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${f(ev.starts_at)}/${f(ev.ends_at)}`,
    details: [ev.description, place?.map_url].filter(Boolean).join('\n\n'),
    location: place?.name || '',
  });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

function personLabel(p) {
  return p.guest_name
    ? `<span class="who-line">${avatar(p.guest_name, 'guest')}<span>${esc(p.guest_name)} <span class="muted small">${esc(t('ev.guestOf', { name: p.display_name }))}</span></span></span>`
    : `<span class="who-line">${avatar(p.display_name)}<span>${esc(p.display_name)}</span></span>`;
}

function eventDetail(id) {
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return closeModal();
  const s = state.series.get(ev.series_id);
  const place = state.places.find((p) => p.id === ev.place_id);
  const st = eventStats(ev);
  const isOwner = ev.created_by === state.user.id;
  const past = new Date(ev.ends_at) < new Date();
  const repeating = s && s.freq !== 'none';
  const subscribed = state.mySubs.has(ev.series_id);
  const start = new Date(ev.starts_at);
  const end = new Date(ev.ends_at);
  const L = (k, v) => esc(t(k, v));
  const canRemove = (p) => p.user_id === state.user.id || isOwner || isAdmin();
  const li = (p, i) => `<li><span class="pos">${i + 1}.</span><span class="who">${personLabel(p)}</span>
      ${canRemove(p) && !past ? `<button class="ghost icon" data-remove="${p.id}" title="${L('remove')}" aria-label="${L('remove')}">${ic('x', 'sm')}</button>` : ''}</li>`;

  let joinBtn = '';
  if (!ev.cancelled && !past) {
    joinBtn = !st.mine && !canJoin()
      ? `<p class="muted small">${L('ban.noJoin')}</p>`
      : st.mine
      ? `<button id="ev-leave">${L(st.mine.status === 'waitlist' ? 'ev.leaveWait' : 'ev.leave')}</button>`
      : `<button class="primary" id="ev-join">${L(st.full ? 'ev.joinWait' : 'ev.join')}</button>`;
  }

  const body = openModal(`
    <div class="modal-head">
      <div><h2>${esc(ev.title)}</h2>${myBadge(ev)}</div>
      ${closeBtn()}
    </div>
    <dl class="ev-meta">
      <dt>${L('ev.when')}</dt><dd>${esc(fmtDateLong(start))}<br>${esc(fmtTime(start))} – ${esc(fmtTime(end))}</dd>
      <dt>${L('ev.where')}</dt><dd>${place ? `<a href="${esc(safeUrl(place.map_url))}" target="_blank" rel="noopener">${ic('pin', 'sm')}${esc(place.name)}${ic('out', 'sm')}</a>` : '—'}</dd>
      <dt>${L('ev.repeatLbl')}</dt><dd>${esc(repeatText(s))}</dd>
      <dt>${L('ev.limitLbl')}</dt><dd>${ev.capacity != null ? L('ev.peopleN', { n: ev.capacity }) : L('ev.noLimit')}</dd>
      ${ev.description ? `<dt>${L('ev.details')}</dt><dd class="pre">${esc(ev.description)}</dd>` : ''}
      ${s ? `<dt>${L('ev.createdAt')}</dt><dd>${L('ev.createdBy', { time: fmtStamp(s.created_at), name: memberName(s.created_by) })}</dd>` : ''}
    </dl>

    <div class="section-title">${ic('users', 'sm')}${L('ev.going')} <span class="count">${st.confirmed.length}${ev.capacity != null ? ` / ${ev.capacity}` : ''}</span></div>
    <ul class="people">${st.confirmed.map(li).join('') || `<li class="none">${L('ev.nobody')}</li>`}</ul>
    ${st.waitlist.length ? `<div class="section-title wait">${ic('hourglass', 'sm')}${L('ev.waitlist')} <span class="count">${st.waitlist.length}</span></div>
      <ul class="people waiting">${st.waitlist.map(li).join('')}</ul>` : ''}

    <div class="btn-row">
      ${joinBtn}
      ${!ev.cancelled && !past && canJoin() ? `<button id="ev-guest">${ic('user-plus')}${L('ev.guest')}</button>` : ''}
      ${repeating && s.active && (subscribed || canJoin()) ? `<button id="ev-sub" aria-pressed="${subscribed}">${ic(subscribed ? 'check' : 'repeat')}${L(subscribed ? 'ev.autoOn' : 'ev.autoOff')}</button>` : ''}
      <button class="ghost" id="ev-gcal">${ic('calendar')}${L('ev.gcal')}</button>
      <button class="ghost" id="ev-history">${ic('history')}${L('log.btn')}</button>
    </div>
    <form class="guest-form" id="guest-form" hidden>
      <input name="guest" required maxlength="40" placeholder="${L('ev.guestPrompt')}" autocomplete="off">
      <button class="primary">${L('add')}</button>
    </form>

    ${isOwner ? `
      <div class="owner-zone"><div class="section-title">${L('ev.organizer')}</div>
      <div class="btn-row">
        ${repeating ? `<button id="ev-cancel">${L(ev.cancelled ? 'ev.restoreDate' : 'ev.cancelDate')}</button>` : ''}
        <button id="ev-edit">${L(repeating ? 'ev.editSeries' : 'ev.edit')}</button>
        <button class="danger" id="ev-delete">${L(repeating ? 'ev.deleteSeries' : 'ev.delete')}</button>
      </div></div>` : ''}
  `);

  const refresh = async () => { await renderCalendar(); eventDetail(id); };
  const on = (sel, fn) => $(sel, body)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try { await fn(); } catch (err) { console.error(err); } finally { btn.disabled = false; }
  });

  on('#ev-join', async () => {
    check(await sb.from('event_participants').insert({ event_id: ev.id }));
    toast(t(st.full ? 'ev.addedWait' : 'ev.joined'));
    await refresh();
  });
  on('#ev-leave', async () => {
    check(await sb.from('event_participants').delete().eq('id', st.mine.id));
    await refresh();
  });
  $('#ev-guest', body)?.addEventListener('click', () => {
    const gf = $('#guest-form', body);
    gf.hidden = !gf.hidden;
    if (!gf.hidden) gf.guest.focus();
  });
  $('#ev-history', body).addEventListener('click', () => eventHistory(ev));
  $('#guest-form', body).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.guest.value.trim();
    if (!name) return;
    e.submitter.disabled = true;
    try {
      check(await sb.from('event_participants').insert({ event_id: ev.id, guest_name: name }));
      await refresh();
    } catch (err) { console.error(err); } finally { e.submitter.disabled = false; }
  });
  on('#ev-sub', async () => {
    if (subscribed) {
      if (!confirm(t('ev.stopAutoConfirm'))) return;
      check(await sb.from('series_subscribers').delete().eq('series_id', ev.series_id).eq('user_id', state.user.id));
    } else {
      check(await sb.from('series_subscribers').insert({ series_id: ev.series_id }));
      toast(t('ev.autoToast'));
    }
    await refresh();
  });
  on('#ev-cancel', async () => {
    check(await sb.from('events').update({ cancelled: !ev.cancelled }).eq('id', ev.id));
    eventsChanged();
    await refresh();
  });
  $('#ev-gcal', body).addEventListener('click', () => window.open(googleCalendarUrl(ev, place), '_blank', 'noopener'));
  on('#ev-edit', async () => seriesEdit(s, ev));
  on('#ev-delete', async () => {
    if (!confirm(t(repeating ? 'ev.deleteSeriesConfirm' : 'ev.deleteConfirm'))) return;
    check(await sb.from('event_series').delete().eq('id', ev.series_id));
    eventsChanged();
    closeModal();
    await renderCalendar();
  });
  body.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    check(await sb.from('event_participants').delete().eq('id', Number(b.dataset.remove)));
    await refresh();
  }));
}

// ---------------------------------------------------------------------
// History (append-only event_log, written by the database)
// ---------------------------------------------------------------------
function logChange(field, [from, to]) {
  if (field === 'active') return t(to ? 'log.resumed' : 'log.stopped');
  const label = { title: 'ev.title', description: 'ev.details', capacity: 'ev.limitLbl', until_date: 'ev.until' }[field];
  const val = (v) => (v == null || v === '' ? (field === 'capacity' ? t('ev.noLimit') : '—')
    : field === 'until_date' ? fmtYmd(v) : String(v));
  return `${t(label)}: ${val(from)} → ${val(to)}`;
}

function logText(r) {
  const actor = r.actor_name || t('log.system');
  const who = r.target_name || '—';
  const guest = r.details?.guest_name;
  switch (r.action) {
    case 'created': return t('log.created', { actor });
    case 'edited': return t('log.edited', { actor });
    case 'deleted': return t('log.deleted', { actor }) + (r.details?.place_deleted ? ' ' + t('log.placeDeleted') : '');
    case 'cancelled': return t('log.cancelled', { actor });
    case 'restored': return t('log.restored', { actor });
    case 'date_deleted': return t('log.dateDeleted', { actor });
    case 'joined':
      if (guest) return t('log.guestAdded', { who, guest });
      return t(r.actor_id === r.target_id ? 'log.joined' : 'log.autoJoined', { who });
    case 'left': return guest ? t('log.guestLeft', { who, guest }) : t('log.left', { who });
    case 'removed': return t('log.removed', { actor, who: guest ? `${guest} ${t('ev.guestOf', { name: who })}` : who });
    default: return r.action;
  }
}

function logList(rows, withEvent) {
  if (!rows.length) return `<p class="muted">${esc(t('log.empty'))}</p>`;
  return `<ul class="log">${rows.map((r) => {
    const changes = r.action === 'edited' ? Object.entries(r.details || {}).map(([k, v]) => logChange(k, v)) : [];
    const what = [withEvent && r.title, r.starts_at && `${fmtDate(new Date(r.starts_at))} ${fmtTime(new Date(r.starts_at))}`]
      .filter(Boolean).join(' · ');
    return `<li class="${['created', 'edited', 'deleted', 'cancelled', 'restored', 'date_deleted'].includes(r.action) ? 'org' : ''}">
      <time datetime="${esc(r.created_at)}">${esc(fmtStamp(r.created_at))}</time>
      <div>${what ? `<div class="muted small">${esc(what)}</div>` : ''}${esc(logText(r))}
        ${changes.length ? `<ul class="changes">${changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}</div></li>`;
  }).join('')}</ul>`;
}

async function eventHistory(ev) {
  const st = eventStats(ev);
  const L = (k, v) => esc(t(k, v));
  const body = openModal(`
    <div class="modal-head"><div><h2>${L('log.title')}</h2><p class="muted small">${esc(ev.title)} · ${esc(fmtDate(new Date(ev.starts_at)))}</p></div>${closeBtn()}</div>
    <div class="section-title">${ic('users', 'sm')}${L('log.signups')} <span class="count">${st.parts.length}</span></div>
    <ul class="people">${st.parts.map((p, i) => `<li><span class="pos">${i + 1}.</span><span class="who">${personLabel(p)}</span>
      <span class="muted small">${L('log.signedUpAt', { time: fmtStamp(p.joined_at) })}</span></li>`).join('') || `<li class="none">${L('ev.nobody')}</li>`}</ul>
    <div class="section-title">${ic('history', 'sm')}${L('log.entries')}</div>
    <div id="log-body">${skeletons('row-sk', 3)}</div>
    <p class="muted small log-note">${L('log.locked')}</p>
    <div class="modal-foot"><button type="button" id="log-back">${L('back')}</button></div>`);
  $('#log-back', body).addEventListener('click', () => eventDetail(ev.id));
  const rows = check(await sb.from('event_log').select('*').eq('series_id', ev.series_id)
    .or(`event_id.is.null,event_id.eq.${ev.id}`).order('created_at').order('id'));
  const el = $('#log-body', body);
  if (el) el.innerHTML = logList(rows, false);
}

async function orgHistory() {
  const L = (k) => esc(t(k));
  const body = openModal(`
    <div class="modal-head"><h2>${L('log.orgTitle')}</h2>${closeBtn()}</div>
    <div id="log-body">${skeletons('row-sk', 5)}</div>
    <p class="muted small log-note">${L('log.locked')}</p>`);
  const rows = check(await sb.from('event_log').select('*').eq('org_id', state.orgId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(300));
  const el = $('#log-body', body);
  if (el) el.innerHTML = logList(rows, true);
}

function seriesEdit(s, ev) {
  const repeating = s.freq !== 'none';
  const L = (k, v) => esc(t(k, v));
  const body = openModal(`
    <div class="modal-head"><h2>${L(repeating ? 'se.titleSeries' : 'se.titleEvent')}</h2>${closeBtn()}</div>
    <form id="series-form">
      <div class="field"><label>${L('ev.title')}</label><input name="title" required value="${esc(s.title)}"></div>
      <div class="field"><label>${L('ev.limit')}</label>
        <input type="number" name="capacity" min="1" value="${s.capacity ?? ''}" placeholder="${L('ev.limitPh')}"></div>
      <div class="field"><label>${L('ev.details')}</label><textarea name="description">${esc(s.description)}</textarea></div>
      ${repeating ? `
        <div class="field"><label>${L('se.untilLbl')}</label><input type="date" name="until_date" value="${s.until_date ?? ''}"></div>
        <div class="field"><label class="checkline"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> ${L('se.keep')}</label></div>` : ''}
      <div class="modal-foot"><button type="button" id="se-back">${L('back')}</button><button class="primary">${L('save')}</button></div>
    </form>`);
  $('#se-back', body).addEventListener('click', () => eventDetail(ev.id));
  $('#series-form', body).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const row = {
      title: f.title.value.trim(),
      capacity: f.capacity.value ? Number(f.capacity.value) : null,
      description: f.description.value.trim(),
    };
    if (repeating) {
      row.until_date = f.until_date.value || null;
      row.active = f.active.checked;
      if (!row.active && !confirm(t('se.stopConfirm'))) return;
    }
    check(await sb.from('event_series').update(row).eq('id', s.id));
    eventsChanged();
    toast(t('saved'));
    await renderCalendar();
    if (state.events.some((x) => x.id === ev.id)) eventDetail(ev.id); else closeModal();
  });
}
})();
