// supabase/functions/send-status-change-email/index.ts
// Envía un correo institucional tipo COMUNICADO UNEMI sobre cambios/novedades en el campus.
// Audiencias:
//   - 'admin' → solo operadores/admins (vía RPC get_admin_users)
//   - 'public' | 'student' → TODOS los usuarios registrados (auth.users + profiles)
//   - 'teacher' → docentes + administrativos
//   - 'staff' → solo administrativos
//
// Para garantizar que llegue a TODOS (incluidos los que solo tienen user_roles='user'
// y aún no completaron su perfil), tomamos los emails desde auth.users via Admin API
// y, opcionalmente, filtramos por user_type cuando la audiencia lo exige.
//
// Usa Gmail API con OAuth2. Requiere: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOGO_URL = "https://www.unemi.edu.ec/wp-content/uploads/2021/09/LOGO-WEB-BLANCO-300x120.png";

async function getGmailAccessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GMAIL_CLIENT_ID")!,
      client_secret: Deno.env.get("GMAIL_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GMAIL_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error("Gmail token error: " + await r.text());
  const j = await r.json();
  return j.access_token as string;
}

function b64url(str: string) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function escapeHtml(s: any) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function sendGmail(accessToken: string, from: string, to: string, subject: string, html: string) {
  // Sujeto codificado UTF-8 (RFC 2047)
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const message =
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${encodedSubject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
    html;
  const raw = b64url(message);
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!r.ok) throw new Error(`Gmail send ${r.status}: ${await r.text()}`);
  return r.json();
}

/** Obtiene TODOS los emails de auth.users paginando. */
async function listAllAuthEmails(supabase: any): Promise<Map<string, string>> {
  const map = new Map<string, string>(); // user_id → email
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email) map.set(u.id, u.email as string);
    }
    if (users.length < perPage) break;
    page += 1;
  }
  return map;
}

async function getRecipients(supabase: any, audience: string): Promise<string[]> {
  // Audiencia admin: solo admins/operators
  if (audience === "admin") {
    try {
      const { data: admins, error } = await supabase.rpc("get_admin_users");
      if (!error && admins) {
        return Array.from(new Set((admins as any[]).map((a) => a.email).filter(Boolean)));
      }
    } catch { /* fallback abajo */ }
    // Fallback: cruza user_roles + auth.users
    const { data: roleRows } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "operator"]);
    const allowed = new Set<string>((roleRows ?? []).map((r: any) => r.user_id));
    const emails = await listAllAuthEmails(supabase);
    const out: string[] = [];
    for (const [uid, mail] of emails) if (allowed.has(uid)) out.push(mail);
    return Array.from(new Set(out));
  }

  // Trae TODOS los emails desde auth.users (fuente de verdad: incluye user_roles=user)
  const allEmails = await listAllAuthEmails(supabase);

  // public/student → TODOS los usuarios registrados
  if (audience === "public" || audience === "student" || !audience) {
    return Array.from(new Set(Array.from(allEmails.values())));
  }

  // teacher / staff → filtrar por user_type vía profiles
  const userTypes = audience === "teacher" ? ["docente", "administrativo"] : ["administrativo"];
  const { data: profs, error } = await supabase
    .from("profiles").select("id, user_type").in("user_type", userTypes);
  if (error) throw error;
  const allowedIds = new Set<string>((profs ?? []).map((p: any) => p.id));
  const out: string[] = [];
  for (const [uid, mail] of allEmails) if (allowedIds.has(uid)) out.push(mail);
  return Array.from(new Set(out));
}

function renderEmail(opts: {
  kind: string;
  name: string;
  prev_status?: string;
  next_status?: string;
  reason?: string;
  url?: string;
}): { subject: string; html: string } {
  const { kind, name, prev_status, next_status, reason, url } = opts;
  const hasName = !!(name && String(name).trim());

  const titulo = hasName
    ? `Actualización: ${kind} "${name}"`
    : `Actualización en ${kind}`;
  const subject = hasName
    ? `🐯 Mapa UNEMI · COMUNICADO · ${kind}: ${name}`
    : `🐯 Mapa UNEMI · COMUNICADO · ${kind}`;

  // Construye el cuerpo del comunicado
  const bodyParts: string[] = [];
  bodyParts.push(
    hasName
      ? `Se informa a la comunidad universitaria que se ha registrado una novedad en <b>${escapeHtml(name)}</b> (${escapeHtml(kind)}).`
      : `Se informa a la comunidad universitaria que se ha registrado una novedad en una <b>${escapeHtml(kind)}</b> del campus.`,
  );
  if (prev_status && next_status) {
    bodyParts.push(`Estado actualizado: <b>${escapeHtml(prev_status)}</b> → <b>${escapeHtml(next_status)}</b>.`);
  }
  if (reason) {
    bodyParts.push(`<b>Motivo:</b> ${escapeHtml(reason)}`);
  }
  bodyParts.push(`Esta medida responde a la necesidad de mantener informada a la comunidad y garantizar la seguridad de todos los usuarios del campus.`);
  bodyParts.push(`Agradecemos su comprensión y colaboración.`);

  const ctaBlock = url
    ? `<tr><td align="center" style="padding:8px 32px 24px">
         <a href="${escapeHtml(url)}" style="display:inline-block;background:#FF7A1A;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;font-size:14px">📍 Ver ubicación en el mapa</a>
       </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#0F172A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 14px rgba(0,0,0,0.08);max-width:600px;width:100%">
        <!-- Cabecera azul institucional -->
        <tr><td style="background:#003B7A;padding:28px 24px;text-align:center">
          <img src="${LOGO_URL}" alt="UNEMI" width="220" style="display:block;margin:0 auto 10px;max-width:220px;height:auto"/>
          <p style="color:#ffffff;font-size:13px;margin:8px 0 0;font-weight:600;letter-spacing:.5px">UNIVERSIDAD ESTATAL DE MILAGRO</p>
        </td></tr>

        <!-- Banda naranja con título -->
        <tr><td style="background:#FF7A1A;padding:14px 24px;text-align:center">
          <h1 style="color:#ffffff;font-size:22px;margin:0;letter-spacing:3px;font-weight:800">COMUNICADO</h1>
        </td></tr>

        <!-- Subtítulo / contexto -->
        <tr><td style="padding:24px 32px 8px;text-align:center">
          <h2 style="color:#003B7A;font-size:18px;margin:0;font-weight:700">${escapeHtml(titulo)}</h2>
          <p style="color:#94A3B8;font-size:12px;margin:6px 0 0">Mapa Institucional UNEMI · ${new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" })}</p>
        </td></tr>

        <!-- Cuerpo -->
        <tr><td style="padding:8px 32px 16px;color:#0F172A;font-size:15px;line-height:1.7;text-align:justify">
          ${bodyParts.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join("")}
        </td></tr>

        ${ctaBlock}

        <!-- Pie institucional -->
        <tr><td style="background:#F8FAFC;padding:20px 24px;border-top:1px solid #E2E8F0;text-align:center">
          <p style="color:#64748B;font-size:12px;margin:0 0 6px;line-height:1.5">
            Por favor, no responda a este correo electrónico, es un envío automático del<br/>
            <b>Sistema Mapa UNEMI</b>
          </p>
          <p style="color:#94A3B8;font-size:11px;margin:10px 0 0;line-height:1.5">
            Cdla. Universitaria "Dr. Rómulo Minchala Murillo" - km. 1.5 vía Milagro Virgen de Fátima<br/>
            Milagro, Guayas, Ecuador
          </p>
          <p style="color:#CBD5E1;font-size:11px;margin:10px 0 0">
            © ${new Date().getFullYear()} Universidad Estatal de Milagro · Todos los derechos reservados
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { kind, name, prev_status, next_status, reason, audience, url } = await req.json();
    if (!kind) throw new Error("kind es requerido");
    const aud = (audience as string) || "public";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const recipients = await getRecipients(supabase, aud);
    console.log(`[send-status-change-email] audience=${aud} → ${recipients.length} destinatarios`);

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent_count: 0, sent: [], note: "no recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subject, html } = renderEmail({ kind, name, prev_status, next_status, reason, url });
    const accessToken = await getGmailAccessToken();
    const from = Deno.env.get("GMAIL_FROM") ?? "Mapa UNEMI <noreply@unemi.edu.ec>";

    const sent: string[] = [];
    const failed: { email: string; error: string }[] = [];
    for (const email of recipients) {
      try {
        await sendGmail(accessToken, from, email, subject, html);
        sent.push(email);
        // best-effort log (si la tabla existe)
        try {
          await supabase.from("email_logs").insert({
            recipient_email: email, subject, template: "status_change_communicado", status: "sent",
          });
        } catch { /* ignore */ }
      } catch (err) {
        const msg = (err as Error).message;
        failed.push({ email, error: msg });
        try {
          await supabase.from("email_logs").insert({
            recipient_email: email, subject, template: "status_change_communicado",
            status: "failed", error_message: msg,
          });
        } catch { /* ignore */ }
      }
    }

    console.log(`[send-status-change-email] sent=${sent.length} failed=${failed.length}`);
    return new Response(JSON.stringify({ sent_count: sent.length, sent, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-status-change-email] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
