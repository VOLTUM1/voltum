// ============================================================
// Voltum — Supabase Edge Function: payment-webhook
// ============================================================
// Maneja notificaciones de Mercado Pago para suscripciones.
//
// Eventos que procesa:
//   - "payment"     → cargo aprobado (primer pago o renovación automática)
//   - "preapproval" → cambio de estado de la suscripción (cancelada, pausada)
//
// Despliega con: supabase functions deploy payment-webhook
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  try {
    const body = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SERVICE_ROLE_KEY") ?? ""
    );

    // ── Cargo aprobado (primer pago o renovación automática) ──
    if (body.type === "payment") {
      const paymentId = body.data?.id;
      if (!paymentId) return new Response("ok", { status: 200 });

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { "Authorization": `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}` }
      });
      if (!mpRes.ok) return new Response("error", { status: 500 });

      const payment = await mpRes.json();
      if (payment.status !== "approved") return new Response("not approved", { status: 200 });

      const userId = payment.external_reference;
      if (!userId) return new Response("no user", { status: 200 });

      // Extender la membresía desde el vencimiento actual (si sigue vigente)
      // o desde hoy (si ya venció). Así el usuario no pierde días pagados.
      const { data: existing } = await supabase
        .from("memberships")
        .select("expires_at")
        .eq("user_id", userId)
        .single();

      const now = new Date();
      const currentExpiry = existing?.expires_at ? new Date(existing.expires_at) : now;
      const baseDate = currentExpiry > now ? currentExpiry : now;
      const newExpiry = new Date(baseDate);
      newExpiry.setMonth(newExpiry.getMonth() + 1);

      await supabase.from("memberships").upsert({
        user_id: userId,
        status: "active",
        payment_id: String(paymentId),
        amount: payment.transaction_amount,
        starts_at: now.toISOString(),
        expires_at: newExpiry.toISOString(),
      }, { onConflict: "user_id" });

      return new Response("ok", { status: 200 });
    }

    // ── Cambio de estado de la suscripción ──
    if (body.type === "preapproval") {
      const subscriptionId = body.data?.id;
      if (!subscriptionId) return new Response("ok", { status: 200 });

      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
        headers: { "Authorization": `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}` }
      });
      if (!mpRes.ok) return new Response("error", { status: 500 });

      const subscription = await mpRes.json();
      const userId = subscription.external_reference;
      if (!userId) return new Response("no user", { status: 200 });

      if (subscription.status === "authorized") {
        // Suscripción activa — guardar subscription_id
        await supabase.from("memberships")
          .update({ subscription_id: subscriptionId })
          .eq("user_id", userId);

      } else if (["cancelled", "paused"].includes(subscription.status)) {
        // Suscripción cancelada/pausada — marcar sin auto-renovación
        // La membresía sigue activa hasta la fecha de vencimiento actual
        await supabase.from("memberships")
          .update({ subscription_id: null })
          .eq("subscription_id", subscriptionId);
      }

      return new Response("ok", { status: 200 });
    }

    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
