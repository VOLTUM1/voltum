// ============================================================
// Voltum — Edge Function: notify-admin-booking
// ============================================================
// Se llama fire-and-forget desde presskit.html después de insertar
// una nueva solicitud de booking. Envía al ADMIN un email con el
// detalle completo para que pueda gestionarlo desde admin.html.
//
// Deploy: supabase functions deploy notify-admin-booking --no-verify-jwt
//
// Variables de entorno requeridas en Supabase:
//   RESEND_API_KEY   = re_xxxx
//   ADMIN_EMAIL      = diossupremoinversionesspa@gmail.com
//   APP_URL          = https://voltum.cl   (o el dominio que uses)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const clp = (n?: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(n);

const esc = (s: unknown) =>
  String(s ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { bookingId } = await req.json();
    if (!bookingId) {
      return new Response(JSON.stringify({ error: "bookingId requerido" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Usamos service role para leer el booking + joins con profiles/companies
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: b, error } = await admin
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (error || !b) {
      return new Response(JSON.stringify({ error: "booking no encontrado" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Fetch del DJ y de la empresa (separado para evitar depender del FK name)
    const [{ data: dj }, { data: co }] = await Promise.all([
      b.dj_user_id
        ? admin.from("profiles").select("dj_name, slug, real_name").eq("id", b.dj_user_id).single()
        : Promise.resolve({ data: null }),
      b.company_id
        ? admin.from("companies").select("name, type, contact_name, contact_phone, instagram").eq("id", b.company_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const appUrl = Deno.env.get("APP_URL") ?? "https://voltum.cl";
    const adminEmail = Deno.env.get("ADMIN_EMAIL") ?? "diossupremoinversionesspa@gmail.com";
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY no configurado" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const eventDate = b.event_date
      ? new Date(b.event_date + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })
      : "—";

    const eq =
      b.equipment_provided === true
        ? "✅ Lugar cuenta con equipamiento"
        : b.equipment_provided === false
        ? "⚠️ Voltum debe proveer equipo"
        : "Sin especificar";

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#000;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#000;padding:40px 20px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border:1px solid rgba(212,255,58,0.25);border-radius:14px;overflow:hidden;">

        <tr><td style="padding:28px 32px 18px;border-bottom:1px solid rgba(255,255,255,0.08);">
          <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:0.24em;color:#D4FF3A;text-transform:uppercase;margin-bottom:8px;">VOLTUM · NUEVO BOOKING</div>
          <div style="font-size:22px;font-weight:900;letter-spacing:-0.01em;">Solicitud de booking recibida</div>
          <div style="color:#8C8C8C;font-size:13px;margin-top:4px;">Revísala y apruébala desde tu panel admin.</div>
        </td></tr>

        <tr><td style="padding:24px 32px;">

          <!-- Empresa → DJ -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
            <tr>
              <td style="width:48%;padding:14px;background:#050505;border:1px solid rgba(255,255,255,0.08);border-radius:8px;vertical-align:top;">
                <div style="color:#8C8C8C;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Empresa</div>
                <div style="font-weight:700;font-size:15px;">${esc(co?.name)}</div>
                <div style="color:#8C8C8C;font-size:12px;margin-top:3px;">${esc(co?.type)}</div>
                ${co?.contact_name ? `<div style="color:#CCCCCC;font-size:12px;margin-top:6px;">👤 ${esc(co.contact_name)}</div>` : ""}
                ${co?.contact_phone ? `<div style="color:#D4FF3A;font-size:12px;margin-top:3px;">📞 ${esc(co.contact_phone)}</div>` : ""}
                ${co?.instagram ? `<div style="color:#D4FF3A;font-size:12px;margin-top:3px;">@${esc(co.instagram)}</div>` : ""}
              </td>
              <td style="width:4%;"></td>
              <td style="width:48%;padding:14px;background:#050505;border:1px solid rgba(255,255,255,0.08);border-radius:8px;vertical-align:top;">
                <div style="color:#8C8C8C;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">DJ solicitado</div>
                <div style="font-weight:700;font-size:15px;">${esc(dj?.dj_name)}</div>
                <div style="color:#8C8C8C;font-size:12px;margin-top:3px;">${esc(dj?.real_name ?? "")}</div>
                ${dj?.slug ? `<a href="${appUrl}/${dj.slug}" style="display:inline-block;margin-top:10px;color:#D4FF3A;font-size:12px;text-decoration:none;border-bottom:1px solid #D4FF3A;">Ver press kit →</a>` : ""}
              </td>
            </tr>
          </table>

          <!-- Detalles del evento -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
            <tr>
              <td colspan="3" style="color:#D4FF3A;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;padding-bottom:10px;">— Detalles del evento</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;background:#050505;border:1px solid rgba(255,255,255,0.08);border-radius:6px;width:33%;">
                <div style="color:#8C8C8C;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Fecha</div>
                <div style="font-weight:600;font-size:14px;">${eventDate}</div>
              </td>
              <td style="width:2%;"></td>
              <td style="padding:10px 12px;background:#050505;border:1px solid rgba(255,255,255,0.08);border-radius:6px;width:33%;">
                <div style="color:#8C8C8C;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Horario</div>
                <div style="font-weight:600;font-size:14px;">${esc(b.event_time ?? "—")}</div>
              </td>
            </tr>
            <tr><td colspan="3" style="height:8px;"></td></tr>
            <tr>
              <td style="padding:10px 12px;background:#050505;border:1px solid rgba(255,255,255,0.08);border-radius:6px;">
                <div style="color:#8C8C8C;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Tipo de evento</div>
                <div style="font-weight:600;font-size:14px;">${esc(b.event_type ?? "—")}</div>
              </td>
              <td></td>
              <td style="padding:10px 12px;background:#050505;border:1px solid rgba(255,255,255,0.08);border-radius:6px;">
                <div style="color:#8C8C8C;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Horas del servicio</div>
                <div style="font-weight:600;font-size:14px;">${b.duration_hrs ? b.duration_hrs + " hrs" : "—"}</div>
              </td>
            </tr>
          </table>

          <!-- Lugar + Equipamiento -->
          <div style="padding:14px 16px;background:#050505;border:1px solid rgba(255,255,255,0.08);border-radius:8px;margin-bottom:14px;">
            <div style="color:#8C8C8C;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Lugar del evento</div>
            <div style="font-weight:600;font-size:15px;margin-bottom:12px;">${esc(b.venue_name ?? "—")}${b.city ? ` · ${esc(b.city)}` : ""}</div>

            <div style="color:#8C8C8C;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">Equipamiento</div>
            <div style="font-size:13px;color:#D4FF3A;">${eq}</div>
            ${b.equipment_details ? `<div style="color:#CCCCCC;font-size:12px;margin-top:8px;line-height:1.55;">${esc(b.equipment_details)}</div>` : ""}
          </div>

          <!-- Presupuesto -->
          <div style="padding:16px;background:linear-gradient(145deg,rgba(212,255,58,0.08),rgba(212,255,58,0.02));border:1px solid rgba(212,255,58,0.25);border-radius:8px;margin-bottom:18px;text-align:center;">
            <div style="color:#D4FF3A;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:6px;">Presupuesto disponible</div>
            <div style="color:#D4FF3A;font-size:28px;font-weight:900;letter-spacing:-0.02em;">${clp(b.budget)}</div>
          </div>

          ${b.message ? `
          <div style="padding:14px 16px;background:#050505;border:1px solid rgba(255,255,255,0.08);border-radius:8px;margin-bottom:18px;">
            <div style="color:#8C8C8C;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Mensaje de la empresa</div>
            <div style="font-size:13px;line-height:1.6;">${esc(b.message)}</div>
          </div>` : ""}

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
            <tr><td align="center">
              <a href="${appUrl}/admin" style="display:inline-block;padding:14px 28px;background:#D4FF3A;color:#000;font-weight:700;font-size:15px;text-decoration:none;border-radius:6px;letter-spacing:0.02em;">Gestionar en panel admin →</a>
            </td></tr>
          </table>

        </td></tr>

        <tr><td style="padding:16px 32px;background:#050505;border-top:1px solid rgba(255,255,255,0.08);text-align:center;">
          <div style="color:#4A4A4A;font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:0.14em;text-transform:uppercase;">VOLTUM · BOOKING ${esc(String(b.id).slice(0, 8))}</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

    const subject = `🎧 Nuevo booking — ${co?.name ?? "Empresa"} → ${dj?.dj_name ?? "DJ"} · ${clp(b.budget)}`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Voltum <bookings@voltum.cl>",
        to: [adminEmail],
        reply_to: co?.contact_phone ? undefined : undefined,
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      return new Response(JSON.stringify({ error: "resend failed", detail: errTxt }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
