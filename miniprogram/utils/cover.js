// Place covers, as on the website (js/app.js): a small OpenStreetMap map centered on the place, or,
// when its location is unknown, a drawn contour pattern in its main category's color.
const COLORS = require('./cover-colors');

function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seeded(seed) {   // mulberry32
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t2 = Math.imul(a ^ (a >>> 15), 1 | a);
    t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
}
const COVER_HUES = 6;
// Color follows the main category, so a category's tile and its places match
function catHue(cat, catById) {
  const root = cat && cat.parent_id ? catById(cat.parent_id) : cat;
  return root ? `hue-${hashStr(root.id + ':' + root.name) % COVER_HUES}` : 'hue-n';
}

// ASCII → base64 (mini programs have no btoa)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(s) {
  let out = '';
  for (let i = 0; i < s.length; i += 3) {
    const [a, b, c] = [s.charCodeAt(i), s.charCodeAt(i + 1), s.charCodeAt(i + 2)];
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < s.length ? B64[n >> 6 & 63] : '=') + (i + 2 < s.length ? B64[n & 63] : '=');
  }
  return out;
}

// Contour lines + a pin, deterministic per name (the same drawing as the website's coverArt)
const artCache = new Map();
function coverArt(name, hue, dark) {
  const key = `${name}|${hue}|${dark ? 1 : 0}`;
  if (artCache.has(key)) return artCache.get(key);
  const { line, ink } = (COLORS[hue] || COLORS['hue-n'])[dark ? 'dark' : 'light'];
  const rnd = seeded(hashStr(name));
  const W = 400, H = 200;
  let lines = '';
  const layers = 7;
  for (let i = 0; i < layers; i++) {
    const base = 14 + i * (H / (layers - 1)) + (rnd() - .5) * 10;
    const amp = 5 + rnd() * 16, freq = .008 + rnd() * .014, phase = rnd() * Math.PI * 2;
    const amp2 = rnd() * 6, freq2 = .03 + rnd() * .02;
    let d = '';
    for (let x = -10; x <= W + 10; x += 10) {
      const y = base + amp * Math.sin(x * freq + phase) + amp2 * Math.sin(x * freq2 + phase * 2);
      d += `${d ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
    }
    lines += `<path d="${d}" opacity="${(.35 + rnd() * .5).toFixed(2)}"/>`;
  }
  const px = (W * .55 + rnd() * W * .35).toFixed(0), py = (H * .22 + rnd() * H * .3).toFixed(0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">`
    + `<g fill="none" stroke="${line}" stroke-width="1.1">${lines}</g>`
    + `<circle cx="${px}" cy="${py}" r="30" fill="${ink}" opacity=".06"/>`
    + `<circle cx="${px}" cy="${py}" r="15" fill="none" stroke="${ink}" stroke-width="1.2" opacity=".28"/>`
    + `<circle cx="${px}" cy="${py}" r="5" fill="${ink}"/></svg>`;
  const uri = 'data:image/svg+xml;base64,' + base64(svg);
  artCache.set(key, uri);
  return uri;
}

// 3 x 2 map squares of 256 px around the place, which sits a little above the middle of the cover
const MAP_ZOOM = 16;
function mapTiles(lat, lng) {
  const size = 256, n = 2 ** MAP_ZOOM;
  const x = (lng + 180) / 360 * n * size;
  const r = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n * size;
  const tx = Math.floor(x / size), ty = Math.floor(y / size);
  const top = y - ty * size < size / 2 ? ty - 1 : ty;   // the row of squares nearer the place
  const tiles = [];
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const X = (((tx + dx) % n) + n) % n, Y = top + dy;
      if (Y < 0 || Y >= n) continue;
      tiles.push({ src: `https://tile.openstreetmap.org/${MAP_ZOOM}/${X}/${Y}.png`, left: (dx + 1) * size, top: dy * size });
    }
  }
  const ox = (x - (tx - 1) * size).toFixed(1), oy = (y - top * size).toFixed(1);
  return { tiles, style: `left:calc(50% - ${ox}px);top:calc(42% - ${oy}px)` };
}
const hasMap = (p) => p.lat != null && p.lng != null;

module.exports = { hashStr, catHue, coverArt, mapTiles, hasMap, base64 };
