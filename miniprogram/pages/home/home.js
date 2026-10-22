// Main page: the group picker and three tabs, Places / Events / Members (the website's top bar and views).
const store = require('../../utils/store');
const api = require('../../utils/api');
const { t, DICT } = require('../../utils/i18n');
const F = require('../../utils/format');
const V = require('../../utils/views');
const ui = require('../../utils/ui');

const VIEWS = ['places', 'calendar', 'org'];
const openEvent = (id) => wx.navigateTo({ url: `/pages/event/event?event=${id}` });

Page({
  data: {
    T: DICT,
    status: 'loading',   // loading | error | ready
    error: '',
    view: 'places',
    hasOrg: false,
    orgNames: [],
    orgIndex: 0,
    orgName: '',
    code: '',
    search: '',
    places: null,
    cal: null,
    calTitle: '',
    upcoming: [],
    members: null,
    myName: '',
    myInitial: '',
  },

  onLoad(q) {
    this.month = F.startOfMonth(new Date());
    this.sel = 'root';
    this.next = new Map();
    this.nextCount = new Map();
    this.calSeq = 0;
    this.dark = ui.isDark();
    this.onTheme = ({ theme }) => { this.dark = theme === 'dark'; if (this.ready && this.data.view === 'places') this.renderPlaces(); };
    if (wx.onThemeChange) wx.onThemeChange(this.onTheme);
    // An invite link: /pages/home/home?join=CODE
    this.pendingJoin = api.inviteCode(q && q.join);
    const saved = store.storage.get('sm.view');
    if (VIEWS.includes(saved)) this.setData({ view: saved });
    this.start();
  },
  onUnload() { if (wx.offThemeChange) wx.offThemeChange(this.onTheme); },
  // Back from an event or the nickname page: pick up what changed there
  onShow() { if (this.ready && this.seen !== store.state.version) this.enter().catch((e) => this.fail(e)); },
  async onPullDownRefresh() {
    try {
      await store.loadOrgs();
      this.nextAt = 0;
      await this.enter(true);
    } catch (err) {
      this.fail(err);
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async start() {
    this.setData({ status: 'loading', error: '' });
    try {
      await store.init();
      if (this.pendingJoin) {
        const code = this.pendingJoin;
        this.pendingJoin = '';
        await this.offerJoin(code);
      }
      this.ready = true;
      await this.enter();
      if (store.needsName()) {
        store.state.nameAsked = true;
        wx.navigateTo({ url: '/pages/name/name' });
      }
    } catch (err) {
      console.error(err);
      this.setData({ status: 'error', error: api.errorText(err) });
    }
  },
  fail(err) {
    console.error(err);
    ui.showError(api.errorText(err));
  },

  // A plain invite link asks first; nobody is asked to join a group they're already in
  async offerJoin(code) {
    const mine = store.state.orgs.find((o) => o.invite_code === code);
    if (mine) return store.setOrg(mine.id);
    if (!(await ui.confirm(t('onb.pending', { code })))) return;
    try {
      const org = await store.joinByCode(code);
      ui.toast(t('onb.joined', { name: org.name }));
    } catch (err) {
      this.fail(err);
    }
  },

  // Show the open group, or the join screen when there is none
  async enter(force = false) {
    const s = store.state;
    this.seen = s.version;
    this.setData({
      status: 'ready',
      hasOrg: !!s.orgId,
      orgNames: [...s.orgs.map((o) => o.name), `+ ${t('mp.joinMenu')}`],
      orgIndex: Math.max(0, s.orgs.findIndex((o) => o.id === s.orgId)),
      orgName: (store.currentOrg() || {}).name || '',
      myName: s.profile.display_name,
      myInitial: F.initial(s.profile.display_name),
    });
    if (!s.orgId) return;
    if (!s.base) this.setData({ places: null, cal: null, members: null });
    await store.loadBase(force);
    this.seen = s.version;
    await this.renderView();
  },
  renderView() {
    const v = this.data.view;
    if (v === 'places') { this.renderPlaces(); return this.loadNext(); }
    if (v === 'calendar') return this.renderCalendar();
    return this.renderMembers();
  },
  onTab(e) {
    const view = e.currentTarget.dataset.view;
    if (view === this.data.view) return;
    this.setData({ view });
    store.storage.set('sm.view', view);
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    Promise.resolve(this.renderView()).catch((err) => this.fail(err));
  },

  // ------------------------------------------------------------- groups
  onOrgPick(e) {
    const i = Number(e.detail.value);
    const org = store.state.orgs[i];
    if (!org) return this.askJoin();
    if (org.id === store.state.orgId) return;
    store.setOrg(org.id);
    this.sel = 'root';
    this.enter().catch((err) => this.fail(err));
  },
  async askJoin() {
    const code = await ui.prompt(t('onb.joinTitle'), t('onb.codePh'));
    if (code) await this.join(code);
  },
  onCode(e) { this.setData({ code: e.detail.value }); },
  onJoin() { if (this.data.code.trim()) this.join(this.data.code); },
  async join(code) {
    wx.showLoading({ title: t('onb.join'), mask: true });
    try {
      const org = await store.joinByCode(api.inviteCode(code));
      wx.hideLoading();
      ui.toast(t('onb.joined', { name: org.name }));
      this.sel = 'root';
      this.setData({ code: '' });
      await this.enter();
    } catch (err) {
      wx.hideLoading();
      this.fail(err);
    }
  },
  onSwitchOrg(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (id === store.state.orgId) return;
    store.setOrg(id);
    this.sel = 'root';
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    this.enter().catch((err) => this.fail(err));
  },

  // ------------------------------------------------------------- places
  renderPlaces() {
    const base = store.state.base;
    if (!base) return;
    const places = V.placesView(base, {
      sel: this.sel, search: this.data.search, next: this.next, nextCount: this.nextCount, dark: this.dark,
    });
    this.sel = places.sel;
    this.setData({ places });
  },
  // Next event per place for the covers; picks up new events at most every 10 s
  async loadNext() {
    const org = store.state.orgId;
    if (this.nextOrg === org && Date.now() - (this.nextAt || 0) < 10000) return;
    try {
      const rows = await api.upcoming(org);
      if (org !== store.state.orgId) return;
      const next = new Map();
      const count = new Map();
      for (const r of rows) {
        if (!next.has(r.place_id)) next.set(r.place_id, r);
        count.set(r.place_id, (count.get(r.place_id) || 0) + 1);
      }
      Object.assign(this, { next, nextCount: count, nextAt: Date.now(), nextOrg: org });
      if (this.data.view === 'places') this.renderPlaces();
    } catch (err) {
      console.warn(err);
    }
  },
  onSearch(e) {
    this.setData({ search: e.detail.value });
    this.renderPlaces();
  },
  onCat(e) {
    this.sel = String(e.currentTarget.dataset.cat);
    this.renderPlaces();
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },
  place(e) { return store.state.base.places.find((p) => p.id === Number(e.currentTarget.dataset.id)); },
  // The website opens Google Maps; here the place opens in WeChat's map when its location is known
  onPlace(e) {
    const p = this.place(e);
    if (!p) return;
    if (p.lat == null || p.lng == null) return this.copyLink(p);
    wx.openLocation({ latitude: p.lat, longitude: p.lng, name: p.name, address: p.note || '', scale: 16 });
  },
  onCopyLink(e) { const p = this.place(e); if (p) this.copyLink(p); },
  copyLink(p) { ui.copy(p.map_url, t('mp.linkCopied')); },
  onOpenEvent(e) { openEvent(Number(e.currentTarget.dataset.id)); },

  // ------------------------------------------------------------- events
  async renderCalendar() {
    const org = store.state.orgId;
    const month = this.month;
    const seq = ++this.calSeq;
    this.setData({ calTitle: F.monthTitle(month) });
    const { from, to } = V.monthRange(month);
    const data = await api.events(org, from, to, store.state.userId);
    if (seq !== this.calSeq || org !== store.state.orgId) return;   // a newer load started
    this.monthEvents = data.events;
    const ctx = { ...data, places: store.state.base.places, userId: store.state.userId };
    this.setData({ cal: V.calendarView({ month, ...ctx }), upcoming: V.upcomingView(ctx) });
  },
  moveMonth(month) {
    this.month = month;
    this.renderCalendar().catch((err) => this.fail(err));
  },
  onPrev() { this.moveMonth(new Date(this.month.getFullYear(), this.month.getMonth() - 1, 1)); },
  onNext() { this.moveMonth(new Date(this.month.getFullYear(), this.month.getMonth() + 1, 1)); },
  onToday() { this.moveMonth(F.startOfMonth(new Date())); },
  // A day: its one event, or a list to choose from
  onDay(e) {
    const day = this.data.cal.days[Number(e.currentTarget.dataset.index)];
    if (!day || !day.ids.length) return;
    if (day.ids.length === 1) return openEvent(day.ids[0]);
    const evs = day.ids.map((id) => this.monthEvents.find((ev) => ev.id === id)).slice(0, 6);
    wx.showActionSheet({
      alertText: t('mp.dayEvents', { date: F.fmtDate(F.fromYmd(day.key)) }),
      itemList: evs.map((ev) => `${F.fmtTime(new Date(ev.starts_at))} ${ev.title}`),
      success: (r) => openEvent(evs[r.tapIndex].id),
    });
  },

  // ------------------------------------------------------------- members
  renderMembers() {
    const s = store.state;
    this.setData({ members: V.membersView(s.base, { org: store.currentOrg(), orgs: s.orgs, userId: s.userId }) });
  },
  onCopyCode() { ui.copy(store.currentOrg().invite_code, t('org.copied')); },
  onEditName() { wx.navigateTo({ url: '/pages/name/name' }); },

  // Sharing this page invites people to the open group (the website's invite link: …/?join=CODE)
  onShareAppMessage() {
    const org = store.currentOrg();
    if (!org) return { title: t('appTitle'), path: '/pages/home/home' };
    return {
      title: t('mp.inviteGroup', { name: store.state.profile.display_name, org: org.name }),
      path: `/pages/home/home?join=${org.invite_code}`,
    };
  },
});
