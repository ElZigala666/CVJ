// Hoja de Ajustes (icono de ajustes de mi perfil): apariencia (fondo y color, en su
// propia pantalla), plataformas, biblioteca, grupo, instalar y cerrar sesión.
import { icono } from './icons.js';
import { abrirHoja } from './hoja.js';
import { aviso, esc, pintarHtml } from './ui.js';
import { modoInstalacion, instalar } from './instalar.js';
import { usuarioActual } from './sesion.js';
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { VERSION_CORTA } from './version.js';
import { montarPlataformas } from './ajustes-plataformas.js';
import { montarGrupo } from './ajustes-grupo.js';
import { botonFoto } from './foto-perfil.js';
import { normalizar, FONDOS, ACENTO_DEFECTO } from './apariencia.js';
import { avatar } from './ui.js';

/** Fila "Apariencia": el fondo (o la pareja del automático) y el color, y abre su pantalla. */
function bloqueApariencia(u) {
  const ap = normalizar(u?.apariencia);
  const acc = String(u?.acento || ACENTO_DEFECTO).toUpperCase();
  const texto = ap.modo === 'auto' ? `Automático · ${FONDOS[ap.dia].nombre} y ${FONDOS[ap.noche].nombre}` : FONDOS[ap.fondo].nombre;
  const mini = (id) => `<i style="background:${esc(id === 'imagen' && ap.imagen ? `url('${ap.imagen.url}') center / cover` : FONDOS[id].css(acc))}"></i>`;
  return `
    <section class="ajustes-bloque">
      <span class="campo-titulo">Apariencia</span>
      <button type="button" class="enlace-fila ajustes-apariencia-fila" data-accion="apariencia">
        <span class="ap-fila-minis">${ap.modo === 'auto' ? mini(ap.dia) + mini(ap.noche) : mini(ap.fondo)}<b style="background:${acc}"></b></span>
        <span class="enlace-fila-texto">Fondo y color<small>${esc(texto)}</small></span>
        ${icono('adelante', { tam: 18, color: 'var(--texto-2)' })}
      </button>
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
export function abrirAjustes(alSalir, { psn = false, steam = false, plataformas = false } = {}) {
  let pasosAbiertos = false;
  abrirHoja({
    titulo: 'Ajustes',
    html: `
      <div class="ajustes">
        <div data-ref="foto"></div>
        <div data-ref="apariencia"></div>
        <div data-ref="avisos"></div>
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
      const pintarApariencia = () => { cuerpo.querySelector('[data-ref="apariencia"]').innerHTML = bloqueApariencia(datos.usuario(usuarioActual()?.id)); };
      pintarApariencia();
      // Notificaciones: qué sale en el resumen al entrar ("Mientras no estabas").
      const pintarAvisos = () => import('./avisos.js').then((m) => { const c = cuerpo.querySelector('[data-ref="avisos"]'); if (c) pintarHtml(c, m.bloqueAjustes(datos.usuario(usuarioActual()?.id))); });
      pintarAvisos();
      cuerpo.addEventListener('change', (e) => { if (e.target.closest('[data-aviso-grupo]')) import('./avisos.js').then((m) => m.cambioAjustes(e)); });
      const quitarFoto = datos.suscribir(() => { pintarFoto(); pintarUmbral(); pintarApariencia(); pintarAvisos(); });
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

      cuerpo.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-accion]');
        if (!b) return;
        if (b.dataset.accion === 'apariencia') {
          cerrar(true);
          import('./ajustes-apariencia.js').then((m) => m.abrirApariencia());
        } else if (b.dataset.accion === 'salir') {
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
