// Tarjeta "Xbox" de Ajustes → Plataformas: "Tu gamertag" + Vincular. Vinculado:
// gamertag, última sincronización, "Sincronizar ahora" (10 min de espera) y
// "Desvincular". Si el historial es privado, mini guía para hacerlo visible.
import { esc, aviso } from './ui.js';
import * as datos from './datos.js';
import * as xbox from './xbox.js';
import { usuarioActual } from './sesion.js';
import { iconoFuente } from './plataformas-ui.js';
import { cuentasDe, filasCuentas, escucharEtiquetas } from './cuentas-ui.js';

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
  const s = { ocupado: null, mensaje: null, error: false, confirmarQuitar: null, guia: false, borrador: '', anadir: false, etiqueta: '' };
  let reloj = null;

  const pintar = () => {
    const u = yo && datos.usuario(yo.id);
    if (!u || !('xbox_xuid' in u)) { cont.innerHTML = ''; return; } // sin la migración 007
    const campo = cont.querySelector('#xbox-gamertag');
    if (campo) s.borrador = campo.value;
    const et = cont.querySelector('#xbox-etiqueta-nueva');
    if (et) s.etiqueta = et.value;
    const cuentas = cuentasDe(u, 'xbox');
    const formulario = !cuentas.length || s.anadir;
    const espera = xbox.esperaRestante(u);
    const min = Math.ceil(espera / 60000);
    const problema = xbox.claveConProblemas();
    cont.innerHTML = `
      <div class="tarjeta-plataforma" id="ajustes-xbox">
        <div class="plataforma-cab">
          ${iconoFuente('xbox', 22)}
          <div class="plataforma-cab-texto">
            <strong>Xbox</strong>
            <span>${!cuentas.length ? 'Sin vincular' : cuentas.length === 1 ? 'Vinculada' : `${cuentas.length} cuentas vinculadas`}</span>
          </div>
        </div>
        ${problema ? `<p class="psn-mensaje error">Solo lo ves tú (admin): la clave de OpenXBL del grupo no funciona. ${esc(problema.mensaje ?? '')} Revisa el secreto OPENXBL_API_KEY en Supabase.</p>` : ''}
        ${cuentas.length ? filasCuentas({
          uid: u.id, fuente: 'xbox', cuentas, attr: 'xbox', confirmar: s.confirmarQuitar, ocupado: s.ocupado,
          quitar: 'Desvincular', quitando: 'Desvinculando…',
          pregunta: 'Se borran los juegos de esta cuenta en CVJ. Tus valoraciones y tus horas extra no se tocan.',
        }) : ''}
        ${cuentas.length ? `
          <button type="button" class="boton-principal" data-xbox="sincronizar"${s.ocupado || espera ? ' disabled' : ''}>${s.ocupado === 'sincronizar' ? 'Sincronizando…' : espera ? `Sincronizar en ${min} min` : 'Sincronizar ahora'}</button>` : ''}
        ${formulario ? `
          <label for="xbox-gamertag" class="campo-titulo">${cuentas.length ? 'Otro gamertag' : 'Tu gamertag'}</label>
          ${cuentas.length ? `<input id="xbox-etiqueta-nueva" class="psn-input" maxlength="40" autocomplete="off" placeholder="Etiqueta (opcional): Cuenta 2" value="${esc(s.etiqueta)}">` : ''}
          <div class="psn-form">
            <input id="xbox-gamertag" class="psn-input" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="20"
              placeholder="Como sale en tu perfil de Xbox" value="${esc(s.borrador)}">
            <button type="button" class="boton-principal" data-xbox="vincular"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'vincular' ? 'Buscando…' : 'Vincular'}</button>
          </div>
          ${cuentas.length ? '' : '<p class="ajustes-nota">Trae tus juegos, horas y logros de Xbox. Nunca se crean valoraciones solas.</p>'}` : ''}
        ${cuentas.length && 'xbox_incluir_pc' in u ? `
          <label class="interruptor">
            <input type="checkbox" data-xbox-pc${u.xbox_incluir_pc ? ' checked' : ''}>
            <span class="interruptor-texto"><strong>Incluir juegos de PC detectados</strong><small>Juegos de PC que Xbox ha visto pero no son de la tienda (Steam, Epic...). Apagado, van a «Ocultos».</small></span>
          </label>` : ''}
        ${s.mensaje ? `<p class="psn-mensaje${s.error ? ' error' : ''}" role="status">${esc(s.mensaje)}</p>` : ''}
        <button type="button" class="enlace-discreto psn-ayuda-boton" data-xbox="guia" aria-expanded="${s.guia}">${s.guia ? 'Ocultar la guía' : 'Cómo hacer visible tu historial de Xbox'}</button>
        ${s.guia ? GUIA_PRIVACIDAD : ''}
        ${cuentas.length && cuentas[0].id ? `
          <button type="button" class="enlace-discreto cuenta-anadir" data-xbox="anadir" aria-expanded="${s.anadir}">${s.anadir ? 'Cancelar' : 'Añadir otra cuenta'}</button>` : ''}
      </div>`;
    clearTimeout(reloj);
    if (espera) reloj = setTimeout(pintar, Math.min(espera, 30_000) + 200);
  };

  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-xbox]');
    if (!b || !yo) return;
    const a = b.dataset.xbox;
    if (a === 'guia') { s.guia = !s.guia; pintar(); return; }
    if (a === 'pedir-quitar') { s.confirmarQuitar = b.dataset.id ?? ''; pintar(); return; }
    if (a === 'no-quitar') { s.confirmarQuitar = null; pintar(); return; }
    if (a === 'anadir') { s.anadir = !s.anadir; s.mensaje = null; pintar(); if (s.anadir) cont.querySelector('#xbox-gamertag')?.focus(); return; }
    let gamertag = '';
    if (a === 'vincular') {
      gamertag = cont.querySelector('#xbox-gamertag')?.value.trim() ?? '';
      if (!gamertag) { s.mensaje = 'Escribe tu gamertag.'; s.error = true; pintar(); return; }
    }
    s.ocupado = a; s.mensaje = null; pintar();
    let r;
    if (a === 'vincular') r = await xbox.vincular(yo.id, gamertag, s.anadir ? cont.querySelector('#xbox-etiqueta-nueva')?.value.trim() : undefined);
    else if (a === 'sincronizar') r = await xbox.sincronizar(yo.id);
    else if (a === 'quitar') r = await xbox.desvincular(yo.id, b.dataset.id || undefined);
    s.ocupado = null;
    if (!r) return;
    s.error = !r.ok;
    if (a === 'vincular') {
      if (r.ok) {
        s.borrador = '';
        s.anadir = false;
        s.etiqueta = '';
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
    if (a === 'quitar') {
      s.confirmarQuitar = r.ok ? null : s.confirmarQuitar;
      s.mensaje = r.ok ? null : xbox.mensajeXbox(r);
      if (r.ok) aviso('Xbox desvinculada');
    }
    pintar();
  });

  cont.addEventListener('change', (e) => {
    const c = e.target.closest('[data-xbox-pc]');
    if (!c || !yo) return;
    datos.cambiarIncluirPc(yo.id, c.checked, aviso);
    aviso(c.checked ? 'Juegos de PC detectados incluidos' : 'Juegos de PC detectados a «Ocultos»');
  });

  const desuscribir = datos.suscribir(pintar);
  const sinEtiquetas = escucharEtiquetas(cont);
  pintar();
  return () => { desuscribir(); sinEtiquetas(); clearTimeout(reloj); };
}

export function resumen(r) {
  const partes = [`Sincronizado: ${r.juegos} ${r.juegos === 1 ? 'juego' : 'juegos'}`];
  if (r.pendientes) partes.push(`identificando ${r.pendientes} en segundo plano`);
  if (r.nuevos) partes.push(`${r.nuevos} ${r.nuevos === 1 ? 'nuevo' : 'nuevos'} para revisar`);
  return partes.join(' · ') + '.';
}
