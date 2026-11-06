// Portadas de IGDB: URLs, bloque de color con título mientras cargan,
// registro de lo ya descargado (para no repetir el fundido) y precarga.

const BASE_IMG = 'https://images.igdb.com/igdb/image/upload';

// Tamaños usados en la app. Uno por sitio, sin srcset: así cada portada se
// descarga una sola vez y la ficha puede reutilizar la URL de la lista.
//   cover_small    90×128   filas de Buscar, actividad, hoja de Valorar
//   cover_small_2x 180×256  tarjetas de los carruseles de Inicio
//   cover_big      264×374  ficha
export function urlPortada(coverId, tam = 'cover_small') {
  return coverId ? `${BASE_IMG}/t_${tam}/${coverId}.jpg` : null;
}

/** Color del bloque mientras no hay portada (estable por juego). */
export function colorBloque(id) {
  const tono = ((Number(id) || 0) * 47) % 360;
  return `hsl(${tono} 38% 24%)`;
}

/** Versión más oscura para el fondo de la cabecera de la ficha. */
export function colorFondo(id) {
  const tono = ((Number(id) || 0) * 47) % 360;
  return `hsl(${tono} 32% 15%)`;
}

// ---------------------------------------------------------------------------
// Registro de portadas descargadas en esta sesión
// ---------------------------------------------------------------------------
const cargadas = new Set();
const mejorPorJuego = new Map(); // coverId → URL más grande ya descargada
const RANGO = { cover_small: 1, cover_small_2x: 2, cover_big: 3 };

function anotar(url) {
  cargadas.add(url);
  const m = url.match(/\/t_([a-z_0-9]+)\/([^/.]+)\.jpg$/);
  if (!m) return;
  const [, tam, id] = m;
  const actual = mejorPorJuego.get(id);
  const rangoActual = actual ? RANGO[actual.match(/\/t_([a-z_0-9]+)\//)[1]] || 0 : 0;
  if ((RANGO[tam] || 0) >= rangoActual) mejorPorJuego.set(id, url);
}

export const yaCargada = (url) => cargadas.has(url);

/** La mejor URL de esa portada que ya está en la caché del navegador (o null). */
export function mejorCargada(coverId) {
  return coverId ? mejorPorJuego.get(coverId) ?? null : null;
}

// Un solo listener para todas las <img data-portada>: marca y hace el fundido.
document.addEventListener('load', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.hasAttribute('data-portada')) return;
  anotar(img.currentSrc || img.src);
  img.classList.add('ok');
}, true);
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.hasAttribute('data-portada')) img.remove();
}, true);

// ---------------------------------------------------------------------------
// Precarga (al tocar un resultado o una tarjeta, antes de navegar)
// ---------------------------------------------------------------------------
const precargas = new Map();
export function precargar(coverId, tam = 'cover_big') {
  const url = urlPortada(coverId, tam);
  if (!url || cargadas.has(url) || precargas.has(url)) return;
  const img = new Image();
  img.decoding = 'async';
  img.fetchPriority = 'high';
  img.onload = () => { anotar(url); precargas.delete(url); };
  img.onerror = () => precargas.delete(url);
  img.src = url;
  precargas.set(url, img);
}

// Cualquier elemento con data-precarga="{cover_id}" precarga la portada grande
// en cuanto se toca (pointerdown llega ~100 ms antes que el click).
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest?.('[data-precarga]');
  if (el?.dataset.precarga) precargar(el.dataset.precarga);
}, { passive: true, capture: true });

// ---------------------------------------------------------------------------
// HTML de una portada
// ---------------------------------------------------------------------------
function escAttr(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Bloque de color con el título (como en el diseño) y la imagen encima.
 * @param {{igdb_id:number, cover_id?:string|null, nombre?:string}} juego
 * @param {{ clase?: string, tam?: string, titulo?: 'arriba'|'abajo'|null, prioridad?: boolean, deco?: boolean }} op
 */
export function portada(juego, op = {}) {
  const { clase = 'portada-lista', tam = 'cover_small', titulo = null, prioridad = false, deco = false } = op;
  const url = urlPortada(juego?.cover_id, tam);
  let img = '';
  if (url) {
    const lista = yaCargada(url);
    const carga = prioridad ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    img = `<img data-portada src="${url}" alt="" ${carga} decoding="async"${lista ? ' class="ok"' : ''}>`;
  }
  const tit = titulo && juego?.nombre
    ? `<span class="portada-titulo portada-titulo-${titulo}">${escAttr(juego.nombre)}</span>`
    : '';
  const circulo = deco ? '<span class="portada-deco"></span>' : '';
  return `<div class="portada ${clase}" style="--bloque:${colorBloque(juego?.igdb_id)}">${circulo}${tit}${img}</div>`;
}
