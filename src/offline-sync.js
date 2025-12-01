import { put, getAll } from "./idb.js";
const RUNTIME = "pwa-hotel-runtime-v1";

export async function saveReportOffline(report) {
  report._id = "local_" + Date.now();
  await put("outbox", report);
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const reg = await navigator.serviceWorker.ready;
    try {
      await reg.sync.register("sync-reports");
    } catch (e) {
      console.warn("Background sync no disponible", e);
    }
  }
}

export async function saveRoomStatusOffline(roomStatus) {
  roomStatus._id = "room_" + Date.now();
  await put("outbox", roomStatus);

  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const reg = await navigator.serviceWorker.ready;
    try {
      await reg.sync.register("sync-reports");
    } catch (e) {
      console.warn("Background sync no disponible", e);
    }
  }
}


export async function flushOutbox() {
  const db = await openDB();
  const tx = db.transaction("outbox", "readwrite");
  const store = tx.objectStore("outbox");
  const req = store.getAll();
  req.onsuccess = async () => {
    for (const r of req.result) {
      try {
        await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(r),
        });
        store.delete(r._id);
      } catch (e) {}
    }
  };
}

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("hotel-db");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
