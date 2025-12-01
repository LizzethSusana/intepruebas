export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("hotel-db", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("rooms"))
        db.createObjectStore("rooms", { keyPath: "id" });
      if (!db.objectStoreNames.contains("maids"))
        db.createObjectStore("maids", { keyPath: "id" });
      if (!db.objectStoreNames.contains("reports"))
        db.createObjectStore("reports", { keyPath: "_id" });
      if (!db.objectStoreNames.contains("outbox"))
        db.createObjectStore("outbox", { keyPath: "_id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function put(storeName, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function del(storeName, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}
