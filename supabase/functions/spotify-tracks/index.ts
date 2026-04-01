// ============================================================
// Voltum — Supabase Edge Function: spotify-tracks
// ============================================================
// Devuelve las top tracks de un artista de Spotify usando
// Client Credentials (no requiere que el usuario inicie sesión).
//
// Despliega con: supabase functions deploy spotify-tracks
//
// Variables de entorno requeridas (supabase secrets set):
//   SPOTIFY_CLIENT_ID=tu_client_id
//   SPOTIFY_CLIENT_SECRET=tu_client_secret
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getSpotifyToken(): Promise<string> {
  const clientId     = Deno.env.get("SPOTIFY_CLIENT_ID")!;
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
  const credentials  = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error("No se pudo obtener el token de Spotify");
  const { access_token } = await res.json();
  return access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { artist_id } = await req.json();
    if (!artist_id) {
      return new Response(
        JSON.stringify({ error: "artist_id es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getSpotifyToken();
    const headers = { "Authorization": `Bearer ${token}` };

    // Top tracks + info del artista en paralelo
    const [tracksRes, artistRes] = await Promise.all([
      fetch(`https://api.spotify.com/v1/artists/${artist_id}/top-tracks?market=ES`, { headers }),
      fetch(`https://api.spotify.com/v1/artists/${artist_id}`, { headers }),
    ]);

    if (!tracksRes.ok || !artistRes.ok) {
      throw new Error("Artista no encontrado en Spotify");
    }

    const { tracks } = await tracksRes.json();
    const artist     = await artistRes.json();

    // Solo los campos que necesitamos
    const result = {
      artist: {
        name:      artist.name,
        followers: artist.followers?.total ?? 0,
        image:     artist.images?.[0]?.url ?? null,
        url:       artist.external_urls?.spotify ?? null,
      },
      tracks: (tracks ?? []).slice(0, 6).map((t: any) => ({
        id:          t.id,
        name:        t.name,
        album:       t.album?.name ?? "",
        artwork:     t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url ?? null,
        duration_ms: t.duration_ms,
        preview_url: t.preview_url,
        url:         t.external_urls?.spotify ?? null,
        popularity:  t.popularity,
      })),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
