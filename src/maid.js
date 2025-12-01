import { openDB, getAll, put } from "./idb.js";

// En desarrollo, desregistrar SW para evitar caché de estilos
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta && import.meta.env && import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  }
}
import { saveReportOffline } from "./offline-sync.js";

const modal = document.getElementById("modal");
const grid = document.getElementById("maidRooms");
const allRoomsGrid = document.getElementById("allRooms");
const filterBtns = Array.from(document.querySelectorAll(".filters button"));

const params = new URLSearchParams(location.search);
const user = params.get("user");
let currentFilter = "all";

if (!user) {
  alert("Usuario no especificado. Vuelve al login.");
  location.href = "./index.html";
}

filterBtns.forEach((b) => {
  b.addEventListener("click", () => {
    filterBtns.forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    currentFilter = b.getAttribute("data-filter") || "all";
    render();
  });
  
});


function matchesFilter(r, filter) {
  if (!filter || filter === "all") return true;
  if (filter === "to-clean")
    return (
      String(r.status || "")
        .toLowerCase()
        .includes("suc") || String(r.status || "").toLowerCase() === "dirty"
    );
  if (filter === "clean")
    return (
      String(r.status || "")
        .toLowerCase()
        .includes("limp") || String(r.status || "").toLowerCase() === "clean"
    );
  if (filter === "occupied") return !!r.rented;
  if (filter === "blocked")
    return (
      String(r.status || "")
        .toLowerCase()
        .includes("bloq") || String(r.status || "").toLowerCase() === "blocked"
    );
  return true;
}

export async function render() {
  const rooms = (await getAll("rooms").catch(() => [])) || [];
  
  // SECCIÓN 1: Mis habitaciones asignadas (con filtros)
  let assigned = rooms.filter((r) => r.maid === user);
  let visible = assigned.filter((r) => matchesFilter(r, currentFilter));

  grid.innerHTML = "";
  if (!visible.length) {
    grid.innerHTML = "<p>No hay habitaciones asignadas.</p>";
  } else {
    for (const r of visible) {
      const el = document.createElement("div");
      el.className = "card room-card framed";
      const statusText = r.status || "Limpia";
      el.innerHTML = `<h3>Hab ${r.id}</h3><p>Estado: ${statusText}${
        r.rented ? " (ocupada)" : ""
      }</p>`;

      // action container for nicer layout
      const rowActions = document.createElement("div");
      rowActions.className = "row-actions";

      // show clean button only when status indicates 'sucia' / 'sucio'
      const statusLower = String(r.status || "").toLowerCase();
      if (statusLower.includes("suc") || statusLower === "dirty") {
        const btnClean = document.createElement("button");
        btnClean.className = "btn btn-sm btn-success";
        btnClean.innerHTML = '<i class="bi bi-broom"></i>Marcar limpia';
        btnClean.addEventListener("click", async () => {
          const ok = await confirmAction(
            "¿Marcar habitación " + r.id + " como limpia?"
          );
          if (!ok) return;
          r.status = "Limpia";
          r.cleanedBy = user;
          r.cleanedAt = new Date().toISOString();
          await put("rooms", r);
          await render();
        });
        rowActions.appendChild(btnClean);
      }

      const btnReport = document.createElement("button");
      btnReport.className = "btn btn-sm btn-danger";
      btnReport.innerHTML =
        '<i class="bi bi-exclamation-triangle"></i>Levantar siniestro';
      btnReport.addEventListener("click", () => openReportModal(r));
      rowActions.appendChild(btnReport);

      el.appendChild(rowActions);

      const tag = document.createElement("small");
      tag.textContent = "Asignada";
      el.appendChild(tag);

      grid.appendChild(el);
    }
  }

  // SECCIÓN 2: Listado general de todas las habitaciones (sin filtros)
  allRoomsGrid.innerHTML = "";
  if (!rooms.length) {
    allRoomsGrid.innerHTML = "<p>No hay habitaciones registradas.</p>";
  } else {
    for (const r of rooms) {
      const el = document.createElement("div");
      el.className = "card room-card framed";
      const statusText = r.status || "Limpia";
      const statusLower = String(r.status || "").toLowerCase();
      const assignedMaid = r.maid ? `(Asignada a: ${r.maid})` : "(Sin asignar)";
      let cleanedInfo = "";
      if (r.cleanedBy && (statusLower.includes("limp") || statusLower === "clean")) {
        cleanedInfo = `<br><small style="color:#2e8b57;font-weight:500;">Aseada por: ${r.cleanedBy}</small>`;
      }
      el.innerHTML = `<h3>Hab ${r.id}</h3><p>Estado: ${statusText}${
        r.rented ? " (ocupada)" : ""
      }${cleanedInfo}</p><small>${assignedMaid}</small>`;

      // action container for nicer layout
      const rowActions = document.createElement("div");
      rowActions.className = "row-actions";

      // show clean button when status indicates 'sucia' / 'sucio' (any camarera can clean)
      if (statusLower.includes("suc") || statusLower === "dirty") {
        const btnClean = document.createElement("button");
        btnClean.className = "btn btn-sm btn-success";
        btnClean.innerHTML = '<i class="bi bi-broom"></i>Marcar limpia';
        btnClean.addEventListener("click", async () => {
          const ok = await confirmAction(
            "¿Marcar habitación " + r.id + " como limpia?"
          );
          if (!ok) return;
          r.status = "Limpia";
          r.cleanedBy = user;
          r.cleanedAt = new Date().toISOString();
          await put("rooms", r);
          await render();
        });
        rowActions.appendChild(btnClean);
      }

      // show report button only if assigned to current user
      if (r.maid === user) {
        const btnReport = document.createElement("button");
        btnReport.className = "btn btn-sm btn-danger";
        btnReport.innerHTML =
          '<i class="bi bi-exclamation-triangle"></i>Levantar siniestro';
        btnReport.addEventListener("click", () => openReportModal(r));
        rowActions.appendChild(btnReport);
      }

      el.appendChild(rowActions);
      allRoomsGrid.appendChild(el);
    }
  }
}

// simple confirm modal for maid page
function confirmAction(message) {
  return new Promise((res) => {
    modal.classList.remove("hidden");
    modal.innerHTML = `<div class="modal-content" role="dialog"><h4>Confirmar</h4><p>${message}</p><div class="row"><button id="confirmYes" class="btn btn-primary">Sí</button><button id="confirmNo" class="btn btn-secondary">No</button></div></div>`;
    document.getElementById("confirmNo").onclick = () => {
      modal.classList.add("hidden");
      res(false);
    };
    document.getElementById("confirmYes").onclick = () => {
      modal.classList.add("hidden");
      res(true);
    };
  });
}

function warningModal(msg) {
  return new Promise((res) => {
    modal.classList.remove("hidden");
    modal.innerHTML = `
    <div class="modal-content" style="border-left: 6px solid #f5c048;">
      <h4 style="color:#b8860b;">Advertencia</h4>
      <p>${msg}</p>
      <div class="row">
        <button id="warnOk" class="btn btn-primary">Aceptar</button>
      </div>
    </div>`;
    document.getElementById("warnOk").onclick = () => {
      modal.classList.add("hidden");
      res(true);
    };
  });
}
function modalSuccess(msg) {
  return new Promise((res) => {
    modal.classList.remove("hidden");
    modal.innerHTML = `
    <div class="modal-content" style="border-left: 6px solid #42c76a;">
      <h3 style="color:#2e8b57;">Éxito</h3>
      <p>${msg}</p>
      <div class="row">
        <button id="okSuccess" class="btn btn-primary">Aceptar</button>
      </div>
    </div>`;
    document.getElementById("okSuccess").onclick = () => {
      modal.classList.add("hidden");
      res(true);
    };
  });
}

function modalError(msg) {
  return new Promise((res) => {
    modal.classList.remove("hidden");
    modal.innerHTML = `
    <div class="modal-content" style="border-left: 6px solid #ff5d5d;">
      <h3 style="color:#b00020;">Error</h3>
      <p>${msg}</p>
      <div class="row">
        <button id="okError" class="btn btn-secondary">Cerrar</button>
      </div>
    </div>`;
    document.getElementById("okError").onclick = () => {
      modal.classList.add("hidden");
      res(true);
    };
  });
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

function openReportModal(room) {
  modal.classList.remove("hidden");
  modal.classList.add("show");

  modal.innerHTML = `
  <div class="modal-content">
    <h3>Siniestro - Hab ${room.id}</h3>
    
    <label for="subject">Tema / Asunto</label>
    <input id="subject" type="text" placeholder="Ej: Fuga de agua, daño en mueble, etc." required />
    
    <label for="desc">Descripción</label>
    <textarea id="desc" placeholder="Describe el problema en detalle..." required></textarea>
    
    <label>Fotos (máx 3)</label>
    <div id="cameraArea">
      <video id="video" autoplay playsinline style="width:100%;max-height:240px;background:#000;display:none;border-radius:6px;"></video>
      <canvas id="canvas" style="display:none;"></canvas>
      <div id="cameraControls" style="margin-top:8px;display:flex;align-items:center;gap:8px;">
        <button id="startCam" class="btn btn-sm btn-primary">Iniciar cámara</button>
        <button id="capture" class="btn btn-sm btn-success" disabled>Tomar foto</button>
        <span id="photoCount" style="margin-left:8px">0 / 3</span>
      </div>
      <div id="thumbs" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"></div>
    </div>
    
    <div class="row">
      <button id="send" class="btn btn-primary">Enviar</button>
      <button id="close" class="btn btn-secondary">Cerrar</button>
    </div>
  </div>`;

  document.getElementById("close").onclick = () => {
    stopStream();
    modal.classList.add("hidden");
  };

  // camera elements and state
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const startCamBtn = document.getElementById("startCam");
  const captureBtn = document.getElementById("capture");
  const thumbs = document.getElementById("thumbs");
  const photoCount = document.getElementById("photoCount");

  let stream = null;
  const images = [];

  function updateUI() {
    photoCount.textContent = `${images.length} / 3`;
    captureBtn.disabled = images.length >= 3 || !stream;
    // enable send only when at least 1 photo (handled later)
  }

  function updateThumbs() {
    thumbs.innerHTML = "";
    images.forEach((src, idx) => {
      const d = document.createElement("div");
      d.style.position = "relative";
      d.style.width = "80px";
      d.style.height = "80px";
      d.style.border = "1px solid #ddd";
      d.style.borderRadius = "6px";
      d.style.overflow = "hidden";
      const img = document.createElement("img");
      img.src = src;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      d.appendChild(img);
      const rem = document.createElement("button");
      rem.textContent = "✕";
      rem.title = "Eliminar";
      rem.style.position = "absolute";
      rem.style.top = "4px";
      rem.style.right = "4px";
      rem.style.background = "rgba(0,0,0,0.5)";
      rem.style.color = "#fff";
      rem.style.border = "none";
      rem.style.borderRadius = "50%";
      rem.style.width = "22px";
      rem.style.height = "22px";
      rem.style.cursor = "pointer";
      rem.onclick = () => {
        images.splice(idx, 1);
        updateThumbs();
        updateUI();
      };
      d.appendChild(rem);
      thumbs.appendChild(d);
    });
  }

  async function startStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      await warningModal("Tu navegador no soporta acceso a cámara.");
      return false;
    }
    
    startCamBtn.disabled = true;
    startCamBtn.textContent = "Iniciando...";
    
    try {
      // intentar cámara trasera primero
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      video.srcObject = stream;
      video.style.display = "block";
      startCamBtn.style.display = "none";
      captureBtn.disabled = false;
      updateUI();
      return true;
    } catch (e) {
      startCamBtn.disabled = false;
      startCamBtn.textContent = "Iniciar cámara";
      await warningModal("No se pudo acceder a la cámara trasera. Verifica permisos o intenta en otro dispositivo.");
      return false;
    }
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (video) video.style.display = "none";
    const camControls = document.getElementById("cameraControls");
    if (camControls && startCamBtn) {
      startCamBtn.style.display = "inline-block";
      startCamBtn.disabled = false;
      startCamBtn.textContent = "Iniciar cámara";
    }
  }

  startCamBtn.onclick = async () => {
    await startStream();
  };

  captureBtn.onclick = () => {
    if (!stream) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return alert("Cámara no lista. Intenta de nuevo.");
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, vw, vh);
    const data = canvas.toDataURL("image/jpeg", 0.9);
    images.push(data);
    updateThumbs();
    updateUI();
    if (images.length >= 3) {
      captureBtn.disabled = true;
    }
  };

  document.getElementById("send").onclick = async () => {
    const subject = document.getElementById("subject").value.trim();
    const desc = document.getElementById("desc").value.trim();

    if (!subject) {
      alert("El tema es requerido");
      return;
    }

    if (!desc) {
      alert("La descripción es requerida");
      return;
    }

    // validar fotos tomadas
    if (images.length === 0) {
      await warningModal("Debes tomar al menos 1 foto con la cámara.");
      return;
    }

    // limitar a 3 por seguridad (ya controlado en UI)
    const finalImages = images.slice(0, 3);

    const report = {
      _id: "r_" + Date.now(),
      roomId: room.id,
      subject: subject,
      description: desc,
      images: finalImages,
      createdAt: new Date().toISOString(),
      createdBy: user,
    };
    // marcar habitación como bloqueada
    room.status = "Bloqueada";
    await put("rooms", room);
    try {
      const resp = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });

      if (!resp.ok) throw new Error("Network");

      const rjson = await resp.json();
      await put("reports", rjson);

      // ✔ Mostrar modal de éxito
      await modalSuccess("El reporte fue enviado correctamente.");
    } catch (e) {
      // guardar offline
      await saveReportOffline(report);
      await put("reports", report);

      // ❌ Modal de error
      await modalError(
        "No se pudo enviar el reporte. Se guardó para enviar más tarde."
      );
    }

    // detener cámara, cerrar modal y refrescar
    stopStream();
    modal.classList.add("hidden");
    await render();
  };
}

async function init() {
  await openDB();
  // set default active filter button
  const btnAll = document.querySelector('.filters button[data-filter="all"]');
  if (btnAll) btnAll.classList.add("active");
  await render();
}

init();


