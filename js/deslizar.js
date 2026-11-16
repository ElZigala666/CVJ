// Deslizar a izquierda y derecha para cambiar de pestaña.
//  - Dentro de una zona con subpestañas (data-deslizar="selector de sus botones": historial
//    del perfil, orden de los rankings) cambia de subpestaña; en la primera o la última,
//    sigue a la pestaña principal de al lado.
//  - En las pestañas principales (Inicio, Buscar, Rankings, Perfil) cambia de pestaña.
// No se activa si el gesto empieza en algo que se desliza en horizontal (carruseles, filas de
// chips, controles deslizantes), en un campo de texto, con una hoja abierta o seleccionando
// juegos. En las fichas no hay conflicto: allí el gesto es de galeria.js y esto no actúa.
const PRINCIPALES = ['inicio', 'buscar', 'rankings', 'perfil'];
const MIN_PX = 64;
const MAX_MS = 650;
const ACTIVO = '.activa, .activo, [aria-selected="true"], [aria-pressed="true"]';

let ini = null;

/** ¿Empieza sobre algo que ya usa el deslizamiento horizontal? */
function ocupado(el, raiz) {
  if (el.closest?.('input, textarea, select, [contenteditable="true"], [data-sin-deslizar]')) return true;
  for (let x = el; x && x !== raiz && x.nodeType === 1; x = x.parentElement) {
    if (x.scrollWidth > x.clientWidth + 8) {
      const o = getComputedStyle(x).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
  }
  return false;
}

function rutaActual() {
  const [ruta, ...params] = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
  return { ruta: ruta || 'inicio', params };
}

/** Marca hacia dónde entra la pantalla nueva (css: .pantalla con data-entra). */
function animar(dir) {
  const raiz = document.documentElement;
  raiz.dataset.entra = dir > 0 ? 'der' : 'izq';
  setTimeout(() => { delete raiz.dataset.entra; }, 320);
}

function alSoltar(vista, dx) {
  const dir = dx < 0 ? 1 : -1; // hacia la izquierda = la siguiente
  // Subpestañas de la zona donde empezó el gesto.
  const zona = ini.el.closest?.('[data-deslizar]');
  if (zona && vista.contains(zona)) {
    const botones = [...zona.querySelectorAll(zona.dataset.deslizar)].filter((b) => !b.disabled && b.getClientRects().length);
    const i = botones.findIndex((b) => b.matches(ACTIVO));
    const destino = i >= 0 ? botones[i + dir] : null;
    if (destino) {
      destino.click();
      zona.querySelector(zona.dataset.deslizar + ':is(' + ACTIVO + ')')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      return;
    }
  }
  // Pestañas principales (el perfil de otro, la tier list... no lo son).
  const { ruta, params } = rutaActual();
  const i = PRINCIPALES.indexOf(ruta);
  if (i < 0 || (ruta === 'perfil' && params.length) ) return;
  const destino = PRINCIPALES[i + dir];
  if (!destino) return;
  animar(dir);
  location.hash = `#${destino}`;
}

export function iniciarDeslizar(vista) {
  vista.addEventListener('touchstart', (e) => {
    ini = null;
    if (e.touches.length !== 1) return;
    const cuerpo = document.body.classList;
    if (cuerpo.contains('hoja-abierta') || cuerpo.contains('seleccionando') || cuerpo.contains('celebrando')) return;
    const t = e.touches[0];
    if (ocupado(e.target, vista)) return;
    ini = { x: t.clientX, y: t.clientY, t: Date.now(), el: e.target };
  }, { passive: true });
  vista.addEventListener('touchmove', (e) => { if (e.touches.length !== 1) ini = null; }, { passive: true });
  vista.addEventListener('touchend', (e) => {
    if (!ini) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - ini.x;
    const dy = t.clientY - ini.y;
    const valido = Math.abs(dx) >= MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.8 && Date.now() - ini.t <= MAX_MS;
    if (valido && !document.body.classList.contains('seleccionando')) alSoltar(vista, dx);
    ini = null;
  }, { passive: true });
  vista.addEventListener('touchcancel', () => { ini = null; }, { passive: true });
}
