// Pantalla 06 (Perfil), con pestañas: Historial · Tier list · Estadísticas · Biblioteca ·
// Columna (si tiene). El contenido se cambia ahí mismo (sin navegar) y se recuerda la última.
//   #perfil                         el mío
//   #perfil/{id}                    el de otro (o el mío)
//   #perfil/{id}/{pestaña}          en esa pestaña: tiers, estadisticas, biblioteca, columna
//   (#estadisticas/{id}, ruta antigua, lleva a #perfil/{id}/estadisticas)
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as metricas from '../metricas.js';
import { usuarioActual } from '../sesion.js';
import { formatearNota, notaALetra as notaLetra } from '../notas.js';
import { esc, avatar, portada, chipLetra, cabeceraAtras, estadoVacio, tiempoRelativo, aviso, estaRejugando, marcaRejugado, notaConLetra, pintarHtml, esperaDatos } from '../ui.js';
import * as social from '../social.js';
import * as insignias from '../insignias.js';
import { abrirHoja } from '../hoja.js';
import { normalizarBusqueda } from '../psn-nombres.js';
import { iconoFuente, plataformaParaValorar } from '../plataformas-ui.js';
import { cuentasDe } from '../cuentas-ui.js';
import { abrirValorar } from '../hoja-valorar.js';
import { textoHoras } from '../metricas.js';
import { volver } from '../navegacion.js';
import { abrirAjustes } from '../ajustes.js';
import { abrirMenuJuego, abrirMenuColeccion } from '../menu-juego.js';
import { logoColumna } from '../columnas-ui.js';
import { entrarSeleccion } from '../seleccion.js';
import { imagenPlataforma } from '../portadas.js';
import { perfilDe, cabeceraEfectiva, capasCabecera } from '../perfil-personal.js';
import { padrino } from '../propuestas.js';
import { htmlTiers, htmlEstadisticas, htmlColumna, clicEstadisticas, clicTiers, cambioTiers, observarGraficos } from '../vistas-perfil.js';

// Pestañas del perfil (la de Columna, solo si tiene). La última elegida se recuerda aquí.
const PESTANAS_PERFIL = [
  { id: 'historial', nombre: 'Historial' },
  { id: 'tiers', nombre: 'Tier list' },
  { id: 'estadisticas', nombre: 'Estadísticas' },
  { id: 'biblioteca', nombre: 'Biblioteca' },
  { id: 'columna', nombre: 'Columna' },
];
const CLAVE_PESTANA = 'cvj.perfil.pestana';
const pestanaGuardada = () => { try { return localStorage.getItem(CLAVE_PESTANA) || 'historial'; } catch { return 'historial'; } };
const guardarPestana = (p) => { try { localStorage.setItem(CLAVE_PESTANA, p); } catch { /* modo privado */ } };

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

// Biblioteca: "Solo sin valorar" (por defecto) o todos; se recuerda en este dispositivo.
const CLAVE_SIN_VALORAR = 'cvj.bib.sinValorar';
let soloSinValorar = (() => { try { return localStorage.getItem(CLAVE_SIN_VALORAR) !== '0'; } catch { return true; } })();

function barraFiltro(clave, f, extra = '') {
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
      ${extra}
    </div>`;
}

export function render(el, { params, alSalir }) {
  const yo = usuarioActual();
  const id = params[0] || yo?.id;
  const pedida = PESTANAS_PERFIL.some((x) => x.id === params[1]) ? params[1] : null;
  return renderPerfil(el, id, alSalir, pedida);
}

// ---------------------------------------------------------------------------
// Perfil (el mío y el de los demás se ven igual; solo el dueño puede ocultar)
// ---------------------------------------------------------------------------
function renderPerfil(el, id, alSalir, pedida = null) {
  const yo = usuarioActual();
  const esMio = id === yo?.id;
  let pestana = pedida ?? pestanaGuardada();
  const fHist = filtroDe(`${id}:hist`, 'nota');
  const fBib = filtroDe(`${id}:bib`, 'horas');
  const vista = { sinIdentificar: false, probados: false, ocultos: false, abiertos: new Set() };
  let primeraPintada = true;

  const pintar = () => {
    const u = datos.usuario(id) ?? (esMio ? yo : null);
    if (!u) {
      el.innerHTML = `
        ${cabeceraAtras('Perfil')}
        ${datos.estadoCarga() === 'frescos' ? estadoVacio({ icono: 'perfil', titulo: 'Este perfil no existe', texto: 'Puede que esa persona ya no esté en el grupo.' }) : `<div class="vacio">${esperaDatos(datos.estadoCarga(), '', 'vacio-texto')}</div>`}`;
      if (!el.hidden) document.title = 'CVJ · Perfil';
      return;
    }
    // Si estaba escribiendo en un buscador, que siga el foco tras repintar.
    const activo = document.activeElement;
    const enFiltro = el.contains(activo) && activo.matches?.('[data-filtro-texto]') ? activo.closest('[data-filtro]').dataset.filtro : null;
    const cursor = enFiltro ? activo.selectionStart : null;

    if (!el.hidden) document.title = `CVJ · ${esMio ? 'Perfil' : u.nombre}`;
    const p = metricas.perfil(id);
    const bib = metricas.biblioteca(id);
    const tiempo = metricas.tiempo(id);
    const vinculado = datos.cuentasDe(u.id).length > 0;
    if (!pestanaRecordada.has(id)) {
      const inicial = p.completados ? 'completado' : PESTANAS.find((x) => p.historial[x.id].length)?.id ?? 'completado';
      pestanaRecordada.set(id, inicial);
    }

    // Plataforma principal: la que ha elegido en "Editar perfil" o, si no, la que más usa.
    const mia = perfilDe(u);
    const hayBiblioteca = bib.total || bib.ocultos.length;

    // Cabecera (diseño v2) y datos: foto montada sobre el borde de la cabecera.
    const cab = cabeceraEfectiva(u);
    const accDueno = u.acento || '#7C3AED';
    const plat = mia.plataforma || p.plataformaPrincipal || '';
    const top = mia.vitrina.map((x) => datos.juegoConocido(x)).filter(Boolean);
    const unido = u.creado_en ? tiempoRelativo(u.creado_en).toLowerCase() : '';
    const meta = p.jugados ? `${p.jugados} ${p.jugados === 1 ? 'juego valorado' : 'juegos valorados'}` : (unido ? `Se unió ${unido.startsWith('hace') ? unido : `el ${unido}`}` : '');
    const falta = (texto, foco) => `<button type="button" class="perfil-falta" data-accion="editar-perfil" data-foco="${foco}">${icono('mas', { tam: 16, color: 'currentColor' })}<span>${texto}</span></button>`;
    const conPerfil = 'perfil_datos' in u;
    const col = datos.columnaDe(id) ?? null;
    const pestanas = PESTANAS_PERFIL.filter((x) => x.id !== 'columna' || col);
    if (!pestanas.some((x) => x.id === pestana)) pestana = 'historial';

    pintarHtml(el, `
      <section class="perfil">
        <header class="perfil-cabecera">
          ${capasCabecera(cab, accDueno)}
          <div class="cab-barra">
            ${esMio ? '' : `<button type="button" class="cab-boton" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: '#FFFFFF' })}</button>`}
            ${cab.tipo === 'juego' ? `<a class="cab-favorito" href="#juego/${cab.juego.igdb_id}"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8 21 7v10l-9 5.2L3 17V7z" fill="${esc(accDueno)}"/></svg><span>Favorito · ${esc(cab.juego.nombre)}</span></a>` : ''}
            <span class="cab-hueco"></span>
            ${esMio && conPerfil ? `<button type="button" class="cab-boton" data-accion="cabecera" aria-label="Cambiar cabecera">${icono('cabecera', { tam: 20, color: '#FFFFFF' })}</button>` : ''}
            ${esMio ? `<button type="button" class="cab-boton" data-accion="ajustes" aria-label="Ajustes">${icono('ajustes', { tam: 20, color: '#FFFFFF' })}</button>` : ''}
          </div>
        </header>
        <div class="perfil-lado">
        <div class="perfil-datos">
          <div class="perfil-foto${u.activo === false ? ' difunto-foto' : ''}">
            ${avatar(u, 112)}
            ${esMio && 'foto_url' in u && !u.foto_url ? `<button type="button" class="perfil-foto-mas" data-foto="${esc(u.id)}" aria-label="Poner foto">${icono('mas', { tam: 18, color: '#FFFFFF' })}</button>` : ''}
          </div>
          <div class="perfil-nombre">
            <h1 class="perfil-nombre-grande">${esc(u.nombre)}</h1>
            <div class="perfil-meta">
              ${plat ? `<span class="perfil-plat">${icono(/^PS/.test(plat) ? 'jugando' : 'monitor', { tam: 15, color: 'var(--acento)', trazo: 'var(--fondo)' })}${esc(plat)}</span>` : ''}
              ${meta ? `<span>${esc(meta)}</span>` : ''}
            </div>
            ${padrino(u.id) ? `<a class="perfil-padrino" href="#perfil/${esc(padrino(u.id).id)}">Entró por propuesta de <strong>${esc(padrino(u.id).nombre)}</strong></a>` : ''}
            ${col ? `<button type="button" class="perfil-columnista" data-ppestana="columna">${logoColumna(col, 18)}<span>Columnista de ${esc(col.nombre)}</span></button>` : ''}
          </div>
          ${u.activo === false ? `<a class="perfil-difunto" href="#cementerio">${icono(u.exorcizado ? 'sello' : 'lapida', { tam: 18, color: 'currentColor' })}<span>${u.exorcizado ? 'Exorcizado. No volverá.' : 'Descansa en el cementerio'} · <strong>Ver su lápida</strong></span></a>` : ''}
          ${mia.bio ? `<p class="perfil-bio">${esc(mia.bio)}</p>` : esMio && conPerfil ? falta('Añade una biografía', 'bio') : ''}
          ${mia.estado ? `
            <div class="perfil-ahora">
              <i aria-hidden="true"></i>
              <span><small>Ahora mismo</small><strong>${esc(mia.estado)}</strong></span>
            </div>` : esMio && conPerfil ? falta('¿A qué estás jugando ahora?', 'estado') : ''}
          ${!mia.plataforma && esMio && conPerfil ? falta('Elige tu plataforma principal', 'plataforma') : ''}

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
                : `<span class="dato-num apagado">—</span><span class="dato-etq">Horas · ${vinculado ? 'sin datos' : 'sin plataforma'}</span>`}
            </div>
          </div>

          ${top.length ? `
            <div class="perfil-top">
              <h2 class="perfil-top-titulo">${esMio ? 'Mi' : 'Su'} top ${top.length}</h2>
              <div class="vitrina-top-fila">
                ${top.map((j, i) => `
                  <a class="vitrina-top-item" href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}" aria-label="${i + 1}. ${esc(j.nombre)}">
                    ${portada(j, { clase: 'portada-jugando', titulo: 'arriba' })}
                    <span class="vitrina-pos">${i + 1}</span>
                  </a>`).join('')}
              </div>
            </div>` : ''}
          <div class="perfil-insignias-compactas">${insignias.vitrinaHtml(u, esMio)}</div>
          ${esMio && conPerfil && (mia.bio || mia.estado || mia.plataforma) ? '<button type="button" class="enlace-discreto perfil-editar-enlace" data-accion="editar-perfil">Editar perfil</button>' : ''}
        </div>

        ${esMio ? '' : `<a class="boton-principal enlace perfil-comparar" href="#rankings/comparar/${esc(yo.id)}/${esc(id)}">${icono('rankings', { tam: 20, color: 'currentColor' })}<span>Comparar conmigo</span></a>`}

        ${esMio && bib.porRevisar.length ? `
          <a class="aviso-revisar en-perfil" href="#revisar">
            ${icono('jugando', { tam: 20, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}
            <span>Revisa ${bib.porRevisar.length} ${bib.porRevisar.length === 1 ? 'juego nuevo' : 'juegos nuevos'} de tu biblioteca</span>
            ${icono('adelante', { tam: 16, color: 'var(--texto-2)' })}
          </a>` : ''}

        </div>
        <div class="perfil-principal" data-subdeslizar data-sub-i="${pestanas.findIndex((x) => x.id === pestana)}" data-sub-n="${pestanas.length}">
          <div class="perfil-pestanas" role="tablist" aria-label="Perfil">
            ${pestanas.map((x) => `
              <button type="button" role="tab" class="perfil-pestana${x.id === pestana ? ' activa' : ''}" aria-selected="${x.id === pestana}" data-ppestana="${x.id}">${x.nombre}</button>`).join('')}
          </div>
          <div class="perfil-panel" data-ref="panel" data-subpanel data-k="panel-${pestana}">${panel(u, p, bib, vinculado, hayBiblioteca, col)}</div>
        </div>
      </section>`);
    if (pestana === 'historial') pintarHistorial(u, p);
    if (pestana === 'estadisticas') observarGraficos(el);
    // La biblioteca, la primera vez, justo después del primer fotograma (cientos de portadas).
    if (pestana === 'biblioteca' && hayBiblioteca) {
      if (primeraPintada) requestAnimationFrame(() => setTimeout(() => { if (el.isConnected) pintarBiblioteca(metricas.biblioteca(id)); }, 0));
      else pintarBiblioteca(bib);
    }
    primeraPintada = false;
    // Si es el perfil de otro y tiene un "¡Completado!" que no he visto, aquí también.

    if (enFiltro) {
      const inp = el.querySelector(`[data-filtro="${enFiltro}"] [data-filtro-texto]`);
      if (inp) { inp.focus(); try { inp.setSelectionRange(cursor, cursor); } catch { /* nada */ } }
    }
  };

  /** El contenido de la pestaña elegida. */
  const panel = (u, p, bib, vinculado, hayBiblioteca, col) => {
    if (pestana === 'tiers') return htmlTiers(id);
    if (pestana === 'estadisticas') return `<div class="perfil-stats">${htmlEstadisticas(id)}</div>`;
    if (pestana === 'columna' && col) return htmlColumna(col, yo, { embebida: true });
    if (pestana === 'biblioteca') {
      return `
        ${hayBiblioteca ? `
          <section class="perfil-seccion">
            <div class="seccion-cab">
              <h2 class="seccion-titulo">Biblioteca</h2>
              <span class="seccion-extra">${bib.horas ? `${bib.horas} h` : ''}</span>
            </div>
            <div data-ref="biblioteca" data-propio></div>
          </section>` : ''}
        <section class="perfil-seccion">
          <h2 class="seccion-titulo">Bibliotecas</h2>
          ${bloqueBibliotecas(u, esMio, vinculado, bib)}
        </section>`;
    }
    return `
      <section class="perfil-seccion">
        <div data-ref="historial" data-propio></div>
      </section>
      ${bloqueResenas(id)}
      ${p.online.length ? `
        <section class="perfil-seccion">
          <div class="seccion-cab">
            <h2 class="seccion-titulo">Juegos sin final</h2>
            <span class="seccion-extra">${p.online.length}</span>
          </div>
          <div class="rejilla" data-lista>${p.online.map((v, i) => itemRejilla(v, i, horasItem(v) ?? undefined, esMio)).join('')}</div>
        </section>` : ''}`;
  };

  /** Cambiar de pestaña: ahí mismo (sin navegar), recordada, y la barra a la vista. */
  const cambiarPestana = (nueva) => {
    if (nueva === pestana) return;
    pestana = nueva;
    guardarPestana(nueva);
    pintar();
    const barra = el.querySelector('.perfil-pestanas');
    if (barra && barra.getBoundingClientRect().top < 0) barra.scrollIntoView({ block: 'start' });
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
      pintarHtml(cont, `
        <div class="historial-vacio">
          ${icono('valorar', { tam: 28, color: 'var(--acento)', trazo: 'var(--superficie)' })}
          <p>${esMio ? 'Tu historial se irá llenando con los juegos que valores.' : `${esc(u.nombre)} todavía no tiene juegos en su historial.`}</p>
          ${esMio ? '<a class="boton-secundario" href="#valorar">Valorar un juego</a>' : ''}
        </div>`);
      return;
    }
    const activa = pestanaRecordada.get(id);
    pintarHtml(cont, `
      <div class="pestanas pestanas-historial" role="tablist" aria-label="Historial">
        ${PESTANAS.map((x) => `
          <button type="button" role="tab" class="pestana${x.id === activa ? ' activa' : ''}" aria-selected="${x.id === activa}" data-pestana="${x.id}">
            ${x.nombre} <span class="pestana-n">${p.historial[x.id].length}</span>
          </button>`).join('')}
      </div>
      ${barraFiltro('hist', fHist)}
      <div data-ref="rejilla-hist">${rejillaHistorial(u, p)}</div>`);
  };

  // ----- Biblioteca de PlayStation -------------------------------------------
  const datosBiblioteca = (x) => ({
    nombre: x.nombre ?? '',
    nota: x.valoracion?.nota != null ? Number(x.valoracion.nota) : null,
    horas: x.horas,
    fecha: x.ultimaVez,
  });

  /** ¿Lo ha valorado (él mismo o a través de su colección, tipo FIFA/EA FC)? */
  const valorado = (x) => {
    if (x.valoracion) return true;
    const ids = x.coleccion ? x.coleccion.juegos.map((j) => j.igdb_id) : x.igdbId != null ? [x.igdbId] : [];
    return ids.some((jid) => { const c = datos.coleccionDeJuego(jid); return !!(c && metricas.valoracionColeccionDe(id, c.id)); });
  };
  const sinValorar = (l) => l.filter((x) => !valorado(x));

  const rejillaBiblioteca = (bib, origen = bib.misJuegos, vacio = 'Todavía no hay juegos identificados.') => {
    const base = soloSinValorar ? sinValorar(origen) : origen;
    const lista = filtrar(base, fBib, datosBiblioteca);
    if (!lista.length) {
      if (soloSinValorar && origen.length && !base.length) {
        return `<p class="historial-tab-vacia">${esMio ? 'Lo tienes todo valorado.' : 'Lo tiene todo valorado.'} <button type="button" class="enlace-discreto" data-accion="sin-valorar">Ver todos</button></p>`;
      }
      return `<p class="historial-tab-vacia">${fBib.texto ? 'Ningún juego con ese nombre.' : vacio}</p>`;
    }
    const item = (x, i) => (x.coleccion
      ? bloqueGrupo(x.clave, x.coleccion.juegos, x.coleccion.juego?.nombre ?? x.nombre,
        `${x.coleccion.juegos.length} juegos${x.horas ? ` · ${textoHoras(x.horas)}` : ''}`,
        x.coleccion.juegos.map((j, k) => itemDeColeccion(j, k, esMio, id)).join(''))
      : itemBiblioteca(x, i, esMio));
    const lista2 = metricas.agruparColecciones(id, lista, (x) => x.igdbId);
    return `<div class="rejilla">${lista2.map((x, i) => (x.esColeccion
      ? itemColeccionBib(x, i, esMio, id)
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
    const nDup = esMio ? metricas.posiblesDuplicados(id).length : 0;
    pintarHtml(cont, `
      <p class="bib-recuento">
        <span><strong>${sinValorar(bib.misJuegos).length}</strong> sin valorar · ${bib.misJuegos.length} en total</span>
        <span><strong>${bib.probados.length}</strong> probados</span>
        ${esMio ? `<span><strong>${bib.ocultos.length}</strong> ocultos</span>` : ''}
      </p>
      ${progresoHorasXbox()}
      ${esMio && nDup ? `
        <a class="aviso-revisar en-perfil aviso-dup" href="#duplicados">
          <span>Revisar posibles duplicados (${nDup})</span>
          ${icono('adelante', { tam: 18, color: 'currentColor' })}
        </a>` : ''}
      ${barraFiltro('bib', fBib, `<button type="button" class="chip bib-sin-valorar${soloSinValorar ? ' activo' : ''}" data-accion="sin-valorar" aria-pressed="${soloSinValorar}" title="${soloSinValorar ? 'Ver todos' : 'Ver solo los que no tienen valoración'}">${soloSinValorar ? 'Sin valorar' : 'Todos'}</button>`)}
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
          </ul>` : ''}` : ''}`);
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

  // Deslizar sobre las subpestañas (js/deslizar.js): la de al lado.
  el.addEventListener('cvj:subpestana', (e) => {
    const lista = [...el.querySelectorAll('[data-ppestana][role="tab"]')].map((b) => b.dataset.ppestana);
    const i = lista.indexOf(pestana);
    const nueva = lista[i + e.detail.dir];
    if (nueva) cambiarPestana(nueva);
  });

  el.addEventListener('change', (e) => { cambioTiers(e); });
  el.addEventListener('click', (e) => {
    if (clicEstadisticas(e)) return;
    if (clicTiers(e)) return;
    const pp = e.target.closest('[data-ppestana]');
    if (pp) { cambiarPestana(pp.dataset.ppestana); return; }
    if (e.target.closest('[data-accion="insignias"]')) { insignias.abrirColeccion(id); return; }
    if (e.target.closest('[data-accion="ver-resenas"]')) {
      if (resenasAbiertas.has(id)) resenasAbiertas.delete(id); else resenasAbiertas.add(id);
      const b = el.querySelector('[data-ref="resenas"]');
      if (b) b.outerHTML = bloqueResenas(id);
      return;
    }
    const menuHist = e.target.closest('[data-menu-item]');
    if (menuHist) {
      e.preventDefault();
      const k = menuHist.dataset.menuItem;
      if (k.startsWith('coleccion:')) abrirMenuColeccion({ uid: yo.id, coleccionId: k.slice(10) });
      else abrirMenuJuego({ uid: yo.id, igdbId: Number(k) });
      return;
    }
    // "¿Es X?" → "Sí": emparejado de un toque (se confirma solo cuando la base lo guarda).
    const si = e.target.closest('[data-es-este]');
    if (si) {
      e.preventDefault();
      const x = grupoBib(si.dataset.esEste);
      const j = datos.juegoConocido(si.dataset.juego);
      if (x && j) datos.emparejarPsn(x.psnTitleId, j, (m) => aviso(m, 6000)).then((ok) => { if (ok) aviso(`Guardado: es ${j.nombre}`); });
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
    if (b.dataset.accion === 'sin-valorar') {
      soloSinValorar = !soloSinValorar;
      try { localStorage.setItem(CLAVE_SIN_VALORAR, soloSinValorar ? '1' : '0'); } catch { /* nada */ }
      pintarBiblioteca(metricas.biblioteca(id));
      return;
    }
    if (b.dataset.accion === 'ver-ocultos') { vista.ocultos = !vista.ocultos; pintarBiblioteca(metricas.biblioteca(id)); return; }
    if (b.dataset.accion === 'seleccionar') {
      entrarSeleccion(el.querySelector('[data-ref="rejilla-bib"]'), false);
      return;
    }
    if (b.dataset.pestana) {
      pestanaRecordada.set(id, b.dataset.pestana);
      const u = datos.usuario(id) ?? yo;
      pintarHistorial(u, metricas.perfil(id));
    } else if (b.dataset.accion === 'editar-perfil') {
      import('../perfil-editar.js').then((m) => m.abrirEditarPerfil(yo.id, null, b.dataset.foco || null));
    } else if (b.dataset.accion === 'cabecera') {
      import('../cabecera-editar.js').then((m) => m.abrirEditarCabecera(yo.id));
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
// ---------------------------------------------------------------------------
// Reseñas: las últimas, con sus reacciones y respuestas
// ---------------------------------------------------------------------------
const resenasAbiertas = new Set(); // perfiles con "Ver todas" abierto (mientras la app está abierta)
const RESENAS_A_LA_VISTA = 3;
function bloqueResenas(uid) {
  const fecha = (v) => v.actualizado_en || v.creado_en;
  const lista = datos.valoracionesEfectivas()
    .filter((v) => v.usuario_id === uid && v.resena?.trim() && v.id)
    .map((v) => ({ tipo: 'valoracion', v, j: datos.juegoConocido(v.juego_id) }))
    .concat((datos.estado.valColecciones ?? [])
      .filter((v) => v.usuario_id === uid && v.resena?.trim())
      .map((v) => ({ tipo: 'valoracion_coleccion', v, j: datos.coleccion(v.coleccion_id) ? datos.comoJuego(datos.coleccion(v.coleccion_id)) : null })))
    .filter((x) => x.j)
    .sort((a, b) => new Date(fecha(b.v)) - new Date(fecha(a.v)));
  if (!lista.length) return '<div data-ref="resenas" hidden></div>';
  const todas = resenasAbiertas.has(uid);
  const vista = todas ? lista : lista.slice(0, RESENAS_A_LA_VISTA);
  return `
    <section class="perfil-seccion" data-ref="resenas">
      <div class="seccion-cab">
        <h2 class="seccion-titulo">Reseñas</h2>
        <span class="seccion-extra">${lista.length}</span>
      </div>
      <div class="perfil-resenas">
        ${vista.map(({ tipo, v, j }) => `
          <article class="perfil-resena">
            <a class="perfil-resena-cab" href="${metricas.rutaDe(j)}">
              ${portada(j, { clase: 'portada-resena' })}
              <span class="perfil-resena-juego"><strong>${esc(j.nombre)}</strong><small data-fecha="${esc(fecha(v))}">${tiempoRelativo(fecha(v))}</small></span>
              ${v.nota != null ? notaConLetra(v.nota, 'act') : ''}
            </a>
            <p class="perfil-resena-texto">${esc(v.resena)}</p>
            ${social.tira(tipo, v.id, { visibles: 1 })}
          </article>`).join('')}
      </div>
      ${lista.length > RESENAS_A_LA_VISTA ? `<button type="button" class="enlace-discreto perfil-resenas-mas" data-accion="ver-resenas">${todas ? 'Ver menos' : `Ver las ${lista.length} reseñas`}</button>` : ''}
    </section>`;
}

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
  const horas = metricas.textoAprox(x.horas, x.horasEstimadas);
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
      ${x.desglose?.filter((d) => !d.excluida).length > 1 ? `<span class="rejilla-plataformas">${esc(x.desglose.filter((d) => !d.excluida).map((d) => `${d.plataforma.replace('Xbox Series', 'Series').replace('Xbox One', 'One').replace('Estimado (IGDB)', 'Estimado')} ${d.estimada ? '≈' : ''}${textoHoras(d.horas)}`).join(' · '))}</span>` : ''}
      ${esMio ? `<button type="button" class="bib-menu" data-bib-menu="${esc(x.clave)}" aria-label="Opciones de ${esc(x.nombre)}">${icono('opciones', { tam: 18, color: '#FFFFFF' })}</button>` : ''}
    </div>`;
}

/**
 * Sin identificar: la imagen de la plataforma, limpia. Debajo, discreto, la mejor propuesta
 * ("¿Es Horizon Forbidden West?" con "Sí" de un toque) o, si no hay, "¿Qué juego es?".
 */
function itemSinIdentificar(x, esMio) {
  const horas = textoHoras(x.horas);
  const dentro = `
    <div class="portada portada-rejilla portada-psn" style="--bloque:var(--superficie-2)">
      <span class="portada-titulo portada-titulo-arriba">${esc(x.nombre)}</span>
      ${x.imagen ? `<img src="${esc(imagenPlataforma(x.imagen, 120))}" alt="" loading="lazy" decoding="async" onload="this.classList.add('ok')" onerror="this.remove()">` : ''}
    </div>
    <span class="rejilla-nota"><span class="rejilla-horas">${horas || 'Sin horas'}</span></span>`;
  if (!esMio) return `<div class="rejilla-item sin-emparejar" aria-label="${esc(x.nombre)}">${dentro}</div>`;
  const elegir = `#elegir/${encodeURIComponent(x.psnTitleId)}`;
  const prop = x.revision?.propuesta ?? null;
  return `
    <div class="bib-celda sin-id" data-bib-celda="${esc(x.clave)}">
      <a class="rejilla-item sin-emparejar" href="${elegir}" aria-label="${esc(x.nombre)}: elegir qué juego es">${dentro}</a>
      <button type="button" class="bib-menu" data-bib-menu="${esc(x.clave)}" aria-label="Opciones de ${esc(x.nombre)}">${icono('opciones', { tam: 18, color: '#FFFFFF' })}</button>
      ${prop ? `
        <div class="sin-id-pie">
          <span class="sin-id-pregunta">¿Es <strong>${esc(prop.nombre)}</strong>?</span>
          <span class="sin-id-botones">
            <button type="button" class="sin-id-si" data-es-este="${esc(x.clave)}" data-juego="${prop.igdb_id}">Sí</button>
            <a class="sin-id-otro" href="${elegir}">Otro</a>
          </span>
        </div>`
      : `<a class="sin-id-pie sin-id-elegir" href="${elegir}">${icono('buscar', { tam: 13, color: 'currentColor' })}<span>¿Qué juego es?</span></a>`}
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
  const h = horas !== undefined ? metricas.textoAprox(horas, v.esColeccion ? metricas.horasColeccion(v.usuario_id, v.coleccion_id).estimadas : metricas.estimadasDe(v.usuario_id, j.igdb_id)) : '';
  const clave = v.esColeccion ? `coleccion:${v.coleccion_id}` : String(j.igdb_id);
  return `
    <div class="bib-celda"${v.esColeccion ? '' : ` data-sel="${j.igdb_id}"`}>
      <a class="rejilla-item" href="${metricas.rutaDe(j)}" data-precarga="${esc(j.cover_id ?? '')}" aria-label="${esc(j.nombre)}${v.esColeccion ? ' (coleccion)' : ''}${n ? `, ${n}` : ''}${h ? `, ${h}` : ''}">
        ${portada(j, { clase: 'portada-rejilla', titulo: 'arriba', prioridad: i < 6 })}
        ${v.esColeccion ? `<span class="sello-coleccion">${esc(metricas.etiquetaColeccion(v.coleccion_id, v.usuario_id))}</span>` : ''}
        ${!v.esColeccion && estaRejugando(v) ? '<span class="sello-rejugando">Rejugando</span>' : !v.esColeccion && v.rejugado ? `<span class="sello-rejugado">${marcaRejugado(v, { tam: 12 })}</span>` : ''}
        ${n || h ? `<span class="rejilla-nota">${n ? `${n}${chipLetra(notaLetra(v.nota), 'mini')}` : ''}${h ? `<span class="rejilla-horas">${h}</span>` : ''}</span>` : ''}
      </a>
      ${conMenu ? `<button type="button" class="bib-menu" data-menu-item="${esc(clave)}" aria-label="Opciones de ${esc(j.nombre)}">${icono('opciones', { tam: 18, color: '#FFFFFF' })}</button>` : ''}
    </div>`;
}

/** Biblioteca: tarjeta de una colección con los juegos que junta (los que no tienen valoración propia). */
function itemColeccionBib(x, i, esMio, uid) {
  const horas = metricas.textoAprox(x.horas, x.horasEstimadas);
  const v = x.valoracion;
  const n = v?.nota != null ? formatearNota(v.nota) : null;
  return `
    <div class="bib-celda" data-bib-celda="${esc(x.clave)}">
      <a class="rejilla-item" href="#coleccion/${esc(x.coleccion.id)}" data-precarga="${esc(x.juego.cover_id ?? '')}" aria-label="${esc(x.coleccion.nombre)} (coleccion)${horas ? `, ${horas}` : ''}">
        ${portada(x.juego, { clase: 'portada-rejilla', titulo: 'arriba', prioridad: i < 6 })}
        <span class="sello-coleccion">${esc(metricas.etiquetaColeccion(x.coleccion.id, uid))}</span>
        <span class="rejilla-nota">
          ${n ? `${n}${chipLetra(notaLetra(v.nota), 'mini')}` : ''}
          ${horas ? `<span class="rejilla-horas">${horas}</span>` : (n ? '' : '<span class="rejilla-horas">Sin horas</span>')}
        </span>
      </a>
      ${esMio ? `<button type="button" class="bib-menu" data-bib-menu="${esc(x.clave)}" aria-label="Opciones de ${esc(x.coleccion.nombre)}">${icono('opciones', { tam: 18, color: '#FFFFFF' })}</button>` : ''}
    </div>`;
}
