// Tarjeta "Xbox" de Ajustes → Plataformas: un solo botón "Conectar Xbox" (login de
// Microsoft con OpenXBL y vuelta a la app ya conectado); conectada: gamertag, última
// sincronización, "Sincronizar ahora" (10 min de espera) y "Desconectar".
import { esc, tiempoRelativo, aviso } from './ui.js';
import * as datos from './datos.js';
import * as xbox from './xbox.js';
import { usuarioActual } from './sesion.js';
import { iconoFuente } from './plataformas-ui.js';

const hace = (iso) => (iso ? tiempoRelativo(iso).replace(/^Ahora$/, 'ahora mismo').toLowerCase() : 'nunca');

export function montarXbox(cont) {
  const yo = usuarioActual();
  const s = { ocupado: null, mensaje: null, error: false, confirmarQuitar: false };
  let reloj = null;

  const pintar = () => {
    const u = yo && datos.usuario(yo.id);
    if (!u || !('xbox_xuid' in u)) { cont.innerHTML = ''; return; } // sin la migración 007
    const conectada = !!u.xbox_xuid;
    const reconectar = conectada && !!u.xbox_reconectar;
    const juegos = datos.bibliotecaDe(u.id).filter((f) => f.fuente === 'xbox' && !f.oculto).length;
    const espera = xbox.esperaRestante(u);
    const min = Math.ceil(espera / 60000);
    cont.innerHTML = `
      <div class="tarjeta-plataforma" id="ajustes-xbox">
        <div class="plataforma-cab">
          ${iconoFuente('xbox', 22)}
          <div class="plataforma-cab-texto">
            <strong>Xbox</strong>
            <span>${conectada && !reconectar
              ? `${esc(u.xbox_gamertag ?? '')} · ${juegos} ${juegos === 1 ? 'juego' : 'juegos'} · sincronizado ${esc(hace(u.xbox_sincronizado_en))}`
              : reconectar ? 'La conexión ha caducado' : 'Sin conectar'}</span>
          </div>
        </div>
        ${!conectada || reconectar ? `
          <button type="button" class="boton-principal" data-xbox="conectar"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'conectar' ? 'Abriendo Microsoft…' : reconectar ? 'Reconectar Xbox' : 'Conectar Xbox'}</button>
          <p class="ajustes-nota">Inicias sesión con tu cuenta de Microsoft y vuelves aquí ya conectado. Trae tus juegos y logros; las horas no las da Xbox. Nunca se crean valoraciones solas.</p>` : `
          <button type="button" class="boton-principal" data-xbox="sincronizar"${s.ocupado || espera ? ' disabled' : ''}>${s.ocupado === 'sincronizar' ? 'Sincronizando…' : espera ? `Sincronizar en ${min} min` : 'Sincronizar ahora'}</button>`}
        ${s.mensaje ? `<p class="psn-mensaje${s.error ? ' error' : ''}" role="status">${esc(s.mensaje)}</p>` : ''}
        ${conectada ? (s.confirmarQuitar
          ? `<div class="psn-confirmar" role="group" aria-label="Confirmar desconexión">
               <p>¿Desconectar Xbox? Se borran tu conexión y tus juegos de Xbox en CVJ. Tus valoraciones no se tocan.</p>
               <div class="psn-confirmar-botones">
                 <button type="button" class="boton-secundario neutro" data-xbox="no-desconectar">Cancelar</button>
                 <button type="button" class="boton-secundario peligro" data-xbox="desconectar"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'desconectar' ? 'Desconectando…' : 'Sí, desconectar'}</button>
               </div>
             </div>`
          : '<button type="button" class="enlace-discreto psn-desconectar" data-xbox="pedir-desconectar">Desconectar</button>') : ''}
      </div>`;
    // Que el contador de espera baje solo.
    clearTimeout(reloj);
    if (espera) reloj = setTimeout(pintar, Math.min(espera, 30_000) + 200);
  };

  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-xbox]');
    if (!b || !yo) return;
    const a = b.dataset.xbox;
    if (a === 'pedir-desconectar') { s.confirmarQuitar = true; pintar(); return; }
    if (a === 'no-desconectar') { s.confirmarQuitar = false; pintar(); return; }
    s.ocupado = a; s.mensaje = null; pintar();
    let r;
    if (a === 'conectar') r = await xbox.irAIniciarSesion();
    else if (a === 'sincronizar') r = await xbox.sincronizar(yo.id);
    else if (a === 'desconectar') r = await xbox.desconectar(yo.id);
    s.ocupado = null;
    if (!r) return;
    s.error = !r.ok;
    if (a === 'conectar' && r.ok) return; // se va a la página de Microsoft
    if (a === 'sincronizar') s.mensaje = r.ok ? resumen(r) : xbox.mensajeXbox(r);
    if (a === 'conectar') s.mensaje = xbox.mensajeXbox(r);
    if (a === 'desconectar') {
      s.confirmarQuitar = false;
      s.mensaje = r.ok ? null : xbox.mensajeXbox(r);
      if (r.ok) aviso('Xbox desconectada');
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
