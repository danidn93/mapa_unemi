// Edge Function: signup_user
// Crea usuario en auth.users (sin confirmar email), inserta profile (status='pending')
// y envía OTP de 6 dígitos por Gmail OAuth2.
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
  if (!j.access_token) throw new Error("Gmail token error: " + JSON.stringify(j));
  return j.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const {
      email, password, first_name, last_name,
      doc_type, cedula, user_type,
      phone, faculty, career, semester,
    } = body;

    if (!email || !password || !first_name || !last_name || !cedula || !doc_type || !user_type) {
      return new Response(JSON.stringify({ error: "Faltan campos obligatorios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Crear usuario (email confirmado para que pueda hacer login con OTP propio)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email, password,
      email_confirm: true,
      user_metadata: { first_name, last_name, cedula, doc_type, user_type, phone, faculty, career, semester },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message || "No se pudo crear el usuario" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = created.user.id;

    await supabase.from("profiles").upsert({
      id: userId,
      first_name, last_name, cedula, email,
      doc_type, user_type,
      phone: phone || null,
      faculty: faculty || null,
      career: career || null,
      semester: semester || null,
      status: "pending",
    }, { onConflict: "id" });

    // Generar OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from("verification_codes")
      .update({ used: true })
      .eq("user_id", userId).eq("type", "email_verification").eq("used", false);
    await supabase.from("verification_codes").insert({
      user_id: userId, code, type: "email_verification", expires_at: expiresAt,
    });

    // Enviar correo
    try {
      const accessToken = await getGmailAccessToken();
      const from = Deno.env.get("GMAIL_FROM") ?? "noreply@unemi.edu.ec";
      const subject = "Código de Verificación - Mapa UNEMI";
      const html = renderOtpEmail({
        name: first_name,
        code,
        title: "Verifica tu cuenta",
        intro: `Bienvenido al Sistema Mapa UNEMI. Usa el siguiente código para activar tu cuenta. Tu contraseña inicial es tu número de ${doc_type === "cedula" ? "cédula" : "pasaporte"}.`,
      });
      const raw = buildRawEmail(from, email, subject, html);
      const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      await supabase.from("email_logs").insert({
        recipient_email: email, subject, template: "email_verification", status: "sent",
      });
    } catch (mailErr: any) {
      await supabase.from("email_logs").insert({
        recipient_email: email,
        subject: "Código de Verificación - Mapa UNEMI",
        template: "email_verification",
        status: "failed",
        error_message: mailErr.message,
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
