// ============================================================
// Voltum — Supabase Edge Function: payment-webhook
// ============================================================
// Recibe notificaciones de Mercado Pago y activa la membresía.
// Despliega con: supabase functions deploy payment-webhook
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  try {
    const body = await req.json();

    // Solo procesar notificaciones de pagos aprobados
    if (body.type !== "payment") {
      return new Response("ok", { status: 200 });
    }

    const paymentId = body.data?.id;
    if (!paymentId) return new Response("ok", { status: 200 });

    // Consultar estado del pago en MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}` }
    });

    if (!mpRes.ok) return new Response("error", { status: 500 });
    const payment = await mpRes.json();

    if (payment.status !== "approved") {
      return new Response("payment not approved", { status: 200 });
    }

    const userId = payment.external_reference;
    if (!userId) return new Response("no user", { status: 200 });

    // Activar membresía en Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SERVICE_ROLE_KEY") ?? ""  // service role para escribir sin RLS
    );

    const starts = new Date();
    const expires = new Date(starts);
    expires.setFullYear(expires.getFullYear() + 1);

    await supabase.from("memberships").upsert({
      user_id: userId,
      status: "active",
      payment_id: String(paymentId),
      amount: payment.transaction_amount,
      starts_at: starts.toISOString(),
      expires_at: expires.toISOString(),
    }, { onConflict: "user_id" });

    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
