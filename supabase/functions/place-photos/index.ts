// Supabase Edge Function: POST { place_id, limit } → { available, photos: [{ url, author, authorUri }] }
// Needs the secret GOOGLE_MAPS_API_KEY (Places API (New) enabled). Runs as the signed-in user,
// so Row Level Security decides whether they may see the place.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { handle } from './logic.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) return json(503, { error: 'GOOGLE_MAPS_API_KEY is not set' });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const [status, data] = await handle(body, {
      fetch,
      apiKey,
      getPlace: async (id) => {
        const { data } = await sb.from('places').select('id, name, map_url, google_place_id').eq('id', id).maybeSingle();
        return data;
      },
      savePlaceId: async (id, googlePlaceId) => {
        await sb.from('places').update({ google_place_id: googlePlaceId }).eq('id', id);
      },
    });
    return json(status, data);
  } catch (err) {
    console.error(err);
    return json(502, { error: 'Could not load photos' });
  }
});
