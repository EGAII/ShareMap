// Native dialogs and toasts, as promises (the website uses its own toast, confirm() and prompt()).
const { t } = require('./i18n');

const toast = (title) => wx.showToast({ title, icon: 'none', duration: 2500 });
const showError = (content) => wx.showModal({ title: t('mp.error'), content, showCancel: false, confirmColor: '#1e6b66' });
const confirm = (content, { title = '', danger = false } = {}) => new Promise((resolve) => wx.showModal({
  title, content, confirmColor: danger ? '#a8402f' : '#1e6b66',
  success: (r) => resolve(!!r.confirm), fail: () => resolve(false),
}));
// A text box in a dialog; null when cancelled
const prompt = (title, placeholderText = '') => new Promise((resolve) => wx.showModal({
  title, editable: true, placeholderText, confirmColor: '#1e6b66',
  success: (r) => resolve(r.confirm ? String(r.content || '').trim() : null), fail: () => resolve(null),
}));
const copy = (data, msg) => new Promise((resolve) => wx.setClipboardData({
  data, success: () => { toast(msg); resolve(true); }, fail: () => resolve(false),
}));
const isDark = () => {
  try { return (wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()).theme === 'dark'; } catch (e) { return false; }
};

module.exports = { toast, showError, confirm, prompt, copy, isDark };
