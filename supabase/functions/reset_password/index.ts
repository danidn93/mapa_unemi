// Edge Function: reset_password
// Verifica OTP password_reset y actualiza la contraseña vía admin.updateUserById.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email, code, new_password } = await req.json();
    if (!email || !code || !new_password) {
      return new Response(JSON.stringify({ error: "email, code y new_password requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (String(new_password).length < 6) {
      return new Response(JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find((u: any) => u.email === email);
    if (!user) {
      return new Response(JSON.stringify({ error: "Código inválido o expirado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rows } = await supabase
      .from("verification_codes")
      .select("*")
      .eq("user_id", user.id)
      .eq("type", "password_reset")
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1);

    const row = rows?.[0];
    if (!row || row.code !== code || new Date(row.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Código inválido o expirado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: upErr } = await supabase.auth.admin.updateUserById(user.id, { password: new_password });
    if (upErr) throw upErr;

    await supabase.from("verification_codes").update({ used: true }).eq("id", row.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
