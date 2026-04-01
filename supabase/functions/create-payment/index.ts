// ============================================================
// Voltum — Supabase Edge Function: create-payment
// ============================================================
// Crea una suscripción recurrente en Mercado Pago (Preapproval).
// Mercado Pago cobra automáticamente cada mes al usuario.
//
// Despliega con: supabase functions deploy create-payment
//
// Variables de entorno requeridas (supabase secrets set):
//   MP_ACCESS_TOKEN=APP_USR-xxxx  (tu token de Mercado Pago)
//   APP_URL=https://tu-dominio.com
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

    const { userEmail, djName, referralCode } = await req.json();
    const appUrl = Deno.env.get("APP_URL") ?? "http://localhost";

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SERVICE_ROLE_KEY") ?? ""
    );

    // Validar código de referido si viene uno
    let discountedAmount = 11990;
    let referralData: any = null;

    if (referralCode) {
      const { data: refCode } = await supabaseAdmin
        .from("referral_codes")
        .select("*")
        .eq("code", referralCode.trim().toUpperCase())
        .eq("active", true)
        .single();

      if (refCode && refCode.owner_user_id !== user.id) {
        // Verificar que este usuario no haya usado ya un código
        const { data: existingReferral } = await supabaseAdmin
          .from("referrals")
          .select("id")
          .eq("referred_user_id", user.id)
          .single();

        if (!existingReferral) {
          referralData = refCode;
          const discount = refCode.discount_percent / 100;
          discountedAmount = Math.round(11990 * (1 - discount));
        }
      }
    }

    // Crear suscripción recurrente en Mercado Pago
    const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: "Voltum Pro — Press Kit Digital Mensual",
        external_reference: user.id,
        payer_email: userEmail || user.email,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: discountedAmount,
          currency_id: "CLP",
        },
        back_url: `${appUrl}/success.html`,
        status: "pending",
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-webhook`,
      }),
    });

    if (!mpResponse.ok) {
      const err = await mpResponse.text();
      console.error("MP error:", err);
      return new Response(JSON.stringify({ error: "Error al crear suscripción" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const subscription = await mpResponse.json();

    // Registrar referido si aplica
    if (referralData) {
      await supabaseAdmin.from("referrals").insert({
        code: referralData.code,
        referrer_user_id: referralData.owner_user_id,
        referred_user_id: user.id,
        discount_months_remaining: referralData.discount_months,
      });
    }

    return new Response(JSON.stringify({
      id: subscription.id,
      init_point: subscription.init_point,
      discounted: !!referralData,
      amount: discountedAmount,
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
