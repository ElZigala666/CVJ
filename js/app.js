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
import { anotarNavegacion, corregirRuta } from './navegacion.js';

const vista = document.getElementById('vista');
const barra = document.getElementById('barra');

const RUTAS = {
  inicio,
  buscar,
  valorar: buscar, // el botón central abre Buscar en modo valorar
  elegir: buscar,  // #elegir/{psnTitleId}: "¿Qué juego es?" (emparejar con PSN)
  rankings,          // #rankings y #rankings/comparar/{a}/{b}
  perfil,            // #perfil, #perfil/{id} y #perfil/{id}/tiers
  estadisticas,      // #estadisticas/{id}
  juego,
};
const PESTANAS = [
  ['inicio', 'Inicio'],
  ['buscar', 'Buscar'],
  ['valorar', null],
  ['rankings', 'Rankings'],
  ['perfil', 'Perfil'],
];
// Rutas que se ven a pantalla completa, sin la barra inferior (la ficha tiene la suya).
const SIN_BARRA = new Set(['juego']);
const REFRESCO_MS = 60_000;

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
    if (location.hash) corregirRuta(location.pathname + location.search);
    montar(entrada, { alEntrar }, false);
    document.title = 'CVJ · Entrar';
    return;
  }

  iniciarDatos();
  anotarNavegacion();
  const { ruta, params } = leerRuta();
  const pedida = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (pedida !== ruta) corregirRuta(`#${ruta}`);
  // Título por defecto; las pantallas con nombre propio lo cambian al pintarse.
  document.title = `CVJ · ${ruta[0].toUpperCase() + ruta.slice(1)}`;
  montar(RUTAS[ruta], { ruta, params, alSalir }, !SIN_BARRA.has(ruta));
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
    // Juegos guardados antes de la migración 005: marcar cuáles son online (una vez).
    revisarOnline(datos.estado.juegos, () => datos.refrescar());
    // Si cambian mis datos (nombre, color, acento) en el servidor, actualizarlos aquí.
    const yo = usuarioActual();
    const fresco = yo && datos.usuario(yo.id);
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
// "Poner / cambiar foto" (Ajustes, o el perfil de otro si soy admin).
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-foto]');
  const u = b && datos.usuario(b.dataset.foto);
  if (u) abrirEditorFoto(u);
});
window.addEventListener('cvj:psn-asistente', () => { if (usuarioActual()) abrirAjustes(alSalir, { psn: true }); });
// Refresco en segundo plano: al volver a la app y cada minuto mientras se ve.
// Si no ha cambiado nada, datos.js no repinta.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && usuarioActual()) datos.refrescar();
});
setInterval(() => {
  if (document.visibilityState === 'visible' && usuarioActual() && datosIniciados) datos.refrescar();
}, REFRESCO_MS);
navegar();
