// Finds a place's Google photos from its Google Maps share link.
// Pure logic (no Deno APIs) so it can be tested with a fake fetch.

const PLACES = 'https://places.googleapis.com/v1';
const MAX_PHOTOS = 3;
const PHOTO_WIDTH = 800;
const UA = 'Mozilla/5.0 (compatible; ShareMap/1.0)';

export type PlaceRow = { id: number; name: string; map_url: string; google_place_id: string | null };
export type Photo = { url: string; author: string; authorUri: string };
export type Deps = {
  fetch: typeof fetch;
  apiKey: string;
  getPlace: (id: number) => Promise<PlaceRow | null>;
  savePlaceId: (id: number, googlePlaceId: string) => Promise<void>;
};
type GooglePhoto = { name: string; authorAttributions?: { displayName?: string; uri?: string }[] };
type Parsed = { name?: string; lat?: number; lng?: number; placeId?: string };

const NUM = '(-?\\d+(?:\\.\\d+)?)';

// Pull what we can out of a full Google Maps URL.
export function parseMapsUrl(raw: string): Parsed {
  let url: URL;
  try { url = new URL(raw); } catch { return {}; }

  // EU consent interstitial wraps the real URL
  if (url.hostname.startsWith('consent.')) {
    const cont = url.searchParams.get('continue');
    return cont ? parseMapsUrl(cont) : {};
  }

  const out: Parsed = {};
  const pid = url.searchParams.get('query_place_id') || url.searchParams.get('place_id');
  if (pid) out.placeId = pid;

  const seg = url.pathname.match(/\/maps\/place\/([^/]+)/);
  if (seg) {
    const name = decodeURIComponent(seg[1].replace(/\+/g, ' ')).trim();
    if (name && !new RegExp(`^${NUM},\\s*${NUM}$`).test(name)) out.name = name;
  }

  // The place's own pin (!3d…!4d…) beats the viewport centre (@lat,lng)
  const href = decodeURIComponent(url.href);
  const pin = href.match(new RegExp(`!3d${NUM}!4d${NUM}`));
  const view = href.match(new RegExp(`@${NUM},${NUM}`));
  const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
  const qll = q.match(new RegExp(`^\\s*${NUM},\\s*${NUM}\\s*$`));
  const ll = pin || qll || view;
  if (ll) { out.lat = Number(ll[1]); out.lng = Number(ll[2]); }
  if (!out.name && q && !qll) out.name = q.trim();
  return out;
}

// Follow maps.app.goo.gl / goo.gl/maps redirects without downloading pages.
export async function resolveShortLink(f: typeof fetch, raw: string): Promise<string> {
  let current = raw;
  for (let hop = 0; hop < 6; hop++) {
    let host: string;
    try { host = new URL(current).hostname; } catch { return current; }
    if (!/(^|\.)goo\.gl$/.test(host)) return current;
    const res = await f(current, { redirect: 'manual', headers: { 'User-Agent': UA } });
    const loc = res.headers.get('location');
    await res.body?.cancel();
    if (!loc) return current;
    current = new URL(loc, current).href;
  }
  return current;
}

async function google(deps: Deps, url: string, method: 'GET' | 'POST', fieldMask: string, body?: unknown) {
  const headers: Record<string, string> = { 'X-Goog-Api-Key': deps.apiKey, 'X-Goog-FieldMask': fieldMask };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await deps.fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function photoUrl(deps: Deps, photoName: string): Promise<string | null> {
  const res = await deps.fetch(`${PLACES}/${photoName}/media?maxWidthPx=${PHOTO_WIDTH}&skipHttpRedirect=true`,
    { headers: { 'X-Goog-Api-Key': deps.apiKey } });
  if (!res.ok) return null;
  const data = await res.json();
  return typeof data.photoUri === 'string' ? data.photoUri : null;
}

// Returns [httpStatus, body]. body = { available, photos: Photo[] }
export async function handle(input: unknown, deps: Deps): Promise<[number, unknown]> {
  const req = (input ?? {}) as { place_id?: unknown; limit?: unknown };
  const id = Number(req.place_id);
  const limit = Math.min(MAX_PHOTOS, Math.max(1, Number(req.limit) || 1));
  if (!Number.isInteger(id)) return [400, { error: 'place_id is required' }];

  const place = await deps.getPlace(id);
  if (!place) return [404, { error: 'Place not found' }];

  let googleId = place.google_place_id;
  let photos: GooglePhoto[] | undefined;

  if (googleId) {
    const details = await google(deps, `${PLACES}/places/${encodeURIComponent(googleId)}`, 'GET', 'photos');
    if (details === null) googleId = null;   // stale ID: look it up again below
    else photos = details.photos;
  }

  if (!googleId) {
    const finalUrl = await resolveShortLink(deps.fetch, place.map_url).catch(() => place.map_url);
    const parsed = parseMapsUrl(finalUrl);
    let hit: { id: string; photos?: GooglePhoto[] } | undefined;
    if (parsed.placeId) {
      const details = await google(deps, `${PLACES}/places/${encodeURIComponent(parsed.placeId)}`, 'GET', 'id,photos');
      if (details) hit = details;
    }
    if (!hit) {
      const search: Record<string, unknown> = { textQuery: parsed.name || place.name, maxResultCount: 1 };
      if (parsed.lat != null && parsed.lng != null) {
        search.locationBias = { circle: { center: { latitude: parsed.lat, longitude: parsed.lng }, radius: 300 } };
      }
      const found = await google(deps, `${PLACES}/places:searchText`, 'POST', 'places.id,places.photos', search);
      hit = found?.places?.[0];
    }
    if (hit) {
      googleId = hit.id;
      photos = hit.photos;
      await deps.savePlaceId(id, hit.id);
    }
  }

  const firstThree = (photos ?? []).slice(0, MAX_PHOTOS);
  const wanted = firstThree.slice(0, limit);
  const urls = await Promise.all(wanted.map((p) => photoUrl(deps, p.name)));
  const result: Photo[] = [];
  wanted.forEach((p, i) => {
    const url = urls[i];
    if (!url) return;
    const a = p.authorAttributions?.[0];
    result.push({ url, author: a?.displayName ?? '', authorUri: a?.uri ?? '' });
  });
  return [200, { available: firstThree.length, photos: result }];
}
