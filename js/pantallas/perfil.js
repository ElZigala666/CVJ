// Pantallas 06 (Perfil) y 08 (Tier list).
//   #perfil            el mío
//   #perfil/{id}       el de otro (o el mío)
//   #perfil/{id}/tiers su tier list
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as metricas from '../metricas.js';
import { usuarioActual } from '../sesion.js';
import { LETRAS, rangoTier, formatearNota, notaALetra as notaLetra } from '../notas.js';
import { esc, avatar, portada, chipLetra, cabeceraAtras, estadoVacio, tiempoRelativo, aviso } from '../ui.js';
import { abrirHoja } from '../hoja.js';
import { botonFoto } from '../foto-perfil.js';
import { normalizarBusqueda } from '../psn-nombres.js';
import { iconoFuente, plataformaParaValorar } from '../plataformas-ui.js';
import { cuentasDe } from '../cuentas-ui.js';
import { abrirValorar } from '../hoja-valorar.js';
import { textoHoras } from '../metricas.js';
import { volver, rutaPerfil } from '../navegacion.js';
import { abrirAjustes } from '../ajustes.js';
import { abrirMenuJuego, abrirMenuColeccion } from '../menu-juego.js';
import { logoColumna } from '../columnas-ui.js';
import { entrarSeleccion } from '../seleccion.js';

const PESTANAS = [
  { id: 'jugando', nombre: 'Jugando' },
  { id: 'completado', nombre: 'Completados' },
  { id: 'abandonado', nombre: 'Abandonados' },
  { id: 'pendiente', nombre: 'Pendientes' },
];
const pestanaRecordada = new Map(); // usuario → pestaña (al volver de una ficha sigue igual)

// Filtro de historial y biblioteca: "{usuario}:hist" / "{usuario}:bib" → { texto, orden }
const ORDENES_FILTRO = [
  { id: 'nota', nombre: 'Nota' },
  { id: 'horas', nombre: 'Horas' },
  { id: 'nombre', nombre: 'Nombre' },
  { id: 'reciente', nombre: 'Más reciente' },
];
const filtros = new Map();
const filtroDe = (clave, orden) => {
  if (!filtros.has(clave)) filtros.set(clave, { texto: '', orden });
  return filtros.get(clave);
};

/**
 * Filtra por nombre y ordena (en el cliente, al momento).
 * @param {(x) => { nombre: string, nota: number|null, horas: number|null, fecha: string|null }} datosDe
 */
function filtrar(lista, f, datosDe) {
  const q = normalizarBusqueda(f.texto);
  const con = lista.map((x) => ({ x, d: datosDe(x) })).filter(({ d }) => !q || normalizarBusqueda(d.nombre).includes(q));
  const porNombre = (a, b) => a.d.nombre.localeCompare(b.d.nombre, 'es');
  const orden = {
    nota: (a, b) => (b.d.nota ?? -1) - (a.d.nota ?? -1) || (b.d.fecha ?? '').localeCompare(a.d.fecha ?? ''),
    horas: (a, b) => (b.d.horas ?? -1) - (a.d.horas ?? -1) || porNombre(a, b),
    nombre: porNombre,
    reciente: (a, b) => (b.d.fecha ?? '').localeCompare(a.d.fecha ?? '') || porNombre(a, b),
  }[f.orden];
  if (orden) con.sort(orden);
  return con.map(({ x }) => x);
}

function barraFiltro(clave, f) {
  return `
    <div class="filtro" data-filtro="${esc(clave)}">
      <label class="filtro-buscar">
        ${icono('buscar', { tam: 16, color: 'var(--texto-2)' })}
        <input type="search" data-filtro-texto placeholder="Buscar por nombre" value="${esc(f.texto)}" autocomplete="off" aria-label="Buscar por nombre">
      </label>
      <label class="filtro-orden">
        <span class="sr">Ordenar por</span>
        <select data-filtro-orden>
          ${ORDENES_FILTRO.map((o) => `<option value="${o.id}"${o.id === f.orden ? ' selected' : ''}>${o.nombre}</option>`).join('')}
        </select>
        ${icono('desplegable', { tam: 12, color: 'var(--texto-2)' })}
      </label>
    </div>`;
}

export function render(el, { params, alSalir }) {
  const yo = usuarioActual();
  const id = params[0] || yo?.id;
  if (params[1] === 'tiers') return renderTiers(el, id);
  return renderPerfil(el, id, alSalir);
}

// ---------------------------------------------------------------------------
// Perfil (el mío y el de los demás se ven igual; solo el dueño puede ocultar)
// ---------------------------------------------------------------------------
function renderPerfil(el, id, alSalir) {
  const yo = usuarioActual();
  const esMio = id === yo?.id;
  const fHist = filtroDe(`${id}:hist`, 'nota');
  const fBib = filtroDe(`${id}:bib`, 'horas');
  const vista = { sinIdentificar: false, probados: false, ocultos: false, abiertos: new Set() };

  const pintar = () => {
    const u = datos.usuario(id) ?? (esMio ? yo : null);
    if (!u) {
      el.innerHTML = `
        ${cabeceraAtras('Perfil')}
        ${estadoVacio({ icono: 'perfil', titulo: 'Este perfil no existe', texto: 'Puede que esa persona ya no esté en el grupo.' })}`;
      document.title = 'CVJ · Perfil';
      return;
    }
    // Si estaba escribiendo en un buscador, que siga el foco tras repintar.
    const activo = document.activeElement;
    const enFiltro = el.contains(activo) && activo.matches?.('[data-filtro-texto]') ? activo.closest('[data-filtro]').dataset.filtro : null;
    const cursor = enFiltro ? activo.selectionStart : null;

    document.title = `CVJ · ${esMio ? 'Perfil' : u.nombre}`;
    const p = metricas.perfil(id);
    const bib = metricas.biblioteca(id);
    const tiempo = metricas.tiempo(id);
    const vinculado = datos.cuentasDe(u.id).length > 0;
    const soyAdmin = !!datos.usuario(yo?.id)?.es_admin;
    if (!pestanaRecordada.has(id)) {
      const inicial = p.completados ? 'completado' : PESTANAS.find((x) => p.historial[x.id].length)?.id ?? 'completado';
      pestanaRecordada.set(id, inicial);
    }

    const sub = p.jugados
      ? `${p.jugados} ${p.jugados === 1 ? 'juego valorado' : 'juegos valorados'}${p.plataformaPrincipal ? ` · juega sobre todo en ${p.plataformaPrincipal}` : ''}`
      : (esMio ? 'Aún no has valorado ningún juego' : 'Aún no ha valorado ningún juego');
    const hayBiblioteca = bib.total || bib.ocultos.length;

    el.innerHTML = `
      <section class="perfil">
        <div class="perfil-lado">
        <div class="perfil-barra">
          ${esMio ? '<span></span>' : `<button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>`}
          ${esMio ? `<button type="button" class="boton-cuadrado" data-accion="ajustes" aria-label="Ajustes">${icono('ajustes', { tam: 22, color: 'var(--texto)' })}</button>` : '<span></span>'}
        </div>
        <div class="perfil-cab">
          ${avatar(u, 128)}
          <h1 class="perfil-nombre-grande">${esc(u.nombre)}</h1>
          <span class="perfil-sub">${esc(sub)}</span>
          ${!esMio && soyAdmin && 'foto_url' in u ? botonFoto(u, u.foto_url ? 'Cambiar su foto' : 'Ponerle foto') : ''}
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
            ${tiempo.total
              ? `<span class="dato-num">${tiempo.total}</span><span class="dato-etq">Horas jugadas</span>`
              : '<span class="dato-num apagado">—</span><span class="dato-etq">Horas · sin datos</span>'}
          </div>
        </div>

        ${esMio ? '' : `<a class="boton-principal enlace perfil-comparar" href="#rankings/comparar/${esc(yo.id)}/${esc(id)}">${icono('rankings', { tam: 20, color: 'currentColor' })}<span>Comparar conmigo</span></a>`}

        <div class="enlaces-perfil">
          <a class="enlace-fila" href="#perfil/${esc(id)}/tiers">
            <span class="icono-tiers" aria-hidden="true"><span data-tier="S"></span><span data-tier="B"></span><span data-tier="D"></span></span>
            <span class="enlace-fila-texto">${esMio ? 'Mi tier list' : `Tier list de ${esc(u.nombre)}`}</span>
            ${icono('adelante', { tam: 18, color: 'var(--texto-2)' })}
          </a>
          ${datos.columnaDe(id) ? `
          <a class="enlace-fila enlace-columna" href="#columna/${esc(datos.columnaDe(id).id)}">
            ${logoColumna(datos.columnaDe(id), 28)}
            <span class="enlace-fila-texto">${esc(datos.columnaDe(id).nombre)}<small>${datos.entradasPublicadas(datos.columnaDe(id).id).length} entradas${esMio ? ' · escribir' : ''}</small></span>
            ${icono('adelante', { tam: 18, color: 'var(--texto-2)' })}
          </a>` : ''}
          <a class="enlace-fila" href="#estadisticas/${esc(id)}">
            ${icono('rankings', { tam: 22, color: 'var(--acento)' })}
            <span class="enlace-fila-texto">Estadísticas</span>
            ${icono('adelante', { tam: 18, color: 'var(--texto-2)' })}
          </a>
        </div>

        ${esMio && bib.porRevisar.length ? `
          <a class="aviso-revisar en-perfil" href="#revisar">
            ${icono('jugando', { tam: 20, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}
            <span>Revisa ${bib.porRevisar.length} ${bib.porRevisar.length === 1 ? 'juego nuevo' : 'juegos nuevos'} de tu biblioteca</span>
            ${icono('adelante', { tam: 16, color: 'var(--texto-2)' })}
          </a>` : ''}

        </div>
        <div class="perfil-principal">
        <section class="perfil-seccion">
          <h2 class="seccion-titulo">Historial</h2>
          <div data-ref="historial"></div>
        </section>

        ${p.online.length ? `
          <section class="perfil-seccion">
            <div class="seccion-cab">
              <h2 class="seccion-titulo">Juegos sin final</h2>
              <span class="seccion-extra">${p.online.length}</span>
            </div>
            <div class="rejilla" data-lista>${p.online.map((v, i) => itemRejilla(v, i, horasItem(v) ?? undefined, esMio)).join('')}</div>
          </section>` : ''}

        ${hayBiblioteca ? `
          <section class="perfil-seccion">
            <div class="seccion-cab">
              <h2 class="seccion-titulo">Biblioteca</h2>
              <span class="seccion-extra">${bib.horas ? `${bib.horas} h` : ''}</span>
            </div>
            <div data-ref="biblioteca"></div>
          </section>` : ''}

        <section class="perfil-seccion">
          <h2 class="seccion-titulo">Bibliotecas</h2>
          ${bloqueBibliotecas(u, esMio, vinculado, bib)}
        </section>
        </div>
      </section>`;
    pintarHistorial(u, p);
    if (hayBiblioteca) pintarBiblioteca(bib);

    if (enFiltro) {
      const inp = el.querySelector(`[data-filtro="${enFiltro}"] [data-filtro-texto]`);
      if (inp) { inp.focus(); try { inp.setSelectionRange(cursor, cursor); } catch { /* nada */ } }
    }
  };

  // ----- Historial ----------------------------------------------------------
  const horasItem = (v) => (v.esColeccion ? metricas.horasColeccion(id, v.coleccion_id).total || null : metricas.horasDe(id, v.juego_id));
  const datosValoracion = (v) => ({
    nombre: (v.esColeccion ? datos.coleccion(v.coleccion_id)?.nombre : datos.juegoConocido(v.juego_id)?.nombre) ?? '',
    nota: v.nota != null ? Number(v.nota) : null,
    horas: horasItem(v),
    fecha: v.actualizado_en ?? v.creado_en,
  });

  const rejillaHistorial = (u, p) => {
    const activa = pestanaRecordada.get(id);
    const lista = filtrar(p.historial[activa], fHist, datosValoracion);
    if (!lista.length) {
      return `<p class="historial-tab-vacia">${fHist.texto ? 'Ningún juego con ese nombre.' : textoVacio(activa, esMio, u.nombre)}</p>`;
    }
    // Las horas, siempre junto a la nota (si hay). Las colecciones valoradas, como un juego más.
    return `<div class="rejilla" data-lista>${lista.map((v, i) => itemRejilla(v, i, horasItem(v) ?? undefined, esMio)).join('')}</div>`;
  };

  /** Bloque plegable (colección o colección agrupada) que ocupa toda la fila de la rejilla. */
  const bloqueGrupo = (clave, juegos, titulo, sub, dentro, desagrupar = null) => `
    <details class="bloque-grupo" data-grupo="${esc(clave)}"${vista.abiertos.has(clave) ? ' open' : ''}>
      <summary>
        <span class="bloque-grupo-portadas">${juegos.filter(Boolean).slice(0, 3).map((j) => portada(j, { clase: 'portada-lista' })).join('')}</span>
        <span class="bloque-grupo-texto"><strong>${esc(titulo)}</strong><small>${esc(sub)}</small></span>
        ${icono('desplegable', { tam: 12, color: 'var(--texto-2)' })}
      </summary>
      <div class="rejilla">${dentro}</div>
      ${desagrupar != null ? `<button type="button" class="enlace-discreto" data-desagrupar="${desagrupar}">Desagrupar</button>` : ''}
    </details>`;

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
    cont.innerHTML = `
      <div class="pestanas pestanas-historial" role="tablist" aria-label="Historial">
        ${PESTANAS.map((x) => `
          <button type="button" role="tab" class="pestana${x.id === activa ? ' activa' : ''}" aria-selected="${x.id === activa}" data-pestana="${x.id}">
            ${x.nombre} <span class="pestana-n">${p.historial[x.id].length}</span>
          </button>`).join('')}
      </div>
      ${barraFiltro('hist', fHist)}
      <div data-ref="rejilla-hist">${rejillaHistorial(u, p)}</div>`;
  };

  // ----- Biblioteca de PlayStation -------------------------------------------
  const datosBiblioteca = (x) => ({
    nombre: x.nombre ?? '',
    nota: x.valoracion?.nota != null ? Number(x.valoracion.nota) : null,
    horas: x.horas,
    fecha: x.ultimaVez,
  });

  const rejillaBiblioteca = (bib, origen = bib.misJuegos, vacio = 'Todavía no hay juegos identificados.') => {
    const lista = filtrar(origen, fBib, datosBiblioteca);
    if (!lista.length) {
      return `<p class="historial-tab-vacia">${fBib.texto ? 'Ningún juego con ese nombre.' : vacio}</p>`;
    }
    const item = (x, i) => (x.coleccion
      ? bloqueGrupo(x.clave, x.coleccion.juegos, x.coleccion.juego?.nombre ?? x.nombre,
        `${x.coleccion.juegos.length} juegos${x.horas ? ` · ${textoHoras(x.horas)}` : ''}`,
        x.coleccion.juegos.map((j, k) => itemDeColeccion(j, k, esMio, id)).join(''))
      : itemBiblioteca(x, i, esMio));
    const lista2 = metricas.agruparColecciones(id, lista, (x) => x.igdbId);
    return `<div class="rejilla">${lista2.map((x, i) => (x.esColeccion
      ? itemColeccionBib(x, i, esMio)
      : item(x, i))).join('')}</div>`;
  };

  /** "Calculando horas de Xbox… (N de M)" mientras se van pidiendo poco a poco. */
  const progresoHorasXbox = () => {
    const filas = datos.bibliotecaDe(id).filter((f) => f.fuente === 'xbox' && !f.oculto);
    if (!filas.length || !('horas_en' in filas[0])) return '';
    const hechas = filas.filter((f) => f.horas_en).length;
    return hechas < filas.length ? `<p class="bib-progreso">Calculando horas de Xbox… (${hechas} de ${filas.length})</p>` : '';
  };

  const pintarBiblioteca = (bib) => {
    const cont = el.querySelector('[data-ref="biblioteca"]');
    if (!cont) return;
    const sinId = filtrar(bib.sinIdentificar.filter((x) => !x.probado), fBib, datosBiblioteca);
    const nSinId = bib.sinIdentificar.filter((x) => !x.probado).length;
    cont.innerHTML = `
      <p class="bib-recuento">
        <span><strong>${bib.misJuegos.length}</strong> en Mis juegos</span>
        <span><strong>${bib.probados.length}</strong> probados</span>
        ${esMio ? `<span><strong>${bib.ocultos.length}</strong> ocultos</span>` : ''}
      </p>
      ${progresoHorasXbox()}
      ${barraFiltro('bib', fBib)}
      ${esMio && bib.identificados.length ? `
        <div class="bib-seleccionar">
          <button type="button" class="enlace-discreto" data-accion="seleccionar">Seleccionar</button>
        </div>` : ''}
      <div data-ref="rejilla-bib" data-lista>${rejillaBiblioteca(bib)}</div>
      ${bib.probados.length ? `
        <details class="bib-plegable"${vista.probados ? ' open' : ''} data-plegable="probados">
          <summary>Probados (${bib.probados.length})</summary>
          <p class="ajustes-nota">Jugados poco (menos de ${bib.umbral} h, o sin horas y con menos del 5 % de logros), sin valorar y no recientes. No se borran: ${esMio ? 'súbelos a «Mis juegos» desde su menú (⋮) o cambia el umbral en Ajustes → Biblioteca' : 'son de relleno'}.</p>
          <div data-ref="rejilla-probados" data-lista>${rejillaBiblioteca(bib, bib.probados.filter((x) => x.coleccion || (x.igdbId != null && x.juego)), 'Ninguno identificado.')}</div>
          ${bib.probados.some((x) => !x.coleccion && !(x.igdbId != null && x.juego)) ? `<div class="rejilla">${filtrar(bib.probados.filter((x) => !x.coleccion && !(x.igdbId != null && x.juego)), fBib, datosBiblioteca).map((x) => itemSinIdentificar(x, esMio)).join('')}</div>` : ''}
        </details>` : ''}
      ${nSinId ? `
        <details class="bib-plegable"${vista.sinIdentificar ? ' open' : ''} data-plegable="sinIdentificar">
          <summary>Sin identificar (${nSinId})</summary>
          <p class="ajustes-nota">${esMio ? 'No hemos sabido qué juego es. Tócalo para elegirlo; vale para todo el grupo.' : 'Juegos de PlayStation que aún no se han identificado.'}</p>
          <div class="rejilla">${sinId.map((x) => itemSinIdentificar(x, esMio)).join('')}</div>
        </details>` : ''}
      ${esMio && bib.ocultos.length ? `
        <button type="button" class="enlace-discreto bib-ver-ocultos" data-accion="ver-ocultos" aria-expanded="${vista.ocultos}">${vista.ocultos ? 'Ocultar la lista' : `Ver ocultos (${bib.ocultos.length})`}</button>
        ${vista.ocultos ? `
          <ul class="bib-ocultos">
            ${bib.ocultos.map((x) => `
              <li><span>${esc(x.nombre)}</span><button type="button" class="boton-secundario boton-pequeno" data-mostrar="${esc(x.clave)}">Volver a mostrar</button></li>`).join('')}
          </ul>` : ''}` : ''}`;
  };

  // ----- Ocultar de mi biblioteca (menú ⋮, pulsación larga o clic derecho) ---
  const grupoBib = (clave) => {
    const bib = metricas.biblioteca(id);
    return [...bib.juegos, ...bib.ocultos].find((x) => x.clave === clave) ?? null;
  };
  const abrirMenuBib = (clave) => {
    if (!esMio) return;
    if (clave.startsWith('coleccion:')) {
      const coleccionId = clave.slice(10);
      const bib = metricas.biblioteca(id);
      const tarjeta = metricas.agruparColecciones(id, [...bib.juegos], (x) => x.igdbId).find((x) => x.esColeccion && x.coleccion.id === coleccionId) ?? null;
      abrirMenuColeccion({ uid: yo.id, coleccionId, bib: tarjeta });
      return;
    }
    const x = grupoBib(clave);
    if (!x) return;
    if (x.igdbId == null) {
      // Sin juego (colección): lo de la biblioteca nada más.
      datos.ocultarBiblioteca(yo.id, x.titulos, true, aviso);
      aviso('Oculto de tu biblioteca');
      return;
    }
    abrirMenuJuego({ uid: yo.id, igdbId: x.igdbId, bib: x });
  };
  // Mantener pulsado = selección múltiple (seleccion.js). El menú: su botón (⋮) o clic derecho.
  el.addEventListener('contextmenu', (e) => {
    // Historial (escritorio): clic derecho = el menú de los tres puntos.
    const delHistorial = !e.target.closest('[data-bib-celda]') && e.target.closest('.bib-celda')?.querySelector('[data-menu-item]');
    if (delHistorial) { e.preventDefault(); delHistorial.click(); return; }
    const c = e.target.closest('[data-bib-celda]');
    if (!c || !esMio) return;
    e.preventDefault();
    abrirMenuBib(c.dataset.bibCelda);
  });

  // ----- Eventos ------------------------------------------------------------
  el.addEventListener('input', (e) => {
    const f = e.target.closest('[data-filtro]');
    if (!f || !e.target.matches('[data-filtro-texto]')) return;
    const estado = f.dataset.filtro === 'hist' ? fHist : fBib;
    estado.texto = e.target.value;
    repintarRejilla(f.dataset.filtro);
  });
  el.addEventListener('change', (e) => {
    const f = e.target.closest('[data-filtro]');
    if (!f || !e.target.matches('[data-filtro-orden]')) return;
    (f.dataset.filtro === 'hist' ? fHist : fBib).orden = e.target.value;
    repintarRejilla(f.dataset.filtro);
  });
  el.addEventListener('toggle', (e) => {
    const d = e.target.closest?.('[data-plegable]');
    if (d) vista[d.dataset.plegable] = d.open;
    const g = e.target.closest?.('[data-grupo]');
    if (g && g === e.target) { if (g.open) vista.abiertos.add(g.dataset.grupo); else vista.abiertos.delete(g.dataset.grupo); }
  }, true);
  const repintarRejilla = (cual) => {
    const u = datos.usuario(id) ?? yo;
    if (cual === 'hist') {
      const r = el.querySelector('[data-ref="rejilla-hist"]');
      if (r) r.innerHTML = rejillaHistorial(u, metricas.perfil(id));
    } else {
      // La biblioteca entera (también filtra "Sin identificar"), sin perder el foco.
      const bib = metricas.biblioteca(id);
      const r = el.querySelector('[data-ref="rejilla-bib"]');
      if (r) r.innerHTML = rejillaBiblioteca(bib);
      const sin = el.querySelector('[data-plegable="sinIdentificar"] .rejilla');
      if (sin) sin.innerHTML = filtrar(bib.sinIdentificar.filter((x) => !x.probado), fBib, datosBiblioteca).map((x) => itemSinIdentificar(x, esMio)).join('');
      const prob = el.querySelector('[data-ref="rejilla-probados"]');
      if (prob) prob.innerHTML = rejillaBiblioteca(bib, bib.probados.filter((x) => x.coleccion || (x.igdbId != null && x.juego)), 'Ninguno identificado.');
    }
  };

  el.addEventListener('click', (e) => {
    const menuHist = e.target.closest('[data-menu-item]');
    if (menuHist) {
      e.preventDefault();
      const k = menuHist.dataset.menuItem;
      if (k.startsWith('coleccion:')) abrirMenuColeccion({ uid: yo.id, coleccionId: k.slice(10) });
      else abrirMenuJuego({ uid: yo.id, igdbId: Number(k) });
      return;
    }
    const menu = e.target.closest('[data-bib-menu]');
    if (menu) { e.preventDefault(); abrirMenuBib(menu.dataset.bibMenu); return; }
    const mostrar = e.target.closest('[data-mostrar]');
    if (mostrar) {
      const x = grupoBib(mostrar.dataset.mostrar);
      if (x) { datos.ocultarBiblioteca(yo.id, x.titulos, false, aviso); aviso('Vuelve a estar en tu biblioteca'); }
      return;
    }
    const b = e.target.closest('[data-accion], [data-pestana], [data-valorar-psn]');
    if (!b) return;
    if (b.dataset.valorarPsn) {
      e.preventDefault();
      abrirValorar(b.dataset.valorarPsn, { plataforma: b.dataset.plataforma || undefined });
      return;
    }
    if (b.dataset.accion === 'vincular-psn') { abrirAjustes(alSalir, { psn: true }); return; }
    if (b.dataset.accion === 'ver-ocultos') { vista.ocultos = !vista.ocultos; pintarBiblioteca(metricas.biblioteca(id)); return; }
    if (b.dataset.accion === 'seleccionar') {
      entrarSeleccion(el.querySelector('[data-ref="rejilla-bib"]'), false);
      return;
    }
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

// ---------------------------------------------------------------------------
// PlayStation en el perfil
// ---------------------------------------------------------------------------
/** Una fila por plataforma (PlayStation, Xbox): conectada con su ID y juegos, o el botón de conectar. */
function bloqueBibliotecas(u, esMio, vinculado, bib) {
  const filas = [];
  const fila = (fuente, nombre, conectada, id, juegos, horas, sincronizado, caducada) => `
    <div class="bibliotecas-cab">
      <span class="bibliotecas-icono">${iconoFuente(fuente, 24)}</span>
      <div class="bibliotecas-texto">
        <strong>${esc(nombre)}${conectada ? ` · ${esc(id ?? '')}` : ''}</strong>
        <span>${conectada
          ? `${juegos ? `${juegos} ${juegos === 1 ? 'juego' : 'juegos'}${horas ? ` · ${horas} h jugadas` : ''}` : 'Aún sin juegos sincronizados'}${sincronizado ? ` · sincronizado ${esc(tiempoRelativo(sincronizado).toLowerCase())}` : ''}`
          : esMio ? 'Sin conectar' : `${esc(u.nombre)} no la ha conectado`}</span>
      </div>
      ${!conectada
        ? (esMio ? '<button type="button" class="boton-secundario boton-pequeno" data-accion="vincular-psn">Conectar</button>' : '<span class="etiqueta-gris">Sin conectar</span>')
        : caducada
          ? (esMio ? '<button type="button" class="boton-secundario boton-pequeno" data-accion="vincular-psn">Reconectar</button>' : '<span class="etiqueta-gris">Caducada</span>')
          : '<span class="etiqueta-acento">Conectada</span>'}
    </div>`;
  // Una fila por cuenta (puede haber varias de la misma plataforma); sin cuentas, la de "Conectar".
  const visibles = datos.bibliotecaDe(u.id).filter((f) => !f.oculto);
  const deCuenta = (c, fuente) => {
    const suyas = visibles.filter((f) => (f.fuente ?? 'psn') === fuente && (!c.id || f.cuenta_id === c.id));
    return [suyas.length, Math.round(metricas.sumarHoras(suyas, u.id).total)];
  };
  const nombres = { psn: 'PlayStation', xbox: 'Xbox', steam: 'Steam' };
  for (const fuente of ['psn', 'xbox', 'steam']) {
    const cuentas = cuentasDe(u, fuente);
    if (!cuentas.length) { filas.push(fila(fuente, nombres[fuente], false, null, 0, 0, null, false)); continue; }
    for (const c of cuentas) {
      const [juegos, horas] = deCuenta(c, fuente);
      const id = c.etiqueta && cuentas.length > 1 ? `${c.nombre ?? ''} (${c.etiqueta})` : c.nombre;
      filas.push(fila(fuente, nombres[fuente], true, id, juegos, horas, c.sincronizado_en, !!c.reconectar));
    }
  }
  if (!filas.length) {
    return '<div class="bibliotecas"><div class="bibliotecas-fila"><span>Plataformas</span><span class="etiqueta-gris">Próximamente</span></div></div>';
  }
  return `
    <div class="bibliotecas bibliotecas-varias">
      ${filas.join('')}
      ${esMio && !vinculado ? '<p class="ajustes-nota">Conecta tus plataformas y tu biblioteca, tus horas y tus logros se cargarán solos. Nunca se crean valoraciones automáticamente.</p>' : ''}
    </div>`;
}

/** Juego dentro de una colección: su portada; si es mío y no lo he valorado, abre Valorar. */
function itemDeColeccion(j, i, esMio, uid) {
  const v = datos.miValoracion(uid, j.igdb_id);
  const n = v?.nota != null ? formatearNota(v.nota) : null;
  const attrs = esMio && !v
    ? `href="#juego/${j.igdb_id}" data-valorar-psn="${j.igdb_id}"`
    : `href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}"`;
  return `
    <a class="rejilla-item" ${attrs} data-sel="${j.igdb_id}" aria-label="${esc(j.nombre)}">
      ${portada(j, { clase: 'portada-rejilla', titulo: 'arriba', prioridad: i < 3 })}
      ${n ? `<span class="rejilla-nota">${n}${chipLetra(notaLetra(v.nota), 'mini')}</span>` : ''}
      ${esMio && !v ? '<span class="rejilla-sin-valorar">Sin valorar</span>' : ''}
    </a>`;
}

function itemBiblioteca(x, i, esMio) {
  const horas = textoHoras(x.horas);
  const v = x.valoracion;
  const n = v?.nota != null ? formatearNota(v.nota) : null;
  const pie = `
    <span class="rejilla-nota">
      ${n ? `${n}${chipLetra(notaLetra(v.nota), 'mini')}` : ''}
      ${horas ? `<span class="rejilla-horas">${horas}</span>` : (n ? '' : '<span class="rejilla-horas">Sin horas</span>')}
    </span>
    ${esMio && !v ? '<span class="rejilla-sin-valorar">Sin valorar</span>' : ''}`;
  // Mío y sin valorar: abre la hoja de Valorar con la plataforma de PSN; si no, la ficha.
  const attrs = esMio && !v
    ? `href="#juego/${x.igdbId}" data-valorar-psn="${x.igdbId}" data-plataforma="${esc(plataformaParaValorar(x.plataformaPrincipal))}"`
    : `href="#juego/${x.igdbId}" data-precarga="${esc(x.juego.cover_id ?? '')}"`;
  const desglose = metricas.textoDesglose(x);
  return `
    <div class="bib-celda" data-bib-celda="${esc(x.clave)}" data-sel="${x.igdbId}"${desglose ? ` title="${esc(desglose)}"` : ''}>
      <a class="rejilla-item" ${attrs} aria-label="${esc(x.juego.nombre)}${horas ? `, ${horas}` : ''}">
        ${portada(x.juego, { clase: 'portada-rejilla', titulo: 'arriba', prioridad: i < 6 })}
        ${pie}
      </a>
      ${x.desglose?.length > 1 ? `<span class="rejilla-plataformas">${esc(x.desglose.map((d) => `${d.plataforma.replace('Xbox Series', 'Series').replace('Xbox One', 'One')} ${textoHoras(d.horas)}`).join(' · '))}</span>` : ''}
      ${esMio ? `<button type="button" class="bib-menu" data-bib-menu="${esc(x.clave)}" aria-label="Opciones de ${esc(x.nombre)}">${icono('opciones', { tam: 18, color: '#FFFFFF' })}</button>` : ''}
    </div>`;
}

/** Sin identificar: imagen de PSN; el dueño puede elegir qué juego es. */
function itemSinIdentificar(x, esMio) {
  const horas = textoHoras(x.horas);
  const dentro = `
    <div class="portada portada-rejilla portada-psn" style="--bloque:var(--superficie-2)">
      <span class="portada-titulo portada-titulo-arriba">${esc(x.nombre)}</span>
      ${x.imagen ? `<img src="${esc(x.imagen)}" alt="" loading="lazy" decoding="async" onload="this.classList.add('ok')" onerror="this.remove()">` : ''}
      ${esMio ? '<span class="que-juego">¿Qué juego es?</span>' : ''}
    </div>
    <span class="rejilla-nota"><span class="rejilla-horas">${horas || 'Sin horas'}</span></span>`;
  if (!esMio) return `<div class="rejilla-item sin-emparejar" aria-label="${esc(x.nombre)}">${dentro}</div>`;
  return `
    <div class="bib-celda" data-bib-celda="${esc(x.clave)}">
      <a class="rejilla-item sin-emparejar" href="#elegir/${encodeURIComponent(x.psnTitleId)}" aria-label="${esc(x.nombre)}: elegir qué juego es">${dentro}</a>
      <button type="button" class="bib-menu" data-bib-menu="${esc(x.clave)}" aria-label="Opciones de ${esc(x.nombre)}">${icono('opciones', { tam: 18, color: '#FFFFFF' })}</button>
    </div>`;
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

/** Juego del historial (o de "Juegos online"): portada, nota y, si se pasan, horas. */
function itemRejilla(v, i, horas, conMenu = false) {
  const j = v.esColeccion ? datos.comoJuego(datos.coleccion(v.coleccion_id)) : datos.juegoConocido(v.juego_id);
  if (!j) return '';
  const n = v.nota != null ? formatearNota(v.nota) : null;
  const h = horas !== undefined ? textoHoras(horas) : '';
  const clave = v.esColeccion ? `coleccion:${v.coleccion_id}` : String(j.igdb_id);
  return `
    <div class="bib-celda"${v.esColeccion ? '' : ` data-sel="${j.igdb_id}"`}>
      <a class="rejilla-item" href="${metricas.rutaDe(j)}" data-precarga="${esc(j.cover_id ?? '')}" aria-label="${esc(j.nombre)}${v.esColeccion ? ' (coleccion)' : ''}${n ? `, ${n}` : ''}${h ? `, ${h}` : ''}">
        ${portada(j, { clase: 'portada-rejilla', titulo: 'arriba', prioridad: i < 6 })}
        ${v.esColeccion ? `<span class="sello-coleccion">Colección · ${datos.juegosDeColeccion(v.coleccion_id).length}</span>` : ''}
        ${n || h ? `<span class="rejilla-nota">${n ? `${n}${chipLetra(notaLetra(v.nota), 'mini')}` : ''}${h ? `<span class="rejilla-horas">${h}</span>` : ''}</span>` : ''}
      </a>
      ${conMenu ? `<button type="button" class="bib-menu" data-menu-item="${esc(clave)}" aria-label="Opciones de ${esc(j.nombre)}">${icono('opciones', { tam: 18, color: '#FFFFFF' })}</button>` : ''}
    </div>`;
}

/** Biblioteca: tarjeta de una colección con los juegos que junta (los que no tienen valoración propia). */
function itemColeccionBib(x, i, esMio) {
  const horas = textoHoras(x.horas);
  const v = x.valoracion;
  const n = v?.nota != null ? formatearNota(v.nota) : null;
  return `
    <div class="bib-celda" data-bib-celda="${esc(x.clave)}">
      <a class="rejilla-item" href="#coleccion/${esc(x.coleccion.id)}" data-precarga="${esc(x.juego.cover_id ?? '')}" aria-label="${esc(x.coleccion.nombre)} (coleccion)${horas ? `, ${horas}` : ''}">
        ${portada(x.juego, { clase: 'portada-rejilla', titulo: 'arriba', prioridad: i < 6 })}
        <span class="sello-coleccion">Colección · ${x.hijos.length}</span>
        <span class="rejilla-nota">
          ${n ? `${n}${chipLetra(notaLetra(v.nota), 'mini')}` : ''}
          ${horas ? `<span class="rejilla-horas">${horas}</span>` : (n ? '' : '<span class="rejilla-horas">Sin horas</span>')}
        </span>
      </a>
      ${esMio ? `<button type="button" class="bib-menu" data-bib-menu="${esc(x.clave)}" aria-label="Opciones de ${esc(x.coleccion.nombre)}">${icono('opciones', { tam: 18, color: '#FFFFFF' })}</button>` : ''}
    </div>`;
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
      <div class="tiers" data-lista>
        ${LETRAS.map((l) => `
          <div class="tier-fila">
            <div class="tier-letra" data-tier="${l}">
              <span class="tier-letra-l">${l}</span>
              <span class="tier-rango">${rangoCorto(l)}</span>
            </div>
            <div class="tier-juegos">
              ${t.filas[l].length
                ? t.filas[l].map((v) => {
                    const j = v.esColeccion ? datos.comoJuego(datos.coleccion(v.coleccion_id)) : datos.juegoConocido(v.juego_id);
                    if (!j) return '';
                    const h = v.esColeccion ? metricas.horasColeccion(id, v.coleccion_id).total : metricas.horasDe(id, v.juego_id);
                    return `
                      <a class="tier-item${v.esColeccion ? ' es-coleccion' : ''}"${v.esColeccion ? '' : ` data-sel="${j.igdb_id}"`} href="${metricas.rutaDe(j)}" data-precarga="${esc(j.cover_id ?? '')}" aria-label="${esc(j.nombre)}${v.esColeccion ? ' (coleccion)' : ''}, ${formatearNota(v.nota)}">
                        ${portada(j, { clase: 'portada-tier', titulo: 'arriba', prioridad: n++ < 12 })}
                        ${v.esColeccion ? '<span class="sello-coleccion mini">Colección</span>' : ''}
                        <span class="tier-nota">${formatearNota(v.nota)}${h ? `<small class="tier-horas">${esc(textoHoras(h))}</small>` : ''}</span>
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
