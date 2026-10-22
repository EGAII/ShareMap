// Dates and event helpers, ported from js/app.js. Dates are written out by hand (as 简体中文 does
// on the website) because Intl date formatting is not available on every phone's mini program engine.
const { t } = require('./i18n');

const pad = (n) => String(n).padStart(2, '0');
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WD_LONG = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// "2026-11-30" as a local date (new Date('2026-11-30') would be UTC midnight)
const fromYmd = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDate = (d) => `${d.getMonth() + 1}月${d.getDate()}日${WD[d.getDay()]}`;                  // 11月30日周一
const fmtDateLong = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日${WD_LONG[d.getDay()]}`;
const fmtYmd = (s) => { const d = fromYmd(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
const fmtStamp = (s) => { const d = new Date(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${fmtTime(d)}:${pad(d.getSeconds())}`; };
const monthTitle = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月`;

// The title of a shared event, e.g. "Tom 邀请你参加 11月30日周一 羽毛球"
const inviteTitle = (name, at, title) =>
  t('ev.inviteTitle', { name, title, date: isNaN(at) ? '' : fmtDate(at) }).replace(/\s+/g, ' ').trim();

// How soon an event starts, in calendar days (colors event rows and calendar chips)
function dueLevel(ev, nowDate = new Date()) {
  if (new Date(ev.ends_at) < nowDate) return { cls: 'due-past', label: '' };
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(new Date(ev.starts_at)) - day(nowDate)) / 86400000);
  if (days <= 0) return { cls: 'due-today', label: t('due.today') };
  if (days === 1) return { cls: 'due-tomorrow', label: t('due.tomorrow') };
  if (days <= 3) return { cls: 'due-3days', label: t('due.inDays', { n: days }) };
  if (days < 7) return { cls: 'due-week', label: t('due.inDays', { n: days }) };
  return { cls: 'due-later', label: '' };
}

function repeatText(s) {
  if (!s || s.freq === 'none') return t('rt.none');
  const n = s.interval_n;
  let txt = '';
  if (s.freq === 'daily') txt = n === 1 ? t('rt.daily1') : t('rt.dailyN', { n });
  if (s.freq === 'weekly') {
    const days = (s.weekdays && s.weekdays.length ? s.weekdays : [fromYmd(s.start_date).getDay()])
      .slice().sort().map((d) => WD[d]).join(t('listSep'));
    txt = n === 1 ? t('rt.weekly1', { days }) : t('rt.weeklyN', { n, days });
  }
  if (s.freq === 'monthly') {
    const d = Number(s.start_date.slice(8));
    txt = n === 1 ? t('rt.monthly1', { d }) : t('rt.monthlyN', { n, d });
  }
  return txt + (s.until_date ? t('rt.until', { date: fmtYmd(s.until_date) }) : '') + (s.active ? '' : t('rt.stopped'));
}

// Confirmed / waiting list for one event, from event_participant_status rows (in position order)
function eventStats(ev, parts, userId) {
  parts = parts || [];
  const confirmed = parts.filter((p) => p.status === 'confirmed');
  const waitlist = parts.filter((p) => p.status === 'waitlist');
  const mine = parts.find((p) => p.user_id === userId && !p.guest_name) || null;
  return { parts, confirmed, waitlist, mine, full: ev.capacity != null && confirmed.length >= ev.capacity };
}

// The first character of a name, for the square avatars
const initial = (name) => ([...String(name || '?').trim()][0] || '?').toUpperCase();

module.exports = {
  pad, WD, dateKey, startOfMonth, addDays, fromYmd,
  fmtTime, fmtDate, fmtDateLong, fmtYmd, fmtStamp, monthTitle,
  inviteTitle, dueLevel, repeatText, eventStats, initial,
};
