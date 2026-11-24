/* Orion Projects service worker
 *
 * - Offline app shell: logo, icons, the /offline page and the photo-compression worker.
 * - Pages: always fetched fresh when online; the last copy of each page you opened is
 *   kept so it still opens with no signal. Unknown pages fall back to /offline.
 * - App code (/_next/static, fingerprinted): cache-first.
 * - Photo thumbnails & avatars from Supabase Storage: kept for offline viewing.
 * - Saved pages/photos are wiped on sign-out (the app sends CLEAR_USER_DATA) and
 *   whenever a page turns out to need signing in.
 * - Push notifications; chat messages are grouped per chat, like a messaging app.
 * Daily updates written offline are queued by the app itself (IndexedDB), not here.
 */
const VERSION = "v1";
const SHELL = `orion-shell-${VERSION}`;
const STATIC = `orion-static-${VERSION}`;
const PAGES = `orion-pages-${VERSION}`;
const IMAGES = `orion-images-${VERSION}`;
const KEEP = [SHELL, STATIC, PAGES, IMAGES];
const SHELL_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/badge-96.png",
  "/brand/orion-logo.png",
  "/brand/orion-logo-white.png",
  "/brand/orion-mark-transparent.png",
  "/vendor/browser-image-compression-2.0.2.js",
];
const MAX_PAGES = 40;
const MAX_IMAGES = 80;
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all(SHELL_URLS.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("orion-") && !KEEP.includes(key)) await caches.delete(key);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function clearUserData() {
  await Promise.all([caches.delete(PAGES), caches.delete(IMAGES)]);
}

const pageKey = (url) => new Request(new URL(url).origin + new URL(url).pathname);

async function handleNavigation(event) {
  const req = event.request;
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const network = preload || (await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)),
    ]));
    const finalPath = new URL(network.url || req.url).pathname;
    if (finalPath === "/login" || finalPath === "/pending") {
      // Signed out (or not approved): forget saved private pages on this device.
      event.waitUntil(clearUserData());
    } else if (network.ok && (network.headers.get("content-type") || "").includes("text/html")) {
      const copy = network.clone();
      event.waitUntil(
        caches.open(PAGES).then((c) => c.put(pageKey(req.url), copy)).then(() => trim(PAGES, MAX_PAGES)),
      );
    }
    return network;
  } catch {
    const cached = (await caches.match(pageKey(req.url), { cacheName: PAGES })) || (await caches.match("/offline", { cacheName: SHELL }));
    return cached || new Response("You're offline.", { status: 503, headers: { "content-type": "text/plain" } });
  }
}

async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req, { cacheName });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

/** Signed photo URLs change every time; store them by path so the saved copy is found again. */
async function imageStaleWhileRevalidate(event) {
  const req = event.request;
  const url = new URL(req.url);
  const key = new Request(url.origin + url.pathname);
  const cache = await caches.open(IMAGES);
  const cached = await cache.match(key);
  const network = fetch(req)
    .then((res) => {
      if (res.ok || res.type === "opaque") event.waitUntil(cache.put(key, res.clone()).then(() => trim(IMAGES, MAX_IMAGES)));
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return; // always live
    if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return; // app navigation data: live (falls back to a full page load offline)
    if (req.mode === "navigate") return event.respondWith(handleNavigation(event));
    if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(req, STATIC));
    if (/^\/(icons|brand|splash|vendor)\//.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
      return event.respondWith(cacheFirst(req, SHELL));
    }
    return;
  }

  // Supabase Storage: photo thumbnails, chat previews and avatars.
  if (url.hostname.endsWith(".supabase.co") || url.port === "54321") {
    const p = url.pathname;
    if (p.includes("/storage/v1/object/sign/") && (p.includes("_thumb.") || p.includes("/avatars/"))) {
      return event.respondWith(imageStaleWhileRevalidate(event));
    }
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CLEAR_USER_DATA") event.waitUntil(clearUserData());
  if (data.type === "WARM" && Array.isArray(data.urls)) {
    // Save key pages right after sign-in so they open offline even if not visited yet.
    event.waitUntil(
      (async () => {
        const cache = await caches.open(PAGES);
        for (const u of data.urls.slice(0, 6)) {
          try {
            const res = await fetch(u, { credentials: "include", headers: { accept: "text/html" } });
            if (res.ok && !res.redirected && (res.headers.get("content-type") || "").includes("text/html")) await cache.put(pageKey(res.url), res);
          } catch {
            /* offline — skip */
          }
        }
      })(),
    );
  }
});

// ---------------------------------------------------------------- push
// Safari (iPhone/iPad/Mac) cancels push for sites that receive a push without showing a notification.
const STRICT_BROWSER = /AppleWebKit/.test(self.navigator.userAgent) && !/Chrome|Chromium|Android|Edg/.test(self.navigator.userAgent);

/** Number on the app icon: chat messages + other notifications still on the phone. */
async function updateIconBadge() {
  if (!self.navigator.setAppBadge) return;
  const shown = await self.registration.getNotifications();
  const n = shown.reduce((sum, x) => sum + ((x.data && x.data.count) || 1), 0);
  await (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(() => {});
}

/** Chat messages: one notification per chat, listing the latest messages (like WhatsApp). */
async function showChatMessage(data) {
  const url = new URL(data.url || "/chats", self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const viewing = windows.some((w) => w.focused && w.visibilityState === "visible" && w.url.split(/[?#]/)[0] === url);
  if (viewing && !STRICT_BROWSER) return; // already reading this chat: no buzz

  const tag = data.tag || url;
  const existing = (await self.registration.getNotifications({ tag }))[0];
  const before = (existing && existing.data) || {};
  const line = data.sender ? `${data.sender}: ${data.body}` : data.body;
  const lines = [...(before.lines || []), line].slice(-6);
  const count = (before.count || 0) + 1;
  await self.registration.showNotification(count > 1 ? `${data.title} (${count} messages)` : data.title, {
    body: lines.join("\n"),
    tag,
    renotify: true, // buzz again for every new message, even though it replaces the previous one
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    timestamp: Date.now(),
    data: { url: data.url || "/chats", kind: "chat", lines, count },
  });
  await updateIconBadge();
}

let pushQueue = Promise.resolve();
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Orion Projects", body: event.data ? event.data.text() : "" };
  }
  const show = () =>
    data.kind === "chat"
      ? showChatMessage(data)
      : self.registration
          .showNotification(data.title || "Orion Projects", {
            body: data.body || "",
            icon: "/icons/icon-192.png",
            badge: "/icons/badge-96.png",
            tag: data.tag,
            data: { url: data.url || "/notifications" },
            // Important messages from an administrator: stay on screen until tapped (Android/computers), buzz.
            ...(data.important ? { requireInteraction: true, renotify: true, vibrate: [300, 150, 300, 150, 300] } : {}),
          })
          .then(updateIconBadge);
  // One at a time, in order: messages arriving together must not overwrite each other.
  pushQueue = pushQueue.then(show, show).catch(() => {});
  event.waitUntil(pushQueue);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin)) {
          await w.focus();
          return w.navigate(url);
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
