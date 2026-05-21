// Edge Function: signup_user
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildRawEmail, renderOtpEmail } from "../_shared/email_template.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DocType = "cedula" | "pasaporte";
type UserType = "estudiante" | "docente" | "administrativo" | "trabajador";

type SignupBody = {
  email: string; // Recibe el email completo desde el cliente
  username?: string;
  password: string;
  first_name: string; // Recibe texto plano desde el cliente
  last_name: string;  // Recibe texto plano desde el cliente
  doc_type: DocType;
  cedula: string;     // Recibe texto plano desde el cliente
  user_type: UserType;
  faculty?: string;
  career?: string;
  semester?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getUsernameFromEmail(email: string, username?: string) {
  const fromBody = cleanText(username).toLowerCase();
  if (fromBody) return fromBody.replace("@unemi.edu.ec", "").trim();
  return email.replace("@unemi.edu.ec", "").trim();
}

function validateBody(body: SignupBody) {
  const email = cleanEmail(body.email);
  const firstName = cleanText(body.first_name);
  const lastName = cleanText(body.last_name);
  const password = cleanText(body.password);
  const cedula = cleanText(body.cedula);

  if (!email || !firstName || !lastName || !password || !cedula) {
    return "Completa los campos obligatorios";
  }

  if (!email.endsWith("@unemi.edu.ec")) {
    return "Debes usar un correo institucional UNEMI";
  }

  if (!["cedula", "pasaporte"].includes(body.doc_type)) {
    return "Tipo de documento inválido";
  }

  if (!["estudiante", "docente", "administrativo", "trabajador"].includes(body.user_type)) {
    return "Tipo de usuario inválido";
  }

  if (body.doc_type === "cedula" && !/^\d{10}$/.test(cedula)) {
    return "La cédula debe tener 10 dígitos";
  }

  if (body.doc_type === "pasaporte" && (cedula.length < 6 || cedula.length > 15)) {
    return "Pasaporte inválido. Debe tener entre 6 y 15 caracteres";
  }

  return null;
}

// Métodos de Encriptación del Servidor (Web Crypto API)
async function getEncryptionKey(PROFILE_ENCRYPTION_KEY: string) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(PROFILE_ENCRYPTION_KEY));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptText(value: string, PROFILE_ENCRYPTION_KEY: string) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey(PROFILE_ENCRYPTION_KEY);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(value)
  );

  const payload = new Uint8Array(iv.length + encrypted.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(encrypted), iv.length);

  let binary = "";
  for (const byte of payload) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function getAccessToken(params: {
  GMAIL_CLIENT_ID: string;
  GMAIL_CLIENT_SECRET: string;
  GMAIL_REFRESH_TOKEN: string;
}) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: params.GMAIL_CLIENT_ID,
      client_secret: params.GMAIL_CLIENT_SECRET,
      refresh_token: params.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    console.error("Gmail token error:", data);
    throw new Error("No se pudo obtener el token de Gmail");
  }
  return data.access_token as string;
}

async function sendVerificationEmail(params: {
  email: string;
  code: string;
  doc_type: DocType;
  first_name: string;
  GMAIL_CLIENT_ID: string;
  GMAIL_CLIENT_SECRET: string;
  GMAIL_REFRESH_TOKEN: string;
  GMAIL_SENDER_EMAIL: string;
}) {
  const accessToken = await getAccessToken({
    GMAIL_CLIENT_ID: params.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: params.GMAIL_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN: params.GMAIL_REFRESH_TOKEN,
  });

  // Conserva el formato original de renderOtpEmail sin modificar la plantilla interna
  const html = renderOtpEmail({
    name: params.first_name,
    code: params.code,
    title: "Verifica tu cuenta",
    intro: `Bienvenido al Sistema Mapa UNEMI. Usa el siguiente código para activar tu cuenta. Tu contraseña inicial es tu número de ${params.doc_type === "cedula" ? "cédula" : "pasaporte"}.`,
  });

  const raw = buildRawEmail(params.GMAIL_SENDER_EMAIL, params.email, "Código de Verificación - Mapa UNEMI", html);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Gmail send error:", text);
    throw new Error("No se pudo enviar el código de verificación");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  let createdUserId: string | null = null;

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Método no permitido" }, 405);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID");
    const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET");
    const GMAIL_REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN");
    const GMAIL_SENDER_EMAIL = Deno.env.get("GMAIL_SENDER_EMAIL") ?? Deno.env.get("GMAIL_FROM");
    const PROFILE_ENCRYPTION_KEY = Deno.env.get("PROFILE_ENCRYPTION_KEY");

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !GMAIL_CLIENT_ID ||
      !GMAIL_CLIENT_SECRET ||
      !GMAIL_REFRESH_TOKEN ||
      !GMAIL_SENDER_EMAIL ||
      !PROFILE_ENCRYPTION_KEY
    ) {
      return json({ ok: false, error: "Faltan variables de entorno en la Edge Function" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: SignupBody;
    try {
      body = (await req.json()) as SignupBody;
    } catch {
      return json({ ok: false, error: "Body JSON inválido" }, 400);
    }

    const validationError = validateBody(body);
    if (validationError) {
      return json({ ok: false, error: validationError }, 400);
    }

    const fullEmail = cleanEmail(body.email);
    const username = getUsernameFromEmail(fullEmail, body.username);

    if (!username) {
      return json({ ok: false, error: "Correo institucional inválido" }, 400);
    }

    const documentValue =
      body.doc_type === "cedula"
        ? cleanText(body.cedula).replace(/\D/g, "")
        : cleanText(body.cedula).toUpperCase();

    const firstName = cleanText(body.first_name);
    const lastName = cleanText(body.last_name);
    const password = cleanText(body.password);

    // Verificar existencia previa usando solo el username sin el dominio
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", username)
      .maybeSingle();

    if (existingProfileError) {
      console.error("existingProfileError:", existingProfileError);
      return json({ ok: false, error: "No se pudo validar si el perfil ya existe" }, 500);
    }

    if (existingProfile) {
      return json({ ok: false, error: "Ya existe una cuenta con este correo institucional" }, 409);
    }

    // Crear cuenta en auth.users enviando el email completo para el flujo nativo de GoTrue
    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email: fullEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        user_type: body.user_type,
      },
    });

    if (createUserError || !createdUser.user) {
      console.error("createUserError:", createUserError);
      return json({ ok: false, error: createUserError?.message || "No se pudo crear el usuario" }, 400);
    }

    createdUserId = createdUser.user.id;

    // Encriptar strings de datos confidenciales antes del upsert
    const encryptedFirstName = await encryptText(firstName, PROFILE_ENCRYPTION_KEY);
    const encryptedLastName = await encryptText(lastName, PROFILE_ENCRYPTION_KEY);
    const encryptedCedula = await encryptText(documentValue, PROFILE_ENCRYPTION_KEY);

    const nowIso = new Date().toISOString();

    // Guardar Perfil: Campo email almacena únicamente el username (sin dominio) y sin datos telefónicos
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: createdUserId,
        email: username, 
        first_name: encryptedFirstName,
        last_name: encryptedLastName,
        doc_type: body.doc_type,
        cedula: encryptedCedula,
        user_type: body.user_type,
        faculty: body.user_type === "estudiante" ? body.faculty ?? null : null,
        career: body.user_type === "estudiante" ? body.career ?? null : null,
        semester: body.user_type === "estudiante" ? body.semester ?? null : null,
        status: "pending",
        encrypted_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      console.error("profileError:", profileError);
      await supabase.auth.admin.deleteUser(createdUserId);
      return json({ ok: false, error: "No se pudo guardar el perfil" }, 500);
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: invalidateOtpError } = await supabase
      .from("verification_codes")
      .update({ used: true })
      .eq("user_id", createdUserId)
      .eq("type", "email_verification")
      .eq("used", false);

    if (invalidateOtpError) {
      console.error("invalidateOtpError:", invalidateOtpError);
      await supabase.auth.admin.deleteUser(createdUserId);
      return json({ ok: false, error: "No se pudo invalidar códigos anteriores" }, 500);
    }

    const { error: otpError } = await supabase.from("verification_codes").insert({
      user_id: createdUserId,
      code,
      type: "email_verification",
      used: false,
      expires_at: expiresAt,
    });

    if (otpError) {
      console.error("otpError:", otpError);
      await supabase.auth.admin.deleteUser(createdUserId);
      return json({ ok: false, error: "No se pudo generar el código de verificación" }, 500);
    }

    // Enviar código usando el correo completo del destinatario
    try {
      await sendVerificationEmail({
        email: fullEmail,
        code,
        doc_type: body.doc_type,
        first_name: firstName,
        GMAIL_CLIENT_ID,
        GMAIL_CLIENT_SECRET,
        GMAIL_REFRESH_TOKEN,
        GMAIL_SENDER_EMAIL,
      });

      // Registro de bitácora exitosa
      await supabase.from("email_logs").insert({
        recipient_email: fullEmail,
        subject: "Código de Verificación - Mapa UNEMI",
        template: "email_verification",
        status: "sent",
      });
    } catch (emailError: any) {
      console.error("sendVerificationEmail error:", emailError);
      
      await supabase.from("email_logs").insert({
        recipient_email: fullEmail,
        subject: "Código de Verificación - Mapa UNEMI",
        template: "email_verification",
        status: "failed",
        error_message: emailError.message || "Error al enviar el correo",
      });

      await supabase.auth.admin.deleteUser(createdUserId);
      return json({ ok: false, error: "No se pudo enviar el correo de verificación" }, 500);
    }

    return json({
      ok: true,
      user_id: createdUserId,
      email: fullEmail,
      username,
      message: "Cuenta creada y código enviado correctamente",
    });
  } catch (error) {
    console.error("signup_user error:", error);
    if (createdUserId) {
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          await supabase.auth.admin.deleteUser(createdUserId);
        }
      } catch (cleanupError) {
        console.error("cleanupError:", cleanupError);
      }
    }
    return json({ ok: false, error: "Error interno al registrar usuario" }, 500);
  }
});