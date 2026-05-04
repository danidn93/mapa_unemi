// Service worker mínimo: NetworkFirst en navegación, push notifications.
// SOLO se registra fuera de iframes y fuera de previews de Lovable.
const CACHE = "unemi-map-v4";
const SHELL = ["/", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Nunca interferir con APIs, auth ni tiles de mapa (evita cachear 400s).
  if (url.pathname.startsWith("/~oauth") || url.hostname.includes("supabase.co")) return;
  if (url.hostname.endsWith("tile.openstreetmap.org") || url.hostname.includes("arcgisonline.com")) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("/").then((r) => r || new Response("Sin conexión", { status: 503 })))
    );
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
    // No cachear respuestas de error
    if (!res || !res.ok) return res;
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    return res;
  })));
});

self.addEventListener("push", (e) => {
  let data = { title: "Mapa UNEMI", body: "Notificación" };
  try { data = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: data.data || {},
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil((async () => {
    const absolute = new URL(targetUrl, self.location.origin).href;
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Si ya hay una ventana abierta del sitio, navega y enfócala
    for (const c of all) {
      try {
        await c.navigate(absolute);
        return c.focus();
      } catch { /* cross-origin o navigate no soportado: probar siguiente */ }
    }
    return self.clients.openWindow(absolute);
  })());
});
