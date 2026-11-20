// Deslizar entre las pestañas principales (las de la barra del móvil, en su orden: js/barra.js)
// como en una app
// nativa: la pantalla actual y la vecina se mueven SIGUIENDO EL DEDO; al soltar, si se ha
// pasado de un tercio del ancho o el gesto es rápido, termina hacia la vecina; si no, vuelve.
// En la primera y la última, un rebote elástico. Solo transform (nada de layout).
//   · La vecina es una copia de la pestaña tal como está (las visitadas siguen montadas en
//     app.js) o, si aún no se ha visitado, un esqueleto: nunca sale en blanco.
//   · Subpestañas del perfil (Historial · Tier list · Estadísticas · Biblioteca · Columna):
//     deslizar sobre su barra o su contenido ([data-subdeslizar]) cambia de subpestaña, con
//     el contenido siguiendo el dedo; en la primera y la última, rebote, y NUNCA salta a
//     otra pestaña principal en ese gesto. Sobre la cabecera del perfil o la barra de abajo,
//     las pestañas principales. La pantalla lo recibe con el evento "cvj:subpestana".
//   · Prioridad del scroll: si el gesto empieza en algo que se desliza en horizontal (filas
//     con scroll, carruseles, chips, deslizadores, campos de texto) o en texto
//     seleccionable, no hay cambio de pestaña en todo ese gesto. Un gesto vertical tampoco:
//     la dirección se decide al empezar a mover y ya no cambia.
// En las fichas no actúa: allí el gesto es de galeria.js.
import { SELECCIONABLE, haySeleccion } from './ui.js';

let PRINCIPALES = ['inicio', 'buscar', 'rankings', 'perfil'];
const ARRANQUE = 10;          // px antes de decidir la dirección
const RAPIDO = 0.45;          // px/ms: un gesto rápido termina aunque sea corto
const DURACION = 240;
const CURVA = 'cubic-bezier(.2, .8, .2, 1)';

/** ¿Empieza sobre algo que ya usa el deslizamiento horizontal (o que no se debe mover)? */
function ocupado(el, raiz) {
  if (el.closest?.(`input, textarea, select, [contenteditable="true"], [data-sin-deslizar], ${SELECCIONABLE}`) || haySeleccion()) return true;
  for (let x = el; x && x !== raiz && x.nodeType === 1; x = x.parentElement) {
    if (x.scrollWidth > x.clientWidth + 4) {
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
/** Índice de la pestaña principal en la que estoy (o -1: perfil de otro, fichas...). */
function indiceActual() {
  const { ruta, params } = rutaActual();
  if (params.filter(Boolean).length) return -1;
  return PRINCIPALES.indexOf(ruta);
}

const ESQUELETO = `
  <div class="pantalla desliz-esqueleto" aria-hidden="true">
    <div class="sk" style="width:40%;height:28px;margin:24px 20px 20px;border-radius:8px"></div>
    ${'<div class="sk" style="height:84px;margin:0 20px 12px;border-radius:14px"></div>'.repeat(5)}
  </div>`;

/**
 * @param {HTMLElement} vista  #vista
 * @param {{ foto: (ruta: string) => Node|null, indicador: (desde: string, hacia: string|null, p: number) => void, indicadorQuieto: () => void }} op
 *   foto: la vecina tal como está (si sigue montada) o su última foto; null = esqueleto.
 */
export function iniciarDeslizar(vista, { foto: fotoDe, indicador, indicadorQuieto, principales = null, barra = null }) {
  const leerPrincipales = () => { if (principales) PRINCIPALES = principales(); };
  let g = null;        // el gesto en curso
  let capa = null;     // la pestaña vecina
  let capaRuta = null;
  let ocupadoAnim = false;

  const ancho = () => vista.getBoundingClientRect().width || window.innerWidth;
  const poner = (el, x, animar) => {
    el.style.transition = animar ? `transform ${DURACION}ms ${CURVA}` : 'none';
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
  };

  function prepararCapa(ruta) {
    if (capa && capaRuta === ruta) return;
    quitarCapa();
    capa = document.createElement('div');
    capa.className = 'desliz-vecina';
    capa.setAttribute('aria-hidden', 'true');
    const dentro = document.createElement('div');
    dentro.className = 'desliz-app';
    const foto = fotoDe(ruta);
    if (foto) dentro.appendChild(foto);
    else dentro.innerHTML = ESQUELETO;
    capa.appendChild(dentro);
    document.body.appendChild(capa);
    capaRuta = ruta;
  }
  function quitarCapa() { capa?.remove(); capa = null; capaRuta = null; }
  function limpiar() {
    vista.style.transition = '';
    vista.style.transform = '';
    vista.style.willChange = '';
    quitarCapa();
    indicadorQuieto();
  }

  // ---- Subpestañas ([data-subdeslizar] con data-sub-i / data-sub-n) -----------------
  const panelDe = (zona) => zona.querySelector('[data-subpanel]');
  function moverSub(dx) {
    const { zona } = g;
    const panel = panelDe(zona);
    if (!panel) return;
    const i = Number(zona.dataset.subI);
    const n = Number(zona.dataset.subN);
    const hay = dx < 0 ? i < n - 1 : i > 0;
    // Sin vecina: rebote elástico.
    const x = hay ? dx : Math.sign(dx) * Math.min(72, Math.abs(dx) / 3);
    panel.style.transition = 'none';
    panel.style.transform = `translate3d(${x}px, 0, 0)`;
    panel.style.opacity = hay ? String(1 - Math.min(0.5, Math.abs(dx) / ancho())) : '';
  }
  function soltarSub(dx, v) {
    const { zona } = g;
    const panel = panelDe(zona);
    if (!panel) return;
    const W = ancho();
    const i = Number(zona.dataset.subI);
    const n = Number(zona.dataset.subN);
    const dir = dx < 0 ? 1 : -1;
    const hay = dir > 0 ? i < n - 1 : i > 0;
    const sigue = hay && (Math.abs(dx) > W / 4 || (Math.abs(v) > RAPIDO && Math.sign(v) === Math.sign(dx) && Math.abs(dx) > 24));
    ocupadoAnim = true;
    panel.style.transition = `transform ${DURACION}ms ${CURVA}, opacity ${DURACION}ms linear`;
    if (!sigue) {
      panel.style.transform = '';
      panel.style.opacity = '';
      setTimeout(() => { panel.style.transition = ''; ocupadoAnim = false; }, DURACION + 20);
      return;
    }
    panel.style.transform = `translate3d(${-dir * W}px, 0, 0)`;
    panel.style.opacity = '0';
    setTimeout(() => {
      // La pantalla cambia de subpestaña (y pinta la nueva); la nueva entra por el otro lado.
      zona.dispatchEvent(new CustomEvent('cvj:subpestana', { bubbles: true, detail: { dir } }));
      const nuevo = panelDe(zona);
      if (nuevo) {
        nuevo.style.transition = 'none';
        nuevo.style.transform = `translate3d(${dir * W * 0.4}px, 0, 0)`;
        nuevo.style.opacity = '0';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          nuevo.style.transition = `transform ${DURACION}ms ${CURVA}, opacity ${DURACION}ms linear`;
          nuevo.style.transform = '';
          nuevo.style.opacity = '';
          setTimeout(() => { nuevo.style.transition = ''; }, DURACION + 20);
        }));
      }
      if (panel !== nuevo) { panel.style.transition = ''; panel.style.transform = ''; panel.style.opacity = ''; }
      ocupadoAnim = false;
    }, DURACION);
  }

  function mover(dx) {
    const W = ancho();
    const i = g.i;
    const dir = dx < 0 ? 1 : -1;
    const vecina = PRINCIPALES[i + dir];
    if (!vecina) {
      // Borde: rebote elástico, sin vecina.
      quitarCapa();
      const r = Math.sign(dx) * Math.min(72, Math.abs(dx) / 3);
      poner(vista, r, false);
      return;
    }
    prepararCapa(vecina);
    poner(vista, dx, false);
    poner(capa, dx + dir * W, false);
    indicador(PRINCIPALES[i], vecina, Math.min(1, Math.abs(dx) / W));
  }

  function soltar(dx, v) {
    const W = ancho();
    const dir = dx < 0 ? 1 : -1;
    const vecina = PRINCIPALES[g.i + dir];
    const sigue = !!vecina && (Math.abs(dx) > W / 3 || (Math.abs(v) > RAPIDO && Math.sign(v) === Math.sign(dx) && Math.abs(dx) > 24));
    ocupadoAnim = true;
    if (!sigue) {
      poner(vista, 0, true);
      if (capa) poner(capa, dir * W, true);
      indicador(PRINCIPALES[g.i], vecina ?? null, 0);
      setTimeout(() => { limpiar(); ocupadoAnim = false; }, DURACION + 20);
      return;
    }
    poner(vista, -dir * W, true);
    poner(capa, 0, true);
    indicador(PRINCIPALES[g.i], vecina, 1);
    setTimeout(() => {
      // Ya se ve la vecina (la foto): se monta la de verdad por debajo y se quita la capa
      // cuando está pintada, sin animación de entrada ni teclado (Buscar).
      const raiz = document.documentElement;
      raiz.dataset.entra = 'deslizando';
      raiz.dataset.llegada = 'deslizar';
      let hecho = false;
      const terminar = () => {
        if (hecho) return;
        hecho = true;
        window.removeEventListener('cvj:pantalla', terminar);
        limpiar();
        ocupadoAnim = false;
        setTimeout(() => { delete raiz.dataset.entra; delete raiz.dataset.llegada; }, 60);
      };
      window.addEventListener('cvj:pantalla', terminar);
      setTimeout(terminar, 1500);
      location.hash = `#${vecina}`;
    }, DURACION);
  }

  const empezar = (e, desdeBarra) => {
    g = null;
    if (ocupadoAnim || e.touches.length !== 1) return;
    const cuerpo = document.body.classList;
    if (cuerpo.contains('hoja-abierta') || cuerpo.contains('seleccionando') || cuerpo.contains('celebrando') || cuerpo.contains('seleccionando-texto')) return;
    leerPrincipales();
    const t = e.touches[0];
    // Sobre las subpestañas: solo subpestañas (en cualquier perfil, mío o de otro).
    const zona = !desdeBarra && e.target.closest?.('[data-subdeslizar]');
    if (zona && vista.contains(zona)) {
      if (ocupado(e.target, zona)) return;
      g = { sub: true, zona, x: t.clientX, y: t.clientY, dir: null, pasos: [{ x: t.clientX, t: e.timeStamp }] };
      return;
    }
    const i = indiceActual();
    if (i < 0 || (!desdeBarra && ocupado(e.target, vista))) return;
    g = { x: t.clientX, y: t.clientY, i, dir: null, pasos: [{ x: t.clientX, t: e.timeStamp }] };
  };
  vista.addEventListener('touchstart', (e) => empezar(e, false), { passive: true });
  // La barra de abajo también cambia de pestaña principal deslizando.
  barra?.addEventListener('touchstart', (e) => empezar(e, true), { passive: true });

  // Mover y soltar, en window: si la pantalla se repinta durante el gesto (llegan datos), el
  // elemento tocado sale del DOM y sus eventos ya no llegarían a #vista.
  window.addEventListener('touchmove', (e) => {
    if (!g) return;
    if (e.touches.length !== 1) { if (g.dir === 'h') (g.sub ? soltarSub : soltar)(0, 0); g = null; return; }
    const t = e.touches[0];
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (!g.dir) {
      if (Math.abs(dx) < ARRANQUE && Math.abs(dy) < ARRANQUE) return;
      // Solo los gestos claramente horizontales; lo demás es scroll y se suelta.
      if (Math.abs(dx) < Math.abs(dy) * 1.3 || document.body.classList.contains('seleccionando')) { g = null; return; }
      g.dir = 'h';
      g.x = t.clientX; // sin salto al empezar a seguir el dedo
      if (!g.sub) vista.style.willChange = 'transform';
    }
    if (e.cancelable) e.preventDefault();
    const d = t.clientX - g.x;
    g.pasos.push({ x: t.clientX, t: e.timeStamp });
    if (g.pasos.length > 6) g.pasos.shift();
    if (g.sub) moverSub(d); else mover(d);
  }, { passive: false });

  const fin = (e) => {
    if (!g) return;
    const gesto = g;
    g = null;
    if (gesto.dir !== 'h') return;
    const t = e.changedTouches?.[0];
    const dx = (t ? t.clientX : gesto.x) - gesto.x;
    const a = gesto.pasos[0];
    const b = gesto.pasos[gesto.pasos.length - 1];
    const v = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
    g = gesto;
    if (gesto.sub) soltarSub(dx, v); else soltar(dx, v);
    g = null;
  };
  window.addEventListener('touchend', fin, { passive: true });
  window.addEventListener('touchcancel', fin, { passive: true });
}
