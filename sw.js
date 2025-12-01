const CACHE_NAME = "pwa-hotel-static-v3";
const RUNTIME = "pwa-hotel-runtime-v3";

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== RUNTIME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

const APP_SHELL = [
  "./index.html",
  "./maid.html",
  "./reception.html",
  "./src/offline-sync.js",
  "./src/idb.js",
  "./src/styles.css",
  "./src/maid.css",
  "./src/reception.css",
  "./src/app-login.js",
  "./src/maid.js",
  "./src/reception.js",
  "./src/api.js",
  "./src/assets/icons/icon-192.png",
  "./src/assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});


self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // API pattern -> network-first then cache
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/reports")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          return caches.open(RUNTIME).then((cache) => {
            cache.put(event.request, res.clone());
            return res;
          });
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-reports") {
    event.waitUntil(syncReports());
  }
});

async function syncReports() {
  try {
    const db = await openSelfDB();
    const tx = db.transaction("outbox", "readwrite");
    const store = tx.objectStore("outbox");
    const req = store.getAll();
    req.onsuccess = async () => {
      const items = req.result || [];
      for (const it of items) {
        try {
          const res = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(it),
          });
          if (res.ok) await store.delete(it._id);
        } catch (e) {
          // keep for next sync
        }
      }
    };
    await tx.complete;
  } catch (e) {
    console.error("SW sync error", e);
  }
}

function openSelfDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("hotel-db");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onupgradeneeded = () => res(r.result);
  });
}
