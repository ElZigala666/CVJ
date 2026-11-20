// Página de una columna (#columna/{id}): portada con el logo y el nombre, y todas sus
// entradas como en un periódico (la última, destacada), de la más reciente a la más
// antigua. El columnista ve además sus borradores y "Escribir una entrada". El mismo
// contenido sale en la pestaña Columna del perfil (js/vistas-perfil.js).
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import { volver } from '../navegacion.js';
import { nombreColumna } from '../columnas-ui.js';
import { htmlColumna } from '../vistas-perfil.js';
import { esperaDatos } from '../ui.js';

export function render(el, { params }) {
  const id = params[0];
  const yo = usuarioActual();

  const pintar = () => {
    const col = datos.columna(id);
    if (!col) {
      el.innerHTML = datos.estadoCarga() === 'frescos'
        ? `<div class="vacio"><h2 class="vacio-titulo">Esta columna no existe</h2><a class="boton-secundario" href="#inicio">Volver</a></div>`
        : `<div class="vacio">${esperaDatos(datos.estadoCarga(), '', 'vacio-texto')}</div>`;
      return;
    }
    document.title = `CVJ · ${nombreColumna(col)}`;
    el.innerHTML = htmlColumna(col, yo);
  };

  el.addEventListener('click', (e) => { if (e.target.closest('[data-accion="atras"]')) volver('#inicio'); });
  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}
