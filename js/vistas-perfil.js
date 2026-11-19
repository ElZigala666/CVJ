// Lo que se ve dentro del perfil (pestañas Tier list, Estadísticas y Columna) y también en
// Rankings (Tier list y Estadísticas, con la fila de personas y "Grupo"): el HTML del
// contenido, sin cabecera. La columna suelta (#columna/{id}) usa htmlColumna.
import { icono } from './icons.js';
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { LETRAS, rangoTier, formatearNota, notaALetra } from './notas.js';
import { esc, avatar, portada, chipLetra } from './ui.js';
import { usuarioActual } from './sesion.js';
import { abrirHoja } from './hoja.js';
import * as clas from './clasificacion.js';
import * as grafico from './graficos.js';
import { textoLectura, logoColumna, nombreColumna, esLegado } from './columnas-ui.js';
import { temaDe } from './pantallas/lectura.js';
import { cuentasHtml } from './social.js';

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
// Estadísticas (de alguien o del grupo): resumen compacto, revelaciones, ADN de jugador
// (radar), géneros favoritos, temas / modos / perspectiva (anillos), mi año (mapa de calor)
// y plataformas y horas. Con pocos datos, menos secciones (nunca gráficos vacíos).
// Los gráficos: js/graficos.js; los datos: js/clasificacion.js.
// ---------------------------------------------------------------------------
// Lo elegido en los selectores se recuerda mientras la app está abierta.
let modoGeneros = 'juegos';
let superpuesta = 'grupo';
const MODOS_GENEROS = [['juegos', 'Por juegos'], ['horas', 'Por horas'], ['nota', 'Por nota']];
const ANILLOS = [['temas', 'Temas'], ['modos', 'Modos de juego'], ['perspectivas', 'Perspectiva']];
const MIN_ANILLO = 5; // grupo: veces jugado
const MIN_JUEGOS = 5; // alguien: juegos jugados con ese dato

const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const deN = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
/** 12 345 (espacio fino de miles: no se confunde con el punto de las notas). */
const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function htmlEstadisticas(id) {
  const u = datos.usuario(id);
  if (!u) return '';
  const tu = id === usuarioActual()?.id;
  const s = metricas.estadisticas(id);
  const bib = metricas.biblioteca(id);
  const t = metricas.tiempo(id);
  const r = clas.radar();
  const serie = r.series.get(id);
  const rev = clas.revelaciones(id, tu);
  const gen = clas.dimension(id, 'generos');
  const anillos = ANILLOS.map(([dim, nombre]) => ({ dim, nombre, partes: clas.dimension(id, dim) }))
    .filter((a) => clas.cuantosCon(id, a.dim) >= MIN_JUEGOS && a.partes.length >= 2);
  const hayGeneros = clas.cuantosCon(id, 'generos') >= MIN_JUEGOS && gen.filter((g) => g.n).length >= 3;
  const poco = !serie && !hayGeneros && !rev.length;

  return `
    <div class="stats graf" data-uid="${esc(id)}">
      ${resumen(s, t, bib, u)}
      ${poco ? `
        <div class="caja-punteada stats-poco">
          ${icono('rankings', { tam: 18, color: 'var(--texto-2)' })}
          <span>${tu ? 'Valora unos cuantos juegos más y aquí saldrá tu ADN de jugador: tus géneros, temas y manías.' : `Cuando ${esc(u.nombre)} valore unos cuantos juegos más, aquí saldrá su ADN de jugador.`}</span>
        </div>` : ''}
      ${rev.length ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">${tu ? 'Lo que dicen tus datos' : 'Lo que dicen sus datos'}</h2>
          <div class="revelaciones" data-scroll="revelaciones">${rev.map((x) => revelacion(x, id)).join('')}</div>
        </section>` : ''}
      ${serie ? seccionRadar(id, serie, r, tu ? 'Tu ADN de jugador' : `ADN de jugador de ${esc(u.nombre)}`) : ''}
      ${hayGeneros ? `
        <section class="stats-seccion">
          <div class="stats-cab">
            <h2 class="stats-titulo">Géneros favoritos</h2>
            ${selectorGeneros()}
          </div>
          <div data-ref="generos-lista">${listaGeneros(id, modoGeneros)}</div>
        </section>` : ''}
      ${anillos.length ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">${tu ? 'Cómo juegas' : 'Cómo juega'}</h2>
          <div class="anillos">${anillos.map((a) => `
            <div class="anillo-bloque">
              <h3 class="anillo-titulo">${a.nombre}</h3>
              ${grafico.anillo({ partes: a.partes, dim: a.dim, uid: id, titulo: a.nombre })}
            </div>`).join('')}
          </div>
        </section>` : ''}
      ${miAnio(id, tu)}
      ${plataformasYHoras(u, s, bib, t)}
    </div>`;
}

/** Las del grupo (Rankings → Estadísticas → Grupo). */
export function htmlEstadisticasGrupo() {
  const g = clas.estadisticasGrupo();
  const r = clas.radar();
  const serie = r.series.get('grupo');
  const gen = clas.dimensionGrupo('generos');
  const anillos = ANILLOS.map(([dim, nombre]) => ({ dim, nombre, partes: clas.dimensionGrupo(dim) }))
    .filter((a) => a.partes.reduce((x, p) => x + p.n, 0) >= MIN_ANILLO && a.partes.length >= 2);
  const une = g.une;
  const curiosidades = [
    g.olvidado ? {
      titulo: 'El género que nadie toca', dato: g.olvidado.tag, dim: 'generos', tag: g.olvidado.tag, largo: true,
      frase: g.olvidado.n ? `Solo ${deN(g.olvidado.n, 'juego', 'juegos')} en todo el grupo.` : 'Nadie del grupo ha jugado nunca a uno.',
    } : null,
    g.decada ? {
      titulo: 'La década del grupo', dato: clas.nombreDecada(g.decada.d).replace('los ', ''), dim: 'decadas', tag: String(g.decada.d),
      frase: `${deN(g.decada.n, 'juego', 'juegos')} de ${clas.nombreDecada(g.decada.d)} jugados en el grupo${g.decada.media != null ? `, con un ${fmt1(g.decada.media)} de media` : ''}.`,
    } : null,
  ].filter(Boolean);
  return `
    <div class="stats graf" data-uid="grupo">
      <section class="stats-resumen">
        <div class="resumen-cifras">
          ${cifra(g.distintos, 'Juegos distintos')}
          ${cifra(g.notas, 'Notas')}
          ${cifra(g.media != null ? `${formatearNota(g.media)}${chipLetra(notaALetra(g.media), 'sm')}` : '—', 'Nota media', true)}
          ${cifra(g.horas ? `${miles(g.horas)}<small> h</small>` : '—', 'Jugadas', true)}
        </div>
      </section>
      ${une ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">El juego que más une</h2>
          <a class="juego-une" href="${metricas.rutaDe(une.juego)}">
            ${portada(une.juego, { clase: 'portada-lista' })}
            <span class="juego-une-texto">
              <strong>${esc(une.juego.nombre)}</strong>
              <span>${deN(une.buenas.length, 'persona le ha', 'personas le han')} puesto buena nota · ${formatearNota(une.media)} de media</span>
              <span class="juego-une-caras">${une.buenas.map((uid) => datos.usuario(uid)).filter(Boolean).map((x) => avatar(x, 24)).join('')}</span>
            </span>
          </a>
        </section>` : ''}
      ${serie ? seccionRadar('grupo', serie, r, 'El ADN del grupo') : ''}
      ${gen.filter((x) => x.n).length >= 3 ? `
        <section class="stats-seccion">
          <div class="stats-cab">
            <h2 class="stats-titulo">Géneros del grupo</h2>
            ${selectorGeneros()}
          </div>
          <div data-ref="generos-lista">${listaGeneros('grupo', modoGeneros)}</div>
        </section>` : ''}
      ${g.especialistas.length ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">Los especialistas</h2>
          <span class="stats-nota">A quién le tira más cada género: el que más parte de lo suyo le dedica</span>
          <div class="especialistas">
            ${g.especialistas.map((e) => { const x = datos.usuario(e.uid); return x ? `
              <button type="button" class="especialista" data-graf="generos" data-tag="${esc(e.tag)}" data-uid="${esc(e.uid)}">
                <span class="especialista-genero">${esc(e.tag)}</span>
                ${avatar(x, 26)}
                <span class="especialista-nombre">${esc(x.nombre)}</span>
                <span class="especialista-dato">${Math.round(e.parte * 100)}% · ${deN(e.n, 'juego', 'juegos')}</span>
              </button>` : ''; }).join('')}
          </div>
        </section>` : ''}
      ${curiosidades.length ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">Curiosidades</h2>
          <div class="revelaciones">${curiosidades.map((x) => revelacion(x, 'grupo')).join('')}</div>
        </section>` : ''}
      ${anillos.length ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">Cómo juega el grupo</h2>
          <div class="anillos">${anillos.map((a) => `
            <div class="anillo-bloque">
              <h3 class="anillo-titulo">${a.nombre}</h3>
              ${grafico.anillo({ partes: a.partes, dim: a.dim, uid: 'grupo', titulo: a.nombre })}
            </div>`).join('')}
          </div>
        </section>` : ''}
    </div>`;
}

// ----- Piezas -----------------------------------------------------------------
function cifra(valor, etiqueta, html = false) {
  return `
    <div class="resumen-cifra">
      <span class="resumen-num${valor === null || valor === '—' ? ' apagado' : ''}">${valor === null ? '—' : html ? valor : esc(String(valor))}</span>
      <span class="resumen-etq">${etiqueta}</span>
    </div>`;
}

/** Lo de siempre, compacto: cifras, una línea de estados y el reparto por tier en una tira. */
function resumen(s, t, bib, u) {
  const totalTier = Object.values(s.reparto).reduce((a, b) => a + b, 0);
  const vs = s.vsGrupo === null ? '' : `${s.vsGrupo > 0 ? '+' : s.vsGrupo < 0 ? '−' : '±'}${fmt1(Math.abs(s.vsGrupo))} vs grupo`;
  const estados = [
    [s.jugando, 'jugando'], [s.abandonados, s.abandonados === 1 ? 'abandonado' : 'abandonados'], [s.pendientes, s.pendientes === 1 ? 'pendiente' : 'pendientes'],
    ...(s.recomendacion.total ? [[`${s.recomendacion.si}/${s.recomendacion.total}`, 'recomendados']] : []),
    ...(bib.total ? [[bib.total, 'en biblioteca']] : []),
  ];
  return `
    <section class="stats-resumen">
      <div class="resumen-cifras">
        ${cifra(s.jugados, 'Jugados')}
        ${cifra(s.completados, 'Completados')}
        ${cifra(s.media !== null ? `${formatearNota(s.media)}${chipLetra(s.letra, 'sm')}` : '—', vs ? `Nota media · ${vs}` : 'Nota media', true)}
        ${cifra(t.total ? `${miles(t.total)}<small> h</small>` : (datos.cuentasDe(u.id).length ? '0' : '—'), t.estimadas ? `Jugadas · ≈${miles(t.estimadas)} h estimadas` : 'Jugadas', true)}
      </div>
      <p class="resumen-estados">${estados.map(([n, e]) => `<span><b>${n}</b> ${e}</span>`).join('')}</p>
      ${totalTier ? `
        <div class="resumen-tiers" role="img" aria-label="Reparto por tier">
          ${LETRAS.filter((l) => s.reparto[l]).map((l) => `
            <span class="resumen-tier graf-anim" data-tier="${l}" style="flex:${s.reparto[l]}"><b>${l}</b><small>${s.reparto[l]}</small></span>`).join('')}
        </div>` : ''}
    </section>`;
}

function revelacion(x, uid) {
  return `
    <button type="button" class="revelacion graf-anim" data-graf="${esc(x.dim)}" data-tag="${esc(x.etiqueta ?? x.tag)}" data-uid="${esc(uid)}">
      <span class="revelacion-titulo">${esc(x.titulo)}</span>
      <span class="revelacion-dato${x.largo ? ' largo' : ''}">${esc(x.dato)}</span>
      <span class="revelacion-frase">${esc(x.frase)}</span>
    </button>`;
}

/** Radar con el selector "Comparar con" (la media del grupo o cualquiera con datos). */
function seccionRadar(id, serie, r, titulo) {
  const otras = [...r.series.values()].filter((x) => x.id !== id);
  let activa = superpuesta;
  if (activa === id || (activa !== 'nadie' && !r.series.has(activa))) activa = id === 'grupo' ? (usuarioActual()?.id ?? 'nadie') : 'grupo';
  if (!r.series.has(activa)) activa = 'nadie';
  const nombreDe = (x) => (x.id === 'grupo' ? 'Grupo' : x.nombre);
  return `
    <section class="stats-seccion">
      <h2 class="stats-titulo">${titulo}</h2>
      <span class="stats-nota">Reparto de ${id === 'grupo' ? 'lo que juega el grupo' : 'lo jugado'} entre los géneros más jugados del grupo. Toca uno para ver sus juegos.</span>
      ${otras.length ? `
        <div class="radar-selector" role="tablist" aria-label="Comparar con" data-scroll="radar">
          <span class="radar-selector-etq">Comparar con</span>
          ${[{ id: 'nadie', nombre: 'Nadie' }, ...otras].map((x) => `
            <button type="button" role="tab" class="chip-radar${x.id === activa ? ' activo' : ''}" aria-selected="${x.id === activa}" data-radar="${esc(x.id)}">${esc(x.id === 'nadie' ? 'Nadie' : nombreDe(x))}</button>`).join('')}
        </div>` : ''}
      <div class="radar-caja">
        ${grafico.radar({ ejes: r.ejes, base: serie, otras, activa, max: r.max, uid: id })}
      </div>
      <div class="radar-leyenda">
        <span><i class="radar-muestra base"></i>${esc(id === 'grupo' ? 'Media del grupo' : serie.nombre)}</span>
        ${otras.map((x) => `<span class="radar-leyenda-otra" data-serie-leyenda="${esc(x.id)}"${x.id === activa ? '' : ' hidden'}><i class="radar-muestra otra"></i>${esc(x.id === 'grupo' ? 'Media del grupo' : x.nombre)}</span>`).join('')}
      </div>
    </section>`;
}

const selectorGeneros = () => `
  <div class="segmentado segmentado-peq" role="tablist" aria-label="Ordenar géneros">
    ${MODOS_GENEROS.map(([m, n]) => `<button type="button" role="tab" data-modo-generos="${m}" class="${modoGeneros === m ? 'activo' : ''}" aria-selected="${modoGeneros === m}">${n}</button>`).join('')}
  </div>`;

/** Las barras de géneros en un modo (juegos, horas o nota), con las portadas que más pesan. */
function listaGeneros(uid, modo) {
  const grupo = uid === 'grupo';
  const gen = grupo ? clas.dimensionGrupo('generos') : clas.dimension(uid, 'generos');
  const juegosDe = (lista, orden) => [...new Map([...lista].sort(orden).map((x) => [x.clave, x.juego])).values()];
  let filas;
  if (modo === 'horas') {
    filas = gen.filter((g) => g.horas > 0).sort((a, b) => b.horas - a.horas).slice(0, 8)
      .map((g) => ({ tag: g.tag, valor: g.horas, texto: `${g.horas} h`, juegos: juegosDe(g.conHoras, (a, b) => b.horas - a.horas) }));
  } else if (modo === 'nota') {
    filas = gen.filter((g) => g.media != null).sort((a, b) => b.media - a.media || b.notas.length - a.notas.length).slice(0, 8)
      .map((g) => ({ tag: g.tag, valor: g.media, texto: formatearNota(g.media), juegos: juegosDe(g.conNota, (a, b) => b.nota - a.nota) }));
  } else {
    filas = gen.filter((g) => g.n > 0).slice(0, 8)
      .map((g) => ({ tag: g.tag, valor: g.n, texto: String(g.n), juegos: juegosDe(g.items, (a, b) => (b.nota ?? -1) - (a.nota ?? -1) || b.horas - a.horas) }));
  }
  const nota = modo === 'horas' ? (grupo ? 'Horas de todos en juegos de cada género' : 'Horas en juegos de cada género (un juego cuenta en todos los suyos)')
    : modo === 'nota' ? (grupo ? 'Nota media de todas las notas (con 3 o más)' : 'Nota media (con 2 notas o más; solo las que cuentan en la tier list)')
      : (grupo ? 'Veces que alguien del grupo ha jugado uno' : 'Juegos valorados de cada género (sin pendientes)');
  if (!filas.length) return `<p class="stats-vacio">${modo === 'horas' ? 'Todavía no hay horas.' : 'Todavía no hay notas suficientes.'}</p>`;
  return `<span class="stats-nota">${nota}</span>${grafico.barras({ filas, dim: 'generos', uid, escala: modo === 'nota' ? 10 : null })}`;
}

/** Mapa de calor de la actividad del último año (se pide al verla). */
function miAnio(id, tu) {
  const filas = datos.actividadAnual(id);
  if (!filas) {
    return `
      <section class="stats-seccion">
        <h2 class="stats-titulo">${tu ? 'Tu año en juegos' : 'Su año en juegos'}</h2>
        <div class="calor-cargando sk"></div>
      </section>`;
  }
  const porDia = new Map();
  let valorados = 0, completados = 0;
  for (const a of filas) {
    const k = grafico.claveDia(new Date(a.creado_en));
    porDia.set(k, (porDia.get(k) ?? 0) + 1);
    if (a.tipo === 'valoro') valorados++;
    if (a.tipo === 'completo') completados++;
  }
  if (porDia.size < 2) return '';
  // Racha más larga de días seguidos con algo.
  const dias = [...porDia.keys()].sort();
  let racha = 1, mejor = 1;
  for (let i = 1; i < dias.length; i++) {
    const seguido = (new Date(dias[i]) - new Date(dias[i - 1])) / 86400000 === 1;
    racha = seguido ? racha + 1 : 1;
    mejor = Math.max(mejor, racha);
  }
  return `
    <section class="stats-seccion">
      <h2 class="stats-titulo">${tu ? 'Tu año en juegos' : 'Su año en juegos'}</h2>
      <p class="resumen-estados">
        <span><b>${porDia.size}</b> días con actividad</span>
        <span><b>${completados}</b> completados</span>
        <span><b>${valorados}</b> valorados</span>
        ${mejor > 1 ? `<span>racha de <b>${mejor}</b> días</span>` : ''}
      </p>
      <div class="calor-scroll" data-calor-uid="${esc(id)}">${grafico.mapaCalor(porDia)}</div>
      <div class="calor-leyenda"><span>Menos</span>${[0, 1, 2, 3, 4].map((n) => `<i class="nv${n}"></i>`).join('')}<span>Más</span></div>
    </section>`;
}

/** Plataformas (según lo valorado) y horas (las totales, los más jugados): compacto. */
function plataformasYHoras(u, s, bib, t) {
  // Los más jugados, con las colecciones como un juego (regla única).
  const top = clas.itemsUsuario(u.id).filter((x) => x.horas > 0).sort((a, b) => b.horas - a.horas).slice(0, 5)
    .map((x) => ({ nombre: x.juego.nombre, horas: x.horas, estimadas: x.coleccionId ? metricas.horasColeccion(u.id, x.coleccionId).estimadas : metricas.estimadasDe(u.id, x.ids[0]) }));
  const maxPlat = Math.max(1, ...s.plataformas.map((x) => x.n));
  const maxH = Math.max(1, ...top.map((x) => x.horas));
  if (!s.plataformas.length && !top.length) return '';
  return `
    <section class="stats-seccion">
      <h2 class="stats-titulo">Plataformas y horas</h2>
      <div class="stats-dos">
        ${s.plataformas.length ? `
          <div>
            <span class="stats-nota">Plataformas de lo valorado</span>
            <div class="barras-plataforma">${s.plataformas.slice(0, 6).map((x) => `
              <div class="barra-plataforma">
                <span class="barra-plataforma-nombre">${esc(x.nombre)}</span>
                <div class="barra-plataforma-pista"><div class="graf-anim" style="width:${Math.max(4, Math.round((x.n / maxPlat) * 100))}%"></div></div>
                <span class="barra-plataforma-n">${x.n}</span>
              </div>`).join('')}</div>
          </div>` : ''}
        ${top.length ? `
          <div>
            <span class="stats-nota">Los más jugados</span>
            <div class="barras-plataforma barras-horas">${top.map((x) => `
              <div class="barra-plataforma">
                <span class="barra-plataforma-nombre largo" title="${esc(x.nombre)}">${esc(x.nombre)}</span>
                <div class="barra-plataforma-pista"><div class="graf-anim" style="width:${Math.max(4, Math.round((x.horas / maxH) * 100))}%"></div></div>
                <span class="barra-plataforma-n ancho">${esc(metricas.textoAprox(x.horas, x.estimadas))}</span>
              </div>`).join('')}</div>
          </div>` : ''}
      </div>
      ${bib.plataformas.length > 1 ? `<p class="resumen-estados">${bib.plataformas.map((x) => `<span><b>${x.juegos}</b> en ${esc(x.nombre)}${x.horas ? ` · ${x.horas} h` : ''}</span>`).join('')}</p>` : ''}
    </section>`;
}

// ----- Interacción ---------------------------------------------------------------
/**
 * Clics de las estadísticas (lo llaman el perfil y Rankings desde su propio oyente):
 * selector del radar, modo de los géneros, tocar un trozo de un gráfico o un día.
 * Devuelve true si era suyo.
 */
export function clicEstadisticas(e) {
  const caja = e.target.closest('.stats');
  if (!caja) return false;
  const chip = e.target.closest('[data-radar]');
  if (chip) {
    superpuesta = chip.dataset.radar;
    for (const b of caja.querySelectorAll('[data-radar]')) { const on = b === chip; b.classList.toggle('activo', on); b.setAttribute('aria-selected', String(on)); }
    for (const g of caja.querySelectorAll('.radar-otra')) g.style.display = g.dataset.serie === superpuesta ? '' : 'none';
    for (const l of caja.querySelectorAll('[data-serie-leyenda]')) l.hidden = l.dataset.serieLeyenda !== superpuesta;
    return true;
  }
  const modo = e.target.closest('[data-modo-generos]');
  if (modo) {
    modoGeneros = modo.dataset.modoGeneros;
    for (const b of caja.querySelectorAll('[data-modo-generos]')) { const on = b === modo; b.classList.toggle('activo', on); b.setAttribute('aria-selected', String(on)); }
    const lista = caja.querySelector('[data-ref="generos-lista"]');
    if (lista) lista.innerHTML = listaGeneros(caja.dataset.uid, modoGeneros);
    return true;
  }
  const dia = e.target.closest('[data-dia]');
  if (dia) { abrirDia(caja.dataset.uid, dia.dataset.dia); return true; }
  const trozo = e.target.closest('[data-graf]');
  if (trozo) { abrirJuegos(trozo.dataset.uid || caja.dataset.uid, trozo.dataset.graf, trozo.dataset.tag); return true; }
  return false;
}

const NOMBRE_DIM = { generos: 'Género', temas: 'Tema', modos: 'Modo de juego', perspectivas: 'Perspectiva', estudios: 'Estudio', franquicias: 'Saga', decadas: 'Década' };

function abrirJuegos(uid, dim, tag) {
  const lista = clas.juegosDe(uid, dim, tag);
  const quien = uid === 'grupo' ? 'Grupo' : datos.usuario(uid)?.nombre ?? '';
  const titulo = dim === 'decadas' ? `Juegos de ${clas.nombreDecada(Number(tag))}` : tag;
  abrirHoja({
    antetitulo: `${NOMBRE_DIM[dim] ?? ''} · ${quien}`,
    titulo,
    html: lista.length ? `
      <p class="hoja-texto">${uid === 'grupo' ? deN(lista.length, 'juego', 'juegos')
        : [deN(lista.filter((x) => x.jugado).length, 'valorado', 'valorados'), lista.some((x) => !x.jugado) ? `${lista.filter((x) => !x.jugado).length} más solo con horas` : ''].filter(Boolean).join(' · ')}</p>
      <div class="graf-juegos">
        ${lista.slice(0, 60).map((x) => {
          const sub = uid === 'grupo'
            ? [deN(x.n, 'persona', 'personas'), x.media != null ? `${formatearNota(x.media)} de media` : '', x.horas ? `${x.horas} h` : ''].filter(Boolean).join(' · ')
            : [x.nota != null ? formatearNota(x.nota) : (x.jugado ? 'Sin nota' : 'Sin valorar'), x.horas ? metricas.textoHoras(x.horas) : ''].filter(Boolean).join(' · ');
          const nota = uid === 'grupo' ? x.media : x.nota;
          return `
            <a class="graf-juego" href="${metricas.rutaDe(x.juego)}">
              ${portada(x.juego, { clase: 'portada-hoja' })}
              <span class="graf-juego-texto"><strong>${esc(x.juego.nombre)}</strong><small>${esc(sub)}</small></span>
              ${nota != null ? chipLetra(notaALetra(nota), 'sm') : ''}
            </a>`;
        }).join('')}
      </div>` : '<p class="hoja-texto">No hay juegos.</p>',
  });
}

const TEXTO_TIPO = { valoro: 'Valoró', completo: 'Completó', empezo: 'Empezó', abandono: 'Abandonó', pendiente: 'Apuntó como pendiente', rejuega: 'Volvió a jugar' };
const FECHA_DIA = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function abrirDia(uid, dia) {
  const filas = (datos.actividadAnual(uid) ?? []).filter((a) => grafico.claveDia(new Date(a.creado_en)) === dia);
  const [a, m, d] = dia.split('-').map(Number);
  abrirHoja({
    antetitulo: datos.usuario(uid)?.nombre ?? '',
    titulo: FECHA_DIA.format(new Date(a, m - 1, d)),
    html: `
      <div class="graf-juegos">
        ${filas.map((f) => {
          const j = f.coleccion_id ? datos.comoJuego(datos.coleccion(f.coleccion_id)) : datos.juegoConocido(f.juego_id);
          if (!j) return '';
          return `
            <a class="graf-juego" href="${metricas.rutaDe(j)}">
              ${portada(j, { clase: 'portada-hoja' })}
              <span class="graf-juego-texto"><strong>${esc(j.nombre)}</strong><small>${esc(TEXTO_TIPO[f.tipo] ?? f.tipo)}</small></span>
            </a>`;
        }).join('')}
      </div>`,
  });
}

/**
 * Animar los gráficos cuando entran en pantalla (y no antes) y llevar el mapa de calor a
 * hoy. Se llama después de pintar.
 */
let observador = null;
export function observarGraficos(raiz) {
  for (const c of raiz.querySelectorAll('.calor-scroll')) {
    if (!c.__alFinal) { c.scrollLeft = c.scrollWidth; c.__alFinal = true; }
  }
  if (!('IntersectionObserver' in window)) return;
  observador ??= new IntersectionObserver((entradas) => {
    for (const en of entradas) {
      if (!en.isIntersecting) continue;
      en.target.removeAttribute('data-espera');
      en.target.__visto = true;
      observador.unobserve(en.target);
    }
  }, { rootMargin: '0px 0px -40px 0px' });
  for (const s of raiz.querySelectorAll('.stats .stats-seccion, .stats .stats-resumen')) {
    if (s.__visto || s.__observado) continue;
    s.__observado = true;
    s.setAttribute('data-espera', '');
    observador.observe(s);
  }
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
