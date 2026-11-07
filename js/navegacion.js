// Navegación: "atrás" con respaldo y enlaces a perfiles desde cualquier sitio.
import { usuarioActual } from './sesion.js';

// Cada entrada del historial guarda su "profundidad" dentro de la app (0 = la
// primera pantalla con la que se abrió). Si es mayor que 0, atrás vuelve dentro
// de la app; si no, se usa la ruta de respaldo para no salir de ella.
let profundidad = 0;
if (typeof history.state?.cvjProf === 'number') profundidad = history.state.cvjProf;
else history.replaceState({ ...(history.state || {}), cvjProf: 0 }, '');

// El scroll de cada pantalla se guarda al salir de ella y se recupera al volver
// (atrás / adelante). La pestaña y los filtros los recuerda cada pantalla.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const scrolls = new Map(); // "profundidad|ruta" → scrollY
let actual = null;          // la pantalla que se está viendo: { clave }

/**
 * app.js lo llama en cada cambio de ruta, antes de montar la pantalla nueva.
 * Devuelve el scroll al que hay que llevar la pantalla (0 si es nueva).
 */
export function anotarNavegacion() {
  if (actual) scrolls.set(actual.clave, window.scrollY); // la que se deja (aún en pantalla)
  const p = history.state?.cvjProf;
  let volviendo = false;
  if (typeof p === 'number') {
    volviendo = p !== profundidad; // atrás / adelante a una entrada ya conocida
    profundidad = p;
  } else {
    profundidad += 1; // entrada nueva
    history.replaceState({ ...(history.state || {}), cvjProf: profundidad }, '');
  }
  const clave = `${profundidad}|${location.hash}`;
  actual = { clave };
  return volviendo ? scrolls.get(clave) ?? 0 : 0;
}

// De una ficha a otra (versiones, sagas, juegos relacionados): se reemplaza la
// entrada del historial, así "atrás" sale siempre a la pantalla que abrió la primera.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey) return;
  const a = e.target.closest?.('a[href^="#juego/"]');
  if (!a || !location.hash.startsWith('#juego/')) return;
  e.preventDefault();
  if (a.getAttribute('href') !== location.hash) reemplazarRuta(a.getAttribute('href'));
});

/** Vuelve atrás si se llegó navegando por la app; si se entró por URL, va al respaldo. */
export function volver(respaldo = '#inicio') {
  if (profundidad > 0) history.back();
  else location.hash = respaldo;
}

/** Cambia de ruta sin crear entrada nueva en el historial (cambiar de usuario, de lado...). */
export function reemplazarRuta(hash) {
  history.replaceState({ cvjProf: profundidad }, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Mantiene la profundidad al reescribir la URL actual (rutas corregidas). */
export function corregirRuta(url) {
  history.replaceState({ cvjProf: profundidad }, '', url);
}

/** Ruta del perfil de un usuario (el mío es #perfil). */
export function rutaPerfil(id) {
  return id && id !== usuarioActual()?.id ? `#perfil/${id}` : '#perfil';
}

// Cualquier elemento con data-perfil="{id}" abre ese perfil, aunque esté dentro de
// un enlace a otra cosa (la fila de la actividad, una tarjeta de Jugando ahora...).
function abrir(e) {
  const el = e.target.closest?.('[data-perfil]');
  if (!el || !el.dataset.perfil) return false;
  e.preventDefault();
  e.stopPropagation();
  location.hash = rutaPerfil(el.dataset.perfil);
  return true;
}
document.addEventListener('click', abrir, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') abrir(e);
}, true);
