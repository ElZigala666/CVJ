// Deslizar entre fichas como en una galería.
// Si una ficha se abre desde una lista (contenedor con data-lista: historial del
// perfil, tier list, biblioteca, rankings, resultados de búsqueda, juegos de una
// saga...), se recuerdan los juegos de ESA lista en su orden y con su filtro, y en
// la ficha se puede deslizar al anterior o al siguiente. Cada paso reemplaza la
// entrada del historial (atrás vuelve a la lista).
import * as datos from './datos.js';
import { reemplazarRuta } from './navegacion.js';
import { precargar } from './portadas.js';
import { esc } from './ui.js';

let lista = null;       // [igdbId] de la lista desde la que se abrió la primera ficha
let direccion = null;   // 'siguiente' | 'anterior': de dónde entra la ficha nueva

const idDe = (href) => {
  const m = /^#juego\/(\d+)/.exec(href ?? '');
  return m ? datos.canonico(Number(m[1])) : null;
};

// Al tocar un juego fuera de una ficha: con lista si está dentro de una, si no, sin ella.
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#juego/"]');
  if (!a || location.hash.startsWith('#juego/')) return;
  const cont = a.closest('[data-lista]');
  if (!cont) { lista = null; return; }
  const ids = [];
  for (const x of cont.querySelectorAll('a[href^="#juego/"]')) {
    const id = idDe(x.getAttribute('href'));
    if (id != null && !ids.includes(id)) ids.push(id);
  }
  lista = ids.length > 1 ? ids : null;
  direccion = null;
}, true);

/** app.js: al ir a una pantalla que no es una ficha. */
export function olvidarGaleria() { lista = null; direccion = null; }

/** Posición de un juego en la lista actual (o null si no hay lista o no está en ella). */
export function posicion(id) {
  if (!lista) return null;
  const i = lista.indexOf(datos.canonico(Number(id)));
  if (i < 0) return null;
  return { i, total: lista.length, anterior: lista[i - 1] ?? null, siguiente: lista[i + 1] ?? null };
}

/** ¿Este toque empieza dentro de algo que ya se desliza en horizontal? */
function enDeslizableHorizontal(el, raiz) {
  for (let x = el; x && x !== raiz; x = x.parentElement) {
    if (x.matches?.('input, textarea, select, [data-scroll], .carrusel, .chips')) return true;
    if (x.scrollWidth > x.clientWidth + 2) {
      const ox = getComputedStyle(x).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

/**
 * Activa el deslizamiento en la ficha (si se abrió desde una lista).
 * @param {HTMLElement} pantalla la pantalla de la ficha
 * @param {number} id juego de la ficha
 * @param {HTMLElement} capa lo que se mueve con el dedo (sin lo fijo, como la barra de abajo)
 * @returns {() => void} para desmontar
 */
export function activarDeslizar(pantalla, id, capa = pantalla) {
  const pos = posicion(id);
  const entrada = direccion;
  direccion = null;
  if (!pos) return () => {};

  // Entrada corta desde el lado del que viene.
  if (entrada) {
    capa.classList.add(entrada === 'siguiente' ? 'entra-derecha' : 'entra-izquierda');
    setTimeout(() => capa.classList.remove('entra-derecha', 'entra-izquierda'), 260);
  }

  // Indicador discreto "12 de 40".
  const ind = document.createElement('div');
  ind.className = 'galeria-indicador';
  ind.setAttribute('aria-live', 'polite');
  ind.innerHTML = `<span>${esc(String(pos.i + 1))} de ${esc(String(pos.total))}</span>`;
  pantalla.append(ind);

  // Precargar las portadas del anterior y del siguiente.
  for (const x of [pos.anterior, pos.siguiente]) {
    const j = x != null ? datos.juegoConocido(x) : null;
    if (j?.cover_id) precargar(j.cover_id);
  }

  let x0 = 0, y0 = 0, t0 = 0, modo = null; // null: sin decidir · 'h' · 'v'
  const ir = (destino, dir) => {
    direccion = dir;
    reemplazarRuta(`#juego/${destino}`);
  };
  const soltar = () => {
    capa.style.transition = 'transform .16s ease-out';
    capa.style.transform = '';
    setTimeout(() => { capa.style.transition = ''; }, 170);
  };

  const inicio = (e) => {
    if (e.touches.length !== 1 || document.body.classList.contains('hoja-abierta') || enDeslizableHorizontal(e.target, pantalla)) { modo = 'v'; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); modo = null;
  };
  const mover = (e) => {
    if (modo === 'v') return;
    const dx = e.touches[0].clientX - x0;
    const dy = e.touches[0].clientY - y0;
    if (modo === null) {
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
      // Solo un gesto claramente horizontal; lo demás es scroll.
      modo = Math.abs(dx) > Math.abs(dy) * 2 ? 'h' : 'v';
      if (modo === 'v') return;
    }
    e.preventDefault();
    // Sin juego a ese lado: resistencia.
    const hay = dx < 0 ? pos.siguiente : pos.anterior;
    capa.style.transform = `translateX(${hay ? dx * 0.6 : dx * 0.15}px)`;
  };
  const fin = (e) => {
    if (modo !== 'h') { modo = null; return; }
    modo = null;
    const dx = (e.changedTouches[0]?.clientX ?? x0) - x0;
    const rapido = Math.abs(dx) / Math.max(1, Date.now() - t0) > 0.5;
    const destino = dx < 0 ? pos.siguiente : pos.anterior;
    if (destino != null && (Math.abs(dx) > 80 || (rapido && Math.abs(dx) > 30))) {
      capa.style.transition = 'transform .12s ease-in';
      capa.style.transform = `translateX(${dx < 0 ? -40 : 40}%)`;
      setTimeout(() => ir(destino, dx < 0 ? 'siguiente' : 'anterior'), 110);
    } else {
      soltar();
    }
  };
  pantalla.addEventListener('touchstart', inicio, { passive: true });
  pantalla.addEventListener('touchmove', mover, { passive: false });
  pantalla.addEventListener('touchend', fin);
  pantalla.addEventListener('touchcancel', fin);
  // Teclado (escritorio): flechas.
  const tecla = (e) => {
    if (e.target.closest?.('input, textarea, select') || document.body.classList.contains('hoja-abierta')) return;
    if (e.key === 'ArrowRight' && pos.siguiente != null) ir(pos.siguiente, 'siguiente');
    if (e.key === 'ArrowLeft' && pos.anterior != null) ir(pos.anterior, 'anterior');
  };
  document.addEventListener('keydown', tecla);
  return () => {
    document.removeEventListener('keydown', tecla);
    ind.remove();
  };
}
