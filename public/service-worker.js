const CACHE_VERSION = "v2";
const CACHE_NAME = `picking-kaisan-${CACHE_VERSION}`;

const URLS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/img/logo.png",
  "/css/style.css",
  "/js/main.js",
  // adicione outros arquivos estáticos conforme necessário
];

// 🔧 Instala e faz cache inicial
self.addEventListener("install", (event) => {
  console.log("🛠️ [SW] Instalando...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("📦 [SW] Cacheado:", CACHE_NAME);
      return cache.addAll(URLS_TO_CACHE);
    })
  );
  self.skipWaiting(); // força ativação imediata
});

// 🚀 Ativa e limpa caches antigos
self.addEventListener("activate", (event) => {
  console.log("🔁 [SW] Ativando...");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("🧹 [SW] Limpando cache antigo:", key);
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// 🌐 Intercepta requisições
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return (
        cachedResponse ||
        fetch(event.request).catch(() =>
          caches.match("/offline.html") // opcional: offline fallback
        )
      );
    })
  );
});
