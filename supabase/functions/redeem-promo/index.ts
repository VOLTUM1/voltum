// ============================================================
// Voltum — Supabase Edge Function: redeem-promo
// ============================================================
// Canjea un código promocional. Soporta dos tipos:
//   - Código de un solo uso global (is_universal = false):
//     solo puede ser canjeado por una cuenta en total.
//   - Código universal (is_universal = true):
//     cualquier cuenta puede canjearlo, pero cada cuenta
//     solo puede usarlo una vez (regla por cuenta).
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

    if (promo.is_universal) {
      // ── Código universal: verificar que esta cuenta no lo haya usado ──
      const { data: existingUse } = await supabaseAdmin
        .from("promo_code_uses")
        .select("id")
        .eq("code_id", promo.id)
        .eq("user_id", user.id)
        .single();

      if (existingUse) {
        return new Response(JSON.stringify({ error: "Ya usaste este código en tu cuenta" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Registrar el uso por esta cuenta
      const { error: useError } = await supabaseAdmin
        .from("promo_code_uses")
        .insert({ code_id: promo.id, user_id: user.id });

      if (useError) {
        return new Response(JSON.stringify({ error: "Este código ya fue reclamado por tu cuenta" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // ── Código de un solo uso global ──
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

      // Marcar como usado (operación atómica)
      const { error: updateError } = await supabaseAdmin
        .from("promo_codes")
        .update({
          used: true,
          used_by: user.id,
          used_at: new Date().toISOString(),
        })
        .eq("id", promo.id)
        .eq("used", false);

      if (updateError) {
        return new Response(JSON.stringify({ error: "Código ya fue reclamado" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Calcular expiración ──
    // Si el código tiene días (ej: 7 días de prueba), usar días.
    // Si no, usar meses.
    const starts = new Date();
    const expires = new Date(starts);

    if (promo.days && promo.days > 0) {
      expires.setDate(expires.getDate() + promo.days);
    } else {
      expires.setMonth(expires.getMonth() + promo.months);
    }

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
        days: promo.days ?? null,
        months: promo.months ?? null,
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
