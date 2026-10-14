// Find the coordinates behind a Google Maps link, for the map on place cards.
// Only Google Maps hosts are ever fetched, so this cannot be used to reach other sites.

export type Coords = { lat: number; lng: number; source: string };

const MAPS_HOST = /^(maps\.app\.goo\.gl|goo\.gl|maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+|consent\.google\.[a-z.]+)$/i;
const UA = 'Mozilla/5.0 (compatible; ShareMap/1.0; +https://github.com/EGAII/ShareMap)';
const MAX_HOPS = 6;

export function isMapsUrl(u: string): boolean {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol) || !MAPS_HOST.test(x.hostname)) return false;
    const h = x.hostname.toLowerCase();
    // goo.gl and google.* only for their /maps paths
    if (h === 'goo.gl') return x.pathname.startsWith('/maps');
    if (/^(www\.)?google\./.test(h)) return x.pathname.startsWith('/maps') || x.pathname === '/url';
    return true;
  } catch {
    return false;
  }
}

const valid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// Coordinates written into a URL or a page, most precise first:
//   !3d<lat>!4d<lng>  the place's own pin
//   @<lat>,<lng>      the map view center
//   q= / ll= / query= / center= / destination=<lat>,<lng>
export function coordsFromText(s: string, source = 'url'): Coords | null {
  const text = s.replace(/%2C/gi, ',');
  const pin = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(text);
  if (pin && valid(+pin[1], +pin[2])) return { lat: +pin[1], lng: +pin[2], source };
  const at = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(text);
  if (at && valid(+at[1], +at[2])) return { lat: +at[1], lng: +at[2], source };
  const q = /[?&](?:q|ll|query|center|destination|sll)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/i.exec(text);
  if (q && valid(+q[1], +q[2])) return { lat: +q[1], lng: +q[2], source };
  return null;
}

// Coordinates inside a Google Maps page: the preview image link, or the initial map state ([zoom, lng, lat])
function coordsFromPage(html: string): Coords | null {
  const img = /staticmap\?center=(-?\d{1,2}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/i.exec(html);
  if (img && valid(+img[1], +img[2])) return { lat: +img[1], lng: +img[2], source: 'page' };
  const state = /APP_INITIALIZATION_STATE=\[\[\[[\d.]+,(-?\d{1,3}\.\d+),(-?\d{1,2}\.\d+)\]/.exec(html);
  if (state && valid(+state[2], +state[1])) return { lat: +state[2], lng: +state[1], source: 'page' };
  return null;
}

// A search text for the place: the q= / query= value, or the name in /maps/place/<name>/
export function searchText(u: string): string {
  try {
    const x = new URL(u);
    const q = x.searchParams.get('q') || x.searchParams.get('query') || '';
    if (q && !/^-?\d/.test(q)) return q;
    const m = /\/maps\/place\/([^/@]+)/.exec(x.pathname);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  } catch {
    return '';
  }
}

// Last resort: look the name/address up in OpenStreetMap (Nominatim, about 1 request a second allowed)
async function geocode(text: string): Promise<Coords | null> {
  if (!text) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en' } });
    if (!res.ok) return null;
    const [hit] = await res.json();
    return hit && valid(+hit.lat, +hit.lon) ? { lat: +hit.lat, lng: +hit.lon, source: 'search' } : null;
  } catch {
    return null;
  }
}

export async function resolveMapUrl(start: string): Promise<Coords | null> {
  if (!isMapsUrl(start)) return null;
  let url = start;
  let lastSearch = searchText(url);
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const found = coordsFromText(url);
    if (found) return found;
    lastSearch = searchText(url) || lastSearch;

    let res: Response;
    try {
      res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en' } });
    } catch {
      break;   // Google unreachable: fall back to the name search below
    }
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) {
      await res.body?.cancel();
      let target = new URL(next, url).href;
      // A cookie-consent page carries the real address in ?continue=
      const t = new URL(target);
      if (/^consent\.google\./i.test(t.hostname) && t.searchParams.get('continue')) target = t.searchParams.get('continue')!;
      if (!isMapsUrl(target)) break;
      url = target;
      continue;
    }
    if (res.ok) {
      const html = (await res.text()).slice(0, 2_000_000);
      const inPage = coordsFromPage(html);
      if (inPage) return inPage;
    } else {
      await res.body?.cancel();
    }
    break;
  }
  return geocode(lastSearch);
}
