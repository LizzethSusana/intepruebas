// =====================
// MODALES DE CAMARERAS
// =====================

import { getAll, put } from '../../idb.js'
import { MAID_STATUS } from '../shared/constants.js'
import { showModal, hideModal, getModal } from '../shared/modal.js'

/**
 * Abre el modal para agregar una nueva camarera
 */
export async function openMaidAddModal() {
  const modal = getModal()
  showModal()
  modal.innerHTML = `
    <div class="modal-content" role="dialog">
      <h3>Nueva Camarera</h3>
      <label for="maidName">Nombre</label>
      <input id="maidName" required/>
      <label for="maidEmail">Correo</label>
      <input id="maidEmail" type="email" required/>
      <label for="maidPassword">Contraseña</label>
      <div style="position: relative;">
        <input id="maidPassword" type="password" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" style="padding-right: 40px;" />
        <button id="pwdToggle" type="button" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1.2rem; color: #666; padding: 4px 8px;" title="Mostrar/Ocultar contraseña">
          <i class="bi bi-eye-slash" id="pwdEye"></i>
        </button>
      </div>
      <label for="maidStatus">Estado</label>
      <select id="maidStatus"><option value="Disponible">Disponible</option><option value="No disponible">No disponible</option></select>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
        <button id="saveMaid" class="btn btn-sm btn-primary">Guardar</button>
        <button id="closeModal" class="btn btn-sm btn-secondary">Cerrar</button>
      </div>
    </div>`

  setupPasswordToggle('pwdToggle', 'maidPassword', 'pwdEye')
  setupPasswordInputClick('maidPassword')

  document.getElementById('closeModal').onclick = () => hideModal()

  document.getElementById('saveMaid').onclick = async () => {
    const name = document.getElementById('maidName').value.trim()
    const email = document.getElementById('maidEmail').value.trim()
    const password = document.getElementById('maidPassword').value.trim()
    const status = document.getElementById('maidStatus').value || MAID_STATUS.AVAILABLE

    if (!email || !name) return alert('Nombre y correo requeridos')

    const id = email
    const record = { id, name, email, status }

    if (password) {
      record.password = password
    }

    await put('maids', record)
    hideModal()
    location.reload()
  }
}

/**
 * Abre el modal para editar una camarera existente
 * @param {Object} maid
 */
export async function openMaidEditModal(maid) {
  const modal = getModal()
  showModal()
  modal.innerHTML = `
    <div class="modal-content" role="dialog">
      <h3>Editar Camarera</h3>

      <label>Nombre</label>
      <input id="editMaidName" value="${maid.name || ''}" required/>

      <label>Correo</label>
      <input id="editMaidEmail" type="email"
             value="${maid.email || maid.id || ''}" required/>

      <label for="editMaidPassword">Nueva Contraseña (opcional)</label>
      <div style="position: relative;">
        <input id="editMaidPassword" type="password" placeholder="Nueva contraseña" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" style="padding-right: 40px;"/>
        <button id="editPwdToggle" type="button" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1.2rem; color: #666; padding: 4px 8px;" title="Mostrar/Ocultar contraseña">
          <i class="bi bi-eye-slash" id="editPwdEye"></i>
        </button>
      </div>

      <label>Estado</label>
      <select id="editMaidStatus">
        <option value="Disponible">Disponible</option>
        <option value="No disponible">No disponible</option>
        <option value="Ocupado">Ocupado</option>
      </select>

      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
        <button id="saveEditMaid" class="btn btn-sm btn-primary">Guardar</button>
        <button id="closeModal" class="btn btn-sm btn-secondary">Cerrar</button>
      </div>
    </div>`

  const statusEl = document.getElementById('editMaidStatus')
  statusEl.value = maid.status || MAID_STATUS.AVAILABLE

  setupPasswordToggle('editPwdToggle', 'editMaidPassword', 'editPwdEye')
  setupPasswordInputClick('editMaidPassword')

  document.getElementById('closeModal').onclick = () => hideModal()

  document.getElementById('saveEditMaid').onclick = async () => {
    const name = document.getElementById('editMaidName').value.trim()
    const newEmail = document.getElementById('editMaidEmail').value.trim()
    const newPassword = document.getElementById('editMaidPassword').value
    const status = document.getElementById('editMaidStatus').value

    if (!name || !newEmail) return alert('Nombre y correo requeridos')

    const oldId = maid.id || maid.email
    const newId = newEmail
    const finalPassword = newPassword && newPassword.trim() ? newPassword.trim() : maid.password

    // Si cambió el correo
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

      if (finalPassword) {
        newRecord.password = finalPassword
      }

      await put('maids', newRecord)

      // Actualizar habitaciones
      const roomsAll = await getAll('rooms').catch(() => [])
      for (const room of roomsAll) {
        if (room.maid === oldId) {
          room.maid = newId
          await put('rooms', room)
        }
      }

      // Eliminar antiguo registro
      const { del: delFn } = await import('../../idb.js')
      await delFn('maids', oldId)
    } else {
      // Mismo ID
      const updated = {
        ...maid,
        id: newId,
        email: newId,
        name,
        status,
      }

      if (finalPassword) {
        updated.password = finalPassword
      }

      await put('maids', updated)
    }

    hideModal()
    location.reload()
  }
}

/**
 * Configura el toggle del botón de contraseña
 * @param {string} toggleButtonId
 * @param {string} inputId
 * @param {string} iconId
 */
function setupPasswordToggle(toggleButtonId, inputId, iconId) {
  const pwdInput = document.getElementById(inputId)
  const pwdToggle = document.getElementById(toggleButtonId)
  const eyeIcon = document.getElementById(iconId)

  if (pwdToggle && pwdInput && eyeIcon) {
    pwdToggle.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const isPassword = pwdInput.type === 'password'
      pwdInput.type = isPassword ? 'text' : 'password'
      eyeIcon.className = isPassword ? 'bi bi-eye' : 'bi bi-eye-slash'
      pwdInput.focus()
    }
  }
}

/**
 * Hace el input de contraseña completamente clickeable
 * @param {string} inputId
 */
function setupPasswordInputClick(inputId) {
  const pwdInput = document.getElementById(inputId)
  if (pwdInput) {
    pwdInput.addEventListener('click', () => {
      pwdInput.focus()
    })
  }
}
