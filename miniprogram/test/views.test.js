// node --test "miniprogram/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeWx, load } = require('./helpers');

const F = load('utils/format.js', fakeWx());
const V = load('utils/views.js', fakeWx());
const C = load('utils/cover.js', fakeWx());

const at = (y, m, d, h = 10, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (d) => d.toISOString();
const ev = (id, start, extra = {}) => ({
  id, org_id: 1, series_id: id, place_id: 1, title: `E${id}`, description: '', capacity: null, cancelled: false,
  created_by: 'owner', starts_at: iso(start), ends_at: iso(new Date(+start + 2 * 3600e3)), ...extra,
});
const part = (id, user_id, status, extra = {}) => ({ id, user_id, status, guest_name: '', display_name: user_id, ...extra });

// ------------------------------------------------------------- dates
test('dates read like the website in 简体中文 (its toLocaleDateString zh-CN output)', () => {
  for (let i = 0; i < 400; i += 7) {
    const d = new Date(2026, 0, 1 + i, 9, 5);
    assert.equal(F.fmtDate(d), d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }));
    assert.equal(F.fmtDateLong(d), d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }));
    assert.equal(F.fmtTime(d), d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    assert.equal(F.monthTitle(d), d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }));
  }
  assert.equal(F.fmtYmd('2026-11-30'), new Date(2026, 10, 30).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }));
  assert.deepEqual(F.WD, [0, 1, 2, 3, 4, 5, 6].map((i) => new Date(2023, 0, 1 + i).toLocaleDateString('zh-CN', { weekday: 'short' })));
});

test('the share title is "<nickname> 邀请你参加 <date> <event>"', () => {
  assert.equal(F.inviteTitle('Tom', at(2026, 11, 30), '羽毛球'), 'Tom 邀请你参加 11月30日周一 羽毛球');
  assert.equal(F.inviteTitle('小王', at(2026, 10, 24), '  周六  爬山 '), '小王 邀请你参加 10月24日周六 周六 爬山');
});

test('how soon an event is: today, tomorrow, 3 days, a week, later, past', () => {
  const now = at(2026, 10, 22, 9);
  const level = (d) => F.dueLevel(ev(1, d), now).cls;
  assert.equal(level(at(2026, 10, 22, 20)), 'due-today');
  assert.equal(level(at(2026, 10, 23, 8)), 'due-tomorrow');
  assert.equal(level(at(2026, 10, 25)), 'due-3days');
  assert.equal(level(at(2026, 10, 28)), 'due-week');
  assert.equal(level(at(2026, 10, 29)), 'due-later');
  assert.equal(level(at(2026, 10, 21)), 'due-past');
  assert.equal(F.dueLevel(ev(1, at(2026, 10, 25)), now).label, '3 天后');
});

test('repeat rules in words', () => {
  assert.equal(F.repeatText(null), '不重复');
  assert.equal(F.repeatText({ freq: 'weekly', interval_n: 1, weekdays: [6, 2], start_date: '2026-10-20', active: true }), '每周 周二、周六');
  assert.equal(F.repeatText({ freq: 'weekly', interval_n: 2, weekdays: [], start_date: '2026-10-20', active: true }), '每 2 周 周二');
  assert.equal(F.repeatText({ freq: 'monthly', interval_n: 1, start_date: '2026-10-05', until_date: '2027-03-01', active: false }),
    '每月 5 日（至 2027年3月1日）（已停止）');
  assert.equal(F.repeatText({ freq: 'daily', interval_n: 3, start_date: '2026-10-05', active: true }), '每 3 天');
});

// ------------------------------------------------------------- calendar
test('month grid: 6 weeks from Sunday, today marked, at most 3 chips a day', () => {
  const now = at(2026, 10, 22, 9);
  const month = new Date(2026, 9, 1);
  const events = [1, 2, 3, 4].map((i) => ev(i, at(2026, 10, 22, 10 + i)))
    .concat([ev(5, at(2026, 10, 23), { capacity: 1 }), ev(6, at(2026, 10, 30), { cancelled: true }), ev(7, at(2026, 10, 1))]);
  const parts = new Map([[5, [part(1, 'me', 'confirmed')]]]);
  const cal = V.calendarView({ month, events, parts, userId: 'me', now });
  assert.equal(cal.title, '2026年10月');
  assert.equal(cal.days.length, 42);
  assert.equal(cal.days[0].key, '2026-09-27');
  assert.equal(cal.days[0].cls, 'other');
  const today = cal.days.find((d) => d.key === '2026-10-22');
  assert.equal(today.cls, 'today');
  assert.equal(today.chips.length, 3);
  assert.equal(today.more, '还有 1 个');
  assert.deepEqual(today.ids, [1, 2, 3, 4]);
  assert.equal(today.chips[0].cls, 'due-today');
  assert.equal(cal.days.find((d) => d.key === '2026-10-23').chips[0].cls, 'due-tomorrow full mine');
  assert.equal(cal.days.find((d) => d.key === '2026-10-30').chips[0].cls, 'cancelled');
  assert.equal(cal.days.find((d) => d.key === '2026-10-01').chips[0].cls, 'due-past');
});

test('the dates loaded cover the grid and the next 31 days', () => {
  const r = V.monthRange(new Date(2026, 9, 1), at(2026, 10, 22, 9));
  assert.equal(F.dateKey(r.from), '2026-09-27');
  assert.equal(F.dateKey(r.to), '2026-11-22');
  const past = V.monthRange(new Date(2026, 7, 1), at(2026, 10, 22, 9));
  assert.equal(F.dateKey(past.from), '2026-07-26');
  assert.equal(F.dateKey(past.to), '2026-11-22');
});

test('upcoming: the next 30 days, with places, counts, spots and my status', () => {
  const now = at(2026, 10, 22, 9);
  const events = [
    ev(1, at(2026, 10, 22, 6)),                     // over
    ev(2, at(2026, 10, 22, 8)),                     // still going on
    ev(3, at(2026, 10, 24), { capacity: 2, description: '带球拍' }),
    ev(4, at(2026, 10, 26), { capacity: 1 }),
    ev(5, at(2026, 11, 30)),                        // too far
  ];
  const parts = new Map([
    [3, [part(1, 'me', 'confirmed')]],
    [4, [part(2, 'a', 'confirmed'), part(3, 'me', 'waitlist'), part(4, 'me', 'waitlist', { guest_name: 'Ann' })]],
  ]);
  const list = V.upcomingView({ events, parts, places: [{ id: 1, name: '体育馆' }], userId: 'me', now });
  assert.deepEqual(list.map((i) => i.id), [2, 3, 4]);
  const [, three, four] = list;
  assert.equal(three.place, '体育馆');
  assert.equal(three.count, '1/2');
  assert.deepEqual(three.spots, { text: '剩 1 个名额', full: false });
  assert.deepEqual(three.badge, { cls: 'ok', text: '已报名', check: true });
  assert.equal(three.desc, '带球拍');
  assert.equal(three.cls, 'due-3days');
  assert.equal(four.waiting, '候补 2 人');
  assert.deepEqual(four.spots, { text: '已满员・可排候补', full: true });
  assert.deepEqual(four.badge, { cls: 'wait', text: '候补第 1 位' });
});

// ------------------------------------------------------------- event detail
const detail = (over = {}) => V.eventView({
  ev: ev(1, at(2026, 10, 24), { capacity: 2 }), series: null, place: { id: 1, name: '体育馆', lat: 35, lng: 139 },
  parts: [], subscribed: false, userId: 'me', isAdmin: false, canJoin: true, memberName: () => 'Owner',
  now: at(2026, 10, 22, 9), ...over,
});

test('event detail: join, join the waiting list, leave, blocked, past', () => {
  assert.deepEqual(detail().join, { kind: 'join', text: '报名', full: false });
  const full = detail({ parts: [part(1, 'a', 'confirmed'), part(2, 'b', 'confirmed')] });
  assert.deepEqual(full.join, { kind: 'join', text: '加入候补', full: true });
  assert.equal(full.goingCount, '2 / 2');
  const waiting = detail({ parts: [part(1, 'a', 'confirmed'), part(2, 'b', 'confirmed'), part(3, 'me', 'waitlist')] });
  assert.deepEqual(waiting.join, { kind: 'leave', text: '取消候补' });
  assert.equal(waiting.mineId, 3);
  assert.deepEqual(waiting.badge, { cls: 'wait', text: '候补第 1 位' });
  assert.deepEqual(detail({ parts: [part(1, 'me', 'confirmed')] }).join, { kind: 'leave', text: '取消报名' });
  assert.equal(detail({ canJoin: false }).join.kind, 'blocked');
  assert.equal(detail({ canJoin: false }).canGuest, false);
  const past = detail({ now: at(2026, 10, 25) });
  assert.equal(past.join, null);
  assert.equal(past.canGuest, false);
  assert.equal(detail({ ev: ev(1, at(2026, 10, 24), { cancelled: true }) }).join, null);
});

test('event detail: guests, who may remove whom, and auto-join', () => {
  const parts = [part(1, 'me', 'confirmed'), part(2, 'me', 'confirmed', { guest_name: 'Ann', display_name: 'Me' }), part(3, 'b', 'waitlist')];
  const v = detail({ parts });
  assert.deepEqual(v.confirmed.map((p) => [p.name, p.guest, p.of, p.removable]),
    [['me', false, '', true], ['Ann', true, '（Me 的朋友）', true]]);
  assert.equal(v.waitlist[0].removable, false);
  assert.equal(detail({ parts, isAdmin: true }).waitlist[0].removable, true);
  assert.equal(detail({ parts, ev: ev(1, at(2026, 10, 24), { created_by: 'me' }) }).waitlist[0].removable, true);

  const weekly = { id: 1, freq: 'weekly', interval_n: 1, weekdays: [6], start_date: '2026-10-24', active: true, created_at: iso(at(2026, 10, 1)), created_by: 'owner' };
  assert.deepEqual(detail({ series: weekly }).sub, { on: false, text: '每次自动报名' });
  assert.deepEqual(detail({ series: weekly, subscribed: true }).sub, { on: true, text: '每次自动报名中' });
  assert.equal(detail({ series: { ...weekly, active: false } }).sub, null);
  assert.equal(detail({ series: weekly }).repeat, '每周 周六');
  assert.match(detail({ series: weekly }).created, /^2026年10月1日 10:00:00（Owner）$/);
  assert.equal(detail({ series: { ...weekly, freq: 'none' } }).sub, null);
});

// ------------------------------------------------------------- places
const cats = [
  { id: 1, name: '餐厅', parent_id: null }, { id: 2, name: '拉面', parent_id: 1 }, { id: 3, name: '寿司', parent_id: 1 },
  { id: 4, name: '运动', parent_id: null },
];
const places = [
  { id: 10, name: '一兰', category_id: 2, note: '', created_by: 'me', lat: 35.66, lng: 139.7, map_url: 'https://maps.app.goo.gl/x' },
  { id: 11, name: '寿司大', category_id: 3, note: '早点去', created_by: 'gone', lat: null, lng: null, map_url: 'https://maps.app.goo.gl/y' },
  { id: 12, name: '家庭餐厅', category_id: 1, note: '', created_by: 'me', lat: null, lng: null, map_url: 'https://maps.app.goo.gl/z' },
  { id: 13, name: '公园', category_id: null, note: '', created_by: 'me', lat: null, lng: null, map_url: 'https://maps.app.goo.gl/w' },
];
const members = [{ user_id: 'me', profiles: { display_name: 'Tom' } }];
const base = { categories: cats, places, members };

test('places start screen: main category tiles, "uncategorized", and an "all places" link', () => {
  const v = V.placesView(base);
  assert.deepEqual(v.tiles.map((x) => [x.key, x.name, x.count]), [['1', '餐厅', '3 个地点'], ['4', '运动', '0 个地点'], ['none', '未分类', '1 个地点']]);
  assert.equal(v.tiles[0].subs, '拉面、寿司');
  assert.match(v.tiles[0].hue, /^hue-[0-5]$/);
  assert.equal(v.tiles[2].hue, 'hue-n');
  assert.deepEqual(v.allLink, { count: 4 });
  assert.deepEqual(v.crumbs, [{ key: 'root', label: '地点', current: true }]);
  assert.equal(v.lists.length, 0);
  assert.equal(v.empty, '');
});

test('places: a main category shows its sub-categories, then its own places', () => {
  const v = V.placesView(base, { sel: '1' });
  assert.deepEqual(v.tiles.map((x) => x.name), ['拉面', '寿司']);
  assert.equal(v.lists[0].title, '“餐厅”的其他地点');
  assert.deepEqual(v.lists[0].places.map((p) => p.name), ['家庭餐厅']);
  assert.deepEqual(v.crumbs.map((c) => c.label), ['地点', '餐厅']);
  // sub-categories take the main category's color
  assert.equal(v.tiles[0].hue, V.placesView(base).tiles[0].hue);
});

test('places: a sub-category lists its cards with map, next event and who added it', () => {
  const next = new Map([[10, { id: 99, starts_at: iso(at(2026, 11, 30, 18, 30)) }]]);
  const v = V.placesView(base, { sel: '2', next, nextCount: new Map([[10, 3]]) });
  assert.deepEqual(v.crumbs.map((c) => [c.key, c.label, c.current]), [['root', '地点', false], ['1', '餐厅', false], ['', '拉面', true]]);
  const [card] = v.lists[0].places;
  assert.equal(card.cat, '餐厅 › 拉面');
  assert.equal(card.by, '由 Tom 添加');
  assert.deepEqual(card.next, { id: 99, at: iso(at(2026, 11, 30, 18, 30)), text: '11月30日周一 · 18:30', more: 2 });
  assert.equal(card.map.tiles.length, 6);
  assert.match(card.map.tiles[0].src, /^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/);
  assert.equal(card.art, '');
  assert.equal(v.credit, true);
  const sushi = V.placesView(base, { sel: '3' }).lists[0].places[0];
  assert.equal(sushi.by, '', 'not shown once the person left the group');
  assert.equal(sushi.map, null);
  assert.match(sushi.art, /^data:image\/svg\+xml;base64,/);
});

test('places: search, all, uncategorized, unknown category, empty group', () => {
  assert.deepEqual(V.placesView(base, { search: '早点' }).lists[0].places.map((p) => p.id), [11]);
  assert.deepEqual(V.placesView(base, { search: '拉面' }).lists[0].places.map((p) => p.id), [10]);
  assert.equal(V.placesView(base, { search: 'zzz' }).empty, 'search');
  assert.equal(V.placesView(base, { sel: 'all' }).lists[0].places.length, 4);
  assert.deepEqual(V.placesView(base, { sel: 'none' }).lists[0].places.map((p) => p.id), [13]);
  assert.equal(V.placesView(base, { sel: '999' }).sel, 'root');
  assert.equal(V.placesView(base, { sel: '4' }).empty, 'folder');
  assert.equal(V.placesView({ categories: [], places: [], members: [] }).empty, 'all');
});

test('the drawn cover is a valid SVG, the same every time, and follows dark mode', () => {
  const a = C.coverArt('一兰', 'hue-2', false);
  assert.equal(a, C.coverArt('一兰', 'hue-2', false));
  assert.notEqual(a, C.coverArt('一兰', 'hue-2', true));
  const svg = Buffer.from(a.split(',')[1], 'base64').toString();
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 400 200"/);
  assert.equal((svg.match(/<path /g) || []).length, 7);
  assert.equal(C.base64('hello, ShareMap!'), Buffer.from('hello, ShareMap!').toString('base64'));
  assert.equal(C.base64('ab'), Buffer.from('ab').toString('base64'));
});

test('members: owner first tags, organizer and limits, my groups', () => {
  const m = V.membersView({ members: [
    { user_id: 'o', role: 'owner', organizer: true, can_create: true, can_join: true, profiles: { display_name: 'Owner', is_guest: false } },
    { user_id: 'me', role: 'member', organizer: true, can_create: false, can_join: true, profiles: { display_name: 'tom', is_guest: false } },
    { user_id: 'g', role: 'member', organizer: false, can_create: true, can_join: false, profiles: { display_name: 'Guest', is_guest: true } },
  ] }, { org: { id: 1, name: '羽毛球', invite_code: 'ABCD2345' }, orgs: [{ id: 1, name: '羽毛球', role: 'member' }, { id: 2, name: '家', role: 'owner' }], userId: 'me' });
  assert.equal(m.title, '成员（3 人）');
  assert.deepEqual(m.members.map((x) => x.tags.map((tg) => tg.text)), [['管理员'], ['活动发起人', '禁止发起'], ['游客', '禁止报名']]);
  assert.equal(m.members[1].me, true);
  assert.equal(m.members[1].initial, 'T');
  assert.deepEqual(m.orgs.map((o) => [o.name, o.owner, o.current]), [['羽毛球', false, true], ['家', true, false]]);
});
