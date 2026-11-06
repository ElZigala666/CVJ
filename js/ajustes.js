// Hoja de Ajustes (icono de ajustes de mi perfil): tema, color de la app,
// instalar y cerrar sesión.
import { icono } from './icons.js';
import { abrirHoja } from './hoja.js';
import { aviso, aplicarAcento, esc } from './ui.js';
import { modoInstalacion, instalar } from './instalar.js';
import { TEMAS, preferenciaTema, guardarTema } from './tema.js';
import { PALETA, ACENTO_DEFECTO, seLeeMal, esDePaleta } from './acento.js';
import { usuarioActual } from './sesion.js';
import * as datos from './datos.js';
import { VERSION_CORTA } from './version.js';
import { montarPsn } from './ajustes-psn.js';
import { botonFoto } from './foto-perfil.js';
import { avatar } from './ui.js';

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
export function abrirAjustes(alSalir, { psn = false } = {}) {
  let pasosAbiertos = false;
  abrirHoja({
    titulo: 'Ajustes',
    html: `
      <div class="ajustes">
        <div data-ref="foto"></div>
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
      // Foto de perfil (solo con la migración 005: la columna foto_url existe).
      const pintarFoto = () => {
        const u = datos.usuario(usuarioActual()?.id);
        cuerpo.querySelector('[data-ref="foto"]').innerHTML = u && 'foto_url' in u ? `
          <section class="ajustes-bloque">
            <span class="campo-titulo">Foto de perfil</span>
            <div class="foto-fila">${avatar(u, 56)}${botonFoto(u)}</div>
          </section>` : '';
      };
      pintarFoto();
      const quitarFoto = datos.suscribir(pintarFoto);
      // PlayStation (se quita la suscripción al cerrar la hoja).
      const quitarPsn = montarPsn(cuerpo.querySelector('[data-ref="psn"]'));
      // Abierta desde el aviso de "Reconectar": directamente al bloque de PlayStation.
      if (psn) {
        setTimeout(() => {
          const bloque = cuerpo.querySelector('#ajustes-psn');
          const scroll = bloque?.closest('.hoja-cuerpo');
          if (bloque && scroll) scroll.scrollTop += bloque.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 8;
        }, 450);
      }
      const vigilar = new MutationObserver(() => { if (!cuerpo.isConnected) { quitarPsn(); quitarFoto(); vigilar.disconnect(); } });
      vigilar.observe(document.body, { childList: true });

      // --- Apariencia ---------------------------------------------------------
      const yo = usuarioActual();
      const acentoGuardado = () => String(datos.usuario(yo?.id)?.acento ?? yo?.acento ?? ACENTO_DEFECTO).toUpperCase();
      const pintarApariencia = () => {
        cuerpo.querySelector('[data-ref="apariencia"]').innerHTML = bloqueApariencia(acentoGuardado());
        pintarNota(acentoGuardado());
      };
      const pintarNota = (hex) => {
        const nota = cuerpo.querySelector('[data-ref="nota-acento"]');
        if (nota) nota.textContent = !esDePaleta(hex) && seLeeMal(hex) ? 'Este color puede leerse mal.' : '';
      };
      /** Marca en la paleta el color que se está usando (siempre, en cualquier orden). */
      const marcar = (hex) => {
        for (const m of cuerpo.querySelectorAll('[data-acento]')) {
          const on = m.dataset.acento.toUpperCase() === hex;
          m.classList.toggle('activa', on);
          m.setAttribute('aria-checked', String(on));
        }
        cuerpo.querySelector('.muestra-libre')?.classList.toggle('activa', !esDePaleta(hex));
      };
      pintarApariencia();

      const elegirAcento = (valor, guardar) => {
        const hex = String(valor).toUpperCase();
        aplicarAcento(hex);
        marcar(hex);
        pintarNota(hex);
        if (!guardar || !yo || hex === acentoGuardado()) return;
        datos.actualizarUsuario(yo.id, { acento: hex }, (msg) => {
          aviso(msg);
          aplicarAcento(acentoGuardado());
          pintarApariencia();
        });
      };
      // Color libre: se ve en vivo al mover el selector y se guarda al soltar, tal cual.
      cuerpo.addEventListener('input', (e) => {
        if (!e.target.matches('[data-libre]')) return;
        elegirAcento(e.target.value, false);
      });
      cuerpo.addEventListener('change', (e) => {
        // Si después se tocó la paleta, el selector ya tiene ese color: no pisa nada.
        if (e.target.matches('[data-libre]')) elegirAcento(e.target.value, true);
      });

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
        if (m) {
          const libre = cuerpo.querySelector('[data-libre]');
          if (libre) libre.value = m.dataset.acento.toLowerCase();
          elegirAcento(m.dataset.acento, true);
          return;
        }
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
