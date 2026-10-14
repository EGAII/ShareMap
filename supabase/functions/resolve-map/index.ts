// Edge Function "resolve-map": POST { url } → { lat, lng } for a Google Maps link.
// Called by signed-in users when they save a place (Supabase checks the login token).
// It only reads the link and answers; it never writes to the database.
// Deploy: supabase functions deploy resolve-map
import { resolveMapUrl, isMapsUrl } from './resolve.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let url = '';
  try {
    url = String((await req.json())?.url || '').trim();
  } catch {
    return json({ error: 'Send JSON: { "url": "…" }' }, 400);
  }
  if (!isMapsUrl(url)) return json({ error: 'Not a Google Maps link' }, 400);
  try {
    const found = await resolveMapUrl(url);
    return found ? json(found) : json({ error: 'No location found' }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: 'Lookup failed' }, 502);
  }
});
