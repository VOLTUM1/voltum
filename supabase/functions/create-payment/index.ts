// ============================================================
// Voltum — Supabase Edge Function: create-payment
// ============================================================
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
    // Verificar autenticación
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

    const { userEmail, djName } = await req.json();
    const appUrl = Deno.env.get("APP_URL") ?? "http://localhost";

    // Crear preferencia en Mercado Pago
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{
          id: "voltum-pro-monthly",
          title: "Voltum Pro — Press Kit Digital Mensual",
          description: `Membresía mensual para ${djName || "DJ"}`,
          quantity: 1,
          unit_price: 11990,
          currency_id: "CLP",
        }],
        payer: {
          email: userEmail || user.email,
        },
        back_urls: {
          success: `${appUrl}/success.html`,
          failure: `${appUrl}/payment.html`,
          pending: `${appUrl}/payment.html`,
        },
        auto_return: "approved",
        external_reference: user.id,
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-webhook`,
        statement_descriptor: "VOLTUM PRO",
        expires: false,
      }),
    });

    if (!mpResponse.ok) {
      const err = await mpResponse.text();
      console.error("MP error:", err);
      return new Response(JSON.stringify({ error: "Error al crear preferencia de pago" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const preference = await mpResponse.json();
    return new Response(JSON.stringify({ id: preference.id, init_point: preference.init_point }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
