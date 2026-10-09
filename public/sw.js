importScripts("/sw-push.js");

// motorsportsinfo.app service worker — offline copy of visited pages.
// - Navigations: network first, falling back to the last cached copy of that page (then the home page).
// - Same-origin static assets: stale-while-revalidate.
// - Never cached: /api/*, FIA Documents (the /documents/* PDFs and the /<series>/documents/* viewer
//   pages), RSC/data requests, non-GET requests and anything cross-origin (map tiles, radar frames,
//   weather APIs).
// Push handlers live in /sw-push.js (owned by the alerts work).

const VERSION = "v1";
const PAGE_CACHE = `msi-pages-${VERSION}`;
const ASSET_CACHE = `msi-assets-${VERSION}`;
const KEEP = [PAGE_CACHE, ASSET_CACHE];
const MAX_PAGES = 30;
const MAX_ASSETS = 200;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.add(new Request("/", { cache: "reload" })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("msi-") && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_URLS" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    Promise.all(
      data.urls.slice(0, 100).map((raw) => {
        let url;
        try {
          url = new URL(raw, self.location.origin);
        } catch {
          return undefined;
        }
        if (url.origin !== self.location.origin || isNeverCached(url)) return undefined;
        const isPage = !isStaticAsset(url);
        return caches.open(isPage ? PAGE_CACHE : ASSET_CACHE).then(async (cache) => {
          const key = isPage ? pageKey(url) : url.href;
          if (await cache.match(key)) return;
          const res = await fetch(url.href, { credentials: "same-origin" }).catch(() => undefined);
          if (res && res.ok && res.type === "basic") await cache.put(key, res);
        });
      }),
    ).catch(() => undefined),
  );
});

function isNeverCached(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/documents/") ||
    /^\/[^/]+\/documents\//.test(url.pathname) ||
    url.searchParams.has("_rsc") ||
    url.pathname === "/sw.js" ||
    url.pathname === "/sw-push.js"
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:js|css|woff2?|png|jpe?g|svg|webp|avif|ico)$/.test(url.pathname) ||
    url.pathname === "/manifest.webmanifest"
  );
}

/** Pages are cached by path only, so query strings do not create duplicates. */
function pageKey(url) {
  return new URL(url.pathname, self.location.origin).href;
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // tiles, radar, weather: straight to network
  if (isNeverCached(url)) return;
  if (request.headers.get("RSC") || request.headers.get("Next-Router-Prefetch")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(event, url));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

async function networkFirstPage(event, url) {
  const cache = await caches.open(PAGE_CACHE);
  const key = pageKey(url);
  try {
    const res = await fetch(event.request);
    if (res.ok && res.type === "basic") {
      const copy = res.clone();
      event.waitUntil(cache.put(key, copy).then(() => trim(PAGE_CACHE, MAX_PAGES)));
    }
    return res;
  } catch {
    const cached = (await cache.match(key)) || (await cache.match(new URL("/", self.location.origin).href));
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · motorsportsinfo.app</title><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:32rem;margin:auto;line-height:1.5"><h1>You are offline</h1><p>This page has not been saved for offline use yet. Open it once while online and it will be available next time.</p></body>',
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok && res.type === "basic") {
        return cache.put(request, res.clone()).then(() => trim(ASSET_CACHE, MAX_ASSETS)).then(() => res);
      }
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const res = await network;
  return res || Response.error();
}
