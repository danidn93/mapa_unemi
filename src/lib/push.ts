// Helper de Web Push: solicita permiso nativo y, si hay VAPID, suscribe el navegador.
import { supabase } from "@/integrations/supabase/client";

// Identifica esta aplicación dentro de push_subscriptions (varias apps comparten la DB).
export const APP_NAME = "mapa_unemi";

const urlB64ToUint8 = (b: string) => {
  const padding = "=".repeat((4 - (b.length % 4)) % 4);
  const base64 = (b + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

let cachedVapid: string | null = null;
async function getVapidPublicKey(): Promise<string | null> {
  if (cachedVapid) return cachedVapid;
  // 1) Permite override en build via VITE_VAPID_PUBLIC_KEY (opcional)
  const fromEnv = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (fromEnv) { cachedVapid = fromEnv; return fromEnv; }
  // 2) Edge function pública que devuelve la clave configurada en el backend
  try {
    const { data, error } = await supabase.functions.invoke("get-vapid-public-key", { body: {} });
    if (error) throw error;
    const key = (data as any)?.vapidPublicKey as string | undefined;
    if (key) { cachedVapid = key; return key; }
  } catch (e) {
    console.warn("[push] no pude obtener VAPID public key:", e);
  }
  return null;
}

/**
 * Solicita permiso nativo de notificaciones e intenta suscribir al usuario a Web Push.
 * Pensado para llamarse justo después del login. No muestra UI propia: usa el prompt nativo del navegador.
 */
export async function requestPushOnLogin(): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    // Asegura SW registrado (Index.tsx lo hace, pero por si se llama antes)
    try {
      const existing = await navigator.serviceWorker.getRegistration();
      if (!existing) await navigator.serviceWorker.register("/sw.js");
    } catch { /* no-op */ }

    // Pide permiso nativo si aún no está decidido
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return;

    const vapid = await getVapidPublicKey();
    if (!vapid) {
      console.warn("[push] VAPID public key no disponible; no se puede suscribir");
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(vapid),
      });
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const json: any = sub.toJSON();
    const { error: upErr } = await (supabase as any).from("push_subscriptions").upsert({
      user_id: data.user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
      app_name: APP_NAME,
    }, { onConflict: "endpoint" });
    if (upErr) console.warn("[push] upsert subscription error:", upErr);
    else console.info("[push] suscripción registrada para", data.user.id);
  } catch (e) {
    console.warn("[push] requestPushOnLogin failed:", e);
  }
}

// Backward compat
export async function subscribeToPush(_vapidPublicKey?: string) {
  return requestPushOnLogin();
}
