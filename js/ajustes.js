// Hoja de Ajustes (icono de ajustes de mi perfil).
// Fase 4: aquí irán el tema (claro/oscuro/sistema) y el color de acento, en la
// sección "apariencia" que de momento no se pinta.
import { icono } from './icons.js';
import { abrirHoja } from './hoja.js';
import { aviso } from './ui.js';
import { modoInstalacion, instalar } from './instalar.js';

function bloqueInstalar(modo, abierto) {
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
      ${abierto ? pasos : ''}
    </section>`;
}

/** Abre la hoja de Ajustes. alSalir: cierra la sesión (lo pasa app.js). */
export function abrirAjustes(alSalir) {
  let pasosAbiertos = false;
  abrirHoja({
    titulo: 'Ajustes',
    html: `
      <div class="ajustes">
        <div data-ref="apariencia"></div>
        <div data-ref="instalar"></div>
        <button type="button" class="boton-secundario neutro ajustes-salir" data-accion="salir">Cerrar sesión en este móvil</button>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const pintarInstalar = () => {
        cuerpo.querySelector('[data-ref="instalar"]').innerHTML = bloqueInstalar(modoInstalacion(), pasosAbiertos);
      };
      pintarInstalar();
      cuerpo.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-accion]');
        if (!b) return;
        if (b.dataset.accion === 'salir') {
          cerrar(true);
          alSalir();
        } else if (b.dataset.accion === 'instalar') {
          if (modoInstalacion() === 'nativo') {
            if (await instalar()) aviso('Instalando CVJ…');
          } else {
            pasosAbiertos = !pasosAbiertos;
          }
          pintarInstalar();
        }
      });
    },
  });
}
