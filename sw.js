const CACHE_VERSION = "diffraction-grating-v2026-06-13-parameter-label-scale-v1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./student-lab.html",
  "./src/styles.css?v=parameter-label-scale-v1-20260613",
  "./src/student-lab.css?v=layout-font-polish-20260613",
  "./src/physics.js",
  "./src/app.js?v=parameter-label-scale-v1-20260613",
  "./src/student-lab.js?v=student-excel-record-table-20260606",
  "./src/scene3d.js",
  "./src/pwa.js?v=student-excel-record-table-20260606",
  "./vendor/three.module.js",
  "./assets/gs-entry-qr-card.png?v=sampling-restore-20260603",
  "./assets/icons/site-icon.svg",
  "./assets/theory/slides/theory-slide-01.webp",
  "./assets/theory/slides/theory-slide-02.webp",
  "./assets/theory/slides/theory-slide-03.webp",
  "./assets/theory/slides/theory-slide-04.webp",
  "./assets/theory/slides/theory-slide-05.webp",
  "./assets/theory/slides/theory-slide-06.webp",
  "./assets/theory/slides/theory-slide-07.webp",
  "./assets/theory/simulations/single_slit_envelope_multislit_cn.png",
  "./assets/theory/simulations/central_maximum_width_cn.png",
  "./assets/theory/matlab/generate_theory_matlab_plots.m",
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


