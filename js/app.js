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
  if (error) { toast(error.message, true); throw error; }
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
  selectedCat: 'all',
  search: '',
  month: startOfMonth(new Date()),
  events: [],
  parts: new Map(),     // event_id -> participant rows (ordered)
  series: new Map(),    // series_id -> series row
  mySubs: new Set(),    // series ids I auto-join
};

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
// Auth
// ---------------------------------------------------------------------
let authEmail = '';
$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  authEmail = $('#auth-email').value.trim().toLowerCase();
  const btn = e.submitter; btn.disabled = true;
  const { error } = await sb.auth.signInWithOtp({
    email: authEmail,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  btn.disabled = false;
  if (error) return toast(error.message, true);
  $('#otp-form').hidden = false;
  toast(t('auth.sent'));
});
$('#otp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.verifyOtp({ email: authEmail, token: $('#otp-code').value.trim(), type: 'email' });
  if (error) toast(error.message, true);
});
$('#signout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

let booted = false;
sb.auth.onAuthStateChange((_event, session) => {
  if (session?.user && !booted) { booted = true; setTimeout(() => boot(session.user), 0); }
  if (!session) { booted = false; $('#topbar').hidden = true; showOnly('view-auth'); }
});

async function boot(user) {
  state.user = user;
  let { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile) {
    profile = check(await sb.from('profiles')
      .insert({ id: user.id, display_name: user.email.split('@')[0] }).select().single());
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

// Show the chosen organization, or the create/join screen when there is none.
async function enterOrg(id) {
  state.orgId = id;
  store.set('fsm.org', id);
  state.selectedCat = 'all';
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
    sb.from('org_members').select('user_id, role, joined_at, profiles(display_name)').eq('org_id', org).order('joined_at'),
  ]);
  if (org !== state.orgId) return;   // switched organization meanwhile
  state.categories = check(cats);
  state.places = check(places);
  state.members = check(members);
}

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (b) switchView(b.dataset.view);
});
function switchView(v) {
  if (!['places', 'calendar', 'categories', 'org'].includes(v)) v = 'places';
  state.view = v;
  store.set('fsm.view', v);
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  showOnly('view-' + v);
  render();
}
function render() {
  if (state.view === 'places') renderPlaces();
  else if (state.view === 'calendar') renderCalendar();
  else if (state.view === 'categories') renderCategories();
  else if (state.view === 'org') renderOrgPage();
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
$('#cat-tree').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  state.selectedCat = b.dataset.cat;
  renderPlaces();
});

function placesInCat(sel) {
  if (sel === 'all') return state.places;
  if (sel === 'none') return state.places.filter((p) => !p.category_id);
  const id = Number(sel);
  const ids = new Set([id, ...childrenOf(id).map((c) => c.id)]);
  return state.places.filter((p) => ids.has(p.category_id));
}

function renderPlaces() {
  const btn = (key, label, cls = '') =>
    `<button data-cat="${key}" class="${cls} ${String(state.selectedCat) === String(key) ? 'active' : ''}">
       <span>${esc(label)}</span><span class="count">${placesInCat(String(key)).length}</span></button>`;
  let h = btn('all', t('places.all'));
  for (const p of parents()) {
    h += btn(p.id, p.name);
    for (const c of childrenOf(p.id)) h += btn(c.id, c.name, 'child');
  }
  if (state.places.some((p) => !p.category_id)) h += btn('none', t('places.none'));
  $('#cat-tree').innerHTML = h;
  renderPlaceList();
}

function renderPlaceList() {
  let list = placesInCat(String(state.selectedCat));
  if (state.search) {
    list = list.filter((p) => [p.name, p.note, catPath(p.category_id)].join(' ').toLowerCase().includes(state.search));
  }
  if (!list.length) {
    $('#place-list').innerHTML = state.places.length
      ? `<div class="empty compact">${ic('search')}<span>${esc(t('places.empty'))}</span></div>`
      : `<div class="empty">${ic('map')}<strong>${esc(t('places.emptyTitle'))}</strong><p>${esc(t('places.emptyAll'))}</p>
           <button class="primary" data-act="add">${ic('plus')}${esc(t('places.add'))}</button></div>`;
    return;
  }
  $('#place-list').innerHTML = list.map((p) => `
    <article class="place-card">
      ${photos.off ? '' : `<div class="ph-wrap" data-ph="${p.id}"><div class="skeleton ph-sk"></div></div>`}
      <a class="card-link" href="${esc(safeUrl(p.map_url))}" target="_blank" rel="noopener" title="${esc(t('places.open'))}">
        <span class="name">${esc(p.name)}</span>${ic('out', 'go')}
      </a>
      ${p.category_id ? `<span class="tag">${esc(catPath(p.category_id))}</span>` : ''}
      ${p.note ? `<span class="note">${esc(p.note)}</span>` : ''}
      <span class="actions">
        <button class="small" data-act="event" data-id="${p.id}">${ic('calendar', 'sm')}${esc(t('places.event'))}</button>
        <button class="small" data-act="edit" data-id="${p.id}">${ic('pencil', 'sm')}${esc(t('edit'))}</button>
      </span>
    </article>`).join('');
  $$('#place-list [data-ph]').forEach((el) => photos.observer.observe(el));
}
$('#place-list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;           // the card's own link opens Google Maps
  e.preventDefault();
  if (b.dataset.act === 'add') return placeForm();
  if (b.dataset.act === 'photos') return togglePhotos(b.closest('[data-ph]'));
  const place = state.places.find((p) => p.id === Number(b.dataset.id));
  if (b.dataset.act === 'edit') placeForm(place);
  if (b.dataset.act === 'event') eventForm({ placeId: place.id });
});

// ---------------------------------------------------------------------
// Place photos (Google Places, via the place-photos Edge Function)
// Shows the first photo; the other two load only when someone clicks it.
// ---------------------------------------------------------------------
const photos = {
  off: false,              // set after repeated failures (e.g. function not deployed)
  failures: 0,
  active: 0,
  queue: [],
  TTL: 45 * 60 * 1000,     // Google photo links are short-lived; refetch after this
  observer: new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      photos.observer.unobserve(en.target);
      loadPhotos(en.target, 1);
    }
  }, { rootMargin: '200px' }),
};

function photoCacheKey(place) { return `fsm.ph.${place.id}.${place.map_url}`; }
function cachedPhotos(place) {
  try {
    const c = JSON.parse(sessionStorage.getItem(photoCacheKey(place)));
    return c && Date.now() - c.at < photos.TTL ? c : null;
  } catch { return null; }
}

// At most 3 requests in flight
function queuePhotoRequest(fn) {
  return new Promise((resolve, reject) => {
    photos.queue.push([fn, resolve, reject]);
    pumpPhotos();
  });
}
function pumpPhotos() {
  while (photos.active < 3 && photos.queue.length) {
    const [fn, resolve, reject] = photos.queue.shift();
    photos.active++;
    fn().then(resolve, reject).finally(() => { photos.active--; pumpPhotos(); });
  }
}

async function fetchPhotos(place, limit) {
  const cached = cachedPhotos(place);
  if (cached && cached.photos.length >= Math.min(limit, cached.available)) return cached;
  const { data, error } = await queuePhotoRequest(() =>
    sb.functions.invoke('place-photos', { body: { place_id: place.id, limit } }));
  if (error) throw error;
  const result = { available: data.available, photos: data.photos, at: Date.now() };
  try { sessionStorage.setItem(photoCacheKey(place), JSON.stringify(result)); } catch { /* full or blocked */ }
  return result;
}

// Google requires showing the photographer and a Google Maps credit with each photo
function photoCredit(ph) {
  if (!ph.author) return 'Google Maps';
  const who = ph.authorUri
    ? `<a href="${esc(safeUrl(ph.authorUri))}" target="_blank" rel="noopener">${esc(ph.author)}</a>`
    : esc(ph.author);
  return `${esc(t('ph.by', { name: '%WHO%' })).replace('%WHO%', who)} · Google Maps`;
}
function photoImg(place, ph, n, lazy) {
  return `<img src="${esc(safeUrl(ph.url))}" alt="${esc(t('ph.alt', { name: place.name, n }))}"${lazy ? ' loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer">`;
}

function renderPhotos(wrap, place, data) {
  if (!data.photos.length) { wrap.remove(); return; }
  const extra = data.available - 1;
  const [first] = data.photos;
  wrap.dataset.extra = String(extra);
  wrap.innerHTML = `
    <div class="ph-hero">
      <button type="button" class="ph-main" data-act="photos" ${extra > 0 ? `aria-expanded="false" aria-label="${esc(t('ph.more', { n: extra }))}"` : 'disabled'}>
        ${photoImg(place, first, 1, false)}
        ${extra > 0 ? `<span class="ph-count" aria-hidden="true">${ic('plus', 'sm')}${extra}</span>` : ''}
      </button>
      <p class="ph-credit">${photoCredit(first)}</p>
    </div>
    <div class="ph-more" hidden></div>`;
  wrap.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => {
    try { sessionStorage.removeItem(photoCacheKey(place)); } catch { /* ignore */ }
    wrap.remove();
  }, { once: true }));
}

async function loadPhotos(wrap, limit) {
  const place = state.places.find((p) => p.id === Number(wrap.dataset.ph));
  if (!place || photos.off) { wrap.remove(); return; }
  try {
    const data = await fetchPhotos(place, limit);
    photos.failures = 0;
    if (wrap.isConnected) renderPhotos(wrap, place, data);
  } catch (err) {
    console.warn('Photos unavailable:', err?.message || err);
    wrap.remove();
    if (++photos.failures >= 3) {
      photos.off = true;
      $$('#place-list [data-ph]').forEach((el) => el.remove());
    }
  }
}

async function togglePhotos(wrap) {
  const btn = $('.ph-main', wrap);
  const more = $('.ph-more', wrap);
  const open = btn.getAttribute('aria-expanded') !== 'true';
  const place = state.places.find((p) => p.id === Number(wrap.dataset.ph));
  const extra = Number(wrap.dataset.extra || 0);
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', t(open ? 'ph.hide' : 'ph.more', { n: extra }));
  more.hidden = !open;
  if (!open || more.dataset.loaded) return;
  more.innerHTML = skeletons('ph-sk small', extra);
  try {
    const data = await fetchPhotos(place, 3);
    more.innerHTML = data.photos.slice(1).map((ph, i) =>
      `<figure class="ph-extra">${photoImg(place, ph, i + 2, true)}<figcaption>${photoCredit(ph)}</figcaption></figure>`).join('');
    more.dataset.loaded = '1';
  } catch (err) {
    console.warn('Photos unavailable:', err?.message || err);
    more.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
}

function placeForm(place = null) {
  const preCat = place ? place.category_id
    : (/^\d+$/.test(String(state.selectedCat)) ? Number(state.selectedCat) : null);
  const body = openModal(`
    <div class="modal-head"><h2>${esc(t(place ? 'place.editTitle' : 'place.addTitle'))}</h2>${closeBtn()}</div>
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
    if (String(state.selectedCat) === String(c.id)) state.selectedCat = 'all';
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
        m.role === 'owner' ? `<span class="role">${esc(t('org.owner'))}</span>` : ''}</span></span>
      ${owner && !me ? `<button class="small danger" data-remove-member="${m.user_id}">${esc(t('remove'))}</button>` : ''}</li>`;
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
$('#member-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-remove-member]');
  if (!b) return;
  const m = state.members.find((x) => x.user_id === b.dataset.removeMember);
  if (!confirm(t('org.removeConfirm', { name: m.profiles?.display_name || '' }))) return;
  check(await sb.from('org_members').delete().eq('org_id', state.orgId).eq('user_id', m.user_id));
  await loadBase();
  renderOrgPage();
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
function upItem(ev) {
  const d = new Date(ev.starts_at);
  const place = state.places.find((p) => p.id === ev.place_id);
  return `<div class="up-item" data-ev="${ev.id}">
    <div class="up-date">${esc(fmtDate(d))}<div class="muted small">${esc(fmtTime(d))}</div></div>
    <div class="up-main"><b>${esc(ev.title)}</b>
      <div class="up-meta"><span>${ic('pin', 'sm')}${esc(place?.name || '')}</span>${countHtml(ev)}</div></div>
    ${myBadge(ev)}
  </div>`;
}
function renderUpcoming() {
  const now = new Date();
  const until = addDays(now, 30);
  const list = state.events.filter((ev) => new Date(ev.ends_at) >= now && new Date(ev.starts_at) <= until);
  $('#upcoming').innerHTML = list.length ? list.map(upItem).join('')
    : `<div class="empty compact">${ic('calendar')}<span>${esc(t('cal.noUpcoming'))}</span></div>`;
}
$('#upcoming').addEventListener('click', (e) => {
  const it = e.target.closest('[data-ev]');
  if (it) eventDetail(Number(it.dataset.ev));
});

// ---------------------------------------------------------------------
// Event form (create a one-off or repeating event)
// ---------------------------------------------------------------------
function eventForm({ placeId = null, date = null } = {}) {
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
        <div class="field"><label>${L('ev.length')}</label><input type="number" name="duration" min="5" step="5" value="120" required></div>
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
    const row = {
      org_id: state.orgId,
      place_id: Number(f.place_id.value),
      title: f.title.value.trim(),
      description: f.description.value.trim(),
      start_date: f.start_date.value,
      start_time: f.start_time.value,
      duration_minutes: Number(f.duration.value),
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
  const canRemove = (p) => p.user_id === state.user.id || isOwner;
  const li = (p, i) => `<li><span class="pos">${i + 1}.</span><span class="who">${personLabel(p)}</span>
      ${canRemove(p) && !past ? `<button class="ghost icon" data-remove="${p.id}" title="${L('remove')}" aria-label="${L('remove')}">${ic('x', 'sm')}</button>` : ''}</li>`;

  let joinBtn = '';
  if (!ev.cancelled && !past) {
    joinBtn = st.mine
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
    </dl>

    <div class="section-title">${ic('users', 'sm')}${L('ev.going')} <span class="count">${st.confirmed.length}${ev.capacity != null ? ` / ${ev.capacity}` : ''}</span></div>
    <ul class="people">${st.confirmed.map(li).join('') || `<li class="none">${L('ev.nobody')}</li>`}</ul>
    ${st.waitlist.length ? `<div class="section-title wait">${ic('hourglass', 'sm')}${L('ev.waitlist')} <span class="count">${st.waitlist.length}</span></div>
      <ul class="people waiting">${st.waitlist.map(li).join('')}</ul>` : ''}

    <div class="btn-row">
      ${joinBtn}
      ${!ev.cancelled && !past ? `<button id="ev-guest">${ic('user-plus')}${L('ev.guest')}</button>` : ''}
      ${repeating && s.active ? `<button id="ev-sub" aria-pressed="${subscribed}">${ic(subscribed ? 'check' : 'repeat')}${L(subscribed ? 'ev.autoOn' : 'ev.autoOff')}</button>` : ''}
      <button class="ghost" id="ev-gcal">${ic('calendar')}${L('ev.gcal')}</button>
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
    await refresh();
  });
  $('#ev-gcal', body).addEventListener('click', () => window.open(googleCalendarUrl(ev, place), '_blank', 'noopener'));
  on('#ev-edit', async () => seriesEdit(s, ev));
  on('#ev-delete', async () => {
    if (!confirm(t(repeating ? 'ev.deleteSeriesConfirm' : 'ev.deleteConfirm'))) return;
    check(await sb.from('event_series').delete().eq('id', ev.series_id));
    closeModal();
    await renderCalendar();
  });
  body.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    check(await sb.from('event_participants').delete().eq('id', Number(b.dataset.remove)));
    await refresh();
  }));
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
    toast(t('saved'));
    await renderCalendar();
    if (state.events.some((x) => x.id === ev.id)) eventDetail(ev.id); else closeModal();
  });
}
})();
