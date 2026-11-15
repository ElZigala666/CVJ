// Arranque de CVJ: sesión, datos, rutas (#inicio, #buscar, #juego/123...) y barra inferior.
import { icono } from './icons.js';
import { usuarioActual, salir, refrescarUsuario } from './sesion.js';
import * as datos from './datos.js';
import { aplicarAcento } from './ui.js';
import { iniciarInstalacion } from './instalar.js';
import { iniciarTema } from './tema.js';
import { iniciarApariencia, aplicarApariencia, olvidarApariencia } from './apariencia.js';
import { anotarNavegacion, corregirRuta } from './navegacion.js';

const vista = document.getElementById('vista');
const barra = document.getElementById('barra');

// Cada pantalla se descarga cuando se abre por primera vez (y las pestañas, en cuanto la
// primera está pintada): al arrancar solo viaja lo que hace falta para lo que se ve.
const buscar = () => import('./pantallas/buscar.js');
const RUTAS = {
  inicio: () => import('./pantallas/inicio.js'),
  buscar,
  valorar: buscar, // el botón central abre Buscar en modo valorar
  elegir: buscar,  // #elegir/{psnTitleId}: "¿Qué juego es?" (emparejar con PSN)
  rankings: () => import('./pantallas/rankings.js'),          // #rankings y #rankings/comparar/{a}/{b}
  perfil: () => import('./pantallas/perfil.js'),              // #perfil, #perfil/{id} y #perfil/{id}/tiers
  estadisticas: () => import('./pantallas/estadisticas.js'),  // #estadisticas/{id}
  juego: () => import('./pantallas/juego.js'),
  revisar: () => import('./pantallas/revisar.js'),            // #revisar: "Revisa tu biblioteca"
  duplicados: () => import('./pantallas/duplicados.js'),      // #duplicados: horas que pueden repetirse entre Steam y Xbox
  coleccion: () => import('./pantallas/coleccion.js'),        // #coleccion/{id}: ficha de una colección
  saga: () => import('./pantallas/saga.js'),                  // #saga/{id}: página de una saga (Persona, Zelda...)
  escribir: () => import('./pantallas/escribir.js'),          // #escribir/{id} o #escribir/nueva[/juego|coleccion|saga/{id}]: editor de columna
  entrada: () => import('./pantallas/lectura.js'),            // #entrada/{id}: leer una entrada de columna
  columna: () => import('./pantallas/columna.js'),            // #columna/{id}: página de una columna
};
const login = () => import('./pantallas/entrada.js');

// Lo que no hace falta para pintar: se carga cuando se usa o cuando la app está quieta.
const abrirAjustes = (...a) => import('./ajustes.js').then((m) => m.abrirAjustes(...a));
const plataformas = () => Promise.all([import('./psn.js'), import('./xbox.js'), import('./steam.js'), import('./igdb.js')]);
let seleccion = null; // js/seleccion.js, cuando llega
const cargarSeleccion = () => import('./seleccion.js').then((m) => { if (!seleccion) { seleccion = m; m.iniciarSeleccion(vista); } });
const enCalma = (fn, ms = 1500) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: ms + 2000 }) : setTimeout(fn, ms));
let segundoPlano = false;
/** Tras pintar la primera pantalla: selección múltiple, estimaciones y las otras pestañas. */
function cargarSegundoPlano() {
  if (segundoPlano) return;
  segundoPlano = true;
  setTimeout(() => enCalma(() => {
    cargarSeleccion();
    import('./estimaciones.js').then((m) => m.iniciarEstimaciones());
    for (const r of ['inicio', 'perfil', 'buscar', 'rankings', 'juego']) RUTAS[r]().catch(() => {});
    import('./hoja-valorar.js').catch(() => {});
  }), 1200);
}
const PESTANAS = [
  ['inicio', 'Inicio'],
  ['buscar', 'Buscar'],
  ['valorar', null],
  ['rankings', 'Rankings'],
  ['perfil', 'Perfil'],
];
// Rutas que se ven a pantalla completa, sin la barra inferior (la ficha tiene la suya).
const SIN_BARRA = new Set(['juego', 'revisar', 'duplicados', 'coleccion', 'saga', 'escribir', 'entrada', 'columna']);
const REFRESCO_MS = 60_000;

let limpiar = null;
let datosIniciados = false;

// ---------------------------------------------------------------------------
// Barra inferior
// ---------------------------------------------------------------------------
function pintarBarra() {
  // En escritorio (css/escritorio.css) esta barra es la lateral: con logo, buscador y
  // "Valorar" con texto. En móvil esas piezas no se ven (display: none).
  barra.innerHTML = `
    <a class="barra-logo" href="#inicio" aria-label="CVJ, ir a Inicio">${icono('logo', { tam: 30, color: 'var(--acento)' })}<span>CVJ</span></a>
    <label class="barra-buscar">${icono('buscar', { tam: 18, color: 'var(--texto-2)' })}<input type="search" data-buscar-global placeholder="Buscar un juego" autocomplete="off" aria-label="Buscar un juego"><kbd>/</kbd></label>
  ` + PESTANAS.map(([ruta, texto]) => {
    if (!texto) {
      return `<a class="barra-fab" href="#${ruta}" data-ruta="${ruta}" aria-label="Valorar un juego">${icono('mas', { tam: 26, color: 'var(--sobre-acento)' })}<span class="barra-fab-texto">Valorar</span></a>`;
    }
    return `<a class="barra-tab" href="#${ruta}" data-ruta="${ruta}">${icono(ruta, { tam: 24 })}<span>${texto}</span></a>`;
  }).join('');
}

// Buscador de la barra lateral (escritorio): lo que se escribe va al buscador de la app.
// El texto (y el cursor) pasan al buscador de la pantalla Buscar en cuanto existe, y se
// sigue escribiendo ahí. Si se teclea deprisa mientras se abre, va siempre lo último.
let textoPendiente = null;
function pasarABuscar() {
  const q = document.getElementById('q');
  if (!q || textoPendiente == null) return false;
  const texto = textoPendiente;
  textoPendiente = null;
  q.value = texto;
  q.dispatchEvent(new Event('input', { bubbles: true }));
  q.focus();
  q.setSelectionRange(texto.length, texto.length);
  const g = barra.querySelector('[data-buscar-global]');
  if (g) g.value = '';
  return true;
}
function alBuscarGlobal(texto) {
  const esperando = textoPendiente != null;
  textoPendiente = texto;
  if (location.hash.startsWith('#buscar') && pasarABuscar()) return;
  if (esperando) return; // ya hay una espera en marcha: se llevará el último texto
  const intentar = (n = 0) => { if (!pasarABuscar() && n < 60) requestAnimationFrame(() => intentar(n + 1)); };
  if (!location.hash.startsWith('#buscar')) {
    window.addEventListener('hashchange', () => requestAnimationFrame(() => intentar()), { once: true });
    location.hash = '#buscar';
  } else intentar();
}
barra.addEventListener('input', (e) => { if (e.target.matches('[data-buscar-global]')) alBuscarGlobal(e.target.value); });
barra.addEventListener('keydown', (e) => {
  if (!e.target.matches('[data-buscar-global]')) return;
  if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); }
  if (e.key === 'Enter') alBuscarGlobal(e.target.value);
});
// Teclado de escritorio: "/" enfoca el buscador (el de la barra lateral si se ve).
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || document.body.classList.contains('hoja-abierta')) return;
  const global = barra.querySelector('[data-buscar-global]');
  e.preventDefault();
  if (global && global.offsetParent !== null) { global.focus(); global.select(); return; }
  if (location.hash.startsWith('#buscar')) { document.getElementById('q')?.focus(); return; }
  window.addEventListener('hashchange', () => requestAnimationFrame(() => document.getElementById('q')?.focus()), { once: true });
  location.hash = '#buscar';
});

function marcarBarra(ruta, params) {
  // Perfil propio, sus tiers y estadísticas marcan "Perfil"; los de otros, nada.
  const yo = usuarioActual()?.id;
  let activa = ruta;
  if (ruta === 'perfil' || ruta === 'estadisticas') activa = !params[0] || params[0] === yo ? 'perfil' : '';
  for (const a of barra.querySelectorAll('[data-ruta]')) {
    const on = a.dataset.ruta === activa;
    a.classList.toggle('activa', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------
function leerRuta() {
  const [ruta, ...params] = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
  return { ruta: RUTAS[ruta] ? ruta : 'inicio', params };
}

let turnoMontar = 0;
async function montar(cargar, contexto, conBarra, scroll = 0) {
  // La pantalla anterior se queda hasta que llega el código de la nueva (la primera vez).
  const turno = ++turnoMontar;
  let modulo;
  try { modulo = await cargar(); } catch (e) {
    console.error(e);
    if (turno === turnoMontar) import('./ui.js').then((m) => m.aviso('No se ha podido abrir. Revisa la conexión.'));
    return;
  }
  if (turno !== turnoMontar) return; // se ha ido a otra pantalla mientras tanto
  try { limpiar?.(); } catch (e) { console.error(e); }
  limpiar = null;
  seleccion?.alCambiarPantalla();

  const pantalla = document.createElement('div');
  pantalla.className = 'pantalla';
  vista.replaceChildren(pantalla);
  barra.hidden = !conBarra;
  document.body.classList.toggle('sin-barra', !conBarra);

  const r = modulo.render(pantalla, contexto);
  if (typeof r === 'function') limpiar = r;
  window.scrollTo(0, scroll);
  // Al volver: lo que se pinta un poco después (imágenes, datos) puede cambiar la altura.
  if (scroll) for (const ms of [50, 200, 500]) setTimeout(() => { if (window.scrollY < scroll - 2) window.scrollTo(0, scroll); }, ms);
  cargarSegundoPlano();
}

function navegar() {
  const usuario = usuarioActual();

  if (!usuario) {
    if (location.hash) corregirRuta(location.pathname + location.search);
    montar(login, { alEntrar }, false);
    document.title = 'CVJ · Entrar';
    return;
  }

  iniciarDatos();
  const scroll = anotarNavegacion();
  const { ruta, params } = leerRuta();
  if (ruta !== 'juego') import('./galeria.js').then((m) => { if (!location.hash.startsWith('#juego')) m.olvidarGaleria(); });
  const pedida = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (pedida !== ruta) corregirRuta(`#${ruta}`);
  // Título por defecto; las pantallas con nombre propio lo cambian al pintarse.
  document.title = `CVJ · ${ruta[0].toUpperCase() + ruta.slice(1)}`;
  montar(RUTAS[ruta], { ruta, params, alSalir }, !SIN_BARRA.has(ruta), scroll);
  marcarBarra(ruta, params);
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------
function alEntrar(usuario) {
  aplicarAcento(usuario.acento);
  corregirRuta('#inicio');
  navegar();
}

function alSalir() {
  salir();
  plataformas().then(([psn, xbox, steam]) => { psn.olvidar(); xbox.olvidar(); steam.olvidar(); });
  datos.borrarCache();
  datosIniciados = false;
  aplicarAcento(null);
  olvidarApariencia();
  corregirRuta(location.pathname + location.search);
  navegar();
}

let revisando = false;
function revisarPlataformas() {
  if (revisando) return;
  revisando = true;
  enCalma(() => plataformas().then(([psn, xbox, steam, igdb]) => {
    revisando = false;
    if (!usuarioActual()) return;
    psn.revisarAutomatico();
    xbox.revisarAutomatico();
    xbox.revisarHoras();
    steam.revisarAutomatico();
    // Biblioteca sincronizada con reglas antiguas: recalcularla una vez con las nuevas.
    psn.revisarReproceso();
    // Juegos guardados antes de la migración 005: marcar cuáles son online (una vez).
    igdb.revisarOnline(datos.estado.juegos, () => datos.refrescar());
  }, () => { revisando = false; }), 800);
}

let suscrito = false;
function iniciarDatos() {
  if (datosIniciados) return;
  datosIniciados = true;
  if (!suscrito) suscrito = !!datos.suscribir(() => {
    // Si cambian mis datos (nombre, color, acento) en el servidor, actualizarlos aquí.
    const yo = usuarioActual();
    const fresco = yo && datos.usuario(yo.id);
    // Desactivado por el admin: se cierra la sesión en este móvil.
    if (fresco?.activo === false) { alSalir(); return; }
    if (fresco && (fresco.acento !== yo.acento || fresco.color !== yo.color || fresco.nombre !== yo.nombre || (fresco.foto_url ?? null) !== (yo.foto_url ?? null))) {
      refrescarUsuario(fresco);
      aplicarAcento(fresco.acento);
    }
    // El fondo va en la cuenta: si se cambió en otro dispositivo, llega aquí.
    if (fresco && 'apariencia' in fresco) aplicarApariencia(fresco.apariencia);
  });
  // Sincronizaciones automáticas: en segundo plano y con datos del servidor (no de la caché).
  datos.cuandoFrescos(revisarPlataformas);
  datos.iniciar();
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
iniciarTema();
iniciarApariencia();
iniciarInstalacion();
pintarBarra();
aplicarAcento(usuarioActual()?.acento);
window.addEventListener('hashchange', navegar);
// "Reconectar" PlayStation (aviso de Inicio): Ajustes abierta en el asistente.
// Sin el menú de pulsación larga del navegador (guardar imagen, abrir enlace...) salvo en
// campos de texto. Las pulsaciones largas propias (menú de la biblioteca) siguen: escuchan
// el mismo evento antes de que llegue aquí.
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest?.('input, textarea, select, [contenteditable="true"]')) e.preventDefault();
});
// "Poner / cambiar foto" (Ajustes, o el perfil de otro si soy admin).
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-foto]');
  const u = b && datos.usuario(b.dataset.foto);
  if (u) import('./foto-perfil.js').then((m) => m.abrirEditorFoto(u));
});
window.addEventListener('cvj:psn-asistente', () => { if (usuarioActual()) abrirAjustes(alSalir, { psn: true }); });
// "Conectar PlayStation, Xbox o Steam" (bienvenida de Inicio): Ajustes en Plataformas.
window.addEventListener('cvj:ajustes-plataformas', () => { if (usuarioActual()) abrirAjustes(alSalir, { plataformas: true }); });
// Vuelta del inicio de sesión de Steam (?steam=vuelta&openid.…): validar y enseñar el resultado en Ajustes.
if (/[?&]steam=vuelta/.test(location.search)) import('./steam.js').then((m) => m.revisarVuelta()?.then(() => { if (usuarioActual()) abrirAjustes(alSalir, { steam: true }); }));
// Refresco en segundo plano: al volver a la app y cada minuto mientras se ve.
// Si no ha cambiado nada, datos.js no repinta.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && usuarioActual()) datos.refrescar();
});
setInterval(() => {
  if (document.visibilityState === 'visible' && usuarioActual() && datosIniciados) datos.refrescar();
}, REFRESCO_MS);
// La caché se lee mientras llega el resto de la app: se pinta ya con datos, sin esqueleto.
(usuarioActual() ? datos.alArrancar() : Promise.resolve()).then(navegar);
