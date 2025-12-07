import { openDB, getAll, get, put } from "./idb.js";

// En desarrollo, desregistrar SW para evitar caché de estilos
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta && import.meta.env && import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  }
}
import { saveReportOffline } from "./offline-sync.js";

const modal = document.getElementById("modal");
const allRoomsGrid = document.getElementById("allRooms");
const roomSearchInput = document.getElementById("roomSearch");
const scanQrBtn = document.getElementById("scanQrBtn");
const filterLegend = document.getElementById("filterLegend");
const searchHint = document.getElementById("searchHint");

const params = new URLSearchParams(location.search);
const user = params.get("user");
let currentFilter = "all"; // filtro de leyenda
let searchQuery = ""; // búsqueda por nombre/ID
// cache para saber si el dispositivo tiene cámara trasera
let rearCameraAvailable = null;
// cache de layout (pisos y habitaciones)
let layoutConfig = null;

if (!user) {
  alert("Usuario no especificado. Vuelve al login.");
  location.href = "./index.html";
}

function getStatusKey(status) {
  if (!status) return 'clean';
  const s = String(status).toLowerCase();
  if (s.includes('bloq') || s.includes('bloque') || s === 'blocked') return 'blocked';
  if (s.includes('suc') || s.includes('sucio') || s === 'dirty') return 'dirty';
  if (s.includes('limp') || s.includes('limpia') || s === 'clean') return 'clean';
  return s;
}

function getFloorFromId(id) {
  if (!id) return '1';
  const str = String(id);
  if (str.includes('-')) return str.split('-')[0];
  const m = str.match(/^(\d+)/);
  return m ? m[1] : '1';
}

function getRoomNumberPart(id) {
  if (!id) return '';
  const str = String(id);
  if (str.includes('-')) return str.split('-')[1] || str;
  return str;
}

function padRoomNumber(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return String(n || '').padStart(2, '0');
  return String(num).padStart(2, '0');
}

async function loadLayoutConfig() {
  try {
    const stored = await get('settings', 'hotelLayout');
    if (stored) layoutConfig = stored;
  } catch (e) {
    layoutConfig = null;
  }
}

async function markRoomClean(room, sourceTag = 'grid') {
  if (!room) return;
  room.status = "Limpia";
  room.cleanedBy = user;
  room.cleanedAt = new Date().toISOString();
  try {
    await put("rooms", room);
  } catch (e) {
    console.error('put failed (' + sourceTag + ') room:', room.id, e);
    await modalError('No se pudo actualizar la habitación: ' + (e && e.message));
    return;
  }
  await render();
}

async function triggerReport(room) {
  if (!room) return;
  try {
    if (rearCameraAvailable === null) rearCameraAvailable = await hasRearCamera();
  } catch (e) {
    rearCameraAvailable = false;
  }
  if (!rearCameraAvailable) {
    await modalError('Función no habilitada en dispositivos sin cámara trasera');
    return;
  }
  openReportModal(room);
}

function shouldShowRoom(room) {
  // Filtrar por búsqueda de texto
  if (searchQuery) {
    const query = String(searchQuery).toLowerCase();
    const roomId = String(room.id).toLowerCase();
    if (!roomId.includes(query)) return false;
  }

  // Filtrar por estado seleccionado
  if (currentFilter === "all") return true;
  const statusKey = getStatusKey(room && room.status);
  if (currentFilter === "assigned") return room.maid === user;
  if (currentFilter === "dirty") return statusKey === 'dirty';
  if (currentFilter === "clean") return statusKey === 'clean';
  if (currentFilter === "blocked") return statusKey === 'blocked';
  return true;
}

export async function render() {
  if (!layoutConfig) await loadLayoutConfig();
  const rooms = (await getAll("rooms").catch(() => [])) || [];
  
  // Solo renderizar el mapa de habitaciones
  renderSeatMap(rooms);
}

function renderSeatMap(rooms) {
  allRoomsGrid.innerHTML = "";
  
  // Filtrar habitaciones según búsqueda y filtro
  const visibleRooms = rooms.filter(shouldShowRoom);
  
  if (!visibleRooms.length) {
    allRoomsGrid.innerHTML = "<p>No se encontraron habitaciones con los filtros aplicados.</p>";
    return;
  }

  // Organización por piso
  const roomsMap = new Map(visibleRooms.map((r) => [String(r.id), r]));
  const floors = [];
  const cfg = layoutConfig && layoutConfig.floors && layoutConfig.roomsPerFloor ? layoutConfig : null;

  if (cfg) {
    for (let f = 1; f <= cfg.floors; f++) {
      const floorId = String(f);
      const seats = [];
      for (let n = 1; n <= cfg.roomsPerFloor; n++) {
        const roomId = `${floorId}-${padRoomNumber(n)}`;
        const room = rooms.find(r => String(r.id) === roomId) || null;
        if (room && shouldShowRoom(room)) {
          seats.push({ roomId, room });
        }
      }
      if (seats.length) floors.push({ floorId, seats });
    }
  } else {
    const grouped = visibleRooms.reduce((acc, r) => {
      const fId = getFloorFromId(r.id);
      if (!acc[fId]) acc[fId] = [];
      acc[fId].push({ roomId: String(r.id), room: r });
      return acc;
    }, {});
    Object.keys(grouped)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((floorId) => floors.push({ floorId, seats: grouped[floorId] }));
  }

  if (!floors.length) {
    allRoomsGrid.innerHTML = "<p>No se encontraron habitaciones con los filtros aplicados.</p>";
    return;
  }

  floors.forEach(({ floorId, seats }) => {
    const floorBlock = document.createElement('div');
    floorBlock.className = 'floor-block card';

    const title = document.createElement('div');
    title.className = 'floor-title';
    title.textContent = `Piso ${floorId}`;
    floorBlock.appendChild(title);

    const seatRow = document.createElement('div');
    seatRow.className = 'room-seats';

    seats.forEach(({ roomId, room }) => {
      const statusKey = getStatusKey(room && room.status);
      const assignedToMe = room && room.maid === user;
      let colorClass = 'seat-gray';
      if (statusKey === 'blocked' || statusKey === 'siniestro') colorClass = 'seat-red';
      else if (assignedToMe) colorClass = 'seat-green';
      else if (statusKey === 'dirty') colorClass = 'seat-blue';

      const seat = document.createElement('div');
      seat.className = `room-seat ${colorClass}`;
      seat.setAttribute('data-room', roomId);

      const seatHeader = document.createElement('div');
      seatHeader.className = 'room-seat__name';
      seatHeader.textContent = roomId;

      const seatMeta = document.createElement('div');
      seatMeta.className = 'room-seat__meta';
      seatMeta.textContent = room ? (room.status || 'Limpia') : 'Sin registrar';

      const seatAssign = document.createElement('div');
      seatAssign.className = 'room-seat__assignment';
      if (room) {
        seatAssign.textContent = room.maid ? `Asignada a ${room.maid}` : 'Sin asignar';
      } else {
        seatAssign.textContent = 'No existe en base';
      }

      const actions = document.createElement('div');
      actions.className = 'seat-actions';

      if (room && statusKey === 'dirty') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-success';
        btn.innerHTML = '<i class="bi bi-broom"></i>Limpia';
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          await markRoomClean(room, 'seat-map');
        });
        actions.appendChild(btn);
      }

      if (room && room.maid === user) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-danger';
        btn.innerHTML = '<i class="bi bi-exclamation-triangle"></i>Siniestro';
        if (rearCameraAvailable === false) {
          btn.disabled = true;
          btn.setAttribute('aria-disabled', 'true');
          btn.classList.add('disabled');
          btn.title = 'Función no disponible en dispositivos sin cámara trasera';
        }
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          await triggerReport(room);
        });
        actions.appendChild(btn);
      }

      seat.appendChild(seatHeader);
      seat.appendChild(seatMeta);
      seat.appendChild(seatAssign);
      if (actions.childElementCount) seat.appendChild(actions);

      seat.title = `Hab ${roomId} \nEstado: ${room ? (room.status || 'Limpia') : 'Sin registrar'}${room && room.rented ? ' (ocupada)' : ''}\nAsignación: ${room && room.maid ? room.maid : 'Ninguna'}`;
      seatRow.appendChild(seat);
    });

    floorBlock.appendChild(seatRow);
    allRoomsGrid.appendChild(floorBlock);
  });
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

// Detectar si el dispositivo cuenta con cámara trasera.
// Estrategia:
// 1) Usar enumerateDevices() y buscar 'videoinput' con label que indique 'back/rear/environment/trasera'.
// 2) Si no hay labels (sin permiso), intentar solicitar `getUserMedia` con `facingMode: { exact: 'environment' }`.
//    Si esto tiene éxito, se considera que hay cámara trasera (cerrando el stream inmediatamente).
async function hasRearCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === 'videoinput');
    if (!videoInputs.length) return false;

    const anyLabeled = videoInputs.some((d) => d.label && d.label.trim().length > 0);
    if (anyLabeled) {
      const re = /back|rear|environment|trasera|trasero|posterior/i;
      return videoInputs.some((d) => re.test(d.label));
    }

    // Sin labels (probablemente permisos no otorgados) -> intentar exact facingMode (puede pedir permiso)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: 'environment' } } });
      s.getTracks().forEach((t) => t.stop());
      return true;
    } catch (e) {
      return false;
    }
  } catch (e) {
    return false;
  }
}

async function openReportModal(room) {
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

  // Comprobar si hay cámara trasera y deshabilitar control si no existe
  try {
    const rear = await hasRearCamera();
    if (!rear) {
      if (startCamBtn) {
        startCamBtn.disabled = true;
        startCamBtn.title = 'No se detectó cámara trasera en este dispositivo';
      }
      const cameraArea = document.getElementById('cameraArea');
      if (cameraArea) {
        const note = document.createElement('div');
        note.style.color = '#b8860b';
        note.style.marginTop = '8px';
        note.textContent = 'No se detectó cámara trasera en este dispositivo. La captura de fotos no está disponible.';
        cameraArea.appendChild(note);
      }
    }
  } catch (e) {
    console.warn('Error verificando cámara trasera', e);
  }

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
  // detectar cámara trasera al iniciar y cachear resultado (evita prompts repetidos)
  try {
    rearCameraAvailable = await hasRearCamera();
  } catch (e) {
    rearCameraAvailable = false;
  }
  
  // Renderizar leyenda como botones filtrados
  renderFilterLegend();
  
  // Listeners para búsqueda
  roomSearchInput.addEventListener('input', (e) => {
    searchQuery = String(e.target.value).trim();
    searchHint.textContent = searchQuery ? `Filtrando: "${searchQuery}"` : '';
    render();
  });

  roomSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = String(roomSearchInput.value).trim();
      if (value) {
        // Buscar y scroll a la habitación
        const seats = Array.from(document.querySelectorAll('[data-room]'));
        const match = seats.find(s => s.getAttribute('data-room') === value);
        if (match) {
          match.scrollIntoView({ behavior: 'smooth', block: 'center' });
          match.style.backgroundColor = '#fffacd';
          setTimeout(() => (match.style.backgroundColor = ''), 1500);
        } else {
          searchHint.textContent = `Habitación "${value}" no encontrada`;
        }
      }
    }
  });

  // Listener para QR scanner
  scanQrBtn.addEventListener('click', async () => {
    try {
      if (rearCameraAvailable === null) rearCameraAvailable = await hasRearCamera();
    } catch (e) {
      rearCameraAvailable = false;
    }
    
    if (!rearCameraAvailable) {
      await modalError('El escaneo de QR requiere cámara trasera. Esta función no está disponible en tu dispositivo.');
      return;
    }
    
    startQrScanner();
  });
  
  // Deshabilitar botón QR si no hay cámara trasera
  if (rearCameraAvailable === false) {
    scanQrBtn.disabled = true;
    scanQrBtn.classList.add('disabled');
    scanQrBtn.title = 'Requiere cámara trasera';
  }

  await render();
}

function renderFilterLegend() {
  filterLegend.innerHTML = '';
  
  const filters = [
    { key: 'all', label: 'Todas', icon: 'grid-3x2-gap' },
    { key: 'assigned', label: 'Asignadas a mí', icon: 'person-check', dot: 'seat-green' },
    { key: 'dirty', label: 'Sucias', icon: 'exclamation-circle', dot: 'seat-blue' },
    { key: 'clean', label: 'Limpias', icon: 'check-circle', dot: 'seat-gray' },
    { key: 'blocked', label: 'Siniestro', icon: 'exclamation-triangle', dot: 'seat-red' },
  ];

  filters.forEach(({ key, label, icon, dot }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-btn';
    if (key === currentFilter) btn.classList.add('active');
    
    let html = `<i class="bi bi-${icon}"></i> ${label}`;
    if (dot) html = `<span class="legend-dot ${dot}"></span> ${label}`;
    btn.innerHTML = html;
    
    btn.addEventListener('click', () => {
      currentFilter = key;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
    
    filterLegend.appendChild(btn);
  });
}

async function startQrScanner() {
  const modal_qr = document.createElement('div');
  modal_qr.className = 'modal show';
  modal_qr.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <h4>Escanear QR/Código de barras</h4>
      <p style="font-size: 0.9rem; color: #666;">Apunta la cámara al código QR o barras de la habitación</p>
      <video id="qrVideo" style="width: 100%; border-radius: 8px; background: #000; margin: 16px 0;"></video>
      <div id="qrResult" style="min-height: 40px; padding: 12px; background: #f0f0f0; border-radius: 8px; margin: 12px 0; text-align: center; font-weight: 600;"></div>
      <div class="row">
        <button id="cancelQr" class="btn btn-secondary">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal_qr);

  const video = modal_qr.querySelector('#qrVideo');
  const resultDiv = modal_qr.querySelector('#qrResult');
  const cancelBtn = modal_qr.querySelector('#cancelQr');
  
  let stream = null;
  let scanning = true;

  cancelBtn.addEventListener('click', () => {
    scanning = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    modal_qr.remove();
  });

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    video.srcObject = stream;
    video.play();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let lastResult = null;

    const scanFrame = () => {
      if (!scanning) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data !== lastResult) {
          lastResult = code.data;
          resultDiv.textContent = `✓ Detectado: ${code.data}`;
          resultDiv.style.background = '#d4edda';
          resultDiv.style.color = '#155724';

          // Auto-apply
          scanning = false;
          if (stream) stream.getTracks().forEach(t => t.stop());
          
          roomSearchInput.value = code.data;
          searchQuery = code.data;
          searchHint.textContent = `Escaneado: "${code.data}"`;
          
          setTimeout(() => {
            modal_qr.remove();
            render();
          }, 600);
          return;
        }
      }

      requestAnimationFrame(scanFrame);
    };

    scanFrame();
  } catch (err) {
    resultDiv.textContent = '✗ No se pudo acceder a la cámara';
    resultDiv.style.background = '#f8d7da';
    resultDiv.style.color = '#721c24';
  }
}

init();


