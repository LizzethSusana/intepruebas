// =====================
// UTILIDADES GENERALES
// =====================

/**
 * Convierte un archivo a base64
 * @param {File} file
 * @returns {Promise<string>}
 */
export function toBase64(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
}

/**
 * Rellena un número con ceros a la izquierda
 * @param {number} num
 * @param {number} width
 * @returns {string}
 */
export function padRoom(num, width = 2) {
  const s = String(num)
  return s.length >= width ? s : '0'.repeat(width - s.length) + s
}

/**
 * Normaliza el estado de una habitación o camarera a una clave CSS
 * @param {string} status
 * @returns {string}
 */
export function getStatusKey(status) {
  if (!status) return 'clean'
  const s = String(status).toLowerCase()
  if (s.includes('bloq') || s.includes('bloque') || s === 'blocked')
    return 'blocked'
  if (s.includes('suc') || s.includes('sucio') || s === 'dirty') return 'dirty'
  if (s.includes('limp') || s.includes('limpia') || s === 'clean')
    return 'clean'
  if (s.includes('no') && s.includes('dispon')) return 'no-disponible'
  if (s.includes('disp')) return 'disponible'
  return s.replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
}

/**
 * Obtiene el label para un estado de camarera
 * @param {string} status
 * @param {string} name
 * @returns {string}
 */
export function getMaidStatusLabel(status, name) {
  const isUnavailable = (status || '').toLowerCase().includes('no')
  return `${name || ''} ${isUnavailable ? '(No disponible)' : ''}`
}

/**
 * Verifica si una camarera está disponible
 * @param {string} status
 * @returns {boolean}
 */
export function isMaidAvailable(status) {
  return !(status || '').toLowerCase().includes('no')
}
