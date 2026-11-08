// "Revisar posibles duplicados" (#duplicados): mis juegos con horas en Steam (o Epic) y
// también en Xbox que pueden ser las mismas partidas. Por fila: las horas de cada fuente,
// por qué lo parece y los tres atajos. Con la selección múltiple (mantener pulsada una
// fila) se resuelven varios a la vez.
import * as datos from '../datos.js';
import * as metricas from '../metricas.js';
import { usuarioActual } from '../sesion.js';
import { esc, portada, cabeceraAtras, estadoVacio, avisoDeshacer } from '../ui.js';
import { volver } from '../navegacion.js';
import { configurarSeleccion } from '../seleccion.js';
import { avisoDuplicado, manejarHoras, resolverDuplicados, TEXTO_RESUELTO } from '../horas-ui.js';

export function render(el) {
  const yo = usuarioActual();
  if (!yo) return;
  document.title = 'CVJ · Posibles duplicados';

  const pintar = () => {
    const lista = metricas.posiblesDuplicados(yo.id);
    el.innerHTML = `
      ${cabeceraAtras('Posibles duplicados', lista.length ? `${lista.length} ${lista.length === 1 ? 'juego' : 'juegos'} con horas en PC y en Xbox` : 'Nada que revisar')}
      <div class="duplicados">
        <p class="ajustes-nota">Xbox también apunta partidas de PC (Game Pass para PC, Play Anywhere) y no dice en qué dispositivo se jugó. Por defecto las horas de las dos fuentes suman; aquí decides qué cuenta. Lo que elijas se respeta en cada sincronización.</p>
        ${lista.length ? `
          <div class="duplicados-lista" data-lista>
            ${lista.map((x) => fila(x)).join('')}
          </div>`
          : estadoVacio({ icono: 'completado', titulo: 'No hay posibles duplicados', texto: 'Si un juego tiene horas en Steam y también en Xbox, aparecerá aquí.' })}
      </div>`;
  };

  configurarSeleccion({
    soloPropias: true,
    acciones: [
      { id: 'pc', texto: 'Solo Steam', icono: 'completado', hacer: (c) => enLote(c, 'pc') },
      { id: 'xbox', texto: 'Solo Xbox', icono: 'jugando', hacer: (c) => enLote(c, 'xbox') },
      { id: 'distintas', texto: 'Distintas', icono: 'fusionar', hacer: (c) => enLote(c, 'distintas') },
    ],
  });
  const enLote = (claves, modo) => {
    const r = resolverDuplicados(yo.id, claves.map(Number), modo);
    if (r.cuantos) avisoDeshacer(`${TEXTO_RESUELTO[modo]} en ${r.cuantos} ${r.cuantos === 1 ? 'juego' : 'juegos'}`, r.deshacer);
  };

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="atras"]')) { volver('#perfil'); return; }
    manejarHoras(e, yo.id);
  });

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}

function fila(x) {
  const lineas = x.desglose.filter((d) => !d.extra && !d.estimada);
  return `
    <div class="dup-fila" data-sel="${x.igdbId}" data-sel-tipo="fila">
      <a class="dup-cab" href="#juego/${x.igdbId}" data-precarga="${esc(x.juego.cover_id ?? '')}">
        ${portada(x.juego, { clase: 'portada-lista' })}
        <span class="dup-texto">
          <strong>${esc(x.juego.nombre)}</strong>
          <small>${esc(lineas.map((d) => `${metricas.NOMBRE_FUENTE[d.fuente] ?? d.fuente}${d.fuente === 'xbox' ? ` (${d.plataforma})` : ''} ${metricas.textoHoras(d.horas)}`).join(' · '))}</small>
          <small>Ahora suman ${esc(metricas.textoHoras(x.horas))}</small>
        </span>
      </a>
      ${avisoDuplicado(x.duplicado, x.igdbId)}
    </div>`;
}
