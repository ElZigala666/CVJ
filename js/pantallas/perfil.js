// Pantallas 06 (Perfil) y 08 (Tier list).
//   #perfil            el mío
//   #perfil/{id}       el de otro (o el mío)
//   #perfil/{id}/tiers su tier list
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as metricas from '../metricas.js';
import { usuarioActual } from '../sesion.js';
import { LETRAS, rangoTier, formatearNota, notaALetra as notaLetra } from '../notas.js';
import { esc, avatar, portada, chipLetra, cabeceraAtras, estadoVacio } from '../ui.js';
import { volver, rutaPerfil } from '../navegacion.js';
import { abrirAjustes } from '../ajustes.js';

const PESTANAS = [
  { id: 'jugando', nombre: 'Jugando' },
  { id: 'completado', nombre: 'Completados' },
  { id: 'abandonado', nombre: 'Abandonados' },
  { id: 'pendiente', nombre: 'Pendientes' },
];
const pestanaRecordada = new Map(); // usuario → pestaña (al volver de una ficha sigue igual)

export function render(el, { params, alSalir }) {
  const yo = usuarioActual();
  const id = params[0] || yo?.id;
  if (params[1] === 'tiers') return renderTiers(el, id);
  return renderPerfil(el, id, alSalir);
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------
function renderPerfil(el, id, alSalir) {
  const yo = usuarioActual();
  const esMio = id === yo?.id;

  const pintar = () => {
    const u = datos.usuario(id) ?? (esMio ? yo : null);
    if (!u) {
      el.innerHTML = `
        ${cabeceraAtras('Perfil')}
        ${estadoVacio({ icono: 'perfil', titulo: 'Este perfil no existe', texto: 'Puede que esa persona ya no esté en el grupo.' })}`;
      document.title = 'CVJ · Perfil';
      return;
    }
    document.title = `CVJ · ${esMio ? 'Perfil' : u.nombre}`;
    const p = metricas.perfil(id);
    if (!pestanaRecordada.has(id)) {
      const inicial = p.completados ? 'completado' : PESTANAS.find((x) => p.historial[x.id].length)?.id ?? 'completado';
      pestanaRecordada.set(id, inicial);
    }

    const sub = p.jugados
      ? `${p.jugados} ${p.jugados === 1 ? 'juego valorado' : 'juegos valorados'}${p.plataformaPrincipal ? ` · juega sobre todo en ${p.plataformaPrincipal}` : ''}`
      : (esMio ? 'Aún no has valorado ningún juego' : 'Aún no ha valorado ningún juego');

    el.innerHTML = `
      <section class="perfil">
        <div class="perfil-barra">
          ${esMio ? '<span></span>' : `<button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>`}
          ${esMio ? `<button type="button" class="boton-cuadrado" data-accion="ajustes" aria-label="Ajustes">${icono('ajustes', { tam: 22, color: 'var(--texto)' })}</button>` : '<span></span>'}
        </div>
        <div class="perfil-cab">
          ${avatar(u, 88)}
          <h1 class="perfil-nombre-grande">${esc(u.nombre)}</h1>
          <span class="perfil-sub">${esc(sub)}</span>
        </div>

        <div class="tarjetas-3">
          <div class="tarjeta-dato">
            <span class="dato-num">${p.completados}</span>
            <span class="dato-etq">Completados</span>
          </div>
          <div class="tarjeta-dato">
            ${p.media !== null
              ? `<span class="dato-num con-letra">${formatearNota(p.media)}${chipLetra(p.letra, 'md2')}</span>`
              : '<span class="dato-num apagado">—</span>'}
            <span class="dato-etq">Nota media</span>
          </div>
          <div class="tarjeta-dato">
            <span class="dato-num apagado">—</span>
            <span class="dato-etq">Horas · sin datos</span>
          </div>
        </div>

        ${esMio ? '' : `<a class="boton-principal enlace perfil-comparar" href="#rankings/comparar/${esc(yo.id)}/${esc(id)}">${icono('rankings', { tam: 20, color: 'currentColor' })}<span>Comparar conmigo</span></a>`}

        <div class="enlaces-perfil">
          <a class="enlace-fila" href="#perfil/${esc(id)}/tiers">
            <span class="icono-tiers" aria-hidden="true"><span data-tier="S"></span><span data-tier="B"></span><span data-tier="D"></span></span>
            <span class="enlace-fila-texto">${esMio ? 'Mi tier list' : `Tier list de ${esc(u.nombre)}`}</span>
            ${icono('adelante', { tam: 18, color: 'var(--texto-2)' })}
          </a>
          <a class="enlace-fila" href="#estadisticas/${esc(id)}">
            ${icono('rankings', { tam: 22, color: 'var(--acento)' })}
            <span class="enlace-fila-texto">Estadísticas</span>
            ${icono('adelante', { tam: 18, color: 'var(--texto-2)' })}
          </a>
        </div>

        <section class="perfil-seccion">
          <h2 class="seccion-titulo">Historial</h2>
          <div data-ref="historial"></div>
        </section>

        <section class="perfil-seccion">
          <h2 class="seccion-titulo">Bibliotecas</h2>
          <div class="bibliotecas">
            <div class="bibliotecas-cab">
              <span class="bibliotecas-icono">${icono('jugando', { tam: 24, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}</span>
              <div class="bibliotecas-texto">
                <strong>Ninguna plataforma conectada</strong>
                <span>${esMio
                  ? 'Cuando la sincronización esté lista, tu biblioteca y tus horas se cargarán solas. Mientras, tu historial es lo que valores aquí.'
                  : 'Cuando la sincronización esté lista, su biblioteca y sus horas se cargarán solas. Mientras, su historial es lo que valore aquí.'}</span>
              </div>
            </div>
            <div class="bibliotecas-fila">
              <span>PlayStation</span>
              <span class="etiqueta-gris">Próximamente</span>
            </div>
          </div>
        </section>
      </section>`;
    pintarHistorial(u, p);
  };

  const pintarHistorial = (u, p) => {
    const cont = el.querySelector('[data-ref="historial"]');
    if (!cont) return;
    if (!p.jugados && !p.pendientes) {
      cont.innerHTML = `
        <div class="historial-vacio">
          ${icono('valorar', { tam: 28, color: 'var(--acento)', trazo: 'var(--superficie)' })}
          <p>${esMio ? 'Tu historial se irá llenando con los juegos que valores.' : `${esc(u.nombre)} todavía no tiene juegos en su historial.`}</p>
          ${esMio ? '<a class="boton-secundario" href="#valorar">Valorar un juego</a>' : ''}
        </div>`;
      return;
    }
    const activa = pestanaRecordada.get(id);
    const lista = p.historial[activa];
    cont.innerHTML = `
      <div class="pestanas pestanas-historial" role="tablist" aria-label="Historial">
        ${PESTANAS.map((x) => `
          <button type="button" role="tab" class="pestana${x.id === activa ? ' activa' : ''}" aria-selected="${x.id === activa}" data-pestana="${x.id}">
            ${x.nombre} <span class="pestana-n">${p.historial[x.id].length}</span>
          </button>`).join('')}
      </div>
      ${lista.length
        ? `<div class="rejilla">${lista.map((v, i) => itemRejilla(v, i)).join('')}</div>`
        : `<p class="historial-tab-vacia">${textoVacio(activa, esMio, u.nombre)}</p>`}`;
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion], [data-pestana]');
    if (!b) return;
    if (b.dataset.pestana) {
      pestanaRecordada.set(id, b.dataset.pestana);
      const u = datos.usuario(id) ?? yo;
      pintarHistorial(u, metricas.perfil(id));
    } else if (b.dataset.accion === 'ajustes') {
      abrirAjustes(alSalir);
    } else if (b.dataset.accion === 'atras') {
      volver('#inicio');
    }
  });

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}

function textoVacio(estado, esMio, nombre) {
  const quien = esMio ? 'No tienes' : `${nombre} no tiene`;
  return {
    jugando: `${quien} ningún juego a medias ahora mismo.`,
    completado: `${quien} juegos completados todavía.`,
    abandonado: `${quien} juegos abandonados. Bien.`,
    pendiente: `${quien} juegos en pendientes.`,
  }[estado];
}

function itemRejilla(v, i) {
  const j = datos.juegoConocido(v.juego_id);
  if (!j) return '';
  const n = v.nota != null ? formatearNota(v.nota) : null;
  return `
    <a class="rejilla-item" href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}" aria-label="${esc(j.nombre)}${n ? `, ${n}` : ''}">
      ${portada(j, { clase: 'portada-rejilla', titulo: 'arriba', prioridad: i < 6 })}
      ${n ? `<span class="rejilla-nota">${n}${chipLetra(notaLetra(v.nota), 'mini')}</span>` : ''}
    </a>`;
}

// ---------------------------------------------------------------------------
// Tier list
// ---------------------------------------------------------------------------
/** "9.0–10" → "9–10" (como en el diseño). */
const rangoCorto = (l) => rangoTier(l).replace(/^(\d+)\.0–/, '$1–');

function renderTiers(el, id) {
  const pintar = () => {
    const u = datos.usuario(id);
    if (!u) {
      el.innerHTML = `${cabeceraAtras('Tier list')}${estadoVacio({ icono: 'perfil', titulo: 'Este perfil no existe', texto: 'Puede que esa persona ya no esté en el grupo.' })}`;
      return;
    }
    const t = metricas.tierList(id);
    document.title = `CVJ · Tier list de ${u.nombre}`;
    let n = 0;
    el.innerHTML = `
      ${cabeceraAtras('Tier list', `${u.nombre} · ${t.total} ${t.total === 1 ? 'juego' : 'juegos'}, según sus notas`)}
      <div class="tiers">
        ${LETRAS.map((l) => `
          <div class="tier-fila">
            <div class="tier-letra" data-tier="${l}">
              <span class="tier-letra-l">${l}</span>
              <span class="tier-rango">${rangoCorto(l)}</span>
            </div>
            <div class="tier-juegos">
              ${t.filas[l].length
                ? t.filas[l].map((v) => {
                    const j = datos.juegoConocido(v.juego_id);
                    if (!j) return '';
                    return `
                      <a class="tier-item" href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}" aria-label="${esc(j.nombre)}, ${formatearNota(v.nota)}">
                        ${portada(j, { clase: 'portada-tier', titulo: 'arriba', prioridad: n++ < 12 })}
                        <span class="tier-nota">${formatearNota(v.nota)}</span>
                      </a>`;
                  }).join('')
                : '<span class="tier-vacio">Ningún juego en este tier</span>'}
            </div>
          </div>`).join('')}
      </div>`;
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="atras"]')) volver(rutaPerfil(id));
  });
  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}
