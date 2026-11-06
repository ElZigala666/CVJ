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
  <p>Si en vez de <code>{"npsso":"…"}</code> sale un error, es que <strong>en ese navegador</strong> no hay una sesión de PlayStation iniciada. Repite el paso 1 y luego el 2 en el mismo navegador, sin cerrarlo.</p>
  <p>Si playstation.com te ofrece abrir la app de PlayStation, di que no y sigue en el navegador: iniciar sesión en la app no sirve.</p>
  <p class="psn-ayuda-iphone"><strong>En iPhone:</strong> hazlo todo en <strong>Safari</strong>, no en la app de PlayStation. Si al tocar los botones se abre una ventana dentro de CVJ y el paso 2 da error, abre Safari a mano y escribe tú las dos direcciones: <code>playstation.com</code> (inicia sesión) y después <code>ca.account.sony.com/api/v1/ssocookie</code>.</p>`;

/**
 * Monta el bloque en un contenedor de la hoja de Ajustes.
 * Devuelve la función para desmontarlo.
 */
export function montarPsn(cont) {
  const yo = usuarioActual();
  const s = {
    paso1: false, paso2: false, ayuda: false,
    confirmarQuitar: false, ocupado: null, mensaje: null, error: false, borrador: '',
  };

  const asistente = (reconectar) => `
    ${reconectar
      ? '<p class="psn-mensaje error">Tu conexión con PlayStation ha caducado. Repite los tres pasos para reconectar; tu biblioteca se queda como estaba.</p>'
      : '<p class="ajustes-nota">Conecta tu cuenta para traer tus juegos, horas y trofeos. Nunca se crean valoraciones solas.</p>'}
    <ol class="psn-pasos">
      <li class="psn-paso${s.paso1 ? ' hecho' : ''}">
        <span class="psn-paso-num" aria-hidden="true">${s.paso1 ? icono('completado', { tam: 28, color: 'var(--acento)', trazo: 'var(--sobre-acento)' }) : '1'}</span>
        <div class="psn-paso-cuerpo">
          <strong>Inicia sesión</strong>
          <span>Inicia sesión con tu cuenta y vuelve aquí.</span>
          <a class="boton-secundario psn-boton-paso" href="${psn.URL_INICIAR_SESION}" target="_blank" rel="noopener noreferrer" data-psn-paso="1">
            ${icono('externo', { tam: 18, color: 'currentColor' })}<span>Iniciar sesión en PlayStation</span>
          </a>
        </div>
      </li>
      <li class="psn-paso${s.paso2 ? ' hecho' : ''}">
        <span class="psn-paso-num" aria-hidden="true">${s.paso2 ? icono('completado', { tam: 28, color: 'var(--acento)', trazo: 'var(--sobre-acento)' }) : '2'}</span>
        <div class="psn-paso-cuerpo">
          <strong>Obtén tu código</strong>
          <span>Copia todo el texto que aparece y vuelve aquí.</span>
          <a class="boton-secundario psn-boton-paso" href="${psn.URL_CODIGO}" target="_blank" rel="noopener noreferrer" data-psn-paso="2">
            ${icono('externo', { tam: 18, color: 'currentColor' })}<span>Obtener mi código</span>
          </a>
          ${ES_IPHONE ? '<span class="psn-nota-iphone">En iPhone, haz los pasos 1 y 2 en Safari.</span>' : ''}
          <button type="button" class="enlace-discreto psn-ayuda-boton" data-psn="ayuda" aria-expanded="${s.ayuda}">${s.ayuda ? 'Ocultar ayuda' : '¿Sale un error en vez del código?'}</button>
          ${s.ayuda ? `<div class="psn-ayuda">${AYUDA_ERROR}</div>` : ''}
        </div>
      </li>
      <li class="psn-paso">
        <span class="psn-paso-num" aria-hidden="true">3</span>
        <div class="psn-paso-cuerpo">
          <label for="psn-codigo"><strong>Pega aquí tu código</strong></label>
          <textarea id="psn-codigo" class="psn-codigo" rows="3" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
            placeholder='{"npsso":"…"}'>${esc(s.borrador)}</textarea>
          <div class="psn-form">
            ${navigator.clipboard?.readText ? `<button type="button" class="boton-secundario neutro psn-pegar" data-psn="pegar">${icono('pegar', { tam: 18, color: 'currentColor', trazo: 'var(--superficie-2)' })}<span>Pegar</span></button>` : ''}
            <button type="button" class="boton-principal" data-psn="conectar"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'conectar' ? 'Conectando…' : reconectar ? 'Reconectar' : 'Conectar'}</button>
          </div>
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

    if (a === 'pegar') {
      try {
        const texto = await navigator.clipboard.readText();
        const campo = cont.querySelector('#psn-codigo');
        if (campo && texto) { campo.value = texto.trim(); s.borrador = campo.value; }
      } catch {
        s.mensaje = 'No se ha podido leer el portapapeles. Mantén pulsado el campo y elige Pegar.';
        s.error = true;
        pintar();
      }
      return;
    }

    if (a === 'conectar') {
      const texto = cont.querySelector('#psn-codigo')?.value ?? '';
      s.borrador = texto;
      const v = psn.extraerNpsso(texto);
      if (v.error) { s.mensaje = v.error; s.error = true; pintar(); return; }
      s.mensaje = null;
      const r = await ejecutar('conectar', async () => {
        // Mientras tanto, que se sepa que puede tardar.
        const nota = cont.querySelector('.psn-privacidad');
        nota?.insertAdjacentHTML('beforebegin', '<p class="psn-mensaje" role="status">Conectando y trayendo tus juegos. La primera vez puede tardar hasta un minuto.</p>');
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
  return desuscribir;
}

function resumen(r) {
  const partes = [`Sincronizado: ${r.juegos} ${r.juegos === 1 ? 'juego' : 'juegos'}`];
  if (r.horas) partes.push(metricas.textoHoras(r.horas));
  if (r.sin_emparejar) partes.push(`${r.sin_emparejar} sin emparejar (puedes elegirlos en tu perfil)`);
  return partes.join(' · ') + '.';
}
