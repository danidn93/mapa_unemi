// supabase/functions/send-admin-route-email/index.ts
// Envía un correo a TODOS los usuarios administrativos (operator/admin) con info de una ruta.
// Usa Gmail API con OAuth2 (refresh token de una cuenta institucional).
// Variables requeridas:
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendGmail(accessToken: string, from: string, to: string, subject: string, html: string) {
  const raw = b64url(
    `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}`,
  );
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!r.ok) throw new Error(`Gmail send ${r.status}: ${await r.text()}`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { route_id, subject, message } = await req.json();
    if (!route_id) throw new Error("route_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: route } = await supabase.from("map_routes").select("*").eq("id", route_id).maybeSingle();
    if (!route) throw new Error("route not found");
    const { data: admins, error: aerr } = await supabase.rpc("get_admin_users");
    if (aerr) throw aerr;
    const recipients = (admins ?? []).filter((a: any) => a.email);

    const accessToken = await getGmailAccessToken();
    const from = Deno.env.get("GMAIL_FROM") ?? "Mapa UNEMI <noreply@unemi.edu.ec>";
    const subj = subject ?? `Nueva ruta institucional registrada`;
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;color:#0F172A">
        <h2 style="color:#FF7A1A">🐯 Mapa UNEMI</h2>
        <p>${message ?? "Se ha registrado una nueva ruta en el sistema."}</p>
        <ul>
          <li><b>Modo:</b> ${route.access_mode}</li>
          <li><b>Distancia:</b> ${Math.round(route.distance_meters ?? 0)} m</li>
          <li><b>Duración:</b> ${Math.round((route.duration_seconds ?? 0) / 60)} min</li>
          <li><b>Origen:</b> ${route.origin_lat}, ${route.origin_lng}</li>
        </ul>
      </div>`;

    const sent: string[] = [];
    for (const r of recipients) {
      try {
        await sendGmail(accessToken, from, r.email, subj, html);
        await supabase.from("email_logs").insert({
          recipient_email: r.email, subject: subj, template: "admin_route", status: "sent",
        });
        sent.push(r.email);
      } catch (err) {
        await supabase.from("email_logs").insert({
          recipient_email: r.email, subject: subj, template: "admin_route",
          status: "failed", error_message: (err as Error).message,
        });
      }
    }

    return new Response(JSON.stringify({ sent_count: sent.length, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
