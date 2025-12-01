import { openDB, getAll, put } from "./idb.js";

async function bootstrap() {
  // Registrar/Desregistrar service worker según entorno
  if ("serviceWorker" in navigator) {
    // En desarrollo, desregistrar para evitar caché que rompe estilos
    if (import.meta && import.meta.env && import.meta.env.DEV) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      } catch (_) {}
    } else {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  await openDB();

  // 🔄 SOLO sincronizamos maids si hay internet
  if (navigator.onLine) {
    try {
      const resp = await fetch("/api/maids");
      if (resp.ok) {
        const maids = await resp.json();
        for (const m of maids) await put("maids", m);
        console.log("Maids sincronizadas:", maids.length);
      }
    } catch (err) {
      console.warn("No se pudo sincronizar maids:", err);
    }
  }

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const u = document.getElementById("username").value.trim();
    const p = document.getElementById("password").value || "";

    if (!u) return;

    // 🛑 RECEPCIÓN SOLO FUNCIONA ONLINE
    if (u.toLowerCase() === "reception") {
      if (!navigator.onLine) {
        alert("Recepción solo funciona con internet.");
        return;
      }
      location.href = "/reception.html";
      return;
    }

    // 👇 MAID: funciona online y offline
    try {
      const maids = await getAll("maids").catch(() => []);

      if (!maids.length) {
        alert("No hay datos locales. Conéctate una vez para cargar las camareras.");
        return;
      }

      const maid = maids.find(
        (m) => m.id === u || m.email === u
      );

      if (!maid) {
        alert("Usuario no encontrado");
        return;
      }

      // Validar contraseña (modo simple)
      if (!maid.password || String(maid.password) !== String(p)) {
        alert("Contraseña incorrecta");
        return;
      }

      // Acceso correcto → Maid
      const encoded = encodeURIComponent(maid.id || maid.email);
      location.href = `/maid.html?user=${encoded}`;

    } catch (err) {
      console.error("Error login:", err);
      alert("Error al verificar credenciales");
    }
  });
}

bootstrap();
