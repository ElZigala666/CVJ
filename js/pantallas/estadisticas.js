// #estadisticas/{id} (ruta antigua): las estadísticas viven ahora en la pestaña
// Estadísticas del perfil (y en Rankings → Estadísticas). Se abre el perfil en esa pestaña.
import { usuarioActual } from '../sesion.js';
import { reemplazarRuta } from '../navegacion.js';

export function render(el, { params }) {
  const id = params[0] || usuarioActual()?.id;
  if (id) reemplazarRuta(`#perfil/${id}/estadisticas`);
}
