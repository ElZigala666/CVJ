// Pestañas de fases futuras: estado vacío limpio con el estilo de la app.
import { cabecera, estadoVacio, avatar, esc } from '../ui.js';
import { usuarioActual } from '../sesion.js';

const TEXTOS = {
  inicio: {
    icono: 'inicio',
    titulo: 'Aquí verás qué juega el grupo',
    texto: 'Lo que está jugando cada uno, los destacados y la actividad reciente llegan en la próxima fase. De momento, busca un juego.',
    boton: { href: '#buscar', texto: 'Buscar un juego' },
  },
  valorar: {
    icono: 'valorar',
    titulo: 'Valorar llega muy pronto',
    texto: 'Podrás puntuar con nota o con letra, recomendar y escribir una reseña. Mientras tanto, busca el juego que quieres valorar.',
    boton: { href: '#buscar', texto: 'Buscar un juego' },
  },
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
  const t = TEXTOS[ruta] || TEXTOS.inicio;
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
