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
import * as metricas from './metricas.js';
import { VERSION_CORTA } from './version.js';
import { montarPlataformas } from './ajustes-plataformas.js';
import { montarGrupo } from './ajustes-grupo.js';
import { abrirSelectorColor } from './selector-color.js';
import { botonFoto } from './foto-perfil.js';
import { avatar } from './ui.js';

function bloqueApariencia(acentoActual) {
  const tema = preferenciaTema();
  const enPaleta = PALETA.some((p) => p.hex.toUpperCase() === acentoActual);
  return `
    <section class="ajustes-bloque">
      <span class="campo-titulo">Tema</span>
      <div class="segmentado" role="radiogroup" aria-label="Tema">
        ${TEMAS.map((t) => `<button type="button" role="radio" data-pref-tema="${t.id}" class="${t.id === tema ? 'activo' : ''}" aria-checked="${t.id === tema}">${t.nombre}</button>`).join('')}
      </div>
    </section>
    <section class="ajustes-bloque">
      <span class="campo-titulo">Color de la app</span>
      <div class="paleta" role="radiogroup" aria-label="Color de la app">
        ${PALETA.map((p) => `
          <button type="button" role="radio" class="muestra${p.hex.toUpperCase() === acentoActual ? ' activa' : ''}"
            style="--muestra:${p.hex}" data-acento="${p.hex}" aria-checked="${p.hex.toUpperCase() === acentoActual}" aria-label="${esc(p.nombre)}"></button>`).join('')}
        <button type="button" class="muestra-libre${enPaleta ? '' : ' activa'}" data-libre aria-label="Color personalizado">
          <span class="muestra-mini" style="--muestra:${enPaleta ? 'conic-gradient(#e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)' : acentoActual}"></span>
          <span>Otro</span>
        </button>
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
export function abrirAjustes(alSalir, { psn = false, steam = false, plataformas = false, color = false } = {}) {
  let pasosAbiertos = false;
  abrirHoja({
    titulo: 'Ajustes',
    html: `
      <div class="ajustes">
        <div data-ref="foto"></div>
        <div data-ref="apariencia" class="ajustes-apariencia"></div>
        <section class="ajustes-bloque ajustes-plataformas" id="ajustes-plataformas">
          <span class="campo-titulo">Plataformas</span>
          <div data-ref="plataformas"></div>
        </section>
        <div data-ref="biblioteca"></div>
        <div data-ref="grupo"></div>
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
      // Biblioteca: umbral de "Probados" (migración 009).
      const pintarUmbral = () => {
        const u = datos.usuario(usuarioActual()?.id);
        const cont = cuerpo.querySelector('[data-ref="biblioteca"]');
        if (!u || !('umbral_probados' in u)) { cont.innerHTML = ''; return; }
        const v = Number(u.umbral_probados ?? 1);
        cont.innerHTML = `
          <section class="ajustes-bloque">
            <span class="campo-titulo">Biblioteca</span>
            <label class="ajustes-fila-select">
              <span>Pasar a «Probados» los juegos con menos de</span>
              <select data-umbral>
                ${[[1, '1 h'], [2, '2 h'], [5, '5 h'], [0, 'Nunca']].map(([n, t]) => `<option value="${n}"${n === v ? ' selected' : ''}>${t}</option>`).join('')}
              </select>
            </label>
            <p class="ajustes-nota">Sin horas conocidas, cuenta tener menos de un 5 % de logros. Valorar un juego o jugarlo en los últimos 30 días lo deja siempre en «Mis juegos».</p>
            ${'estimar_horas' in u ? `
              <label class="interruptor">
                <input type="checkbox" data-estimar${u.estimar_horas ? ' checked' : ''}>
                <span class="interruptor-texto"><strong>Estimar horas de juegos completados sin registro</strong><small>Usa el tiempo para terminar de IGDB (Completo con platino o 100 % de logros; si no, Historia). Se ve con «≈». Si llegan horas reales, se quita sola; al apagarlo se quitan todas las automáticas.</small></span>
              </label>` : ''}
          </section>`;
      };
      pintarUmbral();
      cuerpo.addEventListener('change', (e) => {
        const est = e.target.closest('[data-estimar]');
        if (est) {
          const yoId = usuarioActual()?.id;
          if (!yoId) return;
          datos.actualizarUsuario(yoId, { estimar_horas: est.checked }, aviso, 'No se ha podido guardar. Se ha deshecho el cambio.');
          const { poner, quitar } = metricas.planEstimaciones(yoId);
          aviso(est.checked ? `${poner.length} ${poner.length === 1 ? 'juego' : 'juegos'} con horas estimadas` : `${quitar.length} ${quitar.length === 1 ? 'estimación quitada' : 'estimaciones quitadas'}`);
          return;
        }
        const sel = e.target.closest('[data-umbral]');
        if (!sel) return;
        const yoId = usuarioActual()?.id;
        if (yoId) datos.actualizarUsuario(yoId, { umbral_probados: Number(sel.value) }, aviso, 'No se ha podido guardar. Se ha deshecho el cambio.');
      });
      const quitarFoto = datos.suscribir(() => { pintarFoto(); pintarUmbral(); });
      // PlayStation (se quita la suscripción al cerrar la hoja).
      // PSN se abre desplegada desde el aviso de "Reconectar"; Steam, al volver de su inicio de sesión.
      const quitarPlataformas = montarPlataformas(cuerpo.querySelector('[data-ref="plataformas"]'), { abrir: psn ? 'psn' : steam ? 'steam' : null });
      const quitarGrupo = montarGrupo(cuerpo.querySelector('[data-ref="grupo"]'));
      // Abierta desde el aviso de "Reconectar": directamente al bloque de PlayStation.
      if (psn || steam || plataformas) {
        setTimeout(() => {
          const bloque = cuerpo.querySelector(steam ? '#ajustes-steam' : plataformas ? '#ajustes-plataformas' : '#ajustes-psn');
          const scroll = bloque?.closest('.hoja-cuerpo');
          if (bloque && scroll) scroll.scrollTop += bloque.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 8;
        }, 450);
      }
      const vigilar = new MutationObserver(() => { if (!cuerpo.isConnected) { quitarPlataformas(); quitarGrupo(); quitarFoto(); vigilar.disconnect(); } });
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

      cuerpo.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-pref-tema]');
        if (t) {
          guardarTema(t.dataset.prefTema);
          for (const b of cuerpo.querySelectorAll('[data-pref-tema]')) {
            const on = b === t;
            b.classList.toggle('activo', on);
            b.setAttribute('aria-checked', String(on));
          }
          return;
        }
        const m = e.target.closest('[data-acento]');
        if (m) { elegirAcento(m.dataset.acento, true); return; }
        // Color personalizado: selector propio en otra hoja; al cerrarla se vuelve a Ajustes.
        if (e.target.closest('[data-libre]')) {
          abrirSelectorColor({
            inicial: acentoGuardado(),
            alAplicar: (hex) => elegirAcento(hex, true),
            alCerrar: () => abrirAjustes(alSalir, { color: true }),
          });
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
