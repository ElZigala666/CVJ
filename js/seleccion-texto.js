// Selección de texto PROPIA en los textos de solo lectura (reseñas, respuestas, la lectura de
// columnas: SELECCIONABLE de js/ui.js), solo en pantallas táctiles. Así no sale el menú del
// navegador (Google en Android, el del sistema en iPhone):
//   · la selección nativa sigue desactivada en táctil (css/app.css, @media (hover: none));
//   · pulsación larga sobre una palabra → se selecciona (caretRangeFromPoint /
//     caretPositionFromPoint) y se resalta con el acento (rectángulos propios por encima, sin
//     tocar el texto: la CSS Custom Highlight API no se pinta en todos los navegadores);
//   · dos tiradores para ampliar o reducir palabra a palabra (entre líneas y párrafos del
//     mismo texto), con desplazamiento automático cerca del borde y vibración al empezar;
//   · nuestro menú encima: Copiar, Seleccionar todo, Citar en mi columna (columnistas) y
//     Reaccionar (en reseñas y respuestas con reacciones);
//   · tocar fuera, hacer scroll, atrás o cambiar de pantalla la cancela.
// En escritorio (ratón) no se activa: la selección normal del navegador.
// El editor de columnas usa la selección nativa (es un textarea, fuera de SELECCIONABLE).
import { SELECCIONABLE, aviso, copiarTexto } from './ui.js';
import { icono } from './icons.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';

const PULSACION_MS = 450;
const MOVER_MAX = 9;           // px que se puede mover el dedo sin cancelar la pulsación larga
const BORDE_AUTO = 72;          // px del borde de la pantalla en los que se desplaza solo
const ALZA_DEDO = 26;           // el punto que se mira, algo por encima del dedo (que tapa)
const PALABRA = /[\p{L}\p{N}_'’-]/u;

const tactil = () => window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;

let sel = null;        // { raiz, rango, capa, menu, tiradores: [a, b] }
let pulsacion = null;  // { t, x, y, raiz }
let arrastre = null;   // { cual: 0|1, x, y, raf }
let autoScroll = false;
let tragarClic = false;  // el clic que llega al soltar la pulsación larga no abre nada

// ---------------------------------------------------------------------------
// Posiciones en el texto
// ---------------------------------------------------------------------------
/** El punto (nodo de texto, posición) bajo unas coordenadas, dentro de raiz. */
function puntoEn(x, y, raiz) {
  // Con user-select: none algunos navegadores no devuelven el punto: se permite un momento.
  const antes = raiz.style.webkitUserSelect;
  raiz.style.webkitUserSelect = 'text';
  raiz.style.userSelect = 'text';
  let nodo = null;
  let off = 0;
  try {
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { nodo = p.offsetNode; off = p.offset; }
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) { nodo = r.startContainer; off = r.startOffset; }
    }
  } finally {
    raiz.style.webkitUserSelect = antes;
    raiz.style.userSelect = antes;
  }
  if (!nodo || !raiz.contains(nodo)) return null;
  if (nodo.nodeType !== Node.TEXT_NODE) {
    // Entre elementos: el texto más cercano.
    const hijo = nodo.childNodes[Math.min(off, nodo.childNodes.length - 1)];
    const t = hijo && primerTexto(hijo);
    if (!t) return null;
    return { nodo: t, off: 0 };
  }
  return { nodo, off };
}
function primerTexto(n) {
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  return n.nodeType === Node.TEXT_NODE ? n : w.nextNode();
}
/** Los límites de la palabra en ese punto ({ nodo, ini, fin }), o null si no hay palabra. */
function palabraEn({ nodo, off }) {
  const t = nodo.data;
  let i = Math.min(off, t.length);
  if (!PALABRA.test(t[i] ?? '') && PALABRA.test(t[i - 1] ?? '')) i -= 1;
  if (!PALABRA.test(t[i] ?? '')) return null;
  let a = i;
  let b = i;
  while (a > 0 && PALABRA.test(t[a - 1])) a -= 1;
  while (b < t.length && PALABRA.test(t[b])) b += 1;
  return { nodo, ini: a, fin: b };
}

// ---------------------------------------------------------------------------
// Pintar: resaltado, tiradores y menú
// ---------------------------------------------------------------------------
function capaDoc(clase = 'selt-capa') {
  let c = document.querySelector(`.${clase}`);
  if (!c) { c = document.createElement('div'); c.className = clase; document.body.appendChild(c); }
  return c;
}
/** Los rectángulos de las LÍNEAS de texto seleccionadas (sin las cajas de los párrafos). */
function rectsTexto(rango) {
  const salida = [];
  const raiz = rango.commonAncestorContainer.nodeType === Node.TEXT_NODE ? rango.commonAncestorContainer.parentNode : rango.commonAncestorContainer;
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = w.currentNode.nodeType === Node.TEXT_NODE ? w.currentNode : w.nextNode(); n; n = w.nextNode()) {
    if (!rango.intersectsNode(n)) continue;
    const r = document.createRange();
    r.setStart(n, n === rango.startContainer ? rango.startOffset : 0);
    r.setEnd(n, n === rango.endContainer ? rango.endOffset : n.length);
    for (const x of r.getClientRects()) if (x.width > 0.5 && x.height > 0.5) salida.push(x);
  }
  return salida;
}
function pintar() {
  if (!sel) return;
  const rects = rectsTexto(sel.rango);
  if (!rects.length) return;
  const sx = window.scrollX;
  const sy = window.scrollY;
  // Resaltado: en su propia capa, por debajo de las cabeceras fijas, el menú y los tiradores.
  const marcas = capaDoc('selt-marcas');
  marcas.replaceChildren(...rects.map((r) => {
    const m = document.createElement('span');
    m.className = 'selt-marca';
    Object.assign(m.style, { left: `${r.left + sx}px`, top: `${r.top + sy}px`, width: `${r.width}px`, height: `${r.height}px` });
    return m;
  }));
  // Tiradores: al principio de la primera línea y al final de la última.
  const r0 = rects[0];
  const r1 = rects[rects.length - 1];
  const [ta, tb] = sel.tiradores;
  Object.assign(ta.style, { left: `${r0.left + sx}px`, top: `${r0.top + sy}px`, height: `${r0.height}px` });
  Object.assign(tb.style, { left: `${r1.right + sx}px`, top: `${r1.top + sy}px`, height: `${r1.height}px` });
  // Menú: encima de la selección (o debajo si no cabe), dentro de la pantalla.
  if (!arrastre) {
    const m = sel.menu;
    m.hidden = false;
    const ancho = m.offsetWidth;
    const alto = m.offsetHeight;
    const arriba = Math.min(...rects.map((r) => r.top));
    const abajo = Math.max(...rects.map((r) => r.bottom));
    const centro = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2;
    let top = arriba - alto - 14;
    if (top < 64) top = abajo + 30; // bajo la selección (deja sitio al tirador)
    top = Math.min(top, window.innerHeight - alto - 12);
    const left = Math.max(8, Math.min(window.innerWidth - ancho - 8, centro - ancho / 2));
    Object.assign(m.style, { left: `${left + sx}px`, top: `${top + sy}px` });
  } else sel.menu.hidden = true;
}

function crearUi(raiz) {
  const capa = capaDoc();
  const tiradores = [0, 1].map((i) => {
    const t = document.createElement('span');
    t.className = `selt-tirador ${i ? 'fin' : 'ini'}`;
    t.dataset.tirador = String(i);
    t.innerHTML = '<i></i>';
    capa.appendChild(t);
    return t;
  });
  const menu = document.createElement('div');
  menu.className = 'selt-menu';
  menu.setAttribute('role', 'menu');
  const yo = usuarioActual();
  const columnista = yo && datos.columnaDe?.(yo.id);
  const reaccion = botonReaccion(raiz);
  menu.innerHTML = `
    <button type="button" role="menuitem" data-selt="copiar">${icono('copiar', { tam: 16, color: 'currentColor' })}<span>Copiar</span></button>
    <button type="button" role="menuitem" data-selt="todo"><span>Seleccionar todo</span></button>
    ${columnista ? `<button type="button" role="menuitem" data-selt="citar">${icono('columnas', { tam: 16, color: 'currentColor' })}<span>Citar en mi columna</span></button>` : ''}
    ${reaccion ? `<button type="button" role="menuitem" data-selt="reaccionar">${icono('reaccionar', { tam: 16, color: 'currentColor' })}<span>Reaccionar</span></button>` : ''}`;
  menu.hidden = true;
  capa.appendChild(menu);
  return { tiradores, menu };
}

/** El botón de reaccionar de esa reseña o respuesta (si lo tiene cerca). */
function botonReaccion(raiz) {
  if (raiz.closest('.lectura-articulo')) return null; // en la lectura: al final, no aquí
  for (let x = raiz, n = 0; x && n < 5; x = x.parentElement, n++) {
    const b = x.querySelector?.('[data-social] [data-social-reaccionar]');
    if (b) return b;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Empezar, cambiar y terminar
// ---------------------------------------------------------------------------
function empezar(raiz, x, y) {
  const p = puntoEn(x, y, raiz);
  const w = p && palabraEn(p);
  if (!w) return false;
  cancelar();
  const rango = document.createRange();
  rango.setStart(w.nodo, w.ini);
  rango.setEnd(w.nodo, w.fin);
  sel = { raiz, rango, y0: window.scrollY, ...crearUi(raiz) };
  document.body.classList.add('seleccionando-texto');
  tragarClic = true;
  history.pushState({ ...(history.state || {}), cvjSelTexto: true }, '');
  try { navigator.vibrate?.(12); } catch { /* sin vibración */ }
  pintar();
  return true;
}

export function cancelar({ sinHistorial = false } = {}) {
  if (!sel) return;
  document.querySelector('.selt-capa')?.replaceChildren();
  document.querySelector('.selt-marcas')?.replaceChildren();
  document.body.classList.remove('seleccionando-texto');
  sel = null;
  arrastre = null;
  if (!sinHistorial && history.state?.cvjSelTexto) history.back();
}

/** Mover un extremo hasta el punto (x, y): palabra a palabra; si se cruzan, se cambian. */
function moverExtremo(cual, x, y) {
  const p = puntoEn(x, y - ALZA_DEDO, sel.raiz) || puntoEn(x, y, sel.raiz);
  if (!p) return;
  const w = palabraEn(p) ?? { nodo: p.nodo, ini: p.off, fin: p.off };
  const r = sel.rango;
  const fijo = cual === 0 ? { nodo: r.endContainer, off: r.endOffset } : { nodo: r.startContainer, off: r.startOffset };
  const nuevo = document.createRange();
  // ¿El punto nuevo va antes o después del extremo fijo?
  const prueba = document.createRange();
  prueba.setStart(fijo.nodo, fijo.off);
  const antes = prueba.comparePoint(w.nodo, cual === 0 ? w.ini : w.fin) < 0;
  if (antes) { nuevo.setStart(w.nodo, w.ini); nuevo.setEnd(fijo.nodo, fijo.off); } else { nuevo.setStart(fijo.nodo, fijo.off); nuevo.setEnd(w.nodo, w.fin); }
  if (nuevo.collapsed || !nuevo.toString().trim()) return;
  sel.rango = nuevo;
  // Si se ha cruzado, el tirador que se arrastra pasa a ser el otro extremo.
  arrastre.cual = antes ? 0 : 1;
  pintar();
}

function seleccionarTodo() {
  const r = document.createRange();
  r.selectNodeContents(sel.raiz);
  sel.rango = r;
  pintar();
}

/** "Citar en mi columna": el editor nuevo con la cita y el enlace a la original. */
function citar() {
  const texto = sel.rango.toString().replace(/\s*\n\s*/g, ' ').trim();
  const base = `${location.origin}${location.pathname}`;
  const ruta = location.hash || '#inicio';
  let atrib = 'Visto en CVJ';
  const m = ruta.match(/^#entrada\/([\w-]+)/);
  const e = m ? datos.entrada(m[1]) : null;
  if (e) atrib = `«${e.titulo || 'Sin título'}», de ${datos.usuario(e.usuario_id)?.nombre ?? ''}`;
  else {
    const j = ruta.match(/^#juego\/(\d+)/);
    const juego = j ? datos.juegoConocido(Number(j[1])) : null;
    if (juego) atrib = `Una reseña de ${juego.nombre} en CVJ`;
  }
  const url = /^https:\/\//.test(base) ? `${base}${ruta}` : null;
  const tema = e?.juego_id ? `juego/${e.juego_id}` : (ruta.match(/^#juego\/(\d+)/) ? `juego/${ruta.match(/^#juego\/(\d+)/)[1]}` : null);
  try { sessionStorage.setItem('cvj.cita', JSON.stringify({ texto, atrib, url })); } catch { /* nada */ }
  cancelar({ sinHistorial: true });
  location.hash = `#escribir/nueva/cita${tema ? `/${tema}` : ''}`;
}

// ---------------------------------------------------------------------------
// Puesta en marcha (una vez)
// ---------------------------------------------------------------------------
export function iniciarSeleccionTexto() {
  if (!tactil()) return;
  document.documentElement.classList.add('seleccion-propia');

  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    // Los tiradores: arrastrar.
    const tir = e.target.closest?.('.selt-tirador');
    if (sel && tir) {
      arrastre = { cual: Number(tir.dataset.tirador), x: t.clientX, y: t.clientY, raf: 0 };
      sel.menu.hidden = true;
      return;
    }
    if (sel && e.target.closest?.('.selt-menu')) return;
    if (sel) cancelar(); // tocar fuera
    if (e.touches.length !== 1) return;
    const raiz = e.target.closest?.(SELECCIONABLE);
    if (!raiz || raiz.closest('textarea, input, [contenteditable="true"]')) return;
    clearTimeout(pulsacion?.t);
    pulsacion = {
      x: t.clientX, y: t.clientY, raiz,
      t: setTimeout(() => {
        const p = pulsacion;
        pulsacion = null;
        if (p && document.body.contains(p.raiz)) empezar(p.raiz, p.x, p.y);
      }, PULSACION_MS),
    };
  }, { passive: true, capture: true });

  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (pulsacion && (Math.abs(t.clientX - pulsacion.x) > MOVER_MAX || Math.abs(t.clientY - pulsacion.y) > MOVER_MAX)) {
      clearTimeout(pulsacion.t); pulsacion = null;
    }
    if (!arrastre || !sel) return;
    if (e.cancelable) e.preventDefault(); // al arrastrar un tirador no se desplaza la página
    arrastre.x = t.clientX;
    arrastre.y = t.clientY;
    moverExtremo(arrastre.cual, t.clientX, t.clientY);
    // Cerca del borde: la página se desplaza sola mientras se mantiene el dedo.
    if (!arrastre.raf && (t.clientY < BORDE_AUTO || t.clientY > window.innerHeight - BORDE_AUTO)) {
      const paso = () => {
        if (!arrastre || !sel) return;
        const v = arrastre.y < BORDE_AUTO ? -Math.ceil((BORDE_AUTO - arrastre.y) / 6) : arrastre.y > window.innerHeight - BORDE_AUTO ? Math.ceil((arrastre.y - (window.innerHeight - BORDE_AUTO)) / 6) : 0;
        if (!v) { arrastre.raf = 0; return; }
        autoScroll = true;
        window.scrollBy(0, v);
        moverExtremo(arrastre.cual, arrastre.x, arrastre.y);
        arrastre.raf = requestAnimationFrame(paso);
      };
      arrastre.raf = requestAnimationFrame(paso);
    }
  }, { passive: false, capture: true });

  const fin = () => {
    if (pulsacion) { clearTimeout(pulsacion.t); pulsacion = null; }
    if (arrastre) { cancelAnimationFrame(arrastre.raf); arrastre = null; autoScroll = false; pintar(); }
  };
  window.addEventListener('touchend', fin, { passive: true, capture: true });
  window.addEventListener('touchcancel', fin, { passive: true, capture: true });

  // Que la pulsación larga sobre el texto no abra nada del navegador (ni pase el clic).
  document.addEventListener('contextmenu', (e) => { if (e.target.closest?.(SELECCIONABLE)) e.preventDefault(); }, { capture: true });
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-selt]');
    if (tragarClic && !b) { tragarClic = false; e.preventDefault(); e.stopPropagation(); return; }
    tragarClic = false;
    if (!sel || !b) return;
    e.preventDefault();
    e.stopPropagation();
    const a = b.dataset.selt;
    if (a === 'copiar') {
      const texto = sel.rango.toString();
      copiarTexto(texto).then((ok) => aviso(ok ? 'Copiado' : 'No se ha podido copiar'));
      cancelar();
    } else if (a === 'todo') seleccionarTodo();
    else if (a === 'citar') citar();
    else if (a === 'reaccionar') {
      const boton = botonReaccion(sel.raiz);
      cancelar();
      setTimeout(() => boton?.click(), 50);
    }
  }, { capture: true });

  // Scroll (del usuario), cambiar de pantalla, atrás, girar: se cancela.
  // (Un temblor de unos píxeles no cuenta: solo un scroll de verdad.)
  window.addEventListener('scroll', () => {
    if (!sel) return;
    if (arrastre || autoScroll) { sel.y0 = window.scrollY; pintar(); return; }
    if (Math.abs(window.scrollY - sel.y0) > 10) cancelar(); else pintar();
  }, { passive: true });
  window.addEventListener('hashchange', () => cancelar({ sinHistorial: true }));
  window.addEventListener('popstate', () => { if (sel && !history.state?.cvjSelTexto) cancelar({ sinHistorial: true }); });
  window.addEventListener('resize', () => { if (sel) pintar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancelar(); });
}

/** ¿Hay una selección propia en marcha? (para otros gestos) */
export const seleccionando = () => !!sel;
