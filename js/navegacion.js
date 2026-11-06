// Navegación: "atrás" con respaldo y enlaces a perfiles desde cualquier sitio.
import { usuarioActual } from './sesion.js';

// Cada entrada del historial guarda su "profundidad" dentro de la app (0 = la
// primera pantalla con la que se abrió). Si es mayor que 0, atrás vuelve dentro
// de la app; si no, se usa la ruta de respaldo para no salir de ella.
let profundidad = 0;
if (typeof history.state?.cvjProf === 'number') profundidad = history.state.cvjProf;
else history.replaceState({ ...(history.state || {}), cvjProf: 0 }, '');

/** app.js lo llama en cada cambio de ruta. */
export function anotarNavegacion() {
  const p = history.state?.cvjProf;
  if (typeof p === 'number') {
    profundidad = p; // atrás / adelante a una entrada ya conocida
  } else {
    profundidad += 1; // entrada nueva
    history.replaceState({ ...(history.state || {}), cvjProf: profundidad }, '');
  }
}

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
