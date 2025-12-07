// =====================
// FUNCIONES DE MODAL COMPARTIDAS
// =====================

let modal = null

/**
 * Inicializa la referencia al modal
 * @param {HTMLElement} modalElement
 */
export function initModal(modalElement) {
  modal = modalElement
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideModal()
    })
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden'))
      hideModal()
  })
}

/**
 * Muestra el modal
 */
export function showModal() {
  if (modal) {
    modal.style.display = 'flex'
    modal.classList.remove('hidden')
  }
}

/**
 * Oculta el modal
 */
export function hideModal() {
  if (modal) {
    modal.classList.add('hidden')
  }
}

/**
 * Obtiene la referencia del modal
 * @returns {HTMLElement}
 */
export function getModal() {
  return modal
}

/**
 * Modal de confirmación que devuelve una Promesa<boolean>
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function confirmAction(message) {
  return new Promise((res) => {
    showModal()
    const mdl = getModal()
    mdl.innerHTML = `<div class="modal-content" role="dialog">
      <h4>Confirmar</h4>
      <p>${message}</p>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
        <button id="confirmYes" class="btn btn-sm btn-primary">Sí</button>
        <button id="confirmNo" class="btn btn-sm btn-secondary">No</button>
      </div>
    </div>`

    const btnYes = document.getElementById('confirmYes')
    const btnNo = document.getElementById('confirmNo')

    if (btnNo) {
      btnNo.onclick = () => {
        hideModal()
        res(false)
      }
    }

    if (btnYes) {
      btnYes.onclick = () => {
        hideModal()
        res(true)
      }
    }
  })
}
