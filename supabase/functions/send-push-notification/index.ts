// supabase/functions/send-push-notification/index.ts
// Envía notificaciones Web Push a:
//   - un user_id concreto (user_id)
//   - todos (broadcast: true)
//   - una audiencia (audience: 'public' | 'student' | 'teacher' | 'staff' | 'admin')
// Filtra siempre por app_name (default: 'mapa_unemi').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapea audiencia → conjunto de user_type / roles que deben recibir
function audienceFilters(audience?: string) {
  // user_type values: 'estudiante' | 'docente' | 'administrativo'
  // user_roles.role: 'admin' | 'operator' | 'user'
  switch (audience) {
    case "student":
      // Sala estudiante: estudiantes + docentes + administrativos
      return { userTypes: ["estudiante", "docente", "administrativo"] };
    case "teacher":
      // Sala docente: docentes + administrativos
      return { userTypes: ["docente", "administrativo"] };
    case "staff":
      // Sala administrativo: solo administrativos
      return { userTypes: ["administrativo"] };
    case "admin":
      // Solo admins/operadores del sistema
      return { roles: ["admin", "operator"] };
    case "public":
    default:
      // Público (calles, edificios, landmarks, entradas, parqueos): TODOS
      return { allUsers: true };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@unemi.edu.ec";
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) throw new Error("VAPID keys not configured");
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const { user_id, title, body, data, broadcast, app_name, audience, url } = await req.json();
    if (!title) throw new Error("title required");

    const APP = (app_name as string) || "mapa_unemi";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Construye lista de user_ids destino
    let targetUserIds: string[] | null = null;
    if (user_id && !broadcast && !audience) {
      targetUserIds = [user_id];
    } else if (audience) {
      const f = audienceFilters(audience);
      if (!f.allUsers) {
        const ids = new Set<string>();
        if (f.userTypes && f.userTypes.length) {
          const { data: profs, error: pe } = await supabase
            .from("profiles").select("id").in("user_type", f.userTypes);
          if (pe) throw pe;
          (profs ?? []).forEach((p: any) => ids.add(p.id));
        }
        if (f.roles && f.roles.length) {
          const { data: rs, error: re } = await supabase
            .from("user_roles").select("user_id").in("role", f.roles);
          if (re) throw re;
          (rs ?? []).forEach((r: any) => ids.add(r.user_id));
        }
        targetUserIds = Array.from(ids);
        console.log(`[push] audience=${audience} → ${targetUserIds.length} user_ids`);
        if (targetUserIds.length === 0) {
          return new Response(JSON.stringify({ sent: 0, total: 0, note: "no targets for audience" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        console.log(`[push] audience=${audience} → broadcast a TODOS los suscriptores de app=${APP}`);
      }
    } else if (broadcast) {
      console.log(`[push] broadcast=true → todos los suscriptores de app=${APP}`);
    }

    let query = supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .eq("app_name", APP);
    if (targetUserIds) query = query.in("user_id", targetUserIds);

    const { data: subs, error } = await query;
    if (error) throw error;
    console.log(`[push] suscripciones encontradas: ${subs?.length ?? 0}`);

    const payload = JSON.stringify({
      title,
      body: body ?? "",
      data: { ...(data ?? {}), ...(url ? { url } : {}) },
    });

    const results = await Promise.allSettled(
      (subs ?? []).map((s: any) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        ),
      ),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.length - fulfilled;
    if (rejected > 0) {
      console.warn(`[push] ${rejected} envíos fallaron:`,
        results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .slice(0, 5).map((r) => String(r.reason).slice(0, 200)));
    }
    console.log(`[push] enviados ${fulfilled}/${results.length}`);

    if (!broadcast && !audience && user_id) {
      await supabase.rpc("log_map_notification", {
        _user_id: user_id, _title: title, _body: body ?? "", _data: data ?? {}, _channel: "push",
      });
    }

    return new Response(
      JSON.stringify({
        sent: results.filter((r) => r.status === "fulfilled").length,
        total: results.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
