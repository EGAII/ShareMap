// One event: details, who is going, the waiting list, join / leave / bring a friend, and sharing.
// Opened from the lists, or from a shared chat card: /pages/event/event?join=CODE&event=ID.
// Like the website's event links, the invite code lets people who aren't in the group yet join it
// on the way (members just open the event).
const store = require('../../utils/store');
const api = require('../../utils/api');
const { t, DICT } = require('../../utils/i18n');
const F = require('../../utils/format');
const V = require('../../utils/views');
const ui = require('../../utils/ui');

Page({
  data: {
    T: DICT,
    status: 'loading',   // loading | error | ready
    error: '',
    ev: null,
    guestOpen: false,
    guestName: '',
    busy: false,
  },

  onLoad(q) {
    this.eventId = Number(q.event) || 0;
    this.joinCode = api.inviteCode(q.join);
    this.load(true);
  },
  onShow() { if (this.loaded && this.seen !== store.state.version) this.refresh(); },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()); },

  async load(first = false) {
    this.setData({ status: 'loading', error: '' });
    try {
      await store.init();
      const ev = await this.findEvent();
      if (!ev) return;
      this.loaded = true;
      store.setOrg(ev.org_id);   // the group's pages open on this group afterwards
      await this.show(ev);
      if (first && store.needsName()) {
        store.state.nameAsked = true;
        wx.navigateTo({ url: '/pages/name/name' });
      }
    } catch (err) {
      console.error(err);
      this.setData({ status: 'error', error: api.errorText(err) });
    }
  },

  // The event, joining its group first when the link carries an invite code I'm not in yet
  async findEvent() {
    let ev = this.eventId ? await api.event(this.eventId) : null;
    const code = this.joinCode;
    if (!ev && code && !store.state.orgs.some((o) => o.invite_code === code)) {
      const org = await store.joinByCode(code);   // shows why it failed (banned, old code…)
      ui.toast(t('onb.joined', { name: org.name }));
      if (this.eventId) ev = await api.event(this.eventId);
    }
    if (!ev) {
      // Links made before they carried the invite code can't add anyone to the group
      this.setData({ status: 'error', error: t(code ? 'ev.linkGone' : 'ev.linkNoGroup') });
      return null;
    }
    return ev;
  },

  async show(ev) {
    const base = await store.loadBase();
    const detail = await api.eventDetail(ev, store.state.userId);
    this.event = ev;
    this.series = detail.series;
    this.place = base.places.find((p) => p.id === ev.place_id) || null;
    this.seen = store.state.version;
    const view = V.eventView({
      ev, series: detail.series, place: this.place, parts: detail.parts, subscribed: detail.subscribed,
      userId: store.state.userId, isAdmin: store.isAdmin(), canJoin: store.canJoin(), memberName: store.memberName,
    });
    wx.setNavigationBarTitle({ title: ev.title });
    this.setData({ status: 'ready', ev: view });
  },
  async refresh() {
    try {
      const ev = await api.event(this.eventId);
      if (!ev) return this.setData({ status: 'error', error: t('ev.linkGone') });
      await this.show(ev);
    } catch (err) {
      ui.showError(api.errorText(err));
    }
  },
  // Run a change, then show the event again; changes are seen by the lists too
  async act(fn) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await fn();
      store.state.version++;
      await this.refresh();
    } catch (err) {
      console.error(err);
      ui.showError(api.errorText(err));
    } finally {
      this.setData({ busy: false });
    }
  },

  onJoin() {
    const full = this.data.ev.join.full;
    this.act(async () => {
      await api.join(this.event.id);
      ui.toast(t(full ? 'ev.addedWait' : 'ev.joined'));
    });
  },
  onLeave() { this.act(() => api.removeParticipant(this.data.ev.mineId)); },
  onGuestToggle() { this.setData({ guestOpen: !this.data.guestOpen }); },
  onGuestInput(e) { this.setData({ guestName: e.detail.value }); },
  onGuestAdd() {
    const name = this.data.guestName.trim();
    if (!name) return;
    this.act(async () => {
      await api.join(this.event.id, name);
      this.setData({ guestName: '', guestOpen: false });
    });
  },
  onRemove(e) { this.act(() => api.removeParticipant(Number(e.currentTarget.dataset.id))); },
  async onSub() {
    if (this.data.ev.sub.on) {
      if (!(await ui.confirm(t('ev.stopAutoConfirm')))) return;
      this.act(() => api.unsubscribe(this.event.series_id, store.state.userId));
    } else {
      this.act(async () => {
        await api.subscribe(this.event.series_id);
        ui.toast(t('ev.autoToast'));
      });
    }
  },
  onPlace() {
    const p = this.place;
    if (!p) return;
    if (p.lat == null || p.lng == null) return ui.copy(p.map_url, t('mp.linkCopied'));
    wx.openLocation({ latitude: p.lat, longitude: p.lng, name: p.name, address: p.note || '', scale: 16 });
  },
  onCopyLink() { if (this.place) ui.copy(this.place.map_url, t('mp.linkCopied')); },
  onRetry() { this.load(); },
  onHome() { wx.reLaunch({ url: '/pages/home/home' }); },

  // The chat card reads "<my name> 邀请你参加 <date> <event>", like the website's shared links
  onShareAppMessage() {
    const ev = this.event;
    if (!ev) return { title: t('appTitle'), path: '/pages/home/home' };
    const org = store.state.orgs.find((o) => o.id === ev.org_id);
    return {
      title: F.inviteTitle(store.state.profile.display_name, new Date(ev.starts_at), ev.title),
      path: `/pages/event/event?${org ? `join=${org.invite_code}&` : ''}event=${ev.id}`,
    };
  },
});
