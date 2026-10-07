const CACHE_NAME = "ninjabox-tarot-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Canlı içerikleri cache'lemiyoruz.
});
