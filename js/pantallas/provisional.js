// Pestañas de fases futuras: estado vacío limpio con el estilo de la app.
// En Perfil, además: tarjeta "Instalar app" y cerrar sesión.
import { cabecera, estadoVacio, avatar, esc, aviso } from '../ui.js';
import { icono } from '../icons.js';
import { usuarioActual } from '../sesion.js';
import { modoInstalacion, instalar, alCambiar } from '../instalar.js';

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

function tarjetaInstalar(modo, abierta) {
  if (modo === 'instalada') return '';
  const pasos = modo === 'ios'
    ? `
      <ol class="pasos-instalar">
        <li>${icono('compartir', { tam: 22, color: 'var(--acento)' })}<span>Toca <strong>Compartir</strong> en la barra de Safari.</span></li>
        <li>${icono('anadir-inicio', { tam: 22, color: 'var(--acento)', trazo: 'var(--superficie)' })}<span>Elige <strong>Añadir a pantalla de inicio</strong>.</span></li>
        <li>${icono('completado', { tam: 22, color: 'var(--acento)', trazo: 'var(--superficie)' })}<span>Pulsa <strong>Añadir</strong>. CVJ aparecerá con su icono.</span></li>
      </ol>`
    : `
      <ol class="pasos-instalar">
        <li>${icono('ajustes', { tam: 22, color: 'var(--acento)' })}<span>Abre el menú del navegador (los tres puntos).</span></li>
        <li>${icono('anadir-inicio', { tam: 22, color: 'var(--acento)', trazo: 'var(--superficie)' })}<span>Elige <strong>Instalar app</strong> o <strong>Añadir a pantalla de inicio</strong>.</span></li>
      </ol>`;
  return `
    <section class="tarjeta-instalar">
      <div class="tarjeta-instalar-cab">
        <span class="tarjeta-instalar-icono">${icono('instalar', { tam: 22, color: 'var(--acento)' })}</span>
        <div class="tarjeta-instalar-texto">
          <strong>Instala CVJ</strong>
          <span>Ábrela desde la pantalla de inicio, como una app más.</span>
        </div>
      </div>
      <button type="button" class="boton-principal" data-accion="instalar">Instalar app</button>
      ${abierta ? pasos : ''}
    </section>`;
}

export function render(el, { ruta, alSalir }) {
  const t = TEXTOS[ruta] || TEXTOS.perfil;
  const u = usuarioActual();
  let pasosAbiertos = false;

  const pintar = () => {
    const extra = ruta === 'perfil'
      ? `<div class="perfil-mini">${avatar(u, 56)}<span class="perfil-nombre">${esc(u?.nombre)}</span></div>
         ${tarjetaInstalar(modoInstalacion(), pasosAbiertos)}
         <button type="button" class="boton-secundario" data-accion="salir">Cerrar sesión en este móvil</button>`
      : '';
    el.innerHTML = `${cabecera(u)}${estadoVacio({ ...t, extra })}`;
  };

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'salir') alSalir();
    if (b.dataset.accion === 'instalar') {
      if (modoInstalacion() === 'nativo') {
        if (await instalar()) aviso('Instalando CVJ…');
      } else {
        pasosAbiertos = !pasosAbiertos;
      }
      pintar();
    }
  });

  pintar();
  return ruta === 'perfil' ? alCambiar(pintar) : undefined;
}
