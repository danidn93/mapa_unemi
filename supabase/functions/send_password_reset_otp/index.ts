// Edge Function: send_password_reset_otp
// Genera OTP de 6 dígitos para password_reset y lo envía por Gmail OAuth2.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { renderOtpEmail, buildRawEmail } from "../_shared/email_template.ts";

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
  const j = await r.json();
  if (!j.access_token) throw new Error("Gmail token error");
  return j.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "email requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find((u: any) => u.email === email);
    // Respuesta uniforme para no filtrar existencia de cuenta
    if (!user) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase.from("verification_codes")
      .update({ used: true })
      .eq("user_id", user.id).eq("type", "password_reset").eq("used", false);
    await supabase.from("verification_codes").insert({
      user_id: user.id, code, type: "password_reset", expires_at: expiresAt,
    });

    const accessToken = await getGmailAccessToken();
    const from = Deno.env.get("GMAIL_FROM") ?? "noreply@unemi.edu.ec";
    const subject = "Recuperación de Contraseña - Mapa UNEMI";
    const meta = (user.user_metadata ?? {}) as any;
    const html = renderOtpEmail({
      name: meta.first_name,
      code,
      title: "Recupera tu contraseña",
      intro: "Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente código para continuar.",
    });
    const raw = buildRawEmail(from, email, subject, html);
    const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!resp.ok) throw new Error(`Gmail send: ${await resp.text()}`);

    await supabase.from("email_logs").insert({
      recipient_email: email, subject, template: "password_reset", status: "sent",
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
