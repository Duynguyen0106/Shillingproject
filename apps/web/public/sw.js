const CACHE = "shillops-v1";
const STATIC = ["/", "/app/feed", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Network-first for API calls
  if (e.request.url.includes("/api/") || e.request.url.includes(":4000")) {
    e.respondWith(fetch(e.request).catch(() => new Response("{}", { headers: { "content-type": "application/json" } })));
    return;
  }
  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});

self.addEventListener("push", (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title || "ShillOps", {
      body: data.body || "New raid alert",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/app/feed" }
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || "/app/feed"));
});
