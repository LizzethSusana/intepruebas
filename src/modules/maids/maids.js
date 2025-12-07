// =====================
// MÓDULO DE CAMARERAS
// =====================

import { getAll, put, del } from '../../idb.js'
import { MAIDS_PER_PAGE, MAID_STATUS } from '../shared/constants.js'
import { getStatusKey, isMaidAvailable } from '../shared/utils.js'
import { confirmAction } from '../shared/modal.js'
import { openMaidAddModal, openMaidEditModal } from './maids-modal.js'

let maidsPage = 0

/**
 * Renderiza la tabla de camareras
 * @param {HTMLElement} maidsList
 * @param {Array} maids
 */
export async function renderMaids(maidsList, maids) {
  maidsList.innerHTML = ''
  const totalMaids = maids.length
  const maidsStart = maidsPage * MAIDS_PER_PAGE
  const maidsPageItems = maids.slice(maidsStart, maidsStart + MAIDS_PER_PAGE)

  const maidsContainer = document.createElement('div')
  maidsContainer.className = 'maids-container'

  const table = document.createElement('table')
  table.className = 'maids-table table'
  const thead = document.createElement('thead')
  thead.innerHTML = '<tr><th>Nombre</th><th>Correo</th><th>Estado</th><th>Acciones</th></tr>'
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  for (const m of maidsPageItems) {
    const tr = createMaidRow(m)
    tbody.appendChild(tr)
  }

  table.appendChild(tbody)
  maidsContainer.appendChild(table)
  maidsList.appendChild(maidsContainer)

  // Crear paginador
  createMaidsPaginator(maidsList, totalMaids, maidsStart)
}

/**
 * Crea una fila de la tabla de camareras
 * @param {Object} maid
 * @returns {HTMLElement}
 */
function createMaidRow(maid) {
  const tr = document.createElement('tr')

  const tdName = document.createElement('td')
  tdName.textContent = maid.name || ''

  const tdEmail = document.createElement('td')
  tdEmail.textContent = maid.email || maid.id || ''

  const tdStatus = document.createElement('td')
  const statusBadge = document.createElement('span')
  statusBadge.className = `status-badge ${getStatusKey(maid.status)}`
  statusBadge.textContent = maid.status || MAID_STATUS.AVAILABLE
  tdStatus.appendChild(statusBadge)

  const tdActions = document.createElement('td')
  const btnEditRow = createEditButton(maid)
  const btnDelRow = createDeleteButton(maid)

  tdActions.appendChild(btnEditRow)
  tdActions.appendChild(btnDelRow)

  tr.appendChild(tdName)
  tr.appendChild(tdEmail)
  tr.appendChild(tdStatus)
  tr.appendChild(tdActions)

  return tr
}

/**
 * Crea el botón de edición
 * @param {Object} maid
 * @returns {HTMLElement}
 */
function createEditButton(maid) {
  const btn = document.createElement('button')
  btn.className = 'btn btn-sm btn-primary me-2'
  btn.innerHTML = '<i class="bi bi-pencil" aria-hidden="true"></i>'
  btn.title = 'Editar'
  btn.addEventListener('click', () => openMaidEditModal(maid))
  return btn
}

/**
 * Crea el botón de eliminación
 * @param {Object} maid
 * @returns {HTMLElement}
 */
function createDeleteButton(maid) {
  const btn = document.createElement('button')
  btn.className = 'btn btn-sm btn-danger'
  btn.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i>'
  btn.title = 'Eliminar'
  btn.addEventListener('click', async () => {
    const ok = await confirmAction(
      '¿Eliminar camarera ' + (maid.name || '') + '? Esto quitará la asignación en habitaciones.'
    )
    if (!ok) return

    const roomsAll = await getAll('rooms').catch(() => [])
    for (const room of roomsAll) {
      if (room.maid === (maid.id || maid.email)) {
        room.maid = null
        await put('rooms', room)
      }
    }

    await del('maids', maid.id || maid.email)
    location.reload()
  })
  return btn
}

/**
 * Crea el paginador de camareras
 * @param {HTMLElement} maidsList
 * @param {number} totalMaids
 * @param {number} maidsStart
 */
function createMaidsPaginator(maidsList, totalMaids, maidsStart) {
  const maidsPager = document.createElement('div')
  maidsPager.className = 'pager'

  const prevM = document.createElement('button')
  prevM.textContent = '←'
  prevM.disabled = maidsPage === 0
  prevM.addEventListener('click', () => {
    maidsPage = Math.max(0, maidsPage - 1)
    location.reload()
  })

  const nextM = document.createElement('button')
  nextM.textContent = '→'
  nextM.disabled = maidsStart + MAIDS_PER_PAGE >= totalMaids
  nextM.addEventListener('click', () => {
    if (maidsStart + MAIDS_PER_PAGE < totalMaids) {
      maidsPage++
      location.reload()
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
}

/**
 * Obtiene la página actual de camareras
 * @returns {number}
 */
export function getMaidsPage() {
  return maidsPage
}

/**
 * Establece la página de camareras
 * @param {number} page
 */
export function setMaidsPage(page) {
  maidsPage = page
}
