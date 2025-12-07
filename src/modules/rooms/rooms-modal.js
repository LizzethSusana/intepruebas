// =====================
// MODALES DE HABITACIONES
// =====================

import { getAll, put } from '../../idb.js'
import { ROOM_STATUS } from '../shared/constants.js'
import { showModal, hideModal, getModal } from '../shared/modal.js'

/**
 * Abre el modal de agregar habitación
 */
export async function openRoomAddModal() {
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

  const modal = getModal()
  showModal()
  modal.innerHTML = `
    <div class="modal-content" role="dialog">
      <h3>Nueva Habitación</h3>
      <label>Número de habitación</label>
      <input id="newRoomNumber" required />
      <label>Estado</label>
      <select id="newRoomStatus">
        <option value="Limpia">Limpia</option>
        <option value="Sucio">Sucio</option>
        <option value="Bloqueada">Bloqueada</option>
      </select>
      <label>Asignar camarera</label>
      <select id="newRoomMaid" required>${maidOptions}</select>
      <label class="inline-check"><input type="checkbox" id="newRoomRented" /> <span>Ocupada</span></label>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
        <button id="saveRoom" class="btn btn-sm btn-primary">Guardar</button>
        <button id="closeModal" class="btn btn-sm btn-secondary">Cerrar</button>
      </div>
    </div>`

  document.getElementById('closeModal').onclick = () => hideModal()

  document.getElementById('saveRoom').onclick = async () => {
    const id = document.getElementById('newRoomNumber').value.trim()
    const status = document.getElementById('newRoomStatus').value
    const maidId = document.getElementById('newRoomMaid').value
    const rented = document.getElementById('newRoomRented').checked

    if (!id) return alert('Id requerido')
    if (!maidId) return alert('Debe asignar una camarera')

    await put('rooms', {
      id,
      status: status || ROOM_STATUS.CLEAN,
      maid: maidId,
      rented: !!rented,
    })

    hideModal()
    location.reload()
  }
}

/**
 * Abre el modal de editar habitación
 * @param {Object} room
 */
export async function openRoomEditModal(room) {
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

  const modal = getModal()
  showModal()
  modal.innerHTML = `
    <div class="modal-content" role="dialog">
      <h3>Editar Habitación ${room.id}</h3>
      <label>Estado</label>
      <select id="editRoomStatus">
        <option value="Limpia">Limpia</option>
        <option value="Sucio">Sucio</option>
        <option value="Bloqueada">Bloqueada</option>
      </select>
      <label>Asignar camarera (opcional)</label>
      <select id="editRoomMaid">
        <option value="">-- Sin asignar --</option>
        ${maidOptions}
      </select>
      <label class="inline-check"><input type="checkbox" id="editRoomRented" /> <span>Ocupada</span></label>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
        <button id="saveEditRoom" class="btn btn-sm btn-primary">Guardar</button>
        <button id="closeModal" class="btn btn-sm btn-secondary">Cerrar</button>
      </div>
    </div>`

  const statusEl = document.getElementById('editRoomStatus')
  if (statusEl) statusEl.value = room.status || ROOM_STATUS.CLEAN

  const rentedEl = document.getElementById('editRoomRented')
  if (rentedEl) rentedEl.checked = !!room.rented

  const maidEl = document.getElementById('editRoomMaid')
  if (maidEl) maidEl.value = room.maid || ''

  document.getElementById('closeModal').onclick = () => hideModal()

  document.getElementById('saveEditRoom').onclick = async () => {
    const newStatus = document.getElementById('editRoomStatus').value || ROOM_STATUS.CLEAN
    const newMaid = document.getElementById('editRoomMaid').value || null
    const newRented = document.getElementById('editRoomRented').checked

    room.status = newStatus
    room.maid = newMaid
    room.rented = !!newRented

    await put('rooms', room)
    hideModal()
    location.reload()
  }
}
