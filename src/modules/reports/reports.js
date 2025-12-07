// =====================
// MÓDULO DE REPORTES
// =====================

import { getAll, get, put } from '../../idb.js'
import { REPORTS_PER_PAGE, ROOM_STATUS } from '../shared/constants.js'
import { showReportDetailModal } from './reports-modal.js'

let reportsPage = 0

/**
 * Renderiza la tabla de reportes
 * @param {HTMLElement} reportsEl
 * @param {Array} reports
 * @param {Array} maids
 */
export async function renderReports(reportsEl, reports, maids) {
  reportsEl.innerHTML = ''

  const sorted = (reports || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const totalReports = sorted.length
  const reportsStart = reportsPage * REPORTS_PER_PAGE
  const reportsPageItems = sorted.slice(reportsStart, reportsStart + REPORTS_PER_PAGE)

  for (const rep of reportsPageItems) {
    const tr = createReportRow(rep, maids)
    reportsEl.appendChild(tr)
  }

  // Crear paginador
  createReportsPaginator(reportsEl, totalReports, reportsStart)
}

/**
 * Crea una fila de la tabla de reportes
 * @param {Object} report
 * @param {Array} maids
 * @returns {HTMLElement}
 */
function createReportRow(report, maids) {
  const tr = document.createElement('tr')

  const date = report.createdAt ? new Date(report.createdAt).toLocaleString() : '—'
  const room = report.roomId || '—'
  const subject = report.subject || '—'
  const maidDisplay = resolveMaidName(report, maids)
  const status = report.status || 'Pendiente'

  const tdDate = document.createElement('td')
  tdDate.textContent = date

  const tdRoom = document.createElement('td')
  tdRoom.textContent = room

  const tdMaid = document.createElement('td')
  tdMaid.textContent = maidDisplay

  const tdSubject = document.createElement('td')
  tdSubject.textContent = subject
  tdSubject.style.fontWeight = '600'

  const tdStatus = document.createElement('td')
  const statusSelect = document.createElement('select')
  statusSelect.className = 'report-status'
  statusSelect.innerHTML = `
    <option value="Pendiente" ${status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
    <option value="Habilitado" ${status === 'Habilitado' ? 'selected' : ''}>Habilitado</option>
  `
  statusSelect.addEventListener('change', async () => {
    const newStatus = statusSelect.value
    statusSelect.disabled = true
    try {
      await updateReportStatus(report, newStatus)
      location.reload()
    } catch (e) {
      console.error('No se pudo actualizar el estado del reporte', e)
      alert('No se pudo actualizar el estado. Intenta de nuevo.')
      statusSelect.value = status
    } finally {
      statusSelect.disabled = false
    }
  })
  tdStatus.appendChild(statusSelect)

  const tdResumen = document.createElement('td')
  const btnVerMas = document.createElement('button')
  btnVerMas.className = 'btn btn-sm btn-info'
  btnVerMas.innerHTML = '<i class="bi bi-eye"></i> Ver más'
  btnVerMas.addEventListener('click', () => showReportDetailModal(report, maids))
  tdResumen.appendChild(btnVerMas)

  tr.appendChild(tdDate)
  tr.appendChild(tdRoom)
  tr.appendChild(tdMaid)
  tr.appendChild(tdSubject)
  tr.appendChild(tdResumen)
  tr.appendChild(tdStatus)

  return tr
}

/**
 * Resuelve el nombre de la camarera que reportó
 * @param {Object} report
 * @param {Array} maids
 * @returns {string}
 */
function resolveMaidName(report, maids) {
  if (report.maidId) {
    const found = maids.find((m) => (m.id || m.email) === report.maidId)
    return found ? found.name || found.email || found.id : report.maidId
  }

  if (report.createdBy && report.createdBy !== 'recepcion') {
    const found = maids.find((m) => (m.id || m.email) === report.createdBy)
    return found ? found.name || found.email || found.id : report.createdBy
  }

  if (Array.isArray(report.maids) && report.maids.length) {
    return report.maids
      .map((x) => {
        const f = maids.find((m) => (m.id || m.email) === x)
        return f ? f.name || f.email || f.id : x
      })
      .join(', ')
  }

  return report.createdBy || '—'
}

/**
 * Crea el paginador de reportes
 * @param {HTMLElement} reportsEl
 * @param {number} totalReports
 * @param {number} reportsStart
 */
function createReportsPaginator(reportsEl, totalReports, reportsStart) {
  const reportsPagerEl = document.getElementById('reportsPager')
  if (!reportsPagerEl) return

  reportsPagerEl.innerHTML = ''

  const prevReports = document.createElement('button')
  prevReports.textContent = '←'
  prevReports.disabled = reportsPage === 0
  prevReports.addEventListener('click', () => {
    reportsPage = Math.max(0, reportsPage - 1)
    location.reload()
  })

  const nextReports = document.createElement('button')
  nextReports.textContent = '→'
  nextReports.disabled = reportsStart + REPORTS_PER_PAGE >= totalReports
  nextReports.addEventListener('click', () => {
    if (reportsStart + REPORTS_PER_PAGE < totalReports) {
      reportsPage++
      location.reload()
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

/**
 * Obtiene la página actual de reportes
 * @returns {number}
 */
export function getReportsPage() {
  return reportsPage
}

/**
 * Establece la página de reportes
 * @param {number} page
 */
export function setReportsPage(page) {
  reportsPage = page
}

/**
 * Actualiza el estado del reporte y habilita/bloquea la habitación
 * @param {Object} report
 * @param {string} newStatus
 */
async function updateReportStatus(report, newStatus) {
  const updatedReport = { ...report, status: newStatus }
  await put('reports', updatedReport)

  if (!report.roomId) return

  try {
    const room = await get('rooms', report.roomId)
    if (!room) return

    room.status = newStatus === 'Habilitado' ? ROOM_STATUS.DIRTY : ROOM_STATUS.BLOCKED
    await put('rooms', room)
  } catch (e) {
    console.warn('No se pudo actualizar la habitación vinculada al reporte', e)
  }
}
