// Lo que se ve dentro del perfil (pestañas Tier list, Estadísticas y Columna) y también en
// Rankings (Tier list y Estadísticas, con la fila de personas y "Grupo"): solo el HTML del
// contenido, sin cabecera. La columna suelta (#columna/{id}) usa htmlColumna.
import { icono } from './icons.js';
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { LETRAS, rangoTier, formatearNota } from './notas.js';
import { esc, avatar, portada, chipLetra } from './ui.js';
import { textoLectura, logoColumna, nombreColumna, esLegado } from './columnas-ui.js';
import { temaDe } from './pantallas/lectura.js';
import { cuentasHtml } from './social.js';

const ALTO_BARRA = 80;
const rangoCorto = (l) => rangoTier(l).replace(/^(\d+)\.0–/, '$1–');

// ---------------------------------------------------------------------------
// Fila de personas (y "Grupo") para cambiar sin salir
// ---------------------------------------------------------------------------
export function chipsUsuarios(activo, { grupo = false } = {}) {
  const todos = metricas.usuariosActivos();
  return `
    <div class="chips-usuarios" role="tablist" aria-label="Persona" data-scroll="usuarios">
      ${grupo ? `
        <button type="button" role="tab" class="chip-usuario chip-grupo${activo === 'grupo' ? ' activo' : ''}" aria-selected="${activo === 'grupo'}" data-usuario="grupo">
          <span class="chip-grupo-icono">${icono('rankings', { tam: 18, color: 'currentColor' })}</span><span>Grupo</span>
        </button>` : ''}
      ${todos.map((x) => `
        <button type="button" role="tab" class="chip-usuario${x.id === activo ? ' activo' : ''}" aria-selected="${x.id === activo}" data-usuario="${esc(x.id)}">
          ${avatar(x, 30)}<span>${esc(x.nombre)}</span>
        </button>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------------------
// Tier list (de alguien o del grupo)
// ---------------------------------------------------------------------------
export function htmlTiers(id) {
  const t = metricas.tierList(id);
  let n = 0;
  if (!t.total) return `<p class="historial-tab-vacia">Todavía no hay notas que cuenten en la tier list.</p>`;
  return `
    <p class="tiers-sub">${t.total} ${t.total === 1 ? 'juego' : 'juegos'}, según sus notas</p>
    <div class="tiers" data-lista>
      ${LETRAS.map((l) => fila(l, t.filas[l].map((v) => {
        const j = v.esColeccion ? datos.comoJuego(datos.coleccion(v.coleccion_id)) : datos.juegoConocido(v.juego_id);
        if (!j) return '';
        const h = v.esColeccion ? metricas.horasColeccion(id, v.coleccion_id).total : metricas.horasDe(id, v.juego_id);
        const est = v.esColeccion ? metricas.horasColeccion(id, v.coleccion_id).estimadas : metricas.estimadasDe(id, v.juego_id);
        return item(j, v.esColeccion, formatearNota(v.nota), h ? metricas.textoAprox(h, est) : '', n++ < 12);
      }))).join('')}
    </div>`;
}

/** La del grupo: cada juego con la nota media de todos los que lo han valorado. */
export function htmlTiersGrupo() {
  const t = metricas.tierListGrupo();
  let n = 0;
  if (!t.total) return `<p class="historial-tab-vacia">Todavía no hay notas en el grupo.</p>`;
  return `
    <p class="tiers-sub">${t.total} ${t.total === 1 ? 'juego' : 'juegos'}, con la nota media de todos</p>
    <div class="tiers">
      ${LETRAS.map((l) => fila(l, t.filas[l].map((x) => item(x.juego, !!x.coleccion, formatearNota(x.media), `${x.votos} ${x.votos === 1 ? 'nota' : 'notas'}`, n++ < 12, false)))).join('')}
    </div>`;
}

const fila = (l, items) => `
  <div class="tier-fila">
    <div class="tier-letra" data-tier="${l}">
      <span class="tier-letra-l">${l}</span>
      <span class="tier-rango">${rangoCorto(l)}</span>
    </div>
    <div class="tier-juegos">
      ${items.filter(Boolean).length ? items.join('') : '<span class="tier-vacio">Ningún juego en este tier</span>'}
    </div>
  </div>`;

function item(j, esColeccion, nota, pie, prioridad, seleccionable = true) {
  return `
    <a class="tier-item${esColeccion ? ' es-coleccion' : ''}"${esColeccion || !seleccionable ? '' : ` data-sel="${j.igdb_id}"`} href="${metricas.rutaDe(j)}" data-precarga="${esc(j.cover_id ?? '')}" aria-label="${esc(j.nombre)}${esColeccion ? ' (colección)' : ''}, ${nota}">
      ${portada(j, { clase: 'portada-tier', titulo: 'arriba', prioridad })}
      ${esColeccion ? '<span class="sello-coleccion mini">Colección</span>' : ''}
      <span class="tier-nota">${nota}${pie ? `<small class="tier-horas">${esc(pie)}</small>` : ''}</span>
    </a>`;
}

// ---------------------------------------------------------------------------
// Estadísticas de alguien
// ---------------------------------------------------------------------------
export function htmlEstadisticas(id) {
  const u = datos.usuario(id);
  if (!u) return '';
  const s = metricas.estadisticas(id);
  const bib = metricas.biblioteca(id);
  const maxTier = Math.max(1, ...Object.values(s.reparto));
  const maxPlat = Math.max(1, ...s.plataformas.map((x) => x.n));
  const vsGrupo = s.vsGrupo === null ? '' : ` · ${s.vsGrupo > 0 ? '+' : s.vsGrupo < 0 ? '−' : '±'}${Math.abs(s.vsGrupo).toFixed(1)} vs grupo`;
  return `
    <section class="stats-seccion">
      <h2 class="stats-titulo">Juegos</h2>
      <div class="tarjetas-3">
        ${dato(s.jugados, 'Jugados')}
        ${dato(s.completados, 'Completados')}
        ${dato(s.abandonados, 'Abandonados')}
        ${dato(s.jugando, 'Jugando')}
        ${dato(s.pendientes, 'Pendientes')}
        ${dato(bib.total || (datos.cuentasDe(u.id).length ? 0 : null), 'En biblioteca')}
      </div>
    </section>

    <section class="stats-seccion">
      <h2 class="stats-titulo">Notas</h2>
      <div class="tarjetas-2">
        <div class="tarjeta-dato grande">
          ${s.media !== null
            ? `<span class="dato-num grande con-letra">${formatearNota(s.media)}${chipLetra(s.letra, 'md')}</span>`
            : '<span class="dato-num grande apagado">—</span>'}
          <span class="dato-etq">Nota media${esc(vsGrupo)}</span>
        </div>
        <div class="tarjeta-dato grande">
          ${s.recomendacion.total
            ? `<span class="dato-num grande con-letra">${icono('recomendado', { tam: 22, color: 'var(--acento)', trazo: 'var(--superficie)', grosor: 2.4 })}${s.recomendacion.si}<span class="dato-de">/${s.recomendacion.total}</span></span>
               <span class="dato-etq">Juegos que recomienda · ${s.recomendacion.porcentaje}%</span>`
            : `<span class="dato-num grande apagado">—</span>
               <span class="dato-etq">Aún no ha dicho si recomienda alguno</span>`}
        </div>
      </div>
      <div class="tarjeta-reparto">
        <span class="reparto-titulo">Reparto por tier</span>
        <div class="reparto-grande">
          ${LETRAS.map((l) => {
            const k = s.reparto[l];
            const alto = k ? Math.max(10, Math.round((k / maxTier) * ALTO_BARRA)) : 3;
            return `
              <div class="reparto-grande-col">
                <span class="reparto-grande-n">${k}</span>
                <div class="reparto-barra${k ? '' : ' vacia'}" data-tier="${l}" style="height:${alto}px;border-radius:6px"></div>
                <span class="reparto-grande-l">${l}</span>
              </div>`;
          }).join('')}
        </div>
      </div>
    </section>

    <section class="stats-seccion">
      <h2 class="stats-titulo">Plataformas</h2>
      <span class="stats-nota">Según la plataforma indicada al valorar</span>
      ${s.plataformas.length
        ? `<div class="barras-plataforma">${s.plataformas.map((x) => `
            <div class="barra-plataforma">
              <span class="barra-plataforma-nombre">${esc(x.nombre)}</span>
              <div class="barra-plataforma-pista"><div style="width:${Math.max(4, Math.round((x.n / maxPlat) * 100))}%"></div></div>
              <span class="barra-plataforma-n">${x.n}</span>
            </div>`).join('')}</div>`
        : '<p class="stats-vacio">Todavía no hay plataformas indicadas.</p>'}
    </section>

    <section class="stats-seccion">
      <h2 class="stats-titulo">Tiempo de juego</h2>
      ${tiempoDeJuego(u, bib, metricas.tiempo(id))}
    </section>`;
}

/** Horas totales (sincronizadas de todas las cuentas + extra), top 5 por horas y reparto por plataforma. */
function tiempoDeJuego(u, bib, t) {
  if (!t.total && !bib.total) {
    return `
      <div class="caja-punteada">
        ${icono('pendiente', { tam: 18, color: 'var(--texto-2)', trazo: 'var(--fondo)' })}
        <span>${datos.cuentasDe(u.id).length
          ? 'Hay una plataforma conectada, pero aún no hay juegos sincronizados.'
          : 'Las horas aparecerán aquí cuando se conecte una plataforma o se escriban al valorar.'}</span>
      </div>`;
  }
  const max = Math.max(1, ...t.top.map((x) => x.horas));
  const maxJuegos = Math.max(1, ...bib.plataformas.map((x) => x.juegos));
  return `
    <div class="tarjeta-dato grande">
      ${t.total ? `<span class="dato-num grande">${t.total}<span class="dato-de"> h</span></span>` : '<span class="dato-num grande apagado">—</span>'}
      <span class="dato-etq">jugadas${bib.total ? ` · ${bib.total} ${bib.total === 1 ? 'juego' : 'juegos'} en su biblioteca` : ''}</span>
      ${t.estimadas ? `<span class="dato-etq">Incluye ≈${t.estimadas} h estimadas</span>` : ''}
    </div>
    ${t.top.length ? `
      <span class="stats-nota">Los más jugados</span>
      <div class="barras-plataforma barras-horas">
        ${t.top.map((x) => `
          <div class="barra-plataforma">
            <span class="barra-plataforma-nombre largo" title="${esc(x.nombre)}">${esc(x.nombre)}</span>
            <div class="barra-plataforma-pista"><div style="width:${Math.max(4, Math.round((x.horas / max) * 100))}%"></div></div>
            <span class="barra-plataforma-n ancho">${esc(metricas.textoAprox(x.horas, x.estimadas))}</span>
          </div>`).join('')}
      </div>` : ''}
    ${bib.plataformas.length > 1 ? `
      <span class="stats-nota">Por plataforma (juegos en su biblioteca)</span>
      <div class="barras-plataforma">
        ${bib.plataformas.map((x) => `
          <div class="barra-plataforma">
            <span class="barra-plataforma-nombre">${esc(x.nombre)}</span>
            <div class="barra-plataforma-pista"><div style="width:${Math.max(4, Math.round((x.juegos / maxJuegos) * 100))}%"></div></div>
            <span class="barra-plataforma-n ancho">${x.juegos}${x.horas ? ` · ${x.horas} h` : ''}</span>
          </div>`).join('')}
      </div>` : ''}`;
}

function dato(n, etiqueta) {
  return `
    <div class="tarjeta-dato">
      <span class="dato-num${n === null ? ' apagado' : ''}">${n === null ? '—' : n}</span>
      <span class="dato-etq">${etiqueta}</span>
    </div>`;
}

// ---------------------------------------------------------------------------
// Columna (la página suelta y la pestaña del perfil)
// ---------------------------------------------------------------------------
const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const FECHA_CORTA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

/** embebida: dentro del perfil (sin botón de volver ni "por {autor}"). */
export function htmlColumna(col, yo, { embebida = false } = {}) {
  const autor = datos.usuario(col.usuario_id);
  const legado = esLegado(col);
  const mia = col.usuario_id === yo?.id && !legado; // un difunto no publica
  const ents = datos.entradasPublicadas(col.id);
  const borradores = mia ? datos.borradoresDe(yo.id).filter((e) => e.columna_id === col.id) : [];
  const [primera, ...resto] = ents;
  const tarjeta = (e, grande = false) => {
    const t = temaDe(e);
    return `
      <a class="col-entrada${grande ? ' destacada' : ''}" href="#entrada/${esc(e.id)}">
        ${t?.juego ? portada(t.juego, { clase: grande ? 'portada-col-grande' : 'portada-lista' }) : ''}
        <span class="col-entrada-texto">
          ${t ? `<small class="col-entrada-tema">${esc(t.nombre)}</small>` : ''}
          <strong>${esc(e.titulo || 'Sin título')}</strong>
          ${grande && e.subtitulo ? `<span class="col-entrada-sub">${esc(e.subtitulo)}</span>` : ''}
          <small>${esc((grande ? FECHA : FECHA_CORTA).format(new Date(e.publicada_en ?? e.actualizado_en)))} · ${esc(textoLectura(e.palabras))}</small>
          ${cuentasHtml('entrada', e.id)}
        </span>
      </a>`;
  };
  return `
    <section class="columna${embebida ? ' embebida' : ''}" style="${col.color ? `--col:${esc(col.color)}` : ''}">
      <header class="columna-portada">
        ${embebida ? '' : `<button type="button" class="boton-cuadrado columna-volver" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>`}
        ${logoColumna(col, embebida ? 72 : 96)}
        <h1 class="columna-nombre">${esc(nombreColumna(col))}</h1>
        ${legado ? `<p class="columna-legado">Antes «${esc(col.nombre)}». Su autor descansa en el <a href="#cementerio">cementerio</a> y ya no publicará nada más.</p>` : ''}
        <p class="columna-autor">${embebida ? '' : `por <a href="#perfil/${esc(col.usuario_id)}">${esc(autor?.nombre ?? '')}</a> · `}${ents.length} ${ents.length === 1 ? 'entrada' : 'entradas'}</p>
        ${mia ? '<a class="boton-principal enlace" href="#escribir/nueva">Escribir una entrada</a>' : ''}
      </header>
      ${borradores.length ? `
        <section class="columna-seccion">
          <h2 class="columna-seccion-titulo">Tus borradores</h2>
          ${borradores.map((e) => `<a class="col-borrador" href="#escribir/${esc(e.id)}"><strong>${esc(e.titulo || 'Sin título')}</strong><small>${esc(textoLectura(e.palabras))} · guardado ${esc(FECHA_CORTA.format(new Date(e.actualizado_en)))}</small></a>`).join('')}
        </section>` : ''}
      ${primera ? `
        <section class="columna-seccion">
          ${tarjeta(primera, true)}
          ${resto.length ? `<div class="columna-lista">${resto.map((e) => tarjeta(e)).join('')}</div>` : ''}
        </section>`
        : `<p class="columna-vacia">${mia ? 'Tu columna está esperando su primer texto.' : `${esc(autor?.nombre ?? 'Su autor')} todavía no ha publicado nada.`}</p>`}
    </section>`;
}
