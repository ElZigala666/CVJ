// #avisos: el centro de avisos. Agrupados por día (Hoy, Ayer, Esta semana...), con avatar e
// icono del tipo y filtros "Todo / Sobre mí / Grupo". Al entrar se marcan todos como leídos
// (el contador a cero); los que eran nuevos siguen resaltados durante esa visita. Tocar uno
// lleva al sitio exacto (js/avisos.js).
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as avisos from '../avisos.js';
import { usuarioActual } from '../sesion.js';
import { esc, pintarHtml, aviso, estadoVacio } from '../ui.js';
import { volver } from '../navegacion.js';

const FILTROS = [['todo', 'Todo'], ['mi', 'Sobre mí'], ['grupo', 'Grupo']];
let filtro = 'todo'; // se recuerda mientras la app está abierta

const DIA = 86400000;
function grupoDia(f, ahora) {
  const hoy = new Date(ahora); hoy.setHours(0, 0, 0, 0);
  const t = new Date(f).getTime();
  if (t >= hoy.getTime()) return 'Hoy';
  if (t >= hoy.getTime() - DIA) return 'Ayer';
  if (t >= hoy.getTime() - 6 * DIA) return 'Esta semana';
  if (t >= hoy.getTime() - 30 * DIA) return 'Este mes';
  return 'Antes';
}

export function render(el) {
  document.title = 'CVJ · Avisos';
  const yo = usuarioActual();
  // Los que eran nuevos al entrar (siguen resaltados toda la visita).
  let nuevos = new Set();
  const pintar = () => pintarHtml(el, html(yo, nuevos));
  /** Leer todo lo que haya sin leer (al entrar y, mientras se está aquí, lo que llegue). */
  const leer = () => {
    if (el.hidden || !el.isConnected || !yo) return;
    const sin = datos.notificaciones().filter((n) => n.usuario_id === yo.id && !n.leida);
    if (!sin.length) return;
    for (const n of sin) nuevos.add(n.id);
    datos.marcarAvisos(yo.id, sin.map((n) => n.id), {}, aviso);
  };
  // Si es una pestaña de la barra se queda montada: cada visita empieza de nuevo.
  // (El primer aviso de "pantalla puesta" es el de este mismo montaje: no cuenta.)
  let montada = false;
  const alVolver = () => {
    if (!montada) { montada = true; return; }
    if (!el.hidden && el.isConnected) { nuevos = new Set(); leer(); pintar(); }
  };
  window.addEventListener('cvj:pantalla', alVolver);

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="atras"]')) { volver('#inicio'); return; }
    const f = e.target.closest('[data-filtro]');
    if (f) { filtro = f.dataset.filtro; pintar(); return; }
    const a = e.target.closest('[data-aviso]');
    if (a) { e.preventDefault(); avisos.abrir(a.dataset.aviso); }
  });

  const reloj = setInterval(() => { if (!el.hidden) pintar(); }, 60_000); // los "hace 5 min"
  const quitar = datos.suscribir(() => { leer(); pintar(); });
  leer();
  pintar();
  return () => { clearInterval(reloj); quitar(); window.removeEventListener('cvj:pantalla', alVolver); };
}

function html(yo, nuevos) {
  const ahora = new Date();
  const todas = datos.notificaciones().filter((n) => n.usuario_id === yo?.id);
  // Las insignias que llegan juntas, en un solo aviso.
  const lista = avisos.agrupar(todas.filter((n) => filtro === 'todo' || n.categoria === filtro)
    .sort((a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en)));
  const sinLeer = todas.filter((n) => nuevos.has(n.id)).length;
  const grupos = [];
  for (const n of lista) {
    const g = grupoDia(n.actualizado_en, ahora);
    if (!grupos.length || grupos[grupos.length - 1].g !== g) grupos.push({ g, l: [] });
    grupos[grupos.length - 1].l.push(n);
  }
  return `
    <section class="avisos-pantalla">
      <header class="cementerio-cab avisos-cab">
        <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
        <div class="cementerio-cab-texto">
          <h1 class="cementerio-titulo">Avisos</h1>
          <p class="cementerio-cuenta">${sinLeer ? `${sinLeer} ${sinLeer === 1 ? 'nuevo' : 'nuevos'}` : 'Nada nuevo'}</p>
        </div>
      </header>
      <div class="segmentado avisos-filtros" role="tablist" aria-label="Filtrar avisos">
        ${FILTROS.map(([id, t]) => `<button type="button" role="tab" data-filtro="${id}" class="${filtro === id ? 'activo' : ''}" aria-selected="${filtro === id}">${t}</button>`).join('')}
      </div>
      ${grupos.length ? grupos.map(({ g, l }) => `
        <section class="avisos-dia" data-k="${esc(g)}">
          <h2 class="avisos-dia-titulo">${g}</h2>
          <div class="avisos-lista">${l.map((n) => avisos.fila(n, ahora, { nueva: avisos.idsDe(n).some((id) => nuevos.has(id)) })).join('')}</div>
        </section>`).join('') : estadoVacio({
          icono: 'aviso',
          titulo: filtro === 'todo' ? 'Nada por aquí' : 'Nada de esto',
          texto: 'Cuando alguien reaccione a lo tuyo, publique, proponga a alguien o pase algo en el grupo, lo verás aquí.',
        })}
    </section>`;
}
