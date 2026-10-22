// Every database call the mini program makes. They are the website's queries (js/app.js), so both
// read and write the same rows, under the same Row Level Security.
const sb = require('./supabase');
const { t } = require('./i18n');

// A readable message for an error from the database (like check() on the website)
function errorText(err) {
  const msg = (err && err.message) || String(err);
  // No answer: offline, or WeChat blocked the address ("url not in domain list" = not whitelisted)
  if (err && err.status === 0) return `${t('mp.offline')}（${msg}）`;
  if (msg.includes('BANNED_FROM_ORG')) return t('org.banned');
  if (/Invalid invite code/i.test(msg)) return t('mp.badCode');
  return msg;
}
// As join_organization() reads an invite code
const inviteCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const profile = (uid) => sb.from('profiles').select('*').eq('id', uid).maybeSingle();
// No PATCH in wx.request: an upsert on the user's own row changes only display_name
const saveName = (uid, name) => sb.from('profiles')
  .upsert({ id: uid, display_name: name }, { onConflict: 'id' }).select().maybeSingle();

async function orgs(uid) {
  const rows = await sb.from('org_members')
    .select('role, joined_at, organizations(id, name, invite_code)').eq('user_id', uid);
  return rows.filter((r) => r.organizations)
    .map((r) => ({ ...r.organizations, role: r.role, joined_at: r.joined_at }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
const joinOrg = (code) => sb.rpc('join_organization', { p_code: code });

// Member lists: owner first, then organizers, regular members, and guests last
const memberRank = (m) => (m.role === 'owner' ? 0 : m.profiles && m.profiles.is_guest ? 3 : m.organizer ? 1 : 2);
async function base(org) {
  const [categories, places, members] = await Promise.all([
    sb.from('categories').select('*').eq('org_id', org).order('sort_order').order('name'),
    sb.from('places').select('*').eq('org_id', org).order('name'),
    sb.from('org_members').select('user_id, role, joined_at, organizer, can_create, can_join, profiles(display_name, is_guest)')
      .eq('org_id', org).order('joined_at'),
  ]);
  return { orgId: org, categories, places, members: members.sort((a, b) => memberRank(a) - memberRank(b)) };
}

// Next upcoming (not cancelled) events, for the place covers
const upcoming = (org) => sb.from('events').select('id, place_id, title, starts_at')
  .eq('org_id', org).eq('cancelled', false).gte('starts_at', new Date().toISOString())
  .order('starts_at').limit(500);

// participants of these events, in position order, as event_id → rows
async function participants(ids) {
  const map = new Map();
  for (let i = 0; i < ids.length; i += 150) {
    const rows = await sb.from('event_participant_status').select('*').in('event_id', ids.slice(i, i + 150)).order('position');
    for (const p of rows) {
      if (!map.has(p.event_id)) map.set(p.event_id, []);
      map.get(p.event_id).push(p);
    }
  }
  return map;
}

// Events from..to with their participants, series and my "auto-join" subscriptions (as loadEvents)
async function events(org, from, to, uid) {
  const list = await sb.from('events').select('*').eq('org_id', org)
    .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at');
  const seriesIds = [...new Set(list.map((e) => e.series_id))];
  const [parts, series, subs] = await Promise.all([
    participants(list.map((e) => e.id)),
    seriesIds.length ? sb.from('event_series').select('*').in('id', seriesIds) : [],
    sb.from('series_subscribers').select('series_id').eq('user_id', uid),
  ]);
  return {
    events: list, parts,
    series: new Map(series.map((s) => [s.id, s])),
    mySubs: new Set(subs.map((s) => s.series_id)),
  };
}

// One event (null when it's gone or in a group I'm not in: RLS hides it)
const event = (id) => sb.from('events').select('*').eq('id', id).maybeSingle();
async function eventDetail(ev, uid) {
  const [parts, series, sub] = await Promise.all([
    participants([ev.id]),
    sb.from('event_series').select('*').eq('id', ev.series_id).maybeSingle(),
    sb.from('series_subscribers').select('series_id').eq('series_id', ev.series_id).eq('user_id', uid).maybeSingle(),
  ]);
  return { parts: parts.get(ev.id) || [], series, subscribed: !!sub };
}

// Sign-ups: me (guest_name '') or a friend I bring; user_id is filled in by the database
const join = (eventId, guestName = '') => sb.from('event_participants')
  .insert(guestName ? { event_id: eventId, guest_name: guestName } : { event_id: eventId });
const removeParticipant = (id) => sb.from('event_participants').delete().eq('id', id);
const subscribe = (seriesId) => sb.from('series_subscribers').insert({ series_id: seriesId });
const unsubscribe = (seriesId, uid) => sb.from('series_subscribers').delete().eq('series_id', seriesId).eq('user_id', uid);

module.exports = {
  errorText, inviteCode, profile, saveName, orgs, joinOrg, base, upcoming, events, event, eventDetail,
  join, removeParticipant, subscribe, unsubscribe,
};
