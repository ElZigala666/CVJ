// Hoja de Ajustes (icono de ajustes de mi perfil): tema, color de la app,
// instalar y cerrar sesión.
import { icono } from './icons.js';
import { abrirHoja } from './hoja.js';
import { aviso, aplicarAcento, esc } from './ui.js';
import { modoInstalacion, instalar } from './instalar.js';
import { TEMAS, preferenciaTema, guardarTema } from './tema.js';
import { PALETA, ACENTO_DEFECTO, acentoSeguro } from './acento.js';
import { usuarioActual } from './sesion.js';
import * as datos from './datos.js';
import { VERSION_CORTA } from './version.js';
import { montarPsn } from './ajustes-psn.js';

function bloqueApariencia(acentoActual) {
  const tema = preferenciaTema();
  const enPaleta = PALETA.some((p) => p.hex.toUpperCase() === acentoActual);
  return `
    <section class="ajustes-bloque">
      <span class="campo-titulo">Tema</span>
      <div class="segmentado" role="radiogroup" aria-label="Tema">
        ${TEMAS.map((t) => `<button type="button" role="radio" data-tema="${t.id}" class="${t.id === tema ? 'activo' : ''}" aria-checked="${t.id === tema}">${t.nombre}</button>`).join('')}
      </div>
    </section>
    <section class="ajustes-bloque">
      <span class="campo-titulo">Color de la app</span>
      <div class="paleta" role="radiogroup" aria-label="Color de la app">
        ${PALETA.map((p) => `
          <button type="button" role="radio" class="muestra${p.hex.toUpperCase() === acentoActual ? ' activa' : ''}"
            style="--muestra:${p.hex}" data-acento="${p.hex}" aria-checked="${p.hex.toUpperCase() === acentoActual}" aria-label="${esc(p.nombre)}"></button>`).join('')}
        <label class="muestra-libre${enPaleta ? '' : ' activa'}">
          <input type="color" value="${acentoActual}" data-libre aria-label="Color personalizado">
          <span>Otro</span>
        </label>
      </div>
      <p class="ajustes-nota" data-ref="nota-acento"></p>
    </section>`;
}

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
        <div data-ref="apariencia" class="ajustes-apariencia"></div>
        <div data-ref="psn" class="ajustes-apariencia"></div>
        <div data-ref="instalar"></div>
        <button type="button" class="boton-secundario neutro ajustes-salir" data-accion="salir">Cerrar sesión en este móvil</button>
        <p class="ajustes-version">CVJ · versión ${esc(VERSION_CORTA)}</p>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const pintarInstalar = () => {
        cuerpo.querySelector('[data-ref="instalar"]').innerHTML = bloqueInstalar(modoInstalacion(), pasosAbiertos);
      };
      pintarInstalar();
      // PlayStation (se quita la suscripción al cerrar la hoja).
      const quitarPsn = montarPsn(cuerpo.querySelector('[data-ref="psn"]'));
      const vigilar = new MutationObserver(() => { if (!cuerpo.isConnected) { quitarPsn(); vigilar.disconnect(); } });
      vigilar.observe(document.body, { childList: true });

      // --- Apariencia ---------------------------------------------------------
      const yo = usuarioActual();
      const acentoGuardado = () => acentoSeguro(datos.usuario(yo?.id)?.acento ?? yo?.acento ?? ACENTO_DEFECTO);
      const pintarApariencia = () => {
        cuerpo.querySelector('[data-ref="apariencia"]').innerHTML = bloqueApariencia(acentoGuardado());
      };
      pintarApariencia();

      const elegirAcento = (hex, guardar) => {
        const seguro = acentoSeguro(hex);
        aplicarAcento(seguro);
        const nota = cuerpo.querySelector('[data-ref="nota-acento"]');
        if (nota) nota.textContent = seguro !== hex.toUpperCase() ? 'Lo hemos ajustado un poco para que se lea bien en claro y en oscuro.' : '';
        if (!guardar || !yo) return;
        // El selector libre enseña el color que se usa de verdad (ya ajustado).
        const libre = cuerpo.querySelector('[data-libre]');
        if (libre) libre.value = seguro.toLowerCase();
        if (seguro === acentoGuardado()) return;
        datos.actualizarUsuario(yo.id, { acento: seguro }, (msg) => {
          aviso(msg);
          aplicarAcento(acentoGuardado());
          pintarApariencia();
        });
        for (const m of cuerpo.querySelectorAll('[data-acento]')) {
          const on = m.dataset.acento.toUpperCase() === seguro;
          m.classList.toggle('activa', on);
          m.setAttribute('aria-checked', String(on));
        }
        cuerpo.querySelector('.muestra-libre')?.classList.toggle('activa', !PALETA.some((p) => p.hex.toUpperCase() === seguro));
      };
      // Color libre: se ve en vivo al mover el selector y se guarda al soltar.
      cuerpo.addEventListener('input', (e) => { if (e.target.matches('[data-libre]')) elegirAcento(e.target.value, false); });
      cuerpo.addEventListener('change', (e) => { if (e.target.matches('[data-libre]')) elegirAcento(e.target.value, true); });

      cuerpo.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-tema]');
        if (t) {
          guardarTema(t.dataset.tema);
          for (const b of cuerpo.querySelectorAll('[data-tema]')) {
            const on = b === t;
            b.classList.toggle('activo', on);
            b.setAttribute('aria-checked', String(on));
          }
          return;
        }
        const m = e.target.closest('[data-acento]');
        if (m) { elegirAcento(m.dataset.acento, true); return; }
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
