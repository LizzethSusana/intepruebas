// =====================
// MÓDULO DE HABITACIONES
// =====================

import { getAll, put, del } from '../../idb.js'
import { ITEMS_PER_PAGE, ROOM_STATUS } from '../shared/constants.js'
import { getStatusKey, padRoom } from '../shared/utils.js'
import { confirmAction, showModal, hideModal, getModal } from '../shared/modal.js'
import { openRoomEditModal, openRoomAddModal } from './rooms-modal.js'

let roomsPage = 0

/**
 * Renderiza la lista de habitaciones
 * @param {HTMLElement} roomsList
 * @param {Array} rooms
 * @param {Array} maids
 */
export async function renderRooms(roomsList, rooms, maids) {
  roomsList.innerHTML = ''
  const totalRooms = rooms.length
  const roomsStart = roomsPage * ITEMS_PER_PAGE
  const roomsPageItems = rooms.slice(roomsStart, roomsStart + ITEMS_PER_PAGE)

  for (const r of roomsPageItems) {
    const card = createRoomCard(r, maids)
    roomsList.appendChild(card)
  }

  // Crear paginador
  createRoomsPaginator(roomsList, totalRooms, roomsStart)
}

/**
 * Crea una tarjeta de habitación
 * @param {Object} room
 * @param {Array} maids
 * @returns {HTMLElement}
 */
function createRoomCard(room, maids) {
  const card = document.createElement('div')
  card.className = 'card room-card'

  const info = document.createElement('div')
  info.className = 'info'

  const key = getStatusKey(room.status)
  const badge = document.createElement('span')
  badge.className = `status-badge ${key}`
  badge.textContent = room.status || 'Limpia'

  const h3 = document.createElement('h3')
  h3.textContent = `Hab ${room.id}`

  info.appendChild(h3)
  info.appendChild(badge)

  // Mostrar quién limpió si está limpia
  if (room.cleanedBy && key === 'clean') {
    const cleanedByDiv = document.createElement('div')
    cleanedByDiv.className = 'cleaned-by'
    cleanedByDiv.style.color = '#2e8b57'
    cleanedByDiv.style.fontWeight = '500'
    cleanedByDiv.style.fontSize = '0.9em'
    cleanedByDiv.style.marginTop = '4px'
    cleanedByDiv.textContent = `Aseada por: ${room.cleanedBy}`
    info.appendChild(cleanedByDiv)
  }

  // Mostrar detalles si no está bloqueada
  if (key !== 'blocked') {
    const occ = document.createElement('div')
    occ.className = 'occ'
    occ.textContent = room.rented ? 'Ocupada' : 'Disponible'
    info.appendChild(occ)

    const assigned = createMaidSelector(room, maids)
    info.appendChild(assigned)
  }

  const actions = createRoomActions(room)
  card.appendChild(info)
  card.appendChild(actions)

  return card
}

/**
 * Crea el selector de camarera
 * @param {Object} room
 * @param {Array} maids
 * @returns {HTMLElement}
 */
function createMaidSelector(room, maids) {
  const assigned = document.createElement('div')
  assigned.className = 'assigned'
  const label = document.createElement('div')
  label.textContent = 'Camarera:'
  assigned.appendChild(label)

  const sel = document.createElement('select')
  sel.innerHTML = `<option value="">-- Sin asignar --</option>` + maids
    .map((m) => {
      const disabled = (m.status || '').toLowerCase().includes('no')
        ? 'disabled'
        : ''
      const selected = room.maid === (m.id || m.email) ? 'selected' : ''
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
    if (!selected) {
      room.maid = null
      await put('rooms', room)
      location.reload()
      return
    }
    const chosen = maids.find((m) => (m.id || m.email) === selected)
    if (chosen && (chosen.status || '').toLowerCase().includes('no')) {
      alert('La camarera no está disponible')
      sel.value = room.maid || ''
      return
    }
    room.maid = selected
    await put('rooms', room)
    location.reload()
  })

  assigned.appendChild(sel)
  return assigned
}

/**
 * Crea los botones de acción para una habitación
 * @param {Object} room
 * @returns {HTMLElement}
 */
function createRoomActions(room) {
  const actions = document.createElement('div')
  actions.className = 'actions'

  const btnEditRoom = document.createElement('button')
  btnEditRoom.className = 'btn btn-sm btn-primary'
  btnEditRoom.innerHTML = '<i class="bi bi-pencil" aria-hidden="true"></i>'
  btnEditRoom.title = 'Editar habitación'
  btnEditRoom.addEventListener('click', () => openRoomEditModal(room))
  actions.appendChild(btnEditRoom)

  // Botón habilitar si está bloqueada
  if (getStatusKey(room.status) === 'blocked') {
    const btn = document.createElement('button')
    btn.className = 'btn btn-sm btn-success'
    btn.textContent = 'Habilitar'
    btn.title = 'Habilitar habitación (se marcará como Sucio)'
    btn.addEventListener('click', async () => {
      const ok = await confirmAction(
        `¿Habilitar la habitación ${room.id}? Se marcará como "Sucio".`
      )
      if (!ok) return
      room.status = ROOM_STATUS.DIRTY
      await put('rooms', room)
      location.reload()
    })
    actions.appendChild(btn)
  }

  return actions
}

/**
 * Crea el paginador de habitaciones
 * @param {HTMLElement} roomsList
 * @param {number} totalRooms
 * @param {number} roomsStart
 */
function createRoomsPaginator(roomsList, totalRooms, roomsStart) {
  const roomsPager = document.createElement('div')
  roomsPager.className = 'pager'

  const prevRooms = document.createElement('button')
  prevRooms.textContent = '←'
  prevRooms.disabled = roomsPage === 0
  prevRooms.addEventListener('click', () => {
    roomsPage = Math.max(0, roomsPage - 1)
    location.reload()
  })

  const nextRooms = document.createElement('button')
  nextRooms.textContent = '→'
  nextRooms.disabled = roomsStart + ITEMS_PER_PAGE >= totalRooms
  nextRooms.addEventListener('click', () => {
    if (roomsStart + ITEMS_PER_PAGE < totalRooms) {
      roomsPage++
      location.reload()
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
}

/**
 * Obtiene la página actual de habitaciones
 * @returns {number}
 */
export function getRoomsPage() {
  return roomsPage
}

/**
 * Establece la página de habitaciones
 * @param {number} page
 */
export function setRoomsPage(page) {
  roomsPage = page
}

/**
 * Carga la configuración de layout y asegura que existan las habitaciones
 * @param {number} floors
 * @param {number} roomsPerFloor
 * @returns {Promise<number>} Número de habitaciones creadas
 */
export async function ensureRoomsFromLayout(floors, roomsPerFloor) {
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
