// Find the coordinates behind a Google Maps link, for the map on place cards.
// Only Google Maps links are followed (plus OpenStreetMap's Photon search), so this cannot be
// used to reach other sites.

export type Coords = { lat: number; lng: number; source: string };

const MAPS_HOST = /^(maps\.app\.goo\.gl|goo\.gl|maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+|consent\.google\.[a-z.]+)$/i;
const UA = 'Mozilla/5.0 (compatible; ShareMap/1.0; +https://github.com/EGAII/ShareMap)';   // for Google
const APP_UA = 'ShareMap/1.0 (+https://github.com/EGAII/ShareMap)';   // for the OpenStreetMap searches
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

// Last resort: search the place in OpenStreetMap data with Photon (komoot's free search; Nominatim
// refuses requests from Supabase's servers). A wrong map is worse than none, so a result is only used
// when it is clearly the place:
//   "Name, address" (usual share text): a hit for the name, or for the address, whose city/ward
//                                        appears in the address
//   name only:                           a hit with that name (exact first, else one name containing the other)
// Photon returns unrelated places abroad for queries it doesn't understand, hence these checks.
// (Google's page itself is not read: without a browser it shows a default map view, not the place.)
type Hit = { lat: number; lng: number; name: string; areas: string[] };
const CJK = /[぀-ヿ㐀-鿿]/;   // Japanese / Chinese characters
const norm = (x: string) => x.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

async function photon(q: string, log: string[], limit = 8): Promise<Hit[]> {
  const lang = CJK.test(q) ? '' : '&lang=en';
  try {
    const res = await fetch(`https://photon.komoot.io/api/?limit=${limit}${lang}&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': APP_UA } });
    log.push(`photon "${q}": ${res.status}`);
    if (!res.ok) return [];
    const feats = (await res.json())?.features || [];
    return feats.map((f: any) => {
      const p = f.properties || {};
      const [lng, lat] = f.geometry?.coordinates || [];
      return { lat: +lat, lng: +lng, name: String(p.name || ''),
               areas: [p.city, p.district, p.county, p.locality].filter(Boolean).map(String) };
    }).filter((h: Hit) => valid(h.lat, h.lng));
  } catch (err) {
    log.push(`photon "${q}": ${err}`);
    return [];
  }
}

const inArea = (h: Hit, address: string) => {
  const a = norm(address);
  return h.areas.some((x) => norm(x).length > 1 && a.includes(norm(x).replace(/(city|ward|-ku|区|市)$/u, '')));
};
const done = (h: Hit | undefined): Coords | null => (h ? { lat: h.lat, lng: h.lng, source: 'search' } : null);

async function geocode(text: string, log: string[]): Promise<Coords | null> {
  const parts = text.split(/[,、，]/).map((p) => p.trim()).filter(Boolean);
  const name = parts[0] || '';
  const address = parts.slice(1).filter((p) => !/^(japan|日本)$/i.test(p)).join(' ');
  if (!name) return null;
  if (!address) {
    const hits = await photon(name, log, 5);
    const n = norm(name);
    return done(hits.find((h) => norm(h.name) === n)
      || hits.find((h) => norm(h.name).length > 1 && (n.includes(norm(h.name)) || norm(h.name).includes(n))));
  }
  const byName = (await photon(name, log)).find((h) => inArea(h, address));
  if (byName) return done(byName);
  // The street without the house number, e.g. 東京都渋谷区道玄坂2丁目29-8 → 東京都渋谷区道玄坂
  const street = address.replace(/\b\d{3}-?\d{4}\b/g, '').replace(/[\d０-９\-－−ー丁目番地号]+$/u, '').trim();
  for (const q of [...new Set([address, street])]) {
    if (q.length < 3) continue;
    const hit = (await photon(q, log, 5)).find((h) => inArea(h, address));
    if (hit) return done(hit);
  }
  return null;
}

export async function resolveMapUrl(start: string, log: string[] = []): Promise<Coords | null> {
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
      log.push(`${res.status} ${url}`);
    } catch (err) {
      log.push(`fetch failed ${url}: ${err}`);
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
    await res.body?.cancel();
    break;
  }
  return geocode(lastSearch, log);
}
