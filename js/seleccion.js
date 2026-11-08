// Selección múltiple en toda la app.
//
// Cualquier portada o fila con data-sel="{igdbId}" se puede seleccionar:
//   - mantener pulsado (o Ctrl+clic en escritorio) entra en el modo con ese juego marcado;
//   - en el modo, cada toque marca o desmarca; Mayús+clic marca un rango de la lista.
// Arriba: "N seleccionados", "Seleccionar todo" (de la lista donde se empezó) y la X.
// Abajo: las acciones más usadas y "Más". Atrás (botón o gesto) y Escape salen.
// Una pantalla puede poner sus propias acciones con configurarSeleccion() (Revisar).
import { icono } from './icons.js';
import { esc, aviso, avisoDeshacer, portada, ESTADOS } from './ui.js';
import { abrirHoja } from './hoja.js';
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { usuarioActual } from './sesion.js';
import { abrirValorar } from './hoja-valorar.js';
import { abrirFusion } from './fusiones.js';
import { normalizarBusqueda } from './psn-nombres.js';

const PULSACION_LARGA_MS = 480;
const PLATAFORMAS_GENERICAS = ['PS5', 'PS4', 'PC', 'Xbox', 'Switch'];
const ESTADOS_SIN_FINAL = [
  { id: 'jugando', nombre: 'Lo juego', icono: 'jugando' },
  { id: 'abandonado', nombre: 'Lo he dejado', icono: 'abandonado' },
  { id: 'pendiente', nombre: 'Pendiente', icono: 'pendiente' },
];

let vista = null;          // contenedor de las pantallas
let activo = false;
const claves = new Set();
let ancla = null;          // última clave tocada (para Mayús+clic)
let listaIdx = -1;         // qué [data-lista] de la pantalla es "la lista" (Seleccionar todo)
let contexto = null;       // acciones propias de la pantalla montada
let cab = null;
let barraSel = null;
let largo = null;
let largaHecha = false;
let ultimoPuntero = 'mouse';
let pendientePintar = false;

const yo = () => usuarioActual();
const esAdmin = () => !!datos.usuario(yo()?.id)?.es_admin;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export const seleccionando = () => activo;

/** La pantalla montada pone sus acciones: { acciones: [{id, texto, icono, hacer(claves)}], soloPropias, juegoDe(clave) }. */
export function configurarSeleccion(ctx) { contexto = ctx; }

/** app.js, antes de montar otra pantalla. */
export function alCambiarPantalla() {
  if (activo) salir({ sinHistorial: true });
  contexto = null;
}

/** Entra en el modo (con un elemento marcado o, si no, vacío dentro de una lista). */
export function entrarSeleccion(desde = null, marcar = true) {
  if (!vista) return;
  const item = desde?.closest?.('[data-sel]') ?? null;
  const lista = (item ?? desde)?.closest?.('[data-lista]') ?? null;
  listaIdx = lista ? [...vista.querySelectorAll('[data-lista]')].indexOf(lista) : -1;
  if (!activo) {
    activo = true;
    claves.clear();
    history.pushState({ ...(history.state || {}), cvjSel: true }, '');
    document.body.classList.add('seleccionando');
    montarBarras();
  }
  if (item && marcar) { claves.add(item.dataset.sel); ancla = item.dataset.sel; }
  pintar();
}

export function salirSeleccion() { salir(); }

function salir({ sinHistorial = false } = {}) {
  if (!activo) return;
  activo = false;
  claves.clear();
  ancla = null;
  document.body.classList.remove('seleccionando');
  cab?.remove(); barraSel?.remove();
  cab = barraSel = null;
  pintarMarcas();
  if (!sinHistorial && history.state?.cvjSel) history.back();
}

// ---------------------------------------------------------------------------
// Puesta en marcha (una vez)
// ---------------------------------------------------------------------------
export function iniciarSeleccion(contenedor) {
  vista = contenedor;

  // Clics: en captura y en window, antes que cualquier otro (también los de los perfiles).
  window.addEventListener('click', (e) => {
    const item = e.target.closest?.('[data-sel]');
    const enVista = item && vista.contains(item);
    if (largaHecha) {
      largaHecha = false;
      if (enVista) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (!enVista || e.button > 0) return;
    if (!activo) {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); entrarSeleccion(item); }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey && ancla) rango(ancla, item);
    else alternar(item.dataset.sel);
  }, true);

  // Pulsación larga.
  window.addEventListener('pointerdown', (e) => {
    ultimoPuntero = e.pointerType;
    const item = e.target.closest?.('[data-sel]');
    if (!item || !vista.contains(item) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    largaHecha = false;
    const x0 = e.clientX, y0 = e.clientY;
    clearTimeout(largo?.t);
    largo = {
      x0, y0,
      t: setTimeout(() => {
        largo = null;
        largaHecha = true;
        navigator.vibrate?.(12);
        if (!activo) entrarSeleccion(item);
        else alternar(item.dataset.sel);
      }, PULSACION_LARGA_MS),
    };
  }, true);
  const cancelar = (e) => {
    if (!largo) return;
    if (e.type === 'pointermove' && Math.hypot(e.clientX - largo.x0, e.clientY - largo.y0) < 10) return;
    clearTimeout(largo.t);
    largo = null;
  };
  for (const t of ['pointermove', 'pointerup', 'pointercancel']) window.addEventListener(t, cancelar, true);
  window.addEventListener('scroll', () => { if (largo) { clearTimeout(largo.t); largo = null; } }, { passive: true });
  // Al tocar y mantener, el navegador abre su menú (y algunas pantallas el suyo): aquí no.
  window.addEventListener('contextmenu', (e) => {
    const item = e.target.closest?.('[data-sel]');
    if (!item || !vista.contains(item)) return;
    if (ultimoPuntero !== 'mouse' || activo) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // Atrás sale del modo; Escape también.
  window.addEventListener('popstate', () => { if (activo && !history.state?.cvjSel) salir({ sinHistorial: true }); });
  document.addEventListener('keydown', (e) => {
    if (!activo || e.key !== 'Escape' || document.body.classList.contains('hoja-abierta')) return;
    e.preventDefault();
    salir();
  });

  // La pantalla se repinta sola (datos nuevos, filtros): volver a poner las marcas.
  new MutationObserver(() => {
    if (!activo || pendientePintar) return;
    pendientePintar = true;
    requestAnimationFrame(() => { pendientePintar = false; pintarMarcas(); pintarCuenta(); });
  }).observe(vista, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Marcar
// ---------------------------------------------------------------------------
function alternar(k) {
  if (claves.has(k)) claves.delete(k); else claves.add(k);
  ancla = k;
  pintar();
}

const visible = (el) => el.getClientRects().length > 0;

function itemsDeLista() {
  const listas = [...vista.querySelectorAll('[data-lista]')];
  const raiz = listas[listaIdx] ?? vista;
  return [...raiz.querySelectorAll('[data-sel]')].filter(visible);
}

function rango(desde, hasta) {
  const items = [...vista.querySelectorAll('[data-sel]')].filter(visible);
  const i = items.findIndex((x) => x.dataset.sel === desde);
  const j = items.indexOf(hasta);
  if (i < 0 || j < 0) { alternar(hasta.dataset.sel); return; }
  const [a, b] = i < j ? [i, j] : [j, i];
  for (const x of items.slice(a, b + 1)) claves.add(x.dataset.sel);
  ancla = hasta.dataset.sel;
  pintar();
}

function pintar() {
  pintarMarcas();
  pintarCuenta();
}

function pintarMarcas() {
  if (!vista) return;
  for (const el of vista.querySelectorAll('[data-sel]')) {
    const on = activo && claves.has(el.dataset.sel);
    el.classList.toggle('sel-marcado', on);
    let c = el.querySelector(':scope > .sel-check');
    if (activo) {
      if (!c) {
        c = document.createElement('span');
        c.className = 'sel-check';
        c.setAttribute('aria-hidden', 'true');
        el.appendChild(c);
      }
      const html = on ? icono('completado', { tam: 26, color: 'var(--acento)', trazo: 'var(--sobre-acento)' }) : '';
      if (c.dataset.on !== String(on)) { c.innerHTML = html; c.dataset.on = String(on); }
      el.setAttribute('aria-selected', String(on));
    } else {
      c?.remove();
      el.removeAttribute('aria-selected');
    }
  }
}

function pintarCuenta() {
  if (!cab) return;
  const n = claves.size;
  cab.querySelector('[data-ref="cuenta"]').textContent = n ? plural(n, 'seleccionado', 'seleccionados') : 'Elige juegos';
  const items = itemsDeLista();
  const todos = items.length > 0 && items.every((x) => claves.has(x.dataset.sel));
  const b = cab.querySelector('[data-sel-accion="todo"]');
  b.textContent = todos ? 'Ninguno' : 'Seleccionar todo';
  b.hidden = !items.length;
  for (const x of barraSel?.querySelectorAll('button') ?? []) x.disabled = !n;
}

// ---------------------------------------------------------------------------
// Barras
// ---------------------------------------------------------------------------
const botonBarra = (accion, ic, texto) => `
  <button type="button" class="sel-boton" data-sel-accion="${accion}" disabled>
    ${icono(ic, { tam: 22, color: 'currentColor', trazo: 'var(--fondo)' })}
    <span>${esc(texto)}</span>
  </button>`;

function montarBarras() {
  cab = document.createElement('div');
  cab.className = 'sel-cab';
  cab.setAttribute('role', 'toolbar');
  cab.innerHTML = `
    <button type="button" class="boton-cuadrado" data-sel-accion="salir" aria-label="Salir de la selección">${icono('cerrar', { tam: 18, color: 'var(--texto)' })}</button>
    <span class="sel-cuenta" data-ref="cuenta" aria-live="polite"></span>
    <button type="button" class="enlace-discreto sel-todo" data-sel-accion="todo">Seleccionar todo</button>`;
  barraSel = document.createElement('div');
  barraSel.className = 'sel-barra';
  barraSel.setAttribute('role', 'toolbar');
  const propias = contexto?.acciones ?? [];
  barraSel.innerHTML = [
    ...propias.map((a) => botonBarra(`ctx:${a.id}`, a.icono, a.texto)),
    ...(contexto?.soloPropias ? [] : [
      botonBarra('estado', 'completado', 'Estado'),
      botonBarra('recomendar', 'recomendado', 'Recomendar'),
      botonBarra('valorar', 'valorar', 'Valorar'),
      botonBarra('mas', 'opciones', 'Más'),
    ]),
  ].join('');
  document.body.append(cab, barraSel);
  const alClic = (e) => {
    const b = e.target.closest('[data-sel-accion]');
    if (!b || b.disabled) return;
    const a = b.dataset.selAccion;
    if (a === 'salir') salir();
    else if (a === 'todo') {
      const items = itemsDeLista();
      const todos = items.every((x) => claves.has(x.dataset.sel));
      for (const x of items) { if (todos) claves.delete(x.dataset.sel); else claves.add(x.dataset.sel); }
      pintar();
    } else if (a.startsWith('ctx:')) {
      const acc = propias.find((x) => `ctx:${x.id}` === a);
      const lista = [...claves];
      salir();
      acc?.hacer(lista);
    } else if (a === 'estado') hojaEstado();
    else if (a === 'recomendar') hojaRecomendar();
    else if (a === 'valorar') valorarUnoAUno();
    else if (a === 'mas') hojaMas();
  };
  cab.addEventListener('click', alClic);
  barraSel.addEventListener('click', alClic);
}

// ---------------------------------------------------------------------------
// Qué hay seleccionado
// ---------------------------------------------------------------------------
/** Los juegos elegidos (ids principales, sin repetir, en el orden de la pantalla). */
function juegosElegidos() {
  const orden = [...vista.querySelectorAll('[data-sel]')].map((x) => x.dataset.sel);
  const lista = [...claves].sort((a, b) => (orden.indexOf(a) + 1 || 1e9) - (orden.indexOf(b) + 1 || 1e9));
  const ids = lista.map((k) => (contexto?.juegoDe ? contexto.juegoDe(k) : Number(k))).filter((n) => Number.isFinite(n) && n > 0).map((n) => datos.canonico(n));
  return [...new Set(ids)].filter((id) => datos.juegoConocido(id));
}

/** Mis entradas de biblioteca por juego (para Probados / Mis juegos / Ocultar / Mostrar). */
function bibliotecaPorJuego(uid) {
  const bib = metricas.biblioteca(uid);
  const m = new Map();
  for (const x of bib.juegos) if (x.igdbId != null && !x.coleccion) m.set(datos.canonico(x.igdbId), { ...x, oculto: false });
  for (const x of bib.ocultos) if (x.igdbId != null && !x.coleccion && !m.has(datos.canonico(x.igdbId))) m.set(datos.canonico(x.igdbId), { ...x, oculto: true });
  return m;
}

// ---------------------------------------------------------------------------
// Aplicar: aviso previo si no vale para todos, una escritura y "Deshacer"
// ---------------------------------------------------------------------------
/**
 * @param {{ total:number, aplican:number[], motivos:[number,string][], nota?:string, hacer:(ids)=>{ok,deshacer}|void, hecho:(n)=>string }} op
 */
function aplicar({ total, aplican, motivos = [], nota = '', hacer, hecho }) {
  const razones = motivos.filter(([n]) => n > 0).map(([n, t]) => `${n} ${t}`);
  if (!aplican.length) {
    aviso(razones.length ? `No se puede aplicar a ninguno: ${razones.join(', ')}` : 'No hay nada que cambiar');
    return;
  }
  const ir = () => {
    salir();
    const r = hacer(aplican);
    if (r?.deshacer) avisoDeshacer(hecho(aplican.length), r.deshacer);
    else aviso(hecho(aplican.length));
  };
  if (aplican.length === total && !nota) { ir(); return; }
  abrirHoja({
    titulo: '¿Seguimos?',
    html: `
      <div class="sel-confirmar">
        ${aplican.length < total ? `<p>Se aplicará a <strong>${aplican.length} de ${total}</strong>${razones.length ? ` (${esc(razones.join(', '))})` : ''}.</p>` : ''}
        ${nota ? `<p>${esc(nota)}</p>` : ''}
        <div class="sel-confirmar-botones">
          <button type="button" class="boton-secundario neutro" data-cerrar>Cancelar</button>
          <button type="button" class="boton-principal" data-ref="si">Aplicar a ${aplican.length}</button>
        </div>
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.querySelector('[data-ref="si"]').addEventListener('click', () => { cerrar(true); ir(); });
    },
  });
}

const opcion = (accion, ic, texto, extra = '') => `
  <button type="button" class="menu-opcion" data-op="${esc(accion)}"${extra}>
    <span class="menu-opcion-icono">${icono(ic, { tam: 22, color: 'currentColor', trazo: 'var(--superficie)' })}</span>
    <span>${esc(texto)}</span>
  </button>`;

/** Hoja con opciones; cada data-op llama a su función. */
function hojaOpciones(titulo, html, acciones) {
  const n = claves.size;
  abrirHoja({
    titulo,
    antetitulo: plural(n, 'juego seleccionado', 'juegos seleccionados'),
    html: `<div class="menu-opciones">${html}</div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-op]');
        if (!b || !acciones[b.dataset.op]) return;
        cerrar(true);
        acciones[b.dataset.op](b);
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Acciones para todos (sobre mis valoraciones y mi biblioteca)
// ---------------------------------------------------------------------------
const NOMBRE_ESTADO = { jugando: 'Jugando', completado: 'Completado', abandonado: 'Abandonado', pendiente: 'Pendiente' };

function hojaEstado() {
  const ids = juegosElegidos();
  const sinFinal = ids.length > 0 && ids.every((id) => datos.esOnline(id));
  const estados = sinFinal ? ESTADOS_SIN_FINAL : ESTADOS;
  hojaOpciones('Cambiar estado', estados.map((e) => opcion(`estado:${e.id}`, e.icono, e.nombre)).join(''),
    Object.fromEntries(estados.map((e) => [`estado:${e.id}`, () => cambiarEstado(e.id, e.nombre)])));
}

function cambiarEstado(est, nombre = NOMBRE_ESTADO[est]) {
  const uid = yo().id;
  const ids = juegosElegidos();
  const aplican = [];
  let sinFinal = 0, iguales = 0, conNota = 0;
  for (const id of ids) {
    const v = datos.miValoracion(uid, id);
    if (est === 'completado' && datos.esOnline(id)) { sinFinal++; continue; }
    if (v?.estado === est) { iguales++; continue; }
    if (est === 'pendiente' && (v?.nota != null || v?.recomendado != null)) conNota++;
    aplican.push(id);
  }
  aplicar({
    total: ids.length,
    aplican,
    motivos: [[sinFinal, sinFinal === 1 ? 'es un juego sin final' : 'son juegos sin final'], [iguales, iguales === 1 ? 'ya estaba así' : 'ya estaban así']],
    nota: conNota ? `En «Pendiente» no hay nota: se quitará la nota y la recomendación de ${plural(conNota, 'juego', 'juegos')}. Puedes deshacerlo justo después.` : '',
    hacer: (lista) => datos.valoracionesEnLote(uid, lista, () => ({ estado: est }), aviso),
    hecho: (n) => `${plural(n, 'juego', 'juegos')} en «${nombre}»`,
  });
}

function hojaRecomendar() {
  hojaOpciones('Recomendar', `
    ${opcion('si', 'recomendado', 'Lo recomiendo')}
    ${opcion('no', 'no-recomendado', 'No lo recomiendo')}
    ${opcion('quitar', 'cerrar', 'Quitar recomendación')}`, {
    si: () => recomendar(true),
    no: () => recomendar(false),
    quitar: () => recomendar(null),
  });
}

function recomendar(valor) {
  const uid = yo().id;
  const ids = juegosElegidos();
  const aplican = [];
  let sinVal = 0, pend = 0, iguales = 0;
  for (const id of ids) {
    const v = datos.miValoracion(uid, id);
    if (!v) { sinVal++; continue; }
    if (v.estado === 'pendiente') { pend++; continue; }
    if ((v.recomendado ?? null) === valor) { iguales++; continue; }
    aplican.push(id);
  }
  aplicar({
    total: ids.length,
    aplican,
    motivos: [[sinVal, sinVal === 1 ? 'no tiene valoración' : 'no tienen valoración'], [pend, pend === 1 ? 'está en pendientes' : 'están en pendientes'], [iguales, iguales === 1 ? 'ya estaba así' : 'ya estaban así']],
    hacer: (lista) => datos.valoracionesEnLote(uid, lista, (antes) => (antes ? { recomendado: valor } : null), aviso),
    hecho: (n) => (valor === null ? `Recomendación quitada de ${plural(n, 'juego', 'juegos')}` : `${plural(n, 'juego', 'juegos')} ${valor ? 'recomendados' : 'no recomendados'}`),
  });
}

function contarEnRanking(valor) {
  const uid = yo().id;
  const ids = juegosElegidos();
  const aplican = [];
  let sinVal = 0, iguales = 0;
  for (const id of ids) {
    const v = datos.miValoracion(uid, id);
    if (!v) { sinVal++; continue; }
    if (metricas.cuentaEnRanking(v) === valor) { iguales++; continue; }
    aplican.push(id);
  }
  aplicar({
    total: ids.length,
    aplican,
    motivos: [[sinVal, sinVal === 1 ? 'no tiene valoración' : 'no tienen valoración'], [iguales, iguales === 1 ? 'ya estaba así' : 'ya estaban así']],
    hacer: (lista) => datos.valoracionesEnLote(uid, lista, (antes) => (antes ? { cuenta_ranking: valor } : null), aviso),
    hecho: (n) => `${plural(n, 'juego', 'juegos')} ${valor ? 'cuentan' : 'ya no cuentan'} en tu tier list y rankings`,
  });
}

function hojaPlataformas() {
  const uid = yo().id;
  const ids = juegosElegidos();
  const deJuegos = new Set(ids.flatMap((id) => datos.juegoConocido(id)?.plataformas ?? []));
  const anadir = [...new Set([...deJuegos, ...PLATAFORMAS_GENERICAS])];
  const quitar = [...new Set(ids.flatMap((id) => datos.plataformasDe(datos.miValoracion(uid, id))))];
  abrirHoja({
    titulo: 'Plataformas',
    antetitulo: plural(claves.size, 'juego seleccionado', 'juegos seleccionados'),
    html: `
      <div class="sel-plataformas">
        <span class="campo-titulo">Añadir una</span>
        <div class="sel-chips">${anadir.map((p) => `<button type="button" class="chip" data-anadir="${esc(p)}">${esc(p)}</button>`).join('')}</div>
        ${quitar.length ? `
          <span class="campo-titulo">Quitar una</span>
          <div class="sel-chips">${quitar.map((p) => `<button type="button" class="chip" data-quitar="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-anadir], [data-quitar]');
        if (!b) return;
        cerrar(true);
        cambiarPlataforma(b.dataset.anadir ?? b.dataset.quitar, b.dataset.anadir != null);
      });
    },
  });
}

function cambiarPlataforma(p, poner) {
  const uid = yo().id;
  const ids = juegosElegidos();
  const aplican = [];
  let sinVal = 0, iguales = 0;
  for (const id of ids) {
    const v = datos.miValoracion(uid, id);
    if (!v) { sinVal++; continue; }
    if (datos.plataformasDe(v).includes(p) === poner) { iguales++; continue; }
    aplican.push(id);
  }
  aplicar({
    total: ids.length,
    aplican,
    motivos: [[sinVal, sinVal === 1 ? 'no tiene valoración' : 'no tienen valoración'], [iguales, poner ? (iguales === 1 ? 'ya la tenía' : 'ya la tenían') : (iguales === 1 ? 'no la tenía' : 'no la tenían')]],
    hacer: (lista) => datos.valoracionesEnLote(uid, lista, (antes) => {
      if (!antes) return null;
      const ps = datos.plataformasDe(antes).filter((x) => x !== p);
      return { plataformas: poner ? [...ps, p] : ps };
    }, aviso),
    hecho: (n) => `${p} ${poner ? 'añadida a' : 'quitada de'} ${plural(n, 'juego', 'juegos')}`,
  });
}

function biblioteca(que) {
  const uid = yo().id;
  const ids = juegosElegidos();
  const porJuego = bibliotecaPorJuego(uid);
  const aplican = [];
  let fuera = 0, iguales = 0;
  for (const id of ids) {
    const x = porJuego.get(id);
    if (!x) { fuera++; continue; }
    const ya = que === 'ocultar' ? x.oculto : que === 'mostrar' ? !x.oculto : x.oculto || (que === 'probados' ? x.probado : !x.probado);
    if (ya) { iguales++; continue; }
    aplican.push(id);
  }
  const textos = { probados: 'en «Probados»', mis: 'en «Mis juegos»', ocultar: 'ocultos de tu biblioteca', mostrar: 'de vuelta en tu biblioteca' };
  aplicar({
    total: ids.length,
    aplican,
    motivos: [[fuera, fuera === 1 ? 'no está en tu biblioteca' : 'no están en tu biblioteca'], [iguales, iguales === 1 ? 'ya estaba así' : 'ya estaban así']],
    hacer: (lista) => datos.bibliotecaEnLote(uid, lista.flatMap((id) => porJuego.get(id).titulos), que, aviso),
    hecho: (n) => `${plural(n, 'juego', 'juegos')} ${textos[que]}`,
  });
}

/** Abre la hoja de Valorar del primero; al guardar (o saltar), la del siguiente. */
function valorarUnoAUno() {
  const ids = juegosElegidos();
  if (!ids.length) return;
  salir();
  const paso = (i) => {
    if (i >= ids.length) { aviso(ids.length === 1 ? 'Listo' : `Listo: has repasado ${ids.length} juegos`); return; }
    abrirValorar(ids[i], { serie: { pos: i + 1, total: ids.length, siguiente: () => paso(i + 1) } });
  };
  paso(0);
}

// ---------------------------------------------------------------------------
// "Más": todas las acciones
// ---------------------------------------------------------------------------
function hojaMas() {
  const admin = esAdmin();
  const ids = juegosElegidos();
  const sagaAqui = location.hash.startsWith('#saga/') ? datos.saga(location.hash.split('/')[1]) : null;
  const cab2 = (t) => `<span class="campo-titulo menu-seccion">${esc(t)}</span>`;
  hojaOpciones('Más acciones', `
    ${cab2('Mi valoración')}
    ${opcion('estado', 'completado', 'Cambiar estado…')}
    ${opcion('recomendar', 'recomendado', 'Recomendar…')}
    ${opcion('contar-si', 'rankings', 'Contar en mi tier list y rankings')}
    ${opcion('contar-no', 'rankings', 'No contar en mi tier list y rankings')}
    ${opcion('plataformas', 'ajustes', 'Plataformas…')}
    ${opcion('valorar', 'valorar', 'Valorar uno a uno')}
    ${cab2('Mi biblioteca')}
    ${opcion('mis', 'probados', 'Mover a Mis juegos')}
    ${opcion('probados', 'probados', 'Mover a Probados')}
    ${opcion('ocultar', 'ocultar', 'Ocultar de mi biblioteca')}
    ${opcion('mostrar', 'ficha', 'Volver a mostrar en mi biblioteca')}
    ${admin ? `
      ${cab2('Admin')}
      ${opcion('online-si', 'online', 'Marcar como sin final')}
      ${opcion('online-no', 'online', 'Quitar de «Sin final»')}
      ${opcion('coleccion', 'coleccion', 'Añadir a una colección…')}
      ${opcion('quitar-coleccion', 'coleccion', 'Quitar de su colección')}
      ${opcion('saga', 'saga', 'Añadir a una saga…')}
      ${opcion('quitar-saga', 'saga', sagaAqui ? `Quitar de «${sagaAqui.nombre}»` : 'Quitar de una saga…')}
      ${ids.length >= 2 ? opcion('fusionar', 'fusionar', `Fusionar los ${ids.length} en uno…`) : ''}` : ''}`, {
    estado: hojaEstado,
    recomendar: hojaRecomendar,
    'contar-si': () => contarEnRanking(true),
    'contar-no': () => contarEnRanking(false),
    plataformas: hojaPlataformas,
    valorar: valorarUnoAUno,
    mis: () => biblioteca('mis'),
    probados: () => biblioteca('probados'),
    ocultar: () => biblioteca('ocultar'),
    mostrar: () => biblioteca('mostrar'),
    'online-si': () => admin && sinFinal(true),
    'online-no': () => admin && sinFinal(false),
    coleccion: () => admin && hojaColeccion(),
    'quitar-coleccion': () => admin && quitarColeccion(),
    saga: () => admin && hojaSaga(),
    'quitar-saga': () => admin && quitarSaga(sagaAqui),
    fusionar: () => admin && fusionarVarios(),
  });
}

// ---------------------------------------------------------------------------
// Acciones de admin (no se ven si no lo eres)
// ---------------------------------------------------------------------------
function sinFinal(valor) {
  const ids = juegosElegidos();
  const aplican = ids.filter((id) => datos.juego(id) && datos.esOnline(id) !== valor);
  const iguales = ids.filter((id) => datos.juego(id) && datos.esOnline(id) === valor).length;
  const fuera = ids.length - aplican.length - iguales;
  aplicar({
    total: ids.length,
    aplican,
    motivos: [[iguales, iguales === 1 ? 'ya estaba así' : 'ya estaban así'], [fuera, fuera === 1 ? 'no lo ha valorado nadie' : 'no los ha valorado nadie']],
    hacer: (lista) => datos.marcarOnlineEnLote(lista, valor, aviso),
    hecho: (n) => `${plural(n, 'juego', 'juegos')} ${valor ? 'marcados como sin final' : 'ya no son sin final'}`,
  });
}

/** Hoja para elegir algo de una lista con buscador (colecciones o sagas). */
function hojaElegir({ titulo, lista, vacio, crear = null, alElegir }) {
  let texto = '';
  abrirHoja({
    titulo,
    antetitulo: plural(claves.size, 'juego seleccionado', 'juegos seleccionados'),
    html: `
      <div class="elegir-juegos">
        <input type="search" class="psn-input" data-ref="q" placeholder="Buscar" autocomplete="off">
        <div class="elegir-lista" data-ref="lista"></div>
        ${crear ? `
          <span class="campo-titulo">O crea una nueva</span>
          <div class="psn-form">
            <input class="psn-input" data-ref="nueva" maxlength="80" placeholder="Nombre" autocomplete="off">
            <button type="button" class="boton-principal" data-ref="crear">Crear</button>
          </div>` : ''}
      </div>`,
    alMontar(cuerpo, cerrar) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      const pintarLista = () => {
        const q = normalizarBusqueda(texto);
        const l = lista.filter((x) => !q || normalizarBusqueda(x.nombre).includes(q));
        $('lista').innerHTML = l.map((x) => `
          <button type="button" class="fila-elegir" data-elegir="${esc(x.id)}">
            ${portada(x.juego, { clase: 'portada-lista' })}
            <span class="fila-elegir-texto"><strong>${esc(x.nombre)}</strong><small>${esc(x.sub)}</small></span>
          </button>`).join('') || `<p class="ajustes-nota">${esc(q ? 'Nada con ese nombre.' : vacio)}</p>`;
      };
      $('q').addEventListener('input', (e) => { texto = e.target.value; pintarLista(); });
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-elegir]');
        if (b) { cerrar(true); alElegir(b.dataset.elegir); return; }
        if (crear && e.target.closest('[data-ref="crear"]')) {
          const n = $('nueva').value.trim();
          if (!n) { $('nueva').focus(); return; }
          cerrar(true);
          crear(n);
        }
      });
      pintarLista();
    },
  });
}

function hojaColeccion() {
  const uid = yo().id;
  const ids = juegosElegidos();
  hojaElegir({
    titulo: 'Añadir a una colección',
    vacio: 'Todavía no hay colecciones.',
    lista: datos.colecciones().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((sg) => ({
      id: sg.id, nombre: sg.nombre, juego: datos.comoJuego(sg), sub: plural(datos.juegosDeColeccion(sg.id).length, 'juego', 'juegos'),
    })),
    crear: (nombre) => {
      salir();
      datos.crearColeccion({ nombre, juegos: ids, usuarioId: uid }, aviso);
      aviso(`Colección «${nombre}» creada con ${plural(ids.length, 'juego', 'juegos')}`);
    },
    alElegir: (colId) => {
      const sg = datos.coleccion(colId);
      const aplican = ids.filter((id) => datos.coleccionDeJuego(id)?.id !== colId);
      aplicar({
        total: ids.length,
        aplican,
        motivos: [[ids.length - aplican.length, ids.length - aplican.length === 1 ? 'ya estaba en ella' : 'ya estaban en ella']],
        hacer: (lista) => datos.anadirAColeccionEnLote(colId, lista, aviso),
        hecho: (n) => `${plural(n, 'juego añadido', 'juegos añadidos')} a «${sg?.nombre ?? ''}»`,
      });
    },
  });
}

function quitarColeccion() {
  const ids = juegosElegidos();
  const aplican = ids.filter((id) => datos.coleccionDeJuego(id));
  const fuera = ids.length - aplican.length;
  aplicar({
    total: ids.length,
    aplican,
    motivos: [[fuera, fuera === 1 ? 'no está en ninguna colección' : 'no están en ninguna colección']],
    hacer: (lista) => datos.quitarDeColeccionEnLote(lista, aviso),
    hecho: (n) => `${plural(n, 'juego quitado', 'juegos quitados')} de su colección`,
  });
}

function hojaSaga() {
  const ids = juegosElegidos();
  hojaElegir({
    titulo: 'Añadir a una saga',
    vacio: 'Todavía no hay sagas.',
    lista: datos.sagas().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((sg) => {
      const js = datos.juegosDeSaga(sg.id);
      return { id: sg.id, nombre: sg.nombre, juego: datos.juegoConocido(js[0]) ?? { nombre: sg.nombre }, sub: plural(js.length, 'juego', 'juegos') };
    }),
    alElegir: (sagaId) => {
      const sg = datos.saga(sagaId);
      const dentro = new Set(datos.juegosDeSaga(sagaId).map((x) => datos.canonico(x)));
      const aplican = ids.filter((id) => !dentro.has(id));
      aplicar({
        total: ids.length,
        aplican,
        motivos: [[ids.length - aplican.length, ids.length - aplican.length === 1 ? 'ya estaba en ella' : 'ya estaban en ella']],
        hacer: (lista) => datos.anadirASagaEnLote(sagaId, lista, aviso),
        hecho: (n) => `${plural(n, 'juego añadido', 'juegos añadidos')} a «${sg?.nombre ?? ''}»`,
      });
    },
  });
}

function quitarSaga(sagaAqui) {
  const ids = juegosElegidos();
  const deSaga = (sagaId) => {
    const sg = datos.saga(sagaId);
    const dentro = new Set(datos.juegosDeSaga(sagaId).map((x) => datos.canonico(x)));
    const aplican = ids.filter((id) => dentro.has(id));
    aplicar({
      total: ids.length,
      aplican,
      motivos: [[ids.length - aplican.length, ids.length - aplican.length === 1 ? 'no está en esa saga' : 'no están en esa saga']],
      hacer: (lista) => datos.quitarDeSagaEnLote(sagaId, lista, aviso),
      hecho: (n) => `${plural(n, 'juego quitado', 'juegos quitados')} de «${sg?.nombre ?? ''}»`,
    });
  };
  if (sagaAqui) { deSaga(sagaAqui.id); return; }
  const sagas = [...new Map(ids.flatMap((id) => datos.sagasDeJuego(id)).map((sg) => [sg.id, sg])).values()];
  if (!sagas.length) { aviso('Ninguno está en una saga'); return; }
  if (sagas.length === 1) { deSaga(sagas[0].id); return; }
  hojaElegir({
    titulo: '¿De qué saga?',
    vacio: 'Ninguna.',
    lista: sagas.map((sg) => {
      const n = ids.filter((id) => datos.juegosDeSaga(sg.id).some((x) => datos.canonico(x) === id)).length;
      const js = datos.juegosDeSaga(sg.id);
      return { id: sg.id, nombre: sg.nombre, juego: datos.juegoConocido(js[0]) ?? { nombre: sg.nombre }, sub: `${n} de los seleccionados` };
    }),
    alElegir: deSaga,
  });
}

/** Fusionar: con dos, la hoja de siempre; con más, elegir cuál se queda y fusionar el resto en él. */
function fusionarVarios() {
  const uid = yo().id;
  const ids = juegosElegidos();
  if (ids.length < 2) return;
  if (ids.length === 2) { salir(); abrirFusion(uid, ids[0], ids[1]); return; }
  abrirHoja({
    titulo: '¿Cuál se queda?',
    antetitulo: `Fusionar ${ids.length} juegos en uno`,
    html: `
      <div class="fusion">
        <p class="ajustes-nota">Contarán como un solo juego para todo el grupo, con la portada y el nombre del que elijas. Si tienes nota en varios, se queda la del elegido. Se puede deshacer desde la ficha.</p>
        <div class="fusion-opciones">
          ${ids.map((id) => { const j = datos.juegoConocido(id); return `
            <button type="button" class="fusion-opcion" data-principal="${id}">
              ${portada(j, { clase: 'portada-lista' })}
              <span><strong>${esc(j.nombre)}</strong>${j.anio ? `<small>${j.anio}</small>` : ''}</span>
            </button>`; }).join('')}
        </div>
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-principal]');
        if (!b) return;
        const principal = Number(b.dataset.principal);
        cerrar(true);
        salir();
        let ok = true;
        for (const otro of ids.filter((x) => x !== principal)) {
          ok = await datos.fusionar({ usuarioId: uid, principal, alias: otro, notaDe: 'principal' }, aviso);
          if (!ok) break;
        }
        if (ok) aviso(`Fusionados: ${ids.length} juegos cuentan como uno`);
      });
    },
  });
}

