// Nickname: shown to the group and in shared invitations. The nickname box offers the WeChat
// nickname (WeChat no longer gives it to mini programs without the person choosing it).
const store = require('../../utils/store');
const api = require('../../utils/api');
const { t, DICT } = require('../../utils/i18n');
const F = require('../../utils/format');
const ui = require('../../utils/ui');

Page({
  data: { T: DICT, name: '', initial: '?', hint: '', first: false, busy: false },

  async onLoad() {
    await store.init().catch(() => {});
    const current = (store.state.profile || {}).display_name || '';
    const first = current === store.DEFAULT_NAME;
    this.setData({
      first,
      name: first ? '' : current,
      initial: F.initial(first ? '?' : current),
      hint: t('mp.nameHint', { name: first ? '…' : current }),
    });
  },
  onInput(e) { this.setData({ initial: F.initial(e.detail.value || '?') }); },
  // WeChat checks a chosen nickname; a refused one is emptied (base library 2.24.4+)
  onReview(e) { if (e.detail && e.detail.pass === false) ui.toast(t('mp.nameBad')); },

  async onSubmit(e) {
    const name = String(e.detail.value.nickname || '').trim().slice(0, 40);
    if (!name) return ui.toast(t('mp.nameEmpty'));
    this.setData({ busy: true });
    try {
      await store.saveName(name);
      ui.toast(t('saved'));
      this.leave();
    } catch (err) {
      ui.showError(api.errorText(err));
    } finally {
      this.setData({ busy: false });
    }
  },
  onSkip() {
    store.storage.set('sm.nameSkipped', '1');
    this.leave();
  },
  leave() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/home/home' });
  },
});
