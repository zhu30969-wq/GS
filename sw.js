const CACHE_VERSION = "diffraction-grating-v2026-10-23-front-readable";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./student-lab.html",
  "./src/styles.css?v=voice-agent-desktop-v1-20260831",
  "./src/operation-layout.css?v=front-readable-20261023",
  "./src/theory-layout.css?v=theory-screen-20261019",
  "./src/theory-presentation.js?v=theory-screen-20261019",
  "./src/student-lab.css?v=student-physics-italic-v24-20260718",
  "./src/physics.js",
  "./src/app.js?v=front-readable-20261023",
  "./src/theory-competition.js?v=theory-screen-20261019",
  "./src/student-lab.js?v=student-physics-italic-v24-20260718",
  "./src/scene3d.js?v=physics-italic-v20-20260718",
  "./src/scene3d.js?v=front-readable-20261023",
  "./src/optics-hardware.js?v=video-apparatus-20261023",
  "./src/optics-studio-controls.js?v=front-readable-20261023",
  "./src/scene-sensor.js",
  "./src/pwa.js?v=sampling-restore-20260603",
  "./vendor/three.module.js",
  "./assets/icons/site-icon.svg",
];

self.addEventListener("install", (event) => {
  // 预缓存核心资源，公网 CDN 短时波动时仍能打开已经访问过的页面。
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // 删除旧版本缓存，防止多次迭代后浏览器继续使用过时 JS/CSS。
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(cacheFirstWithRefresh(request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cache = await caches.open(CACHE_VERSION);
    const url = new URL(request.url);
    const fallback = url.pathname.endsWith("/student-lab.html") ? "./student-lab.html" : "./index.html";
    return (await cache.match(request)) || (await cache.match(fallback));
  }
}

async function cacheFirstWithRefresh(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const refresh = fetch(request)
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || refresh || fetch(request);
}


