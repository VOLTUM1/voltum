import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getSpotifyToken() {
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const secret = Deno.env.get("SPOTIFY_CLIENT_SECRET");

  if (!id || !secret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  }

  const credentials = btoa(id + ":" + secret);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + credentials,
    },
    body: "grant_type=client_credentials",
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Spotify token response: " + text.slice(0, 200));
  }

  if (!data.access_token) {
    throw new Error("Spotify token error: " + JSON.stringify(data));
  }

  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let artistId = null;

    if (req.method === "POST") {
      const body = await req.json();
      artistId = body.artist_id;
    } else {
      const url = new URL(req.url);
      artistId = url.searchParams.get("artist_id");
    }

    if (!artistId) {
      return new Response(JSON.stringify({ error: "artist_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getSpotifyToken();

    const [tracksRes, artistRes] = await Promise.all([
      fetch("https://api.spotify.com/v1/artists/" + artistId + "/top-tracks?market=CL", {
        headers: { "Authorization": "Bearer " + token },
      }),
      fetch("https://api.spotify.com/v1/artists/" + artistId, {
        headers: { "Authorization": "Bearer " + token },
      }),
    ]);

    const tracksText = await tracksRes.text();
    const artistText = await artistRes.text();

    let tracksData, artistData;
    try { tracksData = JSON.parse(tracksText); } catch { throw new Error("Tracks response: " + tracksText.slice(0, 200)); }
    try { artistData = JSON.parse(artistText); } catch { throw new Error("Artist response: " + artistText.slice(0, 200)); }

    const tracks = (tracksData.tracks || []).slice(0, 6).map((t) => ({
      name: t.name,
      album: t.album?.name,
      artwork: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url,
      preview_url: t.preview_url,
      external_url: t.external_urls?.spotify,
      duration_ms: t.duration_ms,
    }));

    const artist = {
      name: artistData.name,
      image: artistData.images?.[0]?.url,
      url: artistData.external_urls?.spotify,
      followers: artistData.followers?.total,
    };

    return new Response(JSON.stringify({ tracks, artist }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
