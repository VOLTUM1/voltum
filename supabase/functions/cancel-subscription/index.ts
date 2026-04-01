// ============================================================
// Voltum — Supabase Edge Function: cancel-subscription
// ============================================================
// Cancela la suscripción activa del usuario en Mercado Pago.
// La membresía sigue activa hasta la fecha de vencimiento.
//
// Despliega con: supabase functions deploy cancel-subscription
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Obtener subscription_id del usuario
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SERVICE_ROLE_KEY") ?? ""
    );

    const { data: membership } = await supabaseAdmin
      .from("memberships")
      .select("subscription_id, expires_at")
      .eq("user_id", user.id)
      .single();

    if (!membership?.subscription_id) {
      return new Response(JSON.stringify({ error: "No hay suscripción activa" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Cancelar en Mercado Pago
    const mpRes = await fetch(
      `https://api.mercadopago.com/preapproval/${membership.subscription_id}`,
      {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
      }
    );

    if (!mpRes.ok) {
      const err = await mpRes.text();
      console.error("MP cancel error:", err);
      return new Response(JSON.stringify({ error: "Error al cancelar en Mercado Pago" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Quitar subscription_id — membresía sigue activa hasta que venza
    await supabaseAdmin.from("memberships")
      .update({ subscription_id: null })
      .eq("user_id", user.id);

    return new Response(JSON.stringify({
      ok: true,
      expires_at: membership.expires_at,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
