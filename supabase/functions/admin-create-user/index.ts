// Edge Function: admin-create-user
// Crea un usuario en auth.users y le asigna rol (admin | operator) en user_roles.
// Sólo callable por usuarios con rol 'admin' (superadmin) en user_roles.
//
// Body:
//   { email, password, first_name?, last_name?, role: 'admin' | 'operator',
//     user_type?: 'estudiante' | 'docente' | 'administrativo' }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth" }, 401);

    // Cliente con el JWT del caller para validar identidad/rol
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "Unauthorized" }, 401);

    // Verificar rol superadmin (admin en user_roles)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Solo superadmin (rol admin) puede crear usuarios" }, 403);

    const body = await req.json();
    const {
      email, password, first_name, last_name,
      role = "operator", user_type = "administrativo",
    } = body ?? {};

    if (!email || !password) return json({ error: "email y password requeridos" }, 400);
    if (!["admin", "operator", "user"].includes(role))
      return json({ error: "role inválido" }, 400);

    // 1. Crear usuario (auto-confirmado)
    const { data: created, error: cerr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { first_name, last_name },
    });
    if (cerr) return json({ error: cerr.message }, 400);

    const newId = created.user!.id;

    // 2. Asegurar fila en profiles (si no existe)
    await admin.from("profiles").upsert({
      id: newId, email, first_name: first_name ?? null, last_name: last_name ?? null,
      user_type,
    }, { onConflict: "id" });

    // 3. Asignar rol
    await admin.from("user_roles").insert({ user_id: newId, role });

    return json({ ok: true, user_id: newId });
  } catch (e: any) {
    return json({ error: e?.message ?? "error" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
