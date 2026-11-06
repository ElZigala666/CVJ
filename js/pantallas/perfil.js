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
import { tarjetaSaga } from './revisar.js';
import { abrirValorar } from '../hoja-valorar.js';
import { textoHoras } from '../metricas.js';
import { volver, rutaPerfil } from '../navegacion.js';
import { abrirAjustes } from '../ajustes.js';

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
  const vista = { sinIdentificar: false, ocultos: false, seleccionando: false, abiertos: new Set() };
  const seleccion = new Set(); // claves de la biblioteca elegidas para ocultar

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
    const vinculado = !!u.psn_account_id;
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
        <div class="perfil-barra">
          ${esMio ? '<span></span>' : `<button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>`}
          ${esMio ? `<button type="button" class="boton-cuadrado" data-accion="ajustes" aria-label="Ajustes">${icono('ajustes', { tam: 22, color: 'var(--texto)' })}</button>` : '<span></span>'}
        </div>
        <div class="perfil-cab">
          ${avatar(u, 88)}
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
        ${esMio ? metricas.sugerenciasSaga(id).map(tarjetaSaga).join('') : ''}

        <section class="perfil-seccion">
          <h2 class="seccion-titulo">Historial</h2>
          <div data-ref="historial"></div>
        </section>

        ${p.online.length ? `
          <section class="perfil-seccion">
            <div class="seccion-cab">
              <h2 class="seccion-titulo">Juegos online</h2>
              <span class="seccion-extra">${p.online.length}</span>
            </div>
            <div class="rejilla">${p.online.map((v, i) => itemRejilla(v, i, metricas.horasDe(id, v.juego_id))).join('')}</div>
          </section>` : ''}

        ${hayBiblioteca ? `
          <section class="perfil-seccion">
            <div class="seccion-cab">
              <h2 class="seccion-titulo">Biblioteca de PlayStation</h2>
              <span class="seccion-extra">${bib.total} ${bib.total === 1 ? 'juego' : 'juegos'}${bib.horas ? ` · ${bib.horas} h` : ''}</span>
            </div>
            <div data-ref="biblioteca"></div>
          </section>` : ''}

        <section class="perfil-seccion">
          <h2 class="seccion-titulo">Bibliotecas</h2>
          ${bloqueBibliotecas(u, esMio, vinculado, bib)}
        </section>
      </section>`;
    pintarHistorial(u, p);
    if (hayBiblioteca) pintarBiblioteca(bib);

    if (enFiltro) {
      const inp = el.querySelector(`[data-filtro="${enFiltro}"] [data-filtro-texto]`);
      if (inp) { inp.focus(); try { inp.setSelectionRange(cursor, cursor); } catch { /* nada */ } }
    }
  };

  // ----- Historial ----------------------------------------------------------
  const datosValoracion = (v) => ({
    nombre: datos.juegoConocido(v.juego_id)?.nombre ?? '',
    nota: v.nota != null ? Number(v.nota) : null,
    horas: metricas.horasDe(id, v.juego_id),
    fecha: v.actualizado_en ?? v.creado_en,
  });

  const rejillaHistorial = (u, p) => {
    const activa = pestanaRecordada.get(id);
    const lista = filtrar(p.historial[activa], fHist, datosValoracion);
    if (!lista.length) {
      return `<p class="historial-tab-vacia">${fHist.texto ? 'Ningún juego con ese nombre.' : textoVacio(activa, esMio, u.nombre)}</p>`;
    }
    const conHoras = fHist.orden === 'horas';
    const item = (v, i) => itemRejilla(v, i, conHoras ? metricas.horasDe(id, v.juego_id) : undefined);
    const lista2 = metricas.agruparSagas(id, lista, (v) => Number(v.juego_id));
    return `<div class="rejilla">${lista2.map((x, i) => (x.saga
      ? bloqueGrupo(`saga:${x.saga.id}`, x.hijos.map((v) => datos.juegoConocido(v.juego_id)), `${x.saga.nombre} (saga)`,
        `${x.hijos.length} juegos`, x.hijos.map(item).join(''), esMio ? x.saga.id : null)
      : item(x, i))).join('')}</div>`;
  };

  /** Bloque plegable (colección o saga agrupada) que ocupa toda la fila de la rejilla. */
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

  const rejillaBiblioteca = (bib) => {
    const lista = filtrar(bib.identificados, fBib, datosBiblioteca);
    if (!lista.length) {
      return `<p class="historial-tab-vacia">${fBib.texto ? 'Ningún juego con ese nombre.' : 'Todavía no hay juegos identificados.'}</p>`;
    }
    const item = (x, i) => (x.coleccion
      ? bloqueGrupo(x.clave, x.coleccion.juegos, x.coleccion.juego?.nombre ?? x.nombre,
        `${x.coleccion.juegos.length} juegos${x.horas ? ` · ${textoHoras(x.horas)}` : ''}`,
        x.coleccion.juegos.map((j, k) => itemDeColeccion(j, k, esMio, id)).join(''))
      : itemBiblioteca(x, i, esMio, vista.seleccionando, seleccion.has(x.clave)));
    const lista2 = metricas.agruparSagas(id, lista, (x) => x.igdbId);
    return `<div class="rejilla${vista.seleccionando ? ' seleccionando' : ''}">${lista2.map((x, i) => (x.saga
      ? bloqueGrupo(`saga:${x.saga.id}`, x.hijos.map((h) => h.juego), `${x.saga.nombre} (saga)`,
        `${x.hijos.length} juegos · ${textoHoras(x.hijos.reduce((t, h) => t + h.horas, 0)) || 'sin horas'}`,
        x.hijos.map(item).join(''), esMio ? x.saga.id : null)
      : item(x, i))).join('')}</div>`;
  };

  const pintarBiblioteca = (bib) => {
    const cont = el.querySelector('[data-ref="biblioteca"]');
    if (!cont) return;
    const sinId = filtrar(bib.sinIdentificar, fBib, datosBiblioteca);
    cont.innerHTML = `
      ${barraFiltro('bib', fBib)}
      ${esMio && bib.identificados.length ? `
        <div class="bib-seleccionar">
          <button type="button" class="enlace-discreto" data-accion="seleccionar">${vista.seleccionando ? 'Cancelar selección' : 'Seleccionar'}</button>
        </div>` : ''}
      <div data-ref="rejilla-bib">${rejillaBiblioteca(bib)}</div>
      ${vista.seleccionando ? `
        <div class="barra-accion barra-flotante">
          <button type="button" class="boton-secundario neutro" data-accion="seleccionar">Cancelar</button>
          <button type="button" class="boton-principal" data-accion="ocultar-seleccion"${seleccion.size ? '' : ' disabled'}>Ocultar (${seleccion.size})</button>
        </div>` : ''}
      ${bib.sinIdentificar.length ? `
        <details class="bib-plegable"${vista.sinIdentificar ? ' open' : ''} data-plegable="sinIdentificar">
          <summary>Sin identificar (${bib.sinIdentificar.length})</summary>
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
    const x = grupoBib(clave);
    if (!x || !esMio) return;
    // Su saga de IGDB (si tiene y aún no está agrupada).
    const agrupadas = metricas.sagasAgrupadas(id);
    const saga = (x.juego?.relaciones?.colecciones ?? []).find((c) => !agrupadas.has(Number(c.id))) ?? null;
    abrirHoja({
      titulo: x.nombre,
      antetitulo: 'Tu biblioteca',
      html: `
        <div class="menu-bib">
          <button type="button" class="boton-secundario neutro" data-ocultar>Ocultar de mi biblioteca</button>
          <p class="ajustes-nota">No se borra: deja de salir en tu biblioteca, en tus horas y en «Jugando ahora», también tras sincronizar. Lo recuperas abajo del todo, en «Ver ocultos».</p>
          ${saga ? `<button type="button" class="boton-secundario neutro" data-agrupar-saga>Agrupar saga «${esc(saga.nombre)}»</button>
          <p class="ajustes-nota">Junta en una sola entrada tus juegos de esta saga. Solo cambia cómo se ve tu perfil.</p>` : ''}
        </div>`,
      alMontar(cuerpo, cerrar) {
        cuerpo.querySelector('[data-agrupar-saga]')?.addEventListener('click', () => {
          datos.guardarSaga(yo.id, saga.id, saga.nombre, true, aviso);
          aviso(`Agrupados: ${saga.nombre}`);
          cerrar();
        });
        cuerpo.querySelector('[data-ocultar]').addEventListener('click', () => {
          datos.ocultarBiblioteca(yo.id, x.titulos, true, aviso);
          aviso('Oculto de tu biblioteca');
          cerrar();
        });
      },
    });
  };
  let largo = null;
  let largaHecha = false;
  el.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('[data-bib-celda]');
    if (!c || !esMio || vista.seleccionando) return;
    largaHecha = false;
    const x0 = e.clientX, y0 = e.clientY;
    largo = { x0, y0, t: setTimeout(() => { largaHecha = true; abrirMenuBib(c.dataset.bibCelda); }, 550) };
  });
  const cancelarLargo = (e) => {
    if (!largo) return;
    if (e.type === 'pointermove' && Math.hypot(e.clientX - largo.x0, e.clientY - largo.y0) < 10) return;
    clearTimeout(largo.t);
    largo = null;
  };
  el.addEventListener('pointermove', cancelarLargo);
  el.addEventListener('pointerup', cancelarLargo);
  el.addEventListener('pointercancel', cancelarLargo);
  el.addEventListener('contextmenu', (e) => {
    const c = e.target.closest('[data-bib-celda]');
    if (!c || !esMio) return;
    e.preventDefault();
    if (largo) { clearTimeout(largo.t); largo = null; }
    if (!largaHecha) { largaHecha = true; abrirMenuBib(c.dataset.bibCelda); }
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
      if (sin) sin.innerHTML = filtrar(bib.sinIdentificar, fBib, datosBiblioteca).map((x) => itemSinIdentificar(x, esMio)).join('');
    }
  };

  el.addEventListener('click', (e) => {
    // Modo selección: tocar una portada la marca o desmarca.
    const celdaSel = vista.seleccionando && e.target.closest('[data-bib-celda]');
    if (celdaSel) {
      e.preventDefault();
      const k = celdaSel.dataset.bibCelda;
      if (seleccion.has(k)) seleccion.delete(k); else seleccion.add(k);
      pintarBiblioteca(metricas.biblioteca(id));
      return;
    }
    const sagaBtn = e.target.closest('[data-saga-si], [data-saga-no]');
    if (sagaBtn) {
      const si = !!sagaBtn.dataset.sagaSi;
      datos.guardarSaga(yo.id, Number(sagaBtn.dataset.sagaSi ?? sagaBtn.dataset.sagaNo), sagaBtn.dataset.nombre, si, aviso);
      aviso(si ? `Agrupados: ${sagaBtn.dataset.nombre}` : 'No volveremos a sugerirlo');
      return;
    }
    const desag = e.target.closest('[data-desagrupar]');
    if (desag) {
      const sid = Number(desag.dataset.desagrupar);
      datos.guardarSaga(yo.id, sid, metricas.sagasAgrupadas(id).get(sid) ?? '', false, aviso);
      aviso('Desagrupados');
      return;
    }
    if (largaHecha && e.target.closest('[data-bib-celda]')) {
      // El clic que llega al soltar una pulsación larga no abre nada.
      e.preventDefault();
      largaHecha = false;
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
      vista.seleccionando = !vista.seleccionando;
      seleccion.clear();
      pintarBiblioteca(metricas.biblioteca(id));
      return;
    }
    if (b.dataset.accion === 'ocultar-seleccion' && seleccion.size) {
      const bib = metricas.biblioteca(id);
      const elegidos = bib.juegos.filter((x) => seleccion.has(x.clave));
      datos.ocultarBiblioteca(yo.id, elegidos.flatMap((x) => x.titulos), true, aviso);
      aviso(elegidos.length === 1 ? 'Oculto de tu biblioteca' : `${elegidos.length} ocultos de tu biblioteca`);
      vista.seleccionando = false;
      seleccion.clear();
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
function bloqueBibliotecas(u, esMio, vinculado, bib) {
  if (vinculado) {
    return `
      <div class="bibliotecas">
        <div class="bibliotecas-cab">
          <span class="bibliotecas-icono">${icono('jugando', { tam: 24, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}</span>
          <div class="bibliotecas-texto">
            <strong>PlayStation · ${esc(u.psn_online_id)}</strong>
            <span>${bib.total ? `${bib.total} ${bib.total === 1 ? 'juego' : 'juegos'} · ${bib.horas} h jugadas` : 'Aún sin juegos sincronizados'}${u.psn_sincronizado_en ? ` · sincronizado ${esc(tiempoRelativo(u.psn_sincronizado_en).toLowerCase())}` : ''}</span>
          </div>
        </div>
        <div class="bibliotecas-fila">
          <span>PlayStation</span>
          ${!u.psn_reconectar ? '<span class="etiqueta-acento">Conectada</span>'
            : esMio ? '<button type="button" class="boton-secundario boton-pequeno" data-accion="vincular-psn">Reconectar</button>'
            : '<span class="etiqueta-gris">Caducada</span>'}
        </div>
      </div>`;
  }
  const disponible = 'psn_account_id' in u; // con la migración de PSN ya puesta
  return `
    <div class="bibliotecas">
      <div class="bibliotecas-cab">
        <span class="bibliotecas-icono">${icono('jugando', { tam: 24, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}</span>
        <div class="bibliotecas-texto">
          <strong>Ninguna plataforma conectada</strong>
          <span>${esMio
            ? 'Conecta PlayStation y tu biblioteca, tus horas y tus trofeos se cargarán solos. Nunca se crean valoraciones automáticamente.'
            : `${esc(u.nombre)} aún no ha conectado PlayStation. Mientras, su historial es lo que valore aquí.`}</span>
        </div>
      </div>
      <div class="bibliotecas-fila">
        <span>PlayStation</span>
        ${esMio && disponible
          ? '<button type="button" class="boton-secundario boton-pequeno" data-accion="vincular-psn">Conectar</button>'
          : `<span class="etiqueta-gris">${disponible ? 'Sin conectar' : 'Próximamente'}</span>`}
      </div>
    </div>`;
}

/** Juego identificado de la biblioteca: portada, horas y su nota si lo ha valorado. */
/** Juego dentro de una colección: su portada; si es mío y no lo he valorado, abre Valorar. */
function itemDeColeccion(j, i, esMio, uid) {
  const v = datos.miValoracion(uid, j.igdb_id);
  const n = v?.nota != null ? formatearNota(v.nota) : null;
  const attrs = esMio && !v
    ? `href="#juego/${j.igdb_id}" data-valorar-psn="${j.igdb_id}"`
    : `href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}"`;
  return `
    <a class="rejilla-item" ${attrs} aria-label="${esc(j.nombre)}">
      ${portada(j, { clase: 'portada-rejilla', titulo: 'arriba', prioridad: i < 3 })}
      ${n ? `<span class="rejilla-nota">${n}${chipLetra(notaLetra(v.nota), 'mini')}</span>` : ''}
      ${esMio && !v ? '<span class="rejilla-sin-valorar">Sin valorar</span>' : ''}
    </a>`;
}

function itemBiblioteca(x, i, esMio, seleccionando = false, marcada = false) {
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
    ? `href="#juego/${x.igdbId}" data-valorar-psn="${x.igdbId}" data-plataforma="${esc(x.plataformaPrincipal ?? '')}"`
    : `href="#juego/${x.igdbId}" data-precarga="${esc(x.juego.cover_id ?? '')}"`;
  return `
    <div class="bib-celda${marcada ? ' marcada' : ''}" data-bib-celda="${esc(x.clave)}">
      <a class="rejilla-item" ${attrs} aria-label="${esc(x.juego.nombre)}${horas ? `, ${horas}` : ''}">
        ${portada(x.juego, { clase: 'portada-rejilla', titulo: 'arriba', prioridad: i < 6 })}
        ${pie}
      </a>
      ${seleccionando
        ? `<span class="bib-casilla" aria-hidden="true">${marcada ? icono('completado', { tam: 26, color: 'var(--acento)', trazo: '#FFFFFF' }) : ''}</span>`
        : esMio ? `<button type="button" class="bib-menu" data-bib-menu="${esc(x.clave)}" aria-label="Opciones de ${esc(x.nombre)}">${icono('opciones', { tam: 18, color: '#FFFFFF' })}</button>` : ''}
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
function itemRejilla(v, i, horas) {
  const j = datos.juegoConocido(v.juego_id);
  if (!j) return '';
  const n = v.nota != null ? formatearNota(v.nota) : null;
  const h = horas !== undefined ? textoHoras(horas) : '';
  return `
    <a class="rejilla-item" href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}" aria-label="${esc(j.nombre)}${n ? `, ${n}` : ''}${h ? `, ${h}` : ''}">
      ${portada(j, { clase: 'portada-rejilla', titulo: 'arriba', prioridad: i < 6 })}
      ${n || h ? `<span class="rejilla-nota">${n ? `${n}${chipLetra(notaLetra(v.nota), 'mini')}` : ''}${h ? `<span class="rejilla-horas">${h}</span>` : ''}</span>` : ''}
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
