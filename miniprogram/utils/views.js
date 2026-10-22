// What the pages show, worked out from the data: the website's render functions (js/app.js)
// turned into plain objects for WXML, which can't call functions. No wx.* here, so it is testable.
const { t } = require('./i18n');
const F = require('./format');
const { catHue, coverArt, mapTiles, hasMap } = require('./cover');

// ---------------------------------------------------------------------
// Places: category tiles → sub-category tiles → place cards (the website's phone layout)
// ---------------------------------------------------------------------
function placesView({ categories, places, members }, { sel = 'root', search = '', next = new Map(), nextCount = new Map(), dark = false } = {}) {
  const catById = (id) => categories.find((c) => c.id === id);
  const parents = categories.filter((c) => !c.parent_id);
  const childrenOf = (id) => categories.filter((c) => c.parent_id === id);
  const catPath = (id) => {
    const c = catById(id);
    if (!c) return '';
    const p = c.parent_id ? catById(c.parent_id) : null;
    return p ? `${p.name} › ${c.name}` : c.name;
  };
  const placesInCat = (s) => {
    if (s === 'all' || s === 'root') return places;
    if (s === 'none') return places.filter((p) => !p.category_id);
    const id = Number(s);
    const ids = new Set([id, ...childrenOf(id).map((c) => c.id)]);
    return places.filter((p) => ids.has(p.category_id));
  };
  // A deleted or unknown category falls back to the start screen
  if (!['root', 'all', 'none'].includes(sel) && !catById(Number(sel))) sel = 'root';

  const tile = (cat, kind) => {
    const n = kind === 'none' ? placesInCat('none').length : placesInCat(String(cat.id)).length;
    const kids = kind === 'none' ? [] : childrenOf(cat.id);
    const hue = kind === 'none' ? 'hue-n' : catHue(cat, catById);
    return {
      key: kind === 'none' ? 'none' : String(cat.id), name: cat.name, hue,
      count: t('cats.placesCount', { n }),
      subs: kids.slice(0, 3).map((c) => c.name).join(t('listSep')) + (kids.length > 3 ? ` +${kids.length - 3}` : ''),
      art: coverArt(`cat:${cat.name}`, hue, dark),
    };
  };
  const card = (p) => {
    const hue = catHue(catById(p.category_id), catById);
    const ev = next.get(p.id);
    const by = members.find((m) => m.user_id === p.created_by);   // only while they are still in the group
    return {
      id: p.id, name: p.name, cat: p.category_id ? catPath(p.category_id) : '', hue,
      map: hasMap(p) ? mapTiles(p.lat, p.lng) : null,
      art: hasMap(p) ? '' : coverArt(p.name, hue, dark),
      note: p.note || '',
      by: by && by.profiles ? t('places.addedBy', { name: by.profiles.display_name }) : '',
      next: ev ? {
        id: ev.id, at: ev.starts_at, text: `${F.fmtDate(new Date(ev.starts_at))} · ${F.fmtTime(new Date(ev.starts_at))}`,
        more: (nextCount.get(p.id) || 1) - 1,
      } : null,
    };
  };

  const root = { key: 'root', label: t('nav.places') };
  const cat = catById(Number(sel));
  let trail = [root];
  let tiles = [];
  let lists = [];          // [{ title, places }]
  const q = search.trim().toLowerCase();
  if (q) {
    const hits = places.filter((p) => [p.name, p.note, catPath(p.category_id)].join(' ').toLowerCase().includes(q));
    trail = [root, { label: t('places.results') }];
    lists = [{ title: '', places: hits }];
  } else if (sel === 'all' || (sel === 'root' && !parents.length)) {
    trail = parents.length ? [root, { label: t('places.all') }] : [root];
    lists = [{ title: '', places }];
  } else if (sel === 'none') {
    trail = [root, { label: t('places.none') }];
    lists = [{ title: '', places: placesInCat('none') }];
  } else if (sel === 'root') {
    tiles = parents.map((p) => tile(p));
    if (places.some((p) => !p.category_id)) tiles.push(tile({ name: t('places.none') }, 'none'));
  } else if (cat && !cat.parent_id) {
    trail = [root, { label: cat.name }];
    const kids = childrenOf(cat.id);
    const direct = places.filter((p) => p.category_id === cat.id);
    if (kids.length) {
      tiles = kids.map((c) => tile(c));
      if (direct.length) lists = [{ title: t('places.direct', { name: cat.name }), places: direct }];
    } else {
      lists = [{ title: '', places: direct }];
    }
  } else if (cat) {
    const main = catById(cat.parent_id);
    trail = [root, { key: String(main.id), label: main.name }, { label: cat.name }];
    lists = [{ title: '', places: places.filter((p) => p.category_id === cat.id) }];
  }
  const shown = lists.reduce((n, l) => n + l.places.length, 0);
  return {
    sel,
    crumbs: trail.map((c, i) => ({ key: c.key || '', label: c.label, current: i === trail.length - 1 })),
    // On the start screen, "All places" next to the breadcrumb
    allLink: sel === 'root' && parents.length && places.length && !q ? { count: places.length } : null,
    tiles,
    lists: lists.map((l) => ({ title: l.title, places: l.places.map(card) })),
    empty: !places.length ? 'all' : (!tiles.length && !shown ? (q ? 'search' : 'folder') : ''),
    credit: lists.some((l) => l.places.some(hasMap)),
  };
}

// ---------------------------------------------------------------------
// Events: month grid, upcoming list, and one event
// ---------------------------------------------------------------------
function myBadge(ev, st) {
  if (ev.cancelled) return { cls: 'off', text: t('badge.cancelled') };
  if (!st.mine) return null;
  if (st.mine.status === 'confirmed') return { cls: 'ok', text: t('badge.joined') };
  return { cls: 'wait', text: t('badge.waitlist', { n: st.waitlist.indexOf(st.mine) + 1 }) };
}

// The window of dates to load for a month: the 6-week grid, plus today … 31 days ahead for the upcoming list
function monthRange(month, now = new Date()) {
  const start = F.addDays(month, -month.getDay());
  const end = F.addDays(start, 42);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upTo = F.addDays(today, 31);
  return { start, end, from: start < today ? start : today, to: end > upTo ? end : upTo };
}

function calendarView({ month, events, parts, userId, now = new Date() }) {
  const { start } = monthRange(month, now);
  const todayKey = F.dateKey(now);
  const byDay = new Map();
  for (const ev of events) {
    const k = F.dateKey(new Date(ev.starts_at));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(ev);
  }
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = F.addDays(start, i);
    const key = F.dateKey(d);
    const evs = byDay.get(key) || [];
    days.push({
      key, num: d.getDate(),
      cls: [d.getMonth() !== month.getMonth() && 'other', key === todayKey && 'today'].filter(Boolean).join(' '),
      chips: evs.slice(0, 3).map((ev) => {
        const st = F.eventStats(ev, parts.get(ev.id), userId);
        return {
          id: ev.id, title: ev.title, time: F.fmtTime(new Date(ev.starts_at)),
          cls: [ev.cancelled ? 'cancelled' : F.dueLevel(ev, now).cls, st.full && 'full', st.mine && 'mine'].filter(Boolean).join(' '),
        };
      }),
      more: evs.length > 3 ? t('cal.more', { n: evs.length - 3 }) : '',
      ids: evs.map((ev) => ev.id),
    });
  }
  return { title: F.monthTitle(month), heads: F.WD, days };
}

function upItem(ev, { parts, places, userId, now = new Date() }) {
  const d = new Date(ev.starts_at);
  const st = F.eventStats(ev, parts.get(ev.id), userId);
  const due = ev.cancelled ? { cls: 'due-off', label: '' } : F.dueLevel(ev, now);
  const place = places.find((p) => p.id === ev.place_id);
  const left = ev.capacity == null ? 0 : ev.capacity - st.confirmed.length;
  const joined = !ev.cancelled && st.mine && st.mine.status === 'confirmed';
  return {
    id: ev.id, cls: due.cls, dueLabel: due.label, date: F.fmtDate(d), time: F.fmtTime(d), title: ev.title,
    place: place ? place.name : '',
    count: ev.capacity != null ? `${st.confirmed.length}/${ev.capacity}` : `${st.confirmed.length}`,
    waiting: st.waitlist.length ? t('count.waiting', { n: st.waitlist.length }) : '',
    spots: ev.cancelled || ev.capacity == null ? null
      : left > 0 ? { text: t('up.left', { n: left }), full: false } : { text: t('up.full'), full: true },
    desc: ev.description || '',
    // Right side: my status (joining is done from the event itself)
    badge: joined ? { cls: 'ok', text: t('badge.joined'), check: true } : myBadge(ev, st),
  };
}

// Events still to come within 30 days
function upcomingView(ctx) {
  const now = ctx.now || new Date();
  const until = F.addDays(now, 30);
  return ctx.events.filter((ev) => new Date(ev.ends_at) >= now && new Date(ev.starts_at) <= until)
    .map((ev) => upItem(ev, ctx));
}

function eventView({ ev, series, place, parts, subscribed, userId, isAdmin, canJoin, memberName, now = new Date() }) {
  const st = F.eventStats(ev, parts, userId);
  const start = new Date(ev.starts_at);
  const end = new Date(ev.ends_at);
  const past = end < now;
  const repeating = !!series && series.freq !== 'none';
  const isCreator = ev.created_by === userId;
  const canRemove = (p) => p.user_id === userId || isCreator || isAdmin;
  const person = (p, i) => ({
    id: p.id, pos: i + 1,
    name: p.guest_name || p.display_name || '?',
    initial: F.initial(p.guest_name || p.display_name),
    guest: !!p.guest_name,
    of: p.guest_name ? t('ev.guestOf', { name: p.display_name }) : '',
    removable: canRemove(p) && !past,
  });
  let join = null;
  if (!ev.cancelled && !past) {
    join = !st.mine && !canJoin ? { kind: 'blocked', text: t('ban.noJoin') }
      : st.mine ? { kind: 'leave', text: t(st.mine.status === 'waitlist' ? 'ev.leaveWait' : 'ev.leave') }
      : { kind: 'join', text: t(st.full ? 'ev.joinWait' : 'ev.join'), full: st.full };
  }
  return {
    id: ev.id, title: ev.title, badge: myBadge(ev, st),
    date: F.fmtDateLong(start), time: `${F.fmtTime(start)} – ${F.fmtTime(end)}`,
    place: place ? { name: place.name, map: hasMap(place) } : null,
    repeat: F.repeatText(series),
    limit: ev.capacity != null ? t('ev.peopleN', { n: ev.capacity }) : t('ev.noLimit'),
    details: ev.description || '',
    created: series ? t('ev.createdBy', { time: F.fmtStamp(series.created_at), name: memberName(series.created_by) }) : '',
    goingCount: `${st.confirmed.length}${ev.capacity != null ? ` / ${ev.capacity}` : ''}`,
    confirmed: st.confirmed.map(person),
    waitlist: st.waitlist.map(person),
    join,
    canGuest: !ev.cancelled && !past && canJoin,
    sub: repeating && series.active && (subscribed || canJoin)
      ? { on: subscribed, text: t(subscribed ? 'ev.autoOn' : 'ev.autoOff') } : null,
    past, cancelled: ev.cancelled,
    mineId: st.mine ? st.mine.id : null,
    full: st.full,
  };
}

// ---------------------------------------------------------------------
// Members page
// ---------------------------------------------------------------------
function memberTags(m) {
  if (m.role === 'owner') return [{ cls: 'role', text: t('org.owner') }];
  const tags = [];
  if (m.profiles && m.profiles.is_guest) tags.push({ cls: 'role guest', text: t('guest.badge') });
  if (m.organizer) tags.push({ cls: 'role', text: t('perm.organizer') });
  if (!m.can_create) tags.push({ cls: 'badge wait', text: t('perm.noCreate') });
  if (!m.can_join) tags.push({ cls: 'badge wait', text: t('perm.noJoin') });
  return tags;
}
function membersView({ members }, { org, orgs, userId }) {
  return {
    org: org ? { id: org.id, name: org.name, code: org.invite_code } : null,
    title: t('org.members', { n: members.length }),
    members: members.map((m) => {
      const name = (m.profiles && m.profiles.display_name) || '?';
      return { id: m.user_id, name, initial: F.initial(name), me: m.user_id === userId, tags: memberTags(m) };
    }),
    orgs: orgs.map((o) => ({ id: o.id, name: o.name, initial: F.initial(o.name), owner: o.role === 'owner', current: org && o.id === org.id })),
  };
}

module.exports = { placesView, monthRange, calendarView, upcomingView, upItem, eventView, membersView, memberTags };
