// ============================================================
// Voltum — Supabase Edge Function: redeem-promo
// ============================================================
// Canjea un código promocional de 1 año para influencers.
// Valida que el código exista, no haya sido usado, y activa
// la membresía por 12 meses sin cobro.
//
// Despliega con: supabase functions deploy redeem-promo
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar usuario con anon key
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role para operaciones sin RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SERVICE_ROLE_KEY") ?? ""
    );

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ error: "Código requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedCode = code.trim().toUpperCase();

    // Buscar código
    const { data: promo, error: promoError } = await supabaseAdmin
      .from("promo_codes")
      .select("*")
      .eq("code", normalizedCode)
      .single();

    if (promoError || !promo) {
      return new Response(JSON.stringify({ error: "Código inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (promo.used) {
      return new Response(JSON.stringify({ error: "Este código ya fue utilizado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar que este usuario no haya canjeado otro código antes
    const { data: existingPromo } = await supabaseAdmin
      .from("promo_codes")
      .select("id")
      .eq("used_by", user.id)
      .single();

    if (existingPromo) {
      return new Response(JSON.stringify({ error: "Ya canjeaste un código promocional anteriormente" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Marcar código como usado (operación atómica)
    const { error: updateError } = await supabaseAdmin
      .from("promo_codes")
      .update({
        used: true,
        used_by: user.id,
        used_at: new Date().toISOString(),
      })
      .eq("id", promo.id)
      .eq("used", false); // condición extra: solo actualizar si aún no está usado

    if (updateError) {
      return new Response(JSON.stringify({ error: "Código ya fue reclamado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Activar membresía por 12 meses
    const starts = new Date();
    const expires = new Date(starts);
    expires.setMonth(expires.getMonth() + promo.months);

    await supabaseAdmin.from("memberships").upsert(
      {
        user_id: user.id,
        status: "active",
        payment_id: "PROMO_" + normalizedCode,
        subscription_id: null,
        amount: 0,
        starts_at: starts.toISOString(),
        expires_at: expires.toISOString(),
      },
      { onConflict: "user_id" }
    );

    return new Response(
      JSON.stringify({
        success: true,
        expires_at: expires.toISOString(),
        months: promo.months,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
