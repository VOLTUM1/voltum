// ============================================================
// Voltum — Edge Function: send-expiry-reminder
// ============================================================
// Busca membresías que vencen en 3 días (sin auto-renovación)
// y envía un email de recordatorio a cada DJ.
//
// Despliega con: supabase functions deploy send-expiry-reminder
//
// Programar con pg_cron (ejecutar en SQL Editor de Supabase):
//
//   SELECT cron.schedule(
//     'voltum-expiry-reminder',
//     '0 12 * * *',
//     $$
//     SELECT net.http_post(
//       url := 'https://TU_PROJECT_REF.supabase.co/functions/v1/send-expiry-reminder',
//       headers := json_build_object(
//         'Content-Type', 'application/json',
//         'Authorization', 'Bearer TU_SERVICE_ROLE_KEY'
//       )::jsonb,
//       body := '{}'::text
//     );
//     $$
//   );
//
// Variables de entorno requeridas:
//   RESEND_API_KEY=re_xxxx
//   APP_URL=https://tu-dominio.com
//   SERVICE_ROLE_KEY=xxxx
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SERVICE_ROLE_KEY") ?? ""
    );

    const appUrl = Deno.env.get("APP_URL") ?? "http://localhost";

    // Buscar membresías que vencen entre 3 y 4 días desde ahora,
    // sin auto-renovación activa (subscription_id nulo)
    const in3days = new Date();
    in3days.setDate(in3days.getDate() + 3);
    const in4days = new Date();
    in4days.setDate(in4days.getDate() + 4);

    const { data: memberships, error } = await supabase
      .from("memberships")
      .select("user_id, expires_at")
      .eq("status", "active")
      .is("subscription_id", null)
      .gte("expires_at", in3days.toISOString())
      .lt("expires_at", in4days.toISOString());

    if (error) {
      console.error("DB error:", error);
      return new Response("db error", { status: 500 });
    }

    if (!memberships?.length) {
      return new Response("no reminders needed", { status: 200 });
    }

    // Obtener emails y nombres de cada usuario
    let sent = 0;
    for (const mem of memberships) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("dj_name")
        .eq("id", mem.user_id)
        .single();

      const { data: authUser } = await supabase.auth.admin.getUserById(mem.user_id);
      const email = authUser?.user?.email;
      if (!email) continue;

      const djName = profile?.dj_name || "DJ";
      const expiryDate = new Date(mem.expires_at).toLocaleDateString("es-CL", {
        day: "numeric", month: "long", year: "numeric"
      });

      const emailHtml = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#451a03,#050514);padding:40px 40px 32px;text-align:center;">
            <div style="font-size:2rem;font-weight:800;letter-spacing:-1px;color:#ffffff;margin-bottom:4px;">⚡ VOLTUM</div>
            <div style="font-size:0.85rem;color:rgba(251,191,36,0.8);letter-spacing:2px;text-transform:uppercase;">Aviso de membresía</div>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:40px;">
            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px 20px;margin-bottom:28px;text-align:center;">
              <div style="font-size:1.5rem;margin-bottom:4px;">⏰</div>
              <div style="font-weight:700;color:#92400e;font-size:1rem;">Tu membresía vence en 3 días</div>
              <div style="color:#b45309;font-size:0.875rem;margin-top:4px;">${expiryDate}</div>
            </div>

            <h2 style="margin:0 0 12px;font-size:1.4rem;font-weight:700;color:#0f0f1a;">Hola ${djName},</h2>
            <p style="margin:0 0 20px;color:#64748b;font-size:1rem;line-height:1.6;">
              Tu membresía Voltum Pro vence el <strong>${expiryDate}</strong>. Renueva ahora para que tu press kit siga visible y no pierdas ningún booking.
            </p>

            <div style="text-align:center;margin-bottom:24px;">
              <a href="${appUrl}/payment.html" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#ffffff;font-weight:700;font-size:1rem;padding:14px 32px;border-radius:12px;text-decoration:none;">
                Renovar membresía — $11.990 →
              </a>
            </div>

            <div style="background:#f8f5ff;border-radius:12px;padding:20px;margin-bottom:24px;">
              <div style="font-weight:700;color:#6d28d9;margin-bottom:12px;font-size:0.85rem;">¿Qué pasa si no renuevo?</div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0;color:#ef4444;font-size:0.9rem;">✕ Tu press kit deja de ser visible públicamente</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#ef4444;font-size:0.9rem;">✕ Tu link deja de funcionar para bookings</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#10b981;font-size:0.9rem;margin-top:4px;">✓ Tu información y fotos se mantienen guardadas</td>
                </tr>
              </table>
            </div>

            <p style="color:#94a3b8;font-size:0.85rem;text-align:center;margin:0;">
              ¿Quieres activar el cobro automático mensual? Actívalo en tu <a href="${appUrl}/payment.html" style="color:#8b5cf6;">página de membresía</a>.
            </p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8f9fa;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:0.8rem;">
              ⚡ VOLTUM · Press Kit Digital para DJs<br>
              <a href="${appUrl}" style="color:#8b5cf6;text-decoration:none;">${appUrl}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Voltum <hola@voltum.cl>",
          to: email,
          subject: `⏰ Tu membresía Voltum vence en 3 días, ${djName}`,
          html: emailHtml,
        }),
      });

      if (res.ok) sent++;
      else console.error(`Error enviando a ${email}:`, await res.text());
    }

    return new Response(JSON.stringify({ sent, total: memberships.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
