// Arranque de CVJ: sesión, datos, rutas (#inicio, #buscar, #juego/123...) y barra inferior.
import { icono } from './icons.js';
import { usuarioActual, salir, refrescarUsuario } from './sesion.js';
import * as datos from './datos.js';
import { aplicarAcento } from './ui.js';
import * as entrada from './pantallas/entrada.js';
import * as buscar from './pantallas/buscar.js';
import * as juego from './pantallas/juego.js';
import * as provisional from './pantallas/provisional.js';

const vista = document.getElementById('vista');
const barra = document.getElementById('barra');

const RUTAS = {
  inicio: provisional,
  buscar,
  valorar: provisional,
  rankings: provisional,
  perfil: provisional,
  juego,
};
const PESTANAS = [
  ['inicio', 'Inicio'],
  ['buscar', 'Buscar'],
  ['valorar', null],
  ['rankings', 'Rankings'],
  ['perfil', 'Perfil'],
];
// La ficha de juego se abre desde Buscar: la pestaña Buscar sigue marcada.
const PESTANA_DE = { juego: 'buscar' };

let limpiar = null;
let datosIniciados = false;

// ---------------------------------------------------------------------------
// Barra inferior
// ---------------------------------------------------------------------------
function pintarBarra() {
  barra.innerHTML = PESTANAS.map(([ruta, texto]) => {
    if (!texto) {
      return `<a class="barra-fab" href="#${ruta}" data-ruta="${ruta}" aria-label="Valorar un juego">${icono('mas', { tam: 26, color: 'var(--sobre-acento)' })}</a>`;
    }
    return `<a class="barra-tab" href="#${ruta}" data-ruta="${ruta}">${icono(ruta, { tam: 24 })}<span>${texto}</span></a>`;
  }).join('');
}

function marcarBarra(ruta) {
  const activa = PESTANA_DE[ruta] || ruta;
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

function montar(modulo, contexto, conBarra) {
  try { limpiar?.(); } catch (e) { console.error(e); }
  limpiar = null;

  const pantalla = document.createElement('div');
  pantalla.className = 'pantalla';
  vista.replaceChildren(pantalla);
  barra.hidden = !conBarra;
  document.body.classList.toggle('sin-barra', !conBarra);

  const r = modulo.render(pantalla, contexto);
  if (typeof r === 'function') limpiar = r;
  window.scrollTo(0, 0);
}

function navegar() {
  const usuario = usuarioActual();

  if (!usuario) {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    montar(entrada, { alEntrar }, false);
    document.title = 'CVJ · Entrar';
    return;
  }

  iniciarDatos();
  const { ruta, params } = leerRuta();
  const pedida = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (pedida !== ruta) history.replaceState(null, '', `#${ruta}`);
  montar(RUTAS[ruta], { ruta, params, alSalir }, true);
  marcarBarra(ruta);
  document.title = `CVJ · ${ruta === 'juego' ? 'Juego' : ruta[0].toUpperCase() + ruta.slice(1)}`;
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------
function alEntrar(usuario) {
  aplicarAcento(usuario.acento);
  history.replaceState(null, '', '#inicio');
  navegar();
}

function alSalir() {
  salir();
  datos.borrarCache();
  datosIniciados = false;
  aplicarAcento(null);
  history.replaceState(null, '', location.pathname + location.search);
  navegar();
}

function iniciarDatos() {
  if (datosIniciados) return;
  datosIniciados = true;
  datos.suscribir(() => {
    // Si cambian mis datos (nombre, color, acento) en el servidor, actualizarlos aquí.
    const yo = usuarioActual();
    const fresco = yo && datos.usuario(yo.id);
    if (fresco && (fresco.acento !== yo.acento || fresco.color !== yo.color || fresco.nombre !== yo.nombre)) {
      refrescarUsuario(fresco);
      aplicarAcento(fresco.acento);
    }
  });
  datos.iniciar();
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
pintarBarra();
aplicarAcento(usuarioActual()?.acento);
window.addEventListener('hashchange', navegar);
// Al volver a la app tras un rato, refrescar en segundo plano.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && usuarioActual()) datos.refrescar();
});
navegar();
