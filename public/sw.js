/* OAC service worker: offline fallback, a cached app shell, and "order ready" notifications.
 * Signed-in pages and API calls are never cached: an order's status must come from the network. */

const VERSION = "v2";
const SHELL_CACHE = `oac-shell-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(precacheOffline().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("oac-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Stores the offline page and the stylesheets it links, so the fallback renders styled. */
async function precacheOffline() {
  const cache = await caches.open(SHELL_CACHE);
  const response = await fetch(OFFLINE_URL, { cache: "reload" });
  if (!response.ok) return; // never block install on the fallback: push still has to work
  const html = await response.clone().text();
  await cache.put(OFFLINE_URL, response);

  const sheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
    .map((tag) => /href="([^"]+)"/.exec(tag[0])?.[1])
    .filter(Boolean)
    .map((href) => href.replace(/&amp;/g, "&"));
  await Promise.all(sheets.map((href) => cache.add(href).catch(() => {})));
}

const isStaticAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
    );
    return;
  }

  // Network first, cache as the offline fallback. Cache-first would be safe for hashed production
  // files, but dev chunks can keep a name while their contents change, and stale code is worse than
  // one extra request (the browser's own HTTP cache still answers immutable files instantly).
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch (error) {
          const hit = await cache.match(request);
          if (hit) return hit;
          throw error;
        }
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A malformed payload still deserves a notification.
  }
  const title = data.title || "OAC";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.url || "oac", // a repeat for the same order replaces rather than stacks
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
      vibrate: [120, 60, 120],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) return open.navigate(target);
        return undefined;
      }
      return self.clients.openWindow(target);
    }),
  );
});
