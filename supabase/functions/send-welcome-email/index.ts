// ============================================================
// Voltum — Edge Function: send-welcome-email
// ============================================================
// Envía un email de bienvenida al DJ recién registrado.
// Se llama desde el frontend después del signup exitoso.
//
// Despliega con: supabase functions deploy send-welcome-email
//
// Variables de entorno requeridas:
//   RESEND_API_KEY=re_xxxx       (de resend.com, gratis hasta 3k/mes)
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { djName } = await req.json();
    const appUrl = Deno.env.get("APP_URL") ?? "http://localhost";

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
          <td style="background:linear-gradient(135deg,#1a0533,#050514);padding:40px 40px 32px;text-align:center;">
            <div style="font-size:2rem;font-weight:800;letter-spacing:-1px;color:#ffffff;margin-bottom:4px;">⚡ VOLTUM</div>
            <div style="font-size:0.85rem;color:rgba(167,139,250,0.8);letter-spacing:2px;text-transform:uppercase;">Press Kit Digital para DJs</div>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 8px;font-size:1.6rem;font-weight:700;color:#0f0f1a;">Bienvenido, ${djName} 🎧</h1>
            <p style="margin:0 0 24px;color:#64748b;font-size:1rem;line-height:1.6;">Tu cuenta Voltum está lista. Ahora tienes todo lo que necesitas para presentarte como un DJ profesional.</p>

            <div style="background:#f8f5ff;border-radius:12px;padding:24px;margin-bottom:28px;border:1px solid #e9d5ff;">
              <div style="font-weight:700;color:#6d28d9;margin-bottom:16px;font-size:0.9rem;text-transform:uppercase;letter-spacing:1px;">¿Qué hacer ahora?</div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;">
                    <span style="color:#8b5cf6;font-weight:700;margin-right:10px;">01</span>
                    <span style="color:#374151;">Completa tu bio y agrega tus géneros musicales</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <span style="color:#8b5cf6;font-weight:700;margin-right:10px;">02</span>
                    <span style="color:#374151;">Sube tu foto de perfil y banner</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <span style="color:#8b5cf6;font-weight:700;margin-right:10px;">03</span>
                    <span style="color:#374151;">Agrega tus próximas fechas y eventos</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <span style="color:#8b5cf6;font-weight:700;margin-right:10px;">04</span>
                    <span style="color:#374151;">Activa tu membresía y comparte tu link</span>
                  </td>
                </tr>
              </table>
            </div>

            <div style="text-align:center;margin-bottom:28px;">
              <a href="${appUrl}/dashboard.html" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#22d3ee);color:#ffffff;font-weight:700;font-size:1rem;padding:14px 32px;border-radius:12px;text-decoration:none;">
                Ir a mi Dashboard →
              </a>
            </div>

            <p style="color:#94a3b8;font-size:0.85rem;text-align:center;margin:0;">
              ¿Tienes dudas? Responde este email y te ayudamos.
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
        to: user.email,
        subject: `Bienvenido a Voltum, ${djName} ⚡`,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return new Response(JSON.stringify({ error: "Error enviando email" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
