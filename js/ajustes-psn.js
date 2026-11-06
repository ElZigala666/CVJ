// Bloque "PlayStation" de la hoja de Ajustes.
// Sin conectar (o con la conexión caducada): asistente de 3 pasos para que cada
// usuario conecte SU PROPIA cuenta pegando su código (NPSSO).
// Conectado: ID online, última sincronización, "Sincronizar ahora" y "Desconectar".
import { icono } from './icons.js';
import { esc, tiempoRelativo, aviso } from './ui.js';
import * as datos from './datos.js';
import * as psn from './psn.js';
import { usuarioActual } from './sesion.js';
import * as metricas from './metricas.js';

const ES_IPHONE = /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function hace(iso) {
  return iso ? tiempoRelativo(iso).replace(/^Ahora$/, 'ahora mismo').toLowerCase() : 'nunca';
}

const AYUDA_ERROR = `
  <p>Sale un error si <strong>en ese navegador</strong> no hay sesión de PlayStation. Repite el paso 1 y luego el 2 sin cerrar el navegador.</p>
  <p>Si playstation.com te ofrece abrir la app de PlayStation, di que no: tiene que ser en el navegador.</p>`;

const HAY_PORTAPAPELES = !!navigator.clipboard?.readText;

/**
 * Monta el bloque en un contenedor de la hoja de Ajustes.
 * Devuelve la función para desmontarlo.
 */
export function montarPsn(cont) {
  const yo = usuarioActual();
  const s = {
    paso1: false, paso2: false, ayuda: false, manual: !HAY_PORTAPAPELES,
    confirmarQuitar: false, ocupado: null, mensaje: null, error: false, borrador: '',
    ultimoIntento: null, // último código probado (para no repetirlo al volver a la app)
  };

  const asistente = (reconectar) => `
    ${reconectar
      ? '<p class="psn-mensaje error">Tu conexión con PlayStation ha caducado. Repite los pasos para reconectar; tu biblioteca se queda como estaba.</p>'
      : '<p class="ajustes-nota">Trae tus juegos, horas y trofeos. Nunca se crean valoraciones solas.</p>'}
    <ol class="psn-pasos">
      <li class="psn-paso${s.paso1 ? ' hecho' : ''}">
        <span class="psn-paso-num" aria-hidden="true">${s.paso1 ? icono('completado', { tam: 28, color: 'var(--acento)', trazo: 'var(--sobre-acento)' }) : '1'}</span>
        <div class="psn-paso-cuerpo">
          <strong>Inicia sesión y vuelve</strong>
          <a class="boton-secundario psn-boton-paso" href="${psn.URL_INICIAR_SESION}" target="_blank" rel="noopener noreferrer" data-psn-paso="1">
            ${icono('externo', { tam: 18, color: 'currentColor' })}<span>Iniciar sesión en PlayStation</span>
          </a>
        </div>
      </li>
      <li class="psn-paso${s.paso2 ? ' hecho' : ''}">
        <span class="psn-paso-num" aria-hidden="true">${s.paso2 ? icono('completado', { tam: 28, color: 'var(--acento)', trazo: 'var(--sobre-acento)' }) : '2'}</span>
        <div class="psn-paso-cuerpo">
          <strong>Copia todo el texto y vuelve</strong>
          <a class="boton-secundario psn-boton-paso" href="${psn.URL_CODIGO}" target="_blank" rel="noopener noreferrer" data-psn-paso="2">
            ${icono('externo', { tam: 18, color: 'currentColor' })}<span>Obtener mi código</span>
          </a>
          ${ES_IPHONE ? '<span class="psn-nota-iphone">En iPhone, los pasos 1 y 2 en Safari.</span>' : ''}
          <button type="button" class="enlace-discreto psn-ayuda-boton" data-psn="ayuda" aria-expanded="${s.ayuda}">${s.ayuda ? 'Ocultar ayuda' : '¿Sale un error?'}</button>
          ${s.ayuda ? `<div class="psn-ayuda">${AYUDA_ERROR}</div>` : ''}
        </div>
      </li>
      <li class="psn-paso">
        <span class="psn-paso-num" aria-hidden="true">3</span>
        <div class="psn-paso-cuerpo">
          <strong>Conecta</strong>
          ${HAY_PORTAPAPELES ? `
            <button type="button" class="boton-principal con-icono psn-pegar-conectar" data-psn="pegar-conectar"${s.ocupado ? ' disabled' : ''}>
              ${s.ocupado === 'conectar' ? '<span>Conectando…</span>' : `${icono('pegar', { tam: 20, color: 'currentColor', trazo: 'var(--acento)' })}<span>${reconectar ? 'Pegar y reconectar' : 'Pegar y conectar'}</span>`}
            </button>
            <button type="button" class="enlace-discreto psn-manual-boton" data-psn="manual" aria-expanded="${s.manual}">${s.manual ? 'Ocultar' : '¿No funciona? Pégalo a mano'}</button>` : ''}
          ${s.manual ? `
            <label for="psn-codigo" class="sr">Tu código</label>
            <textarea id="psn-codigo" class="psn-codigo" rows="3" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
              placeholder='Pega aquí el texto: {"npsso":"…"}'>${esc(s.borrador)}</textarea>
            <button type="button" class="${HAY_PORTAPAPELES ? 'boton-secundario neutro psn-conectar-manual' : 'boton-principal'}" data-psn="conectar"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'conectar' ? 'Conectando…' : reconectar ? 'Reconectar' : 'Conectar'}</button>` : ''}
        </div>
      </li>
    </ol>
    ${s.mensaje ? `<p class="psn-mensaje${s.error ? ' error' : ''}" role="status">${esc(s.mensaje)}</p>` : ''}
    <p class="psn-privacidad">${icono('candado', { tam: 16, color: 'var(--texto-2)', trazo: 'var(--fondo)' })}<span>El código se canjea al momento por un permiso de lectura de tu biblioteca y no se guarda.</span></p>`;

  const desconectarHtml = () => s.confirmarQuitar
    ? `<div class="psn-confirmar" role="group" aria-label="Confirmar desconexión">
         <p>¿Desconectar PlayStation? Se borran tu conexión y tu biblioteca de CVJ. Tus valoraciones no se tocan.</p>
         <div class="psn-confirmar-botones">
           <button type="button" class="boton-secundario neutro" data-psn="no-desconectar">Cancelar</button>
           <button type="button" class="boton-secundario peligro" data-psn="desconectar"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'desconectar' ? 'Desconectando…' : 'Sí, desconectar'}</button>
         </div>
       </div>`
    : '<button type="button" class="enlace-discreto psn-desconectar" data-psn="pedir-desconectar">Desconectar</button>';

  const pintar = () => {
    const u = yo && datos.usuario(yo.id);
    // Sin la migración de PSN (o sin datos aún) no se enseña nada.
    if (!u || !('psn_account_id' in u)) { cont.innerHTML = ''; return; }
    // Conservar lo que haya escrito en el campo del código al repintar.
    const campo = cont.querySelector('#psn-codigo');
    if (campo) s.borrador = campo.value;
    const conectado = !!u.psn_account_id;
    const reconectar = conectado && !!u.psn_reconectar;
    const bib = metricas.biblioteca(u.id);

    cont.innerHTML = `
      <section class="ajustes-bloque ajustes-psn" id="ajustes-psn">
        <span class="campo-titulo">PlayStation</span>
        ${conectado && !reconectar ? `
          <div class="psn-conectado">
            <span class="psn-icono">${icono('jugando', { tam: 22, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}</span>
            <div class="psn-conectado-texto">
              <strong>${esc(u.psn_online_id)}</strong>
              <span>${bib.total ? `${bib.total} ${bib.total === 1 ? 'juego' : 'juegos'} · ${bib.horas} h · ` : ''}Sincronizado ${esc(hace(u.psn_sincronizado_en))}</span>
            </div>
          </div>
          <button type="button" class="boton-principal" data-psn="sincronizar"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'sincronizar' ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
          ${s.mensaje ? `<p class="psn-mensaje${s.error ? ' error' : ''}" role="status">${esc(s.mensaje)}</p>` : ''}
          ${desconectarHtml()}` : asistente(reconectar)}
        ${reconectar ? desconectarHtml() : ''}
      </section>`;
  };

  const ejecutar = async (accion, fn) => {
    s.ocupado = accion;
    s.mensaje = null;
    pintar();
    try {
      const r = await fn();
      s.error = !r.ok;
      return r;
    } finally {
      s.ocupado = null;
    }
  };

  /** Valida el texto pegado y conecta. silencioso: al volver a la app (sin avisar si no hay código). */
  const intentarConectar = async (texto, silencioso = false) => {
    s.borrador = texto;
    const v = psn.extraerNpsso(texto);
    if (v.error) {
      if (silencioso) return;
      s.mensaje = HAY_PORTAPAPELES && !String(texto).trim()
        ? 'No hay nada copiado. Copia todo el texto del paso 2 y vuelve a pulsar.'
        : v.error;
      s.error = true;
      pintar();
      return;
    }
    if (silencioso && v.npsso === s.ultimoIntento) return;
    s.ultimoIntento = v.npsso;
    s.mensaje = null;
    const r = await ejecutar('conectar', async () => {
      const nota = cont.querySelector('.psn-privacidad');
      nota?.insertAdjacentHTML('beforebegin', '<p class="psn-mensaje" role="status">Conectando y trayendo tus juegos. Puede tardar un minuto.</p>');
      return psn.conectar(yo.id, v.npsso);
    });
    if (r.ok) {
      s.borrador = '';
      s.paso1 = s.paso2 = false;
      const sinc = r.sincronizacion;
      s.mensaje = sinc?.ok
        ? `Conectado como ${r.online_id}. ${resumen(sinc)}`
        : `Conectado como ${r.online_id}, pero la primera sincronización ha fallado: ${psn.mensajePsn(sinc)} Pulsa «Sincronizar ahora» en un rato.`;
      s.error = !sinc?.ok;
      aviso('PlayStation conectada');
    } else {
      s.mensaje = psn.mensajePsn(r);
    }
    pintar();
  };

  // Al volver a la app después del paso 2: si lo copiado es un código válido, conecta solo.
  // (Si el navegador pide un toque, queda el botón "Pegar y conectar".)
  const alVolver = async () => {
    if (document.visibilityState !== 'visible' || !s.paso2 || s.ocupado || !HAY_PORTAPAPELES || !cont.isConnected) return;
    const u = yo && datos.usuario(yo.id);
    if (!u || (u.psn_account_id && !u.psn_reconectar)) return;
    try {
      const texto = await navigator.clipboard.readText();
      await intentarConectar(texto, true);
    } catch { /* hace falta el toque en el botón */ }
  };
  document.addEventListener('visibilitychange', alVolver);
  window.addEventListener('focus', alVolver);

  cont.addEventListener('click', async (e) => {
    const paso = e.target.closest('[data-psn-paso]');
    if (paso) {
      // El enlace se abre solo (pestaña nueva); aquí solo se marca el paso como hecho.
      s[`paso${paso.dataset.psnPaso}`] = true;
      setTimeout(pintar, 300);
      return;
    }
    const b = e.target.closest('[data-psn]');
    if (!b || !yo) return;
    const a = b.dataset.psn;
    if (a === 'ayuda') { s.ayuda = !s.ayuda; pintar(); return; }
    if (a === 'pedir-desconectar') { s.confirmarQuitar = true; pintar(); return; }
    if (a === 'no-desconectar') { s.confirmarQuitar = false; pintar(); return; }

    if (a === 'manual') { s.manual = !s.manual; pintar(); if (s.manual) cont.querySelector('#psn-codigo')?.focus(); return; }

    if (a === 'pegar-conectar') {
      // Lee el portapapeles y conecta en el mismo toque.
      let texto = '';
      try {
        texto = await navigator.clipboard.readText();
      } catch {
        s.manual = true;
        s.mensaje = 'El navegador no deja leer lo copiado. Pégalo a mano aquí debajo.';
        s.error = true;
        pintar();
        cont.querySelector('#psn-codigo')?.focus();
        return;
      }
      await intentarConectar(texto);
      return;
    }

    if (a === 'conectar') {
      await intentarConectar(cont.querySelector('#psn-codigo')?.value ?? '');
      return;
    }
    if (a === 'sincronizar') {
      const r = await ejecutar('sincronizar', () => psn.sincronizar(yo.id));
      s.mensaje = r.ok ? resumen(r) : psn.mensajePsn(r);
      pintar();
      return;
    }
    if (a === 'desconectar') {
      const r = await ejecutar('desconectar', () => psn.desconectar(yo.id));
      s.confirmarQuitar = !r.ok && s.confirmarQuitar;
      s.mensaje = r.ok ? null : psn.mensajePsn(r);
      if (r.ok) aviso('PlayStation desconectada');
      pintar();
    }
  });

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return () => {
    desuscribir();
    document.removeEventListener('visibilitychange', alVolver);
    window.removeEventListener('focus', alVolver);
  };
}

function resumen(r) {
  const partes = [`Sincronizado: ${r.juegos} ${r.juegos === 1 ? 'juego' : 'juegos'}`];
  if (r.horas) partes.push(metricas.textoHoras(r.horas));
  if (r.pendientes) partes.push(`identificando ${r.pendientes} ${r.pendientes === 1 ? 'juego' : 'juegos'} en segundo plano`);
  else if (r.sin_emparejar) partes.push(`${r.sin_emparejar} sin identificar (puedes elegirlos en tu perfil)`);
  return partes.join(' · ') + '.';
}
