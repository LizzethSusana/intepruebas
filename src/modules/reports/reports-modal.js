// =====================
// MODALES DE REPORTES
// =====================

import { getModal, hideModal } from '../shared/modal.js'
import { toBase64 } from '../shared/utils.js'
import { put } from '../../idb.js'

/**
 * Muestra el modal para crear un reporte (siniestro)
 * @param {Object} room
 * @param {Array} maids
 */
export async function openReportModal(room, maids) {
  const options = ['<option value="">Seleccionar camarera</option>']
    .concat(
      maids.map((m) => {
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

  const modal = getModal()
  modal.classList.remove('hidden')

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

  document.getElementById('close').onclick = () => hideModal()

  document.getElementById('send').onclick = async () => {
    const desc = document.getElementById('desc').value.trim()
    const selectedMaid = document.getElementById('reportMaid').value || null
    const files = document.getElementById('files').files

    if (!desc) return alert('Descripción requerida')

    const images = []
    for (let i = 0; i < Math.min(3, files.length); i++) {
      images.push(await toBase64(files[i]))
    }

    const report = {
      _id: 'r_' + Date.now(),
      roomId: room.id,
      maidId: selectedMaid,
      description: desc,
      images,
      createdAt: new Date().toISOString(),
      createdBy: selectedMaid || 'recepcion',
    }

    room.status = 'Bloqueada'
    await put('rooms', room)
    await put('reports', report)

    hideModal()
    location.reload()
  }
}

/**
 * Muestra el modal de detalle del reporte
 * @param {Object} report
 * @param {Array} maidsList
 */
export function showReportDetailModal(report, maidsList) {
  const date = report.createdAt ? new Date(report.createdAt).toLocaleString() : '—'
  const room = report.roomId || '—'
  const maidDisplay = resolveMaidDisplay(report, maidsList)

  const modal = getModal()
  modal.classList.remove('hidden')
  modal.innerHTML = `<div class="modal-content" role="dialog" style="max-width: 600px;">
    <h3 style="color: var(--primary-dark); margin-bottom: 20px;">Detalle del Reporte</h3>
    
    <div style="background: #f8f9fc; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
      <div style="display: grid; grid-template-columns: 120px 1fr; gap: 12px; font-size: 0.95rem;">
        <div style="font-weight: 600; color: #555;">Fecha:</div>
        <div>${date}</div>
        
        <div style="font-weight: 600; color: #555;">Habitación:</div>
        <div style="font-weight: 600; color: var(--primary);">${room}</div>
        
        <div style="font-weight: 600; color: #555;">Camarera:</div>
        <div>${maidDisplay}</div>
        
        <div style="font-weight: 600; color: #555;">Tema:</div>
        <div style="font-weight: 600; color: #d9534f;">${report.subject || '—'}</div>
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <h4 style="font-size: 1rem; color: #555; margin-bottom: 8px;">Descripción:</h4>
      <div style="background: #fff; border: 1px solid #e3e8ef; padding: 12px; border-radius: 6px; white-space: pre-wrap; line-height: 1.6;">
        ${report.description || '(sin descripción)'}
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <h4 style="font-size: 1rem; color: #555; margin-bottom: 8px;">Imágenes:</h4>
      <div id="reportImages" style="display:flex; gap:12px; flex-wrap:wrap;">
      </div>
    </div>

    <div style="display: flex; justify-content: flex-end;">
      <button id="closeModalReport" class="btn btn-sm btn-secondary">Cerrar</button>
    </div>
  </div>`

  const imgsContainer = document.getElementById('reportImages')
  if (report.images && report.images.length) {
    report.images.forEach((src) => {
      const imgDiv = createImageThumb(src, report.images)
      imgsContainer.appendChild(imgDiv)
    })
  } else {
    const noImgs = document.createElement('div')
    noImgs.style.color = '#999'
    noImgs.style.fontStyle = 'italic'
    noImgs.textContent = 'No hay imágenes adjuntas'
    imgsContainer.appendChild(noImgs)
  }

  document.getElementById('closeModalReport').onclick = () => hideModal()
}

/**
 * Crea la miniatura de una imagen
 * @param {string} src
 * @param {Array} images
 * @returns {HTMLElement}
 */
function createImageThumb(src, images) {
  const d = document.createElement('div')
  d.style.width = '120px'
  d.style.height = '120px'
  d.style.border = '2px solid #ddd'
  d.style.borderRadius = '8px'
  d.style.overflow = 'hidden'
  d.style.cursor = 'pointer'
  d.style.transition = 'transform 0.2s, border-color 0.2s'

  d.onmouseenter = () => {
    d.style.transform = 'scale(1.05)'
    d.style.borderColor = 'var(--primary)'
  }

  d.onmouseleave = () => {
    d.style.transform = 'scale(1)'
    d.style.borderColor = '#ddd'
  }

  const img = document.createElement('img')
  img.src = src
  img.style.width = '100%'
  img.style.height = '100%'
  img.style.objectFit = 'cover'
  d.appendChild(img)

  d.onclick = () => {
    if (window.openImagesModal) window.openImagesModal(images)
  }

  return d
}

/**
 * Resuelve el nombre de la camarera que reportó
 * @param {Object} report
 * @param {Array} maidsList
 * @returns {string}
 */
function resolveMaidDisplay(report, maidsList) {
  if (report.maidId) {
    const found = maidsList.find((m) => (m.id || m.email) === report.maidId)
    return found ? found.name || found.email || found.id : report.maidId
  }

  if (report.createdBy && report.createdBy !== 'recepcion') {
    const found = maidsList.find((m) => (m.id || m.email) === report.createdBy)
    return found ? found.name || found.email || found.id : report.createdBy
  }

  if (Array.isArray(report.maids) && report.maids.length) {
    return report.maids
      .map((x) => {
        const f = maidsList.find((m) => (m.id || m.email) === x)
        return f ? f.name || f.email || f.id : x
      })
      .join(', ')
  }

  return report.createdBy || '—'
}
