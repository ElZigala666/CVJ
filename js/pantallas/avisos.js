// #avisos: el centro de avisos. Agrupados por día (Hoy, Ayer, Esta semana...), con avatar e
// icono del tipo, las no leídas resaltadas, filtros "Todo / Sobre mí / Grupo" y "Marcar todo
// como leído". Tocar uno lleva al sitio exacto y lo marca como leído (js/avisos.js).
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
  const pintar = () => pintarHtml(el, html(yo));

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="atras"]')) { volver('#inicio'); return; }
    const f = e.target.closest('[data-filtro]');
    if (f) { filtro = f.dataset.filtro; pintar(); return; }
    if (e.target.closest('[data-todo-leido]')) {
      datos.marcarAvisos(yo.id, null, {}, aviso);
      aviso('Todo leído');
      return;
    }
    const a = e.target.closest('[data-aviso]');
    if (a) { e.preventDefault(); avisos.abrir(a.dataset.aviso); }
  });

  const reloj = setInterval(() => { if (!el.hidden) pintar(); }, 60_000); // los "hace 5 min"
  const quitar = datos.suscribir(pintar);
  pintar();
  return () => { clearInterval(reloj); quitar(); };
}

function html(yo) {
  const ahora = new Date();
  const todas = datos.notificaciones().filter((n) => n.usuario_id === yo?.id);
  const lista = todas.filter((n) => filtro === 'todo' || n.categoria === filtro)
    .sort((a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en));
  const sinLeer = todas.filter((n) => !n.leida).length;
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
          <p class="cementerio-cuenta">${sinLeer ? `${sinLeer} sin leer` : 'Todo leído'}</p>
        </div>
        ${sinLeer ? '<button type="button" class="enlace-discreto avisos-todo" data-todo-leido>Marcar todo como leído</button>' : ''}
      </header>
      <div class="segmentado avisos-filtros" role="tablist" aria-label="Filtrar avisos">
        ${FILTROS.map(([id, t]) => `<button type="button" role="tab" data-filtro="${id}" class="${filtro === id ? 'activo' : ''}" aria-selected="${filtro === id}">${t}</button>`).join('')}
      </div>
      ${grupos.length ? grupos.map(({ g, l }) => `
        <section class="avisos-dia" data-k="${esc(g)}">
          <h2 class="avisos-dia-titulo">${g}</h2>
          <div class="avisos-lista">${l.map((n) => avisos.fila(n, ahora)).join('')}</div>
        </section>`).join('') : estadoVacio({
          icono: 'aviso',
          titulo: filtro === 'todo' ? 'Nada por aquí' : 'Nada de esto',
          texto: 'Cuando alguien reaccione a lo tuyo, publique, proponga a alguien o pase algo en el grupo, lo verás aquí.',
        })}
    </section>`;
}
