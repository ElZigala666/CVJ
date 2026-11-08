// Arranque de CVJ: sesión, datos, rutas (#inicio, #buscar, #juego/123...) y barra inferior.
import { icono } from './icons.js';
import { usuarioActual, salir, refrescarUsuario } from './sesion.js';
import * as datos from './datos.js';
import { aplicarAcento } from './ui.js';
import { iniciarInstalacion } from './instalar.js';
import { iniciarTema } from './tema.js';
import * as psn from './psn.js';
import { abrirAjustes } from './ajustes.js';
import { abrirEditorFoto } from './foto-perfil.js';
import { revisarOnline } from './igdb.js';
import * as entrada from './pantallas/entrada.js';
import * as inicio from './pantallas/inicio.js';
import * as buscar from './pantallas/buscar.js';
import * as juego from './pantallas/juego.js';
import * as perfil from './pantallas/perfil.js';
import * as estadisticas from './pantallas/estadisticas.js';
import * as rankings from './pantallas/rankings.js';
import * as revisar from './pantallas/revisar.js';
import * as coleccion from './pantallas/coleccion.js';
import * as saga from './pantallas/saga.js';
import * as escribir from './pantallas/escribir.js';
import * as lectura from './pantallas/lectura.js';
import * as columna from './pantallas/columna.js';
import * as xbox from './xbox.js';
import * as steam from './steam.js';
import { anotarNavegacion, corregirRuta } from './navegacion.js';
import { olvidarGaleria } from './galeria.js';
import { iniciarSeleccion, alCambiarPantalla } from './seleccion.js';

const vista = document.getElementById('vista');
const barra = document.getElementById('barra');
iniciarSeleccion(vista);

const RUTAS = {
  inicio,
  buscar,
  valorar: buscar, // el botón central abre Buscar en modo valorar
  elegir: buscar,  // #elegir/{psnTitleId}: "¿Qué juego es?" (emparejar con PSN)
  rankings,          // #rankings y #rankings/comparar/{a}/{b}
  perfil,            // #perfil, #perfil/{id} y #perfil/{id}/tiers
  estadisticas,      // #estadisticas/{id}
  juego,
  revisar,           // #revisar: "Revisa tu biblioteca"
  coleccion,              // #coleccion/{id}: ficha de una colección
  saga,                   // #saga/{id}: página de una saga (Persona, Zelda...)
  escribir,               // #escribir/{id} o #escribir/nueva[/juego|coleccion|saga/{id}]: editor de columna
  entrada: lectura,       // #entrada/{id}: leer una entrada de columna
  columna,                // #columna/{id}: página de una columna
};
const PESTANAS = [
  ['inicio', 'Inicio'],
  ['buscar', 'Buscar'],
  ['valorar', null],
  ['rankings', 'Rankings'],
  ['perfil', 'Perfil'],
];
// Rutas que se ven a pantalla completa, sin la barra inferior (la ficha tiene la suya).
const SIN_BARRA = new Set(['juego', 'revisar', 'coleccion', 'saga', 'escribir', 'entrada', 'columna']);
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

function montar(modulo, contexto, conBarra, scroll = 0) {
  try { limpiar?.(); } catch (e) { console.error(e); }
  limpiar = null;
  alCambiarPantalla();

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
}

function navegar() {
  const usuario = usuarioActual();

  if (!usuario) {
    if (location.hash) corregirRuta(location.pathname + location.search);
    montar(entrada, { alEntrar }, false);
    document.title = 'CVJ · Entrar';
    return;
  }

  iniciarDatos();
  const scroll = anotarNavegacion();
  const { ruta, params } = leerRuta();
  if (ruta !== 'juego') olvidarGaleria();
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
  psn.olvidar();
  xbox.olvidar();
  steam.olvidar();
  datos.borrarCache();
  datosIniciados = false;
  aplicarAcento(null);
  corregirRuta(location.pathname + location.search);
  navegar();
}

let suscrito = false;
function iniciarDatos() {
  if (datosIniciados) return;
  datosIniciados = true;
  if (!suscrito) suscrito = !!datos.suscribir(() => {
    // PlayStation: sincronización automática, en segundo plano.
    psn.revisarAutomatico();
    xbox.revisarAutomatico();
    xbox.revisarHoras();
    steam.revisarAutomatico();
    // Biblioteca sincronizada con reglas antiguas: recalcularla una vez con las nuevas.
    psn.revisarReproceso();
    // Juegos guardados antes de la migración 005: marcar cuáles son online (una vez).
    revisarOnline(datos.estado.juegos, () => datos.refrescar());
    // Si cambian mis datos (nombre, color, acento) en el servidor, actualizarlos aquí.
    const yo = usuarioActual();
    const fresco = yo && datos.usuario(yo.id);
    // Desactivado por el admin: se cierra la sesión en este móvil.
    if (fresco?.activo === false) { alSalir(); return; }
    if (fresco && (fresco.acento !== yo.acento || fresco.color !== yo.color || fresco.nombre !== yo.nombre || (fresco.foto_url ?? null) !== (yo.foto_url ?? null))) {
      refrescarUsuario(fresco);
      aplicarAcento(fresco.acento);
    }
  });
  datos.iniciar();
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
iniciarTema();
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
  if (u) abrirEditorFoto(u);
});
window.addEventListener('cvj:psn-asistente', () => { if (usuarioActual()) abrirAjustes(alSalir, { psn: true }); });
// "Conectar PlayStation, Xbox o Steam" (bienvenida de Inicio): Ajustes en Plataformas.
window.addEventListener('cvj:ajustes-plataformas', () => { if (usuarioActual()) abrirAjustes(alSalir, { plataformas: true }); });
// Vuelta del inicio de sesión de Steam (?steam=vuelta&openid.…): validar y enseñar el resultado en Ajustes.
steam.revisarVuelta()?.then(() => { if (usuarioActual()) abrirAjustes(alSalir, { steam: true }); });
// Refresco en segundo plano: al volver a la app y cada minuto mientras se ve.
// Si no ha cambiado nada, datos.js no repinta.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && usuarioActual()) datos.refrescar();
});
setInterval(() => {
  if (document.visibilityState === 'visible' && usuarioActual() && datosIniciados) datos.refrescar();
}, REFRESCO_MS);
navegar();
