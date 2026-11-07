// Tarjeta "Xbox" de Ajustes → Plataformas: "Tu gamertag" + Vincular. Vinculado:
// gamertag, última sincronización, "Sincronizar ahora" (10 min de espera) y
// "Desvincular". Si el historial es privado, mini guía para hacerlo visible.
import { esc, tiempoRelativo, aviso } from './ui.js';
import * as datos from './datos.js';
import * as xbox from './xbox.js';
import { usuarioActual } from './sesion.js';
import { iconoFuente } from './plataformas-ui.js';

const hace = (iso) => (iso ? tiempoRelativo(iso).replace(/^Ahora$/, 'ahora mismo').toLowerCase() : 'nunca');

// Los nombres de los menús cambian un poco según la versión de la consola y de la web.
const GUIA_PRIVACIDAD = `
  <div class="psn-ayuda">
    <p>CVJ lee tu historial de juegos con la cuenta de Xbox de Marcos, así que tu historial tiene que poder verlo <strong>Todos</strong> (o <strong>Amigos</strong>, si sois amigos en Xbox).</p>
    <p><strong>En la consola:</strong> Configuración → Cuenta → Privacidad y seguridad en línea → Privacidad de Xbox → Ver detalles y personalizar → Contenido del juego → «Otros pueden ver tu historial de juegos y aplicaciones» → <strong>Todos</strong>.</p>
    <p><strong>En la web:</strong> entra en <strong>account.xbox.com</strong> con tu cuenta, ve a la configuración de privacidad (Privacidad y seguridad en línea) y busca la misma opción del historial de juegos y aplicaciones.</p>
    <p>Si los nombres no son exactamente estos, busca algo parecido a «historial de juegos». Luego vuelve aquí y pulsa «Sincronizar ahora»; a veces Xbox tarda unos minutos en aplicar el cambio.</p>
  </div>`;

export function montarXbox(cont) {
  const yo = usuarioActual();
  const s = { ocupado: null, mensaje: null, error: false, confirmarQuitar: false, guia: false, borrador: '' };
  let reloj = null;

  const pintar = () => {
    const u = yo && datos.usuario(yo.id);
    if (!u || !('xbox_xuid' in u)) { cont.innerHTML = ''; return; } // sin la migración 007
    const campo = cont.querySelector('#xbox-gamertag');
    if (campo) s.borrador = campo.value;
    const vinculada = !!u.xbox_xuid;
    const juegos = datos.bibliotecaDe(u.id).filter((f) => f.fuente === 'xbox' && !f.oculto).length;
    const espera = xbox.esperaRestante(u);
    const min = Math.ceil(espera / 60000);
    const problema = xbox.claveConProblemas();
    cont.innerHTML = `
      <div class="tarjeta-plataforma" id="ajustes-xbox">
        <div class="plataforma-cab">
          ${iconoFuente('xbox', 22)}
          <div class="plataforma-cab-texto">
            <strong>Xbox</strong>
            <span>${vinculada
              ? `${esc(u.xbox_gamertag ?? '')} · ${juegos} ${juegos === 1 ? 'juego' : 'juegos'} · sincronizado ${esc(hace(u.xbox_sincronizado_en))}`
              : 'Sin vincular'}</span>
          </div>
        </div>
        ${problema ? `<p class="psn-mensaje error">Solo lo ves tú (admin): la clave de OpenXBL del grupo no funciona. ${esc(problema.mensaje ?? '')} Revisa el secreto OPENXBL_API_KEY en Supabase.</p>` : ''}
        ${vinculada ? `
          <button type="button" class="boton-principal" data-xbox="sincronizar"${s.ocupado || espera ? ' disabled' : ''}>${s.ocupado === 'sincronizar' ? 'Sincronizando…' : espera ? `Sincronizar en ${min} min` : 'Sincronizar ahora'}</button>` : `
          <label for="xbox-gamertag" class="campo-titulo">Tu gamertag</label>
          <div class="psn-form">
            <input id="xbox-gamertag" class="psn-input" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="20"
              placeholder="Como sale en tu perfil de Xbox" value="${esc(s.borrador)}">
            <button type="button" class="boton-principal" data-xbox="vincular"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'vincular' ? 'Buscando…' : 'Vincular'}</button>
          </div>
          <p class="ajustes-nota">Trae tus juegos y logros de Xbox (las horas no las da). Nunca se crean valoraciones solas.</p>`}
        ${s.mensaje ? `<p class="psn-mensaje${s.error ? ' error' : ''}" role="status">${esc(s.mensaje)}</p>` : ''}
        <button type="button" class="enlace-discreto psn-ayuda-boton" data-xbox="guia" aria-expanded="${s.guia}">${s.guia ? 'Ocultar la guía' : 'Cómo hacer visible tu historial de Xbox'}</button>
        ${s.guia ? GUIA_PRIVACIDAD : ''}
        ${vinculada ? (s.confirmarQuitar
          ? `<div class="psn-confirmar" role="group" aria-label="Confirmar">
               <p>¿Desvincular Xbox? Se borran tus juegos de Xbox en CVJ. Tus valoraciones no se tocan.</p>
               <div class="psn-confirmar-botones">
                 <button type="button" class="boton-secundario neutro" data-xbox="no-desvincular">Cancelar</button>
                 <button type="button" class="boton-secundario peligro" data-xbox="desvincular"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'desvincular' ? 'Desvinculando…' : 'Sí, desvincular'}</button>
               </div>
             </div>`
          : '<button type="button" class="enlace-discreto psn-desconectar" data-xbox="pedir-desvincular">Desvincular</button>') : ''}
      </div>`;
    clearTimeout(reloj);
    if (espera) reloj = setTimeout(pintar, Math.min(espera, 30_000) + 200);
  };

  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-xbox]');
    if (!b || !yo) return;
    const a = b.dataset.xbox;
    if (a === 'guia') { s.guia = !s.guia; pintar(); return; }
    if (a === 'pedir-desvincular') { s.confirmarQuitar = true; pintar(); return; }
    if (a === 'no-desvincular') { s.confirmarQuitar = false; pintar(); return; }
    let gamertag = '';
    if (a === 'vincular') {
      gamertag = cont.querySelector('#xbox-gamertag')?.value.trim() ?? '';
      if (!gamertag) { s.mensaje = 'Escribe tu gamertag.'; s.error = true; pintar(); return; }
    }
    s.ocupado = a; s.mensaje = null; pintar();
    let r;
    if (a === 'vincular') r = await xbox.vincular(yo.id, gamertag);
    else if (a === 'sincronizar') r = await xbox.sincronizar(yo.id);
    else if (a === 'desvincular') r = await xbox.desvincular(yo.id);
    s.ocupado = null;
    if (!r) return;
    s.error = !r.ok;
    if (a === 'vincular') {
      if (r.ok) {
        s.borrador = '';
        const sinc = r.sincronizacion;
        s.mensaje = sinc?.ok ? `Vinculado como ${r.gamertag}. ${resumen(sinc)}` : `Vinculado como ${r.gamertag}, pero no se ha podido sincronizar: ${xbox.mensajeXbox(sinc)}`;
        s.error = !sinc?.ok;
        s.guia = sinc?.codigo === 'privado' || s.guia;
        aviso('Xbox vinculada');
      } else {
        s.mensaje = xbox.mensajeXbox(r);
      }
    }
    if (a === 'sincronizar') {
      s.mensaje = r.ok ? resumen(r) : xbox.mensajeXbox(r);
      if (r.codigo === 'privado') s.guia = true;
    }
    if (a === 'desvincular') {
      s.confirmarQuitar = false;
      s.mensaje = r.ok ? null : xbox.mensajeXbox(r);
      if (r.ok) aviso('Xbox desvinculada');
    }
    pintar();
  });

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return () => { desuscribir(); clearTimeout(reloj); };
}

export function resumen(r) {
  const partes = [`Sincronizado: ${r.juegos} ${r.juegos === 1 ? 'juego' : 'juegos'}`];
  if (r.pendientes) partes.push(`identificando ${r.pendientes} en segundo plano`);
  if (r.nuevos) partes.push(`${r.nuevos} ${r.nuevos === 1 ? 'nuevo' : 'nuevos'} para revisar`);
  return partes.join(' · ') + '.';
}
