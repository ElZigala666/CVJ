// Pestañas de fases futuras: estado vacío limpio con el estilo de la app.
import { cabecera, estadoVacio, avatar, esc } from '../ui.js';
import { usuarioActual } from '../sesion.js';

const TEXTOS = {
  rankings: {
    icono: 'rankings',
    titulo: 'Rankings del grupo',
    texto: 'Los mejores juegos según el grupo, la tier list y las comparaciones aparecerán aquí cuando haya valoraciones.',
  },
  perfil: {
    icono: 'perfil',
    titulo: 'Tu perfil',
    texto: 'Tus juegos, tus notas y tus estadísticas llegan en una próxima fase.',
  },
};

export function render(el, { ruta, alSalir }) {
  const t = TEXTOS[ruta] || TEXTOS.perfil;
  const u = usuarioActual();
  const boton = t.boton
    ? `<a class="boton-secundario" href="${t.boton.href}">${esc(t.boton.texto)}</a>`
    : '';
  const extraPerfil = ruta === 'perfil'
    ? `<div class="perfil-mini">${avatar(u, 56)}<span class="perfil-nombre">${esc(u?.nombre)}</span></div>
       <button type="button" class="boton-secundario" data-accion="salir">Cerrar sesión en este móvil</button>`
    : boton;

  el.innerHTML = `${cabecera(u)}${estadoVacio({ ...t, extra: extraPerfil })}`;

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="salir"]')) alSalir();
  });
}
