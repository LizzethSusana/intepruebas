import { getAll, get, put, del } from './idb.js'

// En desarrollo, desregistrar SW para evitar caché de estilos
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta && import.meta.env && import.meta.env.DEV) {
    navigator.serviceWorker
      .getRegistrations()
      .then((rs) => rs.forEach((r) => r.unregister()))
      .catch(() => {})
  }
}

// Referencias DOM necesarias
const modal = document.getElementById('modal')
const roomsList = document.getElementById('roomsList')
const maidsList = document.getElementById('maidsList')
const reportsEl = document.getElementById('reportsList')
const btnAddRoom = document.getElementById('btnAddRoom')
const btnAddMaid = document.getElementById('btnAddMaid')
const layoutFloorsInput = document.getElementById('layoutFloors')
const layoutRoomsInput = document.getElementById('layoutRooms')
const btnSaveLayout = document.getElementById('btnSaveLayout')
const layoutStatus = document.getElementById('layoutStatus')

// Referencias para menú de navegación
const navItems = document.querySelectorAll('.nav-item')

// Debug: verificar que los botones se encuentren
console.log('btnAddRoom:', btnAddRoom)
console.log('btnAddMaid:', btnAddMaid)

// pagination state
let roomsPage = 0
let maidsPage = 0
let reportsPage = 0
const ITEMS_PER_PAGE = 8 // habitaciones
const MAIDS_PER_PAGE = 6 // camareras por página
const REPORTS_PER_PAGE = 6 // reportes por página

// Hacer modal accesible desde otros módulos si se necesita
window.modal = modal

function toBase64(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
}

// -------------------
// Helpers de layout
// -------------------
let layoutSettings = null

function padRoom(num, width = 2) {
  const s = String(num)
  return s.length >= width ? s : '0'.repeat(width - s.length) + s
}

async function loadLayoutSettings() {
  try {
    const stored = await get('settings', 'hotelLayout')
    if (stored) layoutSettings = stored
    if (layoutFloorsInput && stored?.floors)
      layoutFloorsInput.value = stored.floors
    if (layoutRoomsInput && stored?.roomsPerFloor)
      layoutRoomsInput.value = stored.roomsPerFloor
    if (layoutStatus && stored)
      layoutStatus.textContent = `El hotel tiene: ${stored.floors} pisos x ${stored.roomsPerFloor} hab.`
  } catch (e) {
    console.warn('No se pudo cargar layout', e)
  }
}

async function saveLayoutSettings(floors, roomsPerFloor) {
  layoutSettings = {
    key: 'hotelLayout',
    floors,
    roomsPerFloor,
    updatedAt: new Date().toISOString(),
  }
  await put('settings', layoutSettings)
}

async function ensureRoomsFromLayout(floors, roomsPerFloor) {
  const rooms = (await getAll('rooms').catch(() => [])) || []
  const existing = new Set(rooms.map((r) => String(r.id)))
  let created = 0
  for (let f = 1; f <= floors; f++) {
    for (let n = 1; n <= roomsPerFloor; n++) {
      const id = `${f}-${padRoom(n)}`
      if (existing.has(id)) continue
      const room = { id, status: 'Limpia', maid: null, rented: false }
      await put('rooms', room)
      created++
    }
  }
  return created
}

function getStatusKey(status) {
  if (!status) return 'clean'
  const s = String(status).toLowerCase()
  // map common spanish/english forms to normalized keys
  if (s.includes('bloq') || s.includes('bloque') || s === 'blocked')
    return 'blocked'
  if (s.includes('suc') || s.includes('sucio') || s === 'dirty') return 'dirty'
  if (s.includes('limp') || s.includes('limpia') || s === 'clean')
    return 'clean'
  if (s.includes('no') && s.includes('dispon')) return 'no-disponible'
  if (s.includes('disp')) return 'disponible'
  // fallback: sanitize to a safe class name (replace spaces/punctuation)
  return s.replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
}

async function renderAll() {
  const rooms = (await getAll('rooms').catch(() => [])) || []
  const maids = (await getAll('maids').catch(() => [])) || []
  const reports = (await getAll('reports').catch(() => [])) || []

  // remove existing pagers to avoid duplicates
  document.querySelectorAll('.pager').forEach((p) => p.remove())

  // Render habitaciones (paginadas)
  roomsList.innerHTML = ''
  const totalRooms = rooms.length
  const roomsStart = roomsPage * ITEMS_PER_PAGE
  const roomsPageItems = rooms.slice(roomsStart, roomsStart + ITEMS_PER_PAGE)
  for (const r of roomsPageItems) {
    const card = document.createElement('div')
    card.className = 'card room-card'

    const info = document.createElement('div')
    info.className = 'info'
    // Mostrar: número de habitación, estado, ocupado/disponible, camarera (select)
    const key = getStatusKey(r.status)
    const badge = document.createElement('span')
    badge.className = `status-badge ${key}`
    badge.textContent = r.status || 'Limpia'
    const h3 = document.createElement('h3')
    h3.textContent = `Hab ${r.id}`

    // Orden: número primero, luego estado
    info.appendChild(h3)
    info.appendChild(badge)

    // Mostrar quién limpió la habitación si está limpia y tiene cleanedBy
    if (r.cleanedBy && key === 'clean') {
      const cleanedByDiv = document.createElement('div')
      cleanedByDiv.className = 'cleaned-by'
      cleanedByDiv.style.color = '#2e8b57'
      cleanedByDiv.style.fontWeight = '500'
      cleanedByDiv.style.fontSize = '0.9em'
      cleanedByDiv.style.marginTop = '4px'
      cleanedByDiv.textContent = `Aseada por: ${r.cleanedBy}`
      info.appendChild(cleanedByDiv)
    }

    // Si está bloqueada, no mostrar más detalles
    let sel = null
    if (key !== 'blocked') {
      // ocupado / disponible
      const occ = document.createElement('div')
      occ.className = 'occ'
      occ.textContent = r.rented ? 'Ocupada' : 'Disponible'
      info.appendChild(occ)

      // asignación: etiqueta + select
      const assigned = document.createElement('div')
      assigned.className = 'assigned'
      const label = document.createElement('div')
      label.textContent = 'Camarera:'
      assigned.appendChild(label)

      sel = document.createElement('select')
      sel.innerHTML = `<option value="">-- Sin asignar --</option>` + maids
        .map((m) => {
          const disabled = (m.status || '').toLowerCase().includes('no')
            ? 'disabled'
            : ''
          const selected = r.maid === (m.id || m.email) ? 'selected' : ''
          const labelText = `${m.name || ''} ${
            (m.status || '').toLowerCase().includes('no')
              ? '(No disponible)'
              : ''
          }`
          return `<option value="${
            m.id || m.email
          }" ${selected} ${disabled}>${labelText}</option>`
        })
        .join('')

      sel.addEventListener('change', async () => {
        const selected = sel.value
        // Permitir desasignar (valor vacío)
        if (!selected) {
          r.maid = null
          await put('rooms', r)
          await renderAll()
          return
        }
        const chosen = maids.find((m) => (m.id || m.email) === selected)
        if (chosen && (chosen.status || '').toLowerCase().includes('no')) {
          alert('La camarera no está disponible')
          sel.value = r.maid || ''
          return
        }
        r.maid = selected
        await put('rooms', r)
        await renderAll()
      })

      assigned.appendChild(sel)
      info.appendChild(assigned)
    }

    const actions = document.createElement('div')
    actions.className = 'actions'

    // edit room button - siempre disponible
    const btnEditRoom = document.createElement('button')
    btnEditRoom.className = 'btn btn-sm btn-primary'
    btnEditRoom.innerHTML = '<i class="bi bi-pencil" aria-hidden="true"></i>'
    btnEditRoom.title = 'Editar habitación'
    btnEditRoom.addEventListener('click', () => editRoomModal(r))
    actions.appendChild(btnEditRoom)

    // show habilitar if blocked
    if (getStatusKey(r.status) === 'blocked') {
      const btn = document.createElement('button')
      btn.className = 'btn btn-sm btn-success'
      btn.textContent = 'Habilitar'
      btn.title = 'Habilitar habitación (se marcará como Sucio)'
      btn.addEventListener('click', async () => {
        const ok = await confirmAction(
          `¿Habilitar la habitación ${r.id}? Se marcará como "Sucio".`
        )
        if (!ok) return
        r.status = 'Sucio' // marcar como sucio cuando se habilita
        await put('rooms', r)
        await renderAll()
      })
      actions.appendChild(btn)
    }

    card.appendChild(info)
    card.appendChild(actions)
    roomsList.appendChild(card)
  }
  // pagination controls for rooms
  const roomsPager = document.createElement('div')
  roomsPager.className = 'pager'
  const prevRooms = document.createElement('button')
  prevRooms.textContent = '←'
  prevRooms.disabled = roomsPage === 0
  prevRooms.addEventListener('click', () => {
    roomsPage = Math.max(0, roomsPage - 1)
    renderAll()
  })
  const nextRooms = document.createElement('button')
  nextRooms.textContent = '→'
  nextRooms.disabled = roomsStart + ITEMS_PER_PAGE >= totalRooms
  nextRooms.addEventListener('click', () => {
    if (roomsStart + ITEMS_PER_PAGE < totalRooms) {
      roomsPage++
      renderAll()
    }
  })
  const infoRooms = document.createElement('span')
  infoRooms.textContent = `Página ${roomsPage + 1} / ${Math.max(
    1,
    Math.ceil(totalRooms / ITEMS_PER_PAGE)
  )}`
  roomsPager.appendChild(prevRooms)
  roomsPager.appendChild(infoRooms)
  roomsPager.appendChild(nextRooms)
  roomsList.parentNode.insertBefore(roomsPager, roomsList.nextSibling)

  // Render camareras en tabla (paginadas)
  maidsList.innerHTML = ''
  const totalMaids = maids.length
  const maidsStart = maidsPage * MAIDS_PER_PAGE
  const maidsPageItems = maids.slice(maidsStart, maidsStart + MAIDS_PER_PAGE)

  // Envoltorio con clase que permite cambiar a grid en móviles
  const maidsContainer = document.createElement('div')
  maidsContainer.className = 'maids-container'

  // Tabla para desktop
  const table = document.createElement('table')
  table.className = 'maids-table table'
  const thead = document.createElement('thead')
  thead.innerHTML =
    '<tr><th>Nombre</th><th>Correo</th><th>Estado</th><th>Acciones</th></tr>'
  table.appendChild(thead)
  const tbody = document.createElement('tbody')

  for (const m of maidsPageItems) {
    const tr = document.createElement('tr')
    const tdName = document.createElement('td')
    tdName.textContent = m.name || ''
    const tdEmail = document.createElement('td')
    tdEmail.textContent = m.email || m.id || ''
    const tdStatus = document.createElement('td')
    const statusBadge = document.createElement('span')
    statusBadge.className = `status-badge ${getStatusKey(m.status)}`
    statusBadge.textContent = m.status || 'Disponible'
    tdStatus.appendChild(statusBadge)

    const tdActions = document.createElement('td')
    const btnEditRow = document.createElement('button')
    btnEditRow.className = 'btn btn-sm btn-primary me-2'
    btnEditRow.innerHTML = '<i class="bi bi-pencil" aria-hidden="true"></i>'
    btnEditRow.title = 'Editar'
    btnEditRow.addEventListener('click', () => editMaidModal(m))

    const btnDelRow = document.createElement('button')
    btnDelRow.className = 'btn btn-sm btn-danger'
    btnDelRow.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i>'
    btnDelRow.title = 'Eliminar'
    btnDelRow.addEventListener('click', async () => {
      const ok = await confirmAction(
        '¿Eliminar camarera ' +
          (m.name || '') +
          '? Esto quitará la asignación en habitaciones.'
      )
      if (!ok) return
      const roomsAll = await getAll('rooms').catch(() => [])
      for (const room of roomsAll) {
        if (room.maid === (m.id || m.email)) {
          room.maid = null
          await put('rooms', room)
        }
      }
      await del('maids', m.id || m.email)
      await renderAll()
    })

    tdActions.appendChild(btnEditRow)
    tdActions.appendChild(btnDelRow)

    tr.appendChild(tdName)
    tr.appendChild(tdEmail)
    tr.appendChild(tdStatus)
    tr.appendChild(tdActions)
    tbody.appendChild(tr)
  }

  table.appendChild(tbody)
  maidsContainer.appendChild(table)
  maidsList.appendChild(maidsContainer)
  // pager for maids
  const maidsPager = document.createElement('div')
  maidsPager.className = 'pager'
  const prevM = document.createElement('button')
  prevM.textContent = '←'
  prevM.disabled = maidsPage === 0
  prevM.addEventListener('click', () => {
    maidsPage = Math.max(0, maidsPage - 1)
    renderAll()
  })
  const nextM = document.createElement('button')
  nextM.textContent = '→'
  nextM.disabled = maidsStart + MAIDS_PER_PAGE >= totalMaids
  nextM.addEventListener('click', () => {
    if (maidsStart + MAIDS_PER_PAGE < totalMaids) {
      maidsPage++
      renderAll()
    }
  })
  const infoM = document.createElement('span')
  infoM.textContent = `Página ${maidsPage + 1} / ${Math.max(
    1,
    Math.ceil(totalMaids / MAIDS_PER_PAGE)
  )}`
  maidsPager.appendChild(prevM)
  maidsPager.appendChild(infoM)
  maidsPager.appendChild(nextM)
  maidsList.parentNode.insertBefore(maidsPager, maidsList.nextSibling)

  // Render informes en la tabla (paginados)
  reportsEl.innerHTML = ''
  const sorted = (reports || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const totalReports = sorted.length
  const reportsStart = reportsPage * REPORTS_PER_PAGE
  const reportsPageItems = sorted.slice(
    reportsStart,
    reportsStart + REPORTS_PER_PAGE
  )
  for (const rep of reportsPageItems) {
    const tr = document.createElement('tr');
    const date = rep.createdAt ? new Date(rep.createdAt).toLocaleString() : '';
    const room = rep.roomId || '';
    const subject = rep.subject || '—';
    const desc = rep.description || '(sin descripción)';
    const tdDate = document.createElement('td');
    tdDate.textContent = date;
    const tdRoom = document.createElement('td');
    tdRoom.textContent = room;
    // intentar resolver la camarera del reporte
    const tdMaid = document.createElement('td');
    let maidDisplay = '';
    if (rep.maidId) {
      const found = maids.find((m) => (m.id || m.email) === rep.maidId)
      maidDisplay = found ? found.name || found.email || found.id : rep.maidId
    } else if (rep.createdBy && rep.createdBy !== 'recepcion') {
      const found = maids.find((m) => (m.id || m.email) === rep.createdBy)
      maidDisplay = found
        ? found.name || found.email || found.id
        : rep.createdBy
    } else if (Array.isArray(rep.maids) && rep.maids.length) {
      maidDisplay = rep.maids
        .map((x) => {
          const f = maids.find((m) => (m.id || m.email) === x)
          return f ? f.name || f.email || f.id : x
        })
        .join(', ')
    } else {
      maidDisplay = rep.createdBy || '—'
    }
    tdMaid.textContent = maidDisplay

    const tdSubject = document.createElement('td')
    tdSubject.textContent = subject
    tdSubject.style.fontWeight = '600'

    const tdDesc = document.createElement('td');
    // limitar texto a 150 caracteres visuales
    tdDesc.textContent = desc.length > 150 ? desc.slice(0, 147) + '...' : desc;
    const tdImgs = document.createElement('td');
    if (rep.images && rep.images.length) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm view-img-btn';
      btn.innerHTML = `<i class="bi bi-image"></i> Ver imágenes (${rep.images.length})`;
      btn.addEventListener('click', () => {
        if (window.openImagesModal) window.openImagesModal(rep.images);
      });
      tdImgs.appendChild(btn);
    } else {
      tdImgs.textContent = '—';
    }

    tr.appendChild(tdDate);
    tr.appendChild(tdRoom);
    tr.appendChild(tdMaid);
    tr.appendChild(tdSubject);
    tr.appendChild(tdDesc);
    tr.appendChild(tdImgs);
    reportsEl.appendChild(tr);
  }

  // Función auxiliar para mostrar modal con detalle completo del reporte
  function showReportSummaryModal(rep, maidsList) {
    const date = rep.createdAt ? new Date(rep.createdAt).toLocaleString() : '—';
    const room = rep.roomId || '—';
    let maidDisplay = '—';
    if (rep.maidId) {
      const found = maidsList.find(m => (m.id || m.email) === rep.maidId);
      maidDisplay = found ? (found.name || found.email || found.id) : rep.maidId;
    } else if (rep.createdBy && rep.createdBy !== 'recepcion') {
      const found = maidsList.find(m => (m.id || m.email) === rep.createdBy);
      maidDisplay = found ? (found.name || found.email || found.id) : rep.createdBy;
    } else if (Array.isArray(rep.maids) && rep.maids.length) {
      maidDisplay = rep.maids
        .map(x => {
          const f = maidsList.find(m => (m.id || m.email) === x);
          return f ? (f.name || f.email || f.id) : x;
        })
        .join(', ');
    } else {
      maidDisplay = rep.createdBy || '—';
    }

    modal.classList.remove('hidden');
    modal.innerHTML = `<div class="modal-content" role="dialog">
      <h3>Detalle del reporte</h3>
      <p><strong>Fecha:</strong> ${date}</p>
      <p><strong>Habitación:</strong> ${room}</p>
      <p><strong>Camarera:</strong> ${maidDisplay}</p>
      <p><st  rong>Tema:</strong> ${rep.subject || '—'}</p>
      <p><strong>Descripción:</strong></p>
      <p style="white-space:pre-wrap;">${rep.description || '(sin descripción)'}</p>
      <div id="reportImages" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
      </div>
      <div class="row" style="margin-top:12px;justify-content:flex-end;"><button id="closeModalReport" class="btn btn-secondary">Cerrar</button></div>
    </div>`;

    const imgsContainer = document.getElementById('reportImages');
    if (rep.images && rep.images.length) {
      rep.images.forEach((src, idx) => {
        const d = document.createElement('div');
        d.style.width = '100px';
        d.style.height = '80px';
        d.style.border = '1px solid #ddd';
        d.style.borderRadius = '6px';
        d.style.overflow = 'hidden';
        d.style.cursor = 'pointer';
        const img = document.createElement('img');
        img.src = src;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        d.appendChild(img);
        d.onclick = () => { if (window.openImagesModal) window.openImagesModal(rep.images); };
        imgsContainer.appendChild(d);
      });
    } else {
      imgsContainer.textContent = '(sin imágenes)';
    }

    document.getElementById('closeModalReport').onclick = () => modal.classList.add('hidden');
  }
  // pagination controls for reports (centrada en #reportsPager)
  const reportsPagerEl = document.getElementById('reportsPager')
  if (reportsPagerEl) {
    reportsPagerEl.innerHTML = ''
    const prevReports = document.createElement('button')
    prevReports.textContent = '←'
    prevReports.disabled = reportsPage === 0
    prevReports.addEventListener('click', () => {
      reportsPage = Math.max(0, reportsPage - 1)
      renderAll()
    })
    const nextReports = document.createElement('button')
    nextReports.textContent = '→'
    nextReports.disabled = reportsStart + REPORTS_PER_PAGE >= totalReports
    nextReports.addEventListener('click', () => {
      if (reportsStart + REPORTS_PER_PAGE < totalReports) {
        reportsPage++
        renderAll()
      }
    })
    const infoReports = document.createElement('span')
    infoReports.textContent = `Página ${reportsPage + 1} / ${Math.max(
      1,
      Math.ceil(totalReports / REPORTS_PER_PAGE)
    )}`
    reportsPagerEl.appendChild(prevReports)
    reportsPagerEl.appendChild(infoReports)
    reportsPagerEl.appendChild(nextReports)
  }
}

async function addRoomModal() {
  const allMaids = (await getAll('maids').catch(() => [])) || []
  const maidOptions = allMaids
    .map((m) => {
      const id = m.id || m.email || ''
      const label =
        (m.name || id) +
        ((m.status || '').toLowerCase().includes('no')
          ? ' (No disponible)'
          : '')
      const disabled = (m.status || '').toLowerCase().includes('no')
        ? 'disabled'
        : ''
      return `<option value="${id}" ${disabled}>${label}</option>`
    })
    .join('')

  // Limpiar estilos inline previos para asegurar que el modal se muestre correctamente
  modal.style.display = ''
  modal.classList.remove('hidden')
  modal.innerHTML = `<div class="modal-content" role="dialog"><h3>Nueva Habitación</h3><label>Número de habitación</label><input id="newRoomNumber" required /><label>Estado</label><select id="newRoomStatus"><option value="Limpia">Limpia</option><option value="Sucio">Sucio</option><option value="Bloqueada">Bloqueada</option></select><label>Asignar camarera</label><select id="newRoomMaid" required>${maidOptions}</select><label class="inline-check"><input type="checkbox" id="newRoomRented" /> <span>Ocupada</span></label><div class="row"><button id="saveRoom">Guardar</button><button id="closeModal">Cerrar</button></div></div>`
  document.getElementById('closeModal').onclick = () =>
    modal.classList.add('hidden')
  // style buttons
  const saveRoomBtn = document.getElementById('saveRoom')
  const closeRoomBtn = document.getElementById('closeModal')
  if (saveRoomBtn) saveRoomBtn.className = 'btn btn-primary'
  if (closeRoomBtn) closeRoomBtn.className = 'btn btn-secondary'

  document.getElementById('saveRoom').onclick = async () => {
    const id = document.getElementById('newRoomNumber').value.trim()
    const status = document.getElementById('newRoomStatus').value
    const maidId = document.getElementById('newRoomMaid').value
    const rented = document.getElementById('newRoomRented').checked
    if (!id) return alert('Id requerido')
    if (!maidId) return alert('Debe asignar una camarera')
    await put('rooms', {
      id,
      status: status || 'Limpia',
      maid: maidId,
      rented: !!rented,
    })
    modal.classList.add('hidden')
    await renderAll()
  }
}

async function editRoomModal(room) {
  const allMaids = (await getAll('maids').catch(() => [])) || []
  const maidOptions = allMaids
    .map((m) => {
      const id = m.id || m.email || ''
      const label =
        (m.name || id) +
        ((m.status || '').toLowerCase().includes('no')
          ? ' (No disponible)'
          : '')
      const sel = room.maid && room.maid === id ? 'selected' : ''
      const disabled = (m.status || '').toLowerCase().includes('no')
        ? 'disabled'
        : ''
      return `<option value="${id}" ${sel} ${disabled}>${label}</option>`
    })
    .join('')

  // Limpiar estilos inline previos para asegurar que el modal se muestre correctamente
  modal.style.display = ''
  modal.classList.remove('hidden')
  modal.innerHTML = `<div class="modal-content" role="dialog"><h3>Editar Habitación ${room.id}</h3><label>Estado</label><select id="editRoomStatus"><option value="Limpia">Limpia</option><option value="Sucio">Sucio</option><option value="Bloqueada">Bloqueada</option></select><label>Asignar camarera (opcional)</label><select id="editRoomMaid"><option value="">-- Sin asignar --</option>${maidOptions}</select><label class="inline-check"><input type="checkbox" id="editRoomRented" /> <span>Ocupada</span></label><div class="row"><button id="saveEditRoom">Guardar</button><button id="closeModal">Cerrar</button></div></div>`
  const statusEl = document.getElementById('editRoomStatus')
  if (statusEl) statusEl.value = room.status || 'Limpia'
  const rentedEl = document.getElementById('editRoomRented')
  if (rentedEl) rentedEl.checked = !!room.rented
  const maidEl = document.getElementById('editRoomMaid')
  if (maidEl) maidEl.value = room.maid || ''
  const saveBtn = document.getElementById('saveEditRoom')
  const closeBtn = document.getElementById('closeModal')
  if (saveBtn) saveBtn.className = 'btn btn-primary'
  if (closeBtn) closeBtn.className = 'btn btn-secondary'
  document.getElementById('closeModal').onclick = () =>
    modal.classList.add('hidden')
  document.getElementById('saveEditRoom').onclick = async () => {
    const newStatus =
      document.getElementById('editRoomStatus').value || 'Limpia'
    const newMaid = document.getElementById('editRoomMaid').value || null
    const newRented = document.getElementById('editRoomRented').checked
    room.status = newStatus
    room.maid = newMaid
    room.rented = !!newRented
    await put('rooms', room)
    modal.classList.add('hidden')
    await renderAll()
  }
}

function addMaidModal() {
  // Limpiar estilos inline previos para asegurar que el modal se muestre correctamente
  modal.style.display = ''
  modal.classList.remove('hidden')
  modal.innerHTML = `<div class="modal-content" role="dialog">
    <h3>Nueva Camarera</h3>
    <label for="maidName">Nombre</label>
    <input id="maidName" required/>
    <label for="maidEmail">Correo</label>
    <input id="maidEmail" type="email" required/>
    <label for="maidPassword">Contraseña (opcional)</label>
    <input id="maidPassword" type="password" placeholder="Opcional" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" />
    <div class="row" style="justify-content:flex-end; gap:8px; margin-top:6px;">
      <button id="pwdSelect" type="button" class="btn btn-sm btn-outline-secondary">Seleccionar</button>
    </div>
    <label for="maidStatus">Estado</label>
    <select id="maidStatus"><option value="Disponible">Disponible</option><option value="No disponible">No disponible</option></select>
    <div class="row"><button id="saveMaid">Guardar</button><button id="closeModal">Cerrar</button></div>
  </div>`
  document.getElementById('closeModal').onclick = () =>
    modal.classList.add('hidden')
  // style buttons
  const saveMaidBtn = document.getElementById('saveMaid')
  const closeMaidBtn = document.getElementById('closeModal')
  if (saveMaidBtn) saveMaidBtn.className = 'btn btn-primary'
  if (closeMaidBtn) closeMaidBtn.className = 'btn btn-secondary'

  // Controles de contraseña: mostrar/ocultar y seleccionar
  const pwdInput = document.getElementById('maidPassword')
  const pwdToggle = document.getElementById('pwdToggle')
  const pwdSelect = document.getElementById('pwdSelect')
  if (pwdToggle && pwdInput) {
    pwdToggle.onclick = () => {
      pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password'
      pwdToggle.textContent =
        pwdInput.type === 'password' ? 'Mostrar' : 'Ocultar'
      pwdInput.focus()
    }
  }
  if (pwdSelect && pwdInput) {
    pwdSelect.onclick = () => {
      pwdInput.focus()
      pwdInput.select()
      try {
        document.execCommand('copy')
      } catch (_) {}
    }
  }

  document.getElementById('saveMaid').onclick = async () => {
    const name = document.getElementById('maidName').value.trim()
    const email = document.getElementById('maidEmail').value.trim()
    const password = document.getElementById('maidPassword').value.trim()
    const status = document.getElementById('maidStatus').value || 'Disponible'

    if (!email || !name) return alert('Nombre y correo requeridos')

    // Guardamos usando el correo como id (clave).
    const id = email
    const record = { id, name, email, status }

    // Solo agregar password si no está vacío
    if (password) {
      record.password = password
    }

    await put('maids', record)
    modal.classList.add('hidden')
    await renderAll()
  }
}

function editMaidModal(maid) {
  // Limpiar estilos inline previos para asegurar que el modal se muestre correctamente
  modal.style.display = ''
  modal.classList.remove('hidden')
  modal.innerHTML = `
    <div class="modal-content" role="dialog">
      <h3>Editar Camarera</h3>

      <label>Nombre</label>
      <input id="editMaidName" value="${maid.name || ''}" required/>

      <label>Correo</label>
      <input id="editMaidEmail" type="email"
             value="${maid.email || maid.id || ''}" required/>

      <label for="editMaidPassword">Nueva Contraseña (opcional)</label>
      <input id="editMaidPassword" type="password" placeholder="Dejar vacío para no cambiar" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false"/>
      <div class="row" style="justify-content:flex-end; gap:8px; margin-top:6px;">
        <button id="editPwdToggle" type="button" class="btn btn-sm btn-secondary">Mostrar</button>
        <button id="editPwdSelect" type="button" class="btn btn-sm btn-outline-secondary">Seleccionar</button>
      </div>

      <label>Estado</label>
      <select id="editMaidStatus">
        <option value="Disponible">Disponible</option>
        <option value="No disponible">No disponible</option>
        <option value="Ocupado">Ocupado</option>
      </select>

      <div class="row">
        <button id="saveEditMaid">Guardar</button>
        <button id="closeModal">Cerrar</button>
      </div>
    </div>`

  document.getElementById('closeModal').onclick = () =>
    modal.classList.add('hidden')

  const statusEl = document.getElementById('editMaidStatus')
  statusEl.value = maid.status || 'Disponible'

  const saveBtn = document.getElementById('saveEditMaid')
  saveBtn.className = 'btn btn-primary'
  document.getElementById('closeModal').className = 'btn btn-secondary'

  // Controles de contraseña en edición
  const editPwdInput = document.getElementById('editMaidPassword')
  const editPwdToggle = document.getElementById('editPwdToggle')
  const editPwdSelect = document.getElementById('editPwdSelect')
  if (editPwdToggle && editPwdInput) {
    editPwdToggle.onclick = () => {
      editPwdInput.type = editPwdInput.type === 'password' ? 'text' : 'password'
      editPwdToggle.textContent =
        editPwdInput.type === 'password' ? 'Mostrar' : 'Ocultar'
      editPwdInput.focus()
    }
  }
  if (editPwdSelect && editPwdInput) {
    editPwdSelect.onclick = () => {
      editPwdInput.focus()
      editPwdInput.select()
      try {
        document.execCommand('copy')
      } catch (_) {}
    }
  }

  document.getElementById('saveEditMaid').onclick = async () => {
    const name = document.getElementById('editMaidName').value.trim()
    const newEmail = document.getElementById('editMaidEmail').value.trim()
    const newPassword = document.getElementById('editMaidPassword').value // NO trim para detectar si está vacío
    const status = document.getElementById('editMaidStatus').value

    if (!name || !newEmail) return alert('Nombre y correo requeridos')

    const oldId = maid.id || maid.email
    const newId = newEmail

    // Determinar password: si hay nueva usa esa, si no mantiene la anterior
    const finalPassword =
      newPassword && newPassword.trim() ? newPassword.trim() : maid.password

    // si cambió el correo
    if (newId !== oldId) {
      const allMaids = (await getAll('maids').catch(() => [])) || []
      const exists = allMaids.find((x) => (x.id || x.email) === newId)
      if (exists) return alert('Ya existe una camarera con ese correo')

      const newRecord = {
        ...maid,
        id: newId,
        email: newId,
        name,
        status,
      }

      // Solo agregar password si existe
      if (finalPassword) {
        newRecord.password = finalPassword
      }

      await put('maids', newRecord)

      // actualizar habitaciones
      const roomsAll = await getAll('rooms').catch(() => [])
      for (const room of roomsAll) {
        if (room.maid === oldId) {
          room.maid = newId
          await put('rooms', room)
        }
      }

      await del('maids', oldId)
    } else {
      // mismo ID
      const updated = {
        ...maid,
        id: newId,
        email: newId,
        name,
        status,
      }

      // Solo agregar password si existe
      if (finalPassword) {
        updated.password = finalPassword
      }

      await put('maids', updated)
    }

    modal.classList.add('hidden')
    await renderAll()
  }
}

async function openReportModal(room) {
  // traer camareras para el select
  const allMaids = (await getAll('maids').catch(() => [])) || []
  // Limpiar estilos inline previos para asegurar que el modal se muestre correctamente
  modal.style.display = ''
  modal.classList.remove('hidden')
  const options = ['<option value="">Seleccionar camarera</option>']
    .concat(
      allMaids.map((m) => {
        const id = m.id || m.email || ''
        const label =
          (m.name || id) +
          ((m.status || '').toLowerCase().includes('no')
            ? ' (No disponible)'
            : '')
        const sel = room.maid && room.maid === id ? 'selected' : ''
        const disabled = (m.status || '').toLowerCase().includes('no')
          ? 'disabled'
          : ''
        return `<option value="${id}" ${sel} ${disabled}>${label}</option>`
      })
    )
    .join('')

  modal.innerHTML = `
    <div class="modal-content" role="dialog">
      <h3>Siniestro - Hab ${room.id}</h3>
      <label>Camarera</label>
      <select id="reportMaid">${options}</select>
      <label>Descripción</label>
      <textarea id="desc"></textarea>
      <label>Fotos (máx 3)</label>
      <input id="files" type="file" accept="image/*" multiple />
      <div class="row"><button id="send">Enviar</button><button id="close">Cerrar</button></div>
    </div>`

  document.getElementById('close').onclick = () => modal.classList.add('hidden')

  document.getElementById('send').onclick = async () => {
    const desc = document.getElementById('desc').value.trim()
    const selectedMaid = document.getElementById('reportMaid').value || null
    const files = document.getElementById('files').files
    if (!desc) return alert('Descripción requerida')
    const images = []
    for (let i = 0; i < Math.min(3, files.length); i++)
      images.push(await toBase64(files[i]))
    const report = {
      _id: 'r_' + Date.now(),
      roomId: room.id,
      maidId: selectedMaid,
      description: desc,
      images,
      createdAt: new Date().toISOString(),
      createdBy: selectedMaid || 'recepcion',
    }
    // marcar habitación como bloqueada (valor en español)
    room.status = 'Bloqueada'
    await put('rooms', room)
    await put('reports', report)
    modal.classList.add('hidden')
    await renderAll()
  }
}

// simple confirm modal that returns a Promise<boolean>
function confirmAction(message) {
  return new Promise((res) => {
    // Limpiar cualquier estilo inline previo que pueda interferir
    modal.style.display = ''
    modal.classList.remove('hidden')
    modal.innerHTML = `<div class="modal-content" role="dialog">
      <h4>Confirmar</h4>
      <p>${message}</p>
      <div class="row" style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
        <button id="confirmYes" class="btn btn-primary">Sí</button>
        <button id="confirmNo" class="btn btn-secondary">No</button>
      </div>
    </div>`

    const btnYes = document.getElementById('confirmYes')
    const btnNo = document.getElementById('confirmNo')

    if (btnNo) {
      btnNo.onclick = () => {
        modal.classList.add('hidden')
        res(false)
      }
    }

    if (btnYes) {
      btnYes.onclick = () => {
        modal.classList.add('hidden')
        res(true)
      }
    }
  })
}

// Guardar layout (pisos / habitaciones)
if (btnSaveLayout) {
  btnSaveLayout.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const floors = parseInt(layoutFloorsInput?.value || '0', 10)
    const roomsPerFloor = parseInt(layoutRoomsInput?.value || '0', 10)
    if (!floors || floors < 1) return alert('Ingresa el número de pisos')
    if (!roomsPerFloor || roomsPerFloor < 1)
      return alert('Ingresa habitaciones por piso')
    await saveLayoutSettings(floors, roomsPerFloor)
    const created = await ensureRoomsFromLayout(floors, roomsPerFloor)
    if (layoutStatus)
      layoutStatus.textContent = `Guardado: ${floors} pisos x ${roomsPerFloor} hab. (${created} nuevas)`
    await renderAll()
  })
}

// Enlazar botones con soporte táctil mejorado
if (btnAddRoom) {
  btnAddRoom.addEventListener(
    'click',
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      console.log('btnAddRoom clicked')
      addRoomModal()
    },
    { passive: false }
  )

  // Agregar soporte táctil explícito para móviles
  btnAddRoom.addEventListener(
    'touchend',
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      console.log('btnAddRoom touched')
      addRoomModal()
    },
    { passive: false }
  )
}

if (btnAddMaid) {
  btnAddMaid.addEventListener(
    'click',
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      console.log('btnAddMaid clicked')
      addMaidModal()
    },
    { passive: false }
  )

  // Agregar soporte táctil explícito para móviles
  btnAddMaid.addEventListener(
    'touchend',
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      console.log('btnAddMaid touched')
      addMaidModal()
    },
    { passive: false }
  )
}

// Cerrar modal al clicar fuera
if (modal)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden')
  })

// Cerrar modal con ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal && !modal.classList.contains('hidden'))
    modal.classList.add('hidden')
})

// =====================
// Menú de navegación
// =====================
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const section = item.dataset.section
    scrollToSection(section)
  })
})

function scrollToSection(section) {
  const sectionMap = {
    'rooms': roomsList.closest('.card'),
    'maids': maidsList.closest('.card'),
    'reports': reportsEl.closest('.card')
  }
  
  const targetSection = sectionMap[section]
  if (targetSection) {
    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// Inicializar: cargar layout (si existe), asegurar habitaciones y renderizar
;(async () => {
  await loadLayoutSettings()
  if (layoutSettings?.floors && layoutSettings?.roomsPerFloor) {
    await ensureRoomsFromLayout(layoutSettings.floors, layoutSettings.roomsPerFloor)
  }
  await renderAll()
})()