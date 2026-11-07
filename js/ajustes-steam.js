// Tarjeta "Steam" de Ajustes → Plataformas: "Conectar Steam" (inicio de sesión oficial
// de Steam), lista de cuentas con etiqueta, "Sincronizar ahora", desconectar una a una
// y "Añadir otra cuenta". Si la biblioteca es privada, mini guía para hacerla pública.
import { esc, aviso } from './ui.js';
import * as datos from './datos.js';
import * as steam from './steam.js';
import { usuarioActual } from './sesion.js';
import { iconoFuente } from './plataformas-ui.js';
import { filasCuentas, escucharEtiquetas } from './cuentas-ui.js';
import * as metricas from './metricas.js';

const GUIA_PRIVACIDAD = `
  <div class="psn-ayuda">
    <p>Para que CVJ vea tus juegos y tus horas, tu biblioteca de Steam tiene que ser pública:</p>
    <p>En Steam, abre tu <strong>perfil</strong> → <strong>Editar perfil</strong> → <strong>Privacidad</strong>.</p>
    <p>Pon <strong>Detalles de juegos: Público</strong> y desmarca <strong>«Mantener siempre privado mi tiempo de juego total»</strong>.</p>
    <p>Luego vuelve aquí y pulsa «Sincronizar ahora». A veces Steam tarda unos minutos en aplicar el cambio.</p>
  </div>`;

export function montarSteam(cont) {
  const yo = usuarioActual();
  const s = { ocupado: null, mensaje: null, error: false, confirmarQuitar: null, guia: false, anadir: false, etiqueta: '' };

  // Lo que pasó al volver del inicio de sesión de Steam.
  const vuelta = steam.tomarResultado();
  if (vuelta) {
    const sinc = vuelta.sincronizacion;
    s.error = !vuelta.ok || !sinc?.ok;
    s.mensaje = !vuelta.ok ? steam.mensajeSteam(vuelta)
      : sinc?.ok ? `Conectado como ${vuelta.nombre}. ${resumen(sinc)}`
      : `Conectado como ${vuelta.nombre}, pero no se ha podido sincronizar: ${steam.mensajeSteam(sinc)}`;
    s.guia = sinc?.codigo === 'privado';
  }

  const pintar = () => {
    const u = yo && datos.usuario(yo.id);
    if (!u || !Array.isArray(datos.estado.cuentas)) { cont.innerHTML = ''; return; }
    const et = cont.querySelector('#steam-etiqueta-nueva');
    if (et) s.etiqueta = et.value;
    const cuentas = datos.cuentasDe(u.id, 'steam');
    cont.innerHTML = `
      <div class="tarjeta-plataforma" id="ajustes-steam">
        <div class="plataforma-cab">
          ${iconoFuente('steam', 22)}
          <div class="plataforma-cab-texto">
            <strong>Steam</strong>
            <span>${!cuentas.length ? 'Sin conectar' : cuentas.length === 1 ? 'Conectada' : `${cuentas.length} cuentas conectadas`}</span>
          </div>
        </div>
        ${cuentas.length ? filasCuentas({
          uid: u.id, fuente: 'steam', cuentas, attr: 'steam', confirmar: s.confirmarQuitar, ocupado: s.ocupado,
          quitar: 'Desconectar', quitando: 'Desconectando…',
          pregunta: 'Se borran los juegos de esta cuenta en CVJ. Tus valoraciones y tus horas extra no se tocan.',
        }) : ''}
        ${cuentas.length ? `
          <button type="button" class="boton-principal" data-steam="sincronizar"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'sincronizar' ? 'Sincronizando…' : 'Sincronizar ahora'}</button>` : ''}
        ${!cuentas.length || s.anadir ? `
          ${cuentas.length ? `<input id="steam-etiqueta-nueva" class="psn-input" maxlength="40" autocomplete="off" placeholder="Etiqueta (opcional): Cuenta 2" value="${esc(s.etiqueta)}">
            <p class="ajustes-nota">Antes, cierra la sesión de Steam en el navegador para poder entrar con la otra cuenta.</p>` : ''}
          <button type="button" class="boton-principal" data-steam="conectar">Conectar Steam</button>
          ${cuentas.length ? '' : '<p class="ajustes-nota">Entras con el inicio de sesión oficial de Steam (CVJ nunca ve tu contraseña). Trae tus juegos y tus horas. Nunca se crean valoraciones solas.</p>'}` : ''}
        ${s.mensaje ? `<p class="psn-mensaje${s.error ? ' error' : ''}" role="status">${esc(s.mensaje)}</p>` : ''}
        <button type="button" class="enlace-discreto psn-ayuda-boton" data-steam="guia" aria-expanded="${s.guia}">${s.guia ? 'Ocultar la guía' : 'Cómo hacer pública tu biblioteca de Steam'}</button>
        ${s.guia ? GUIA_PRIVACIDAD : ''}
        ${cuentas.length ? `
          <button type="button" class="enlace-discreto cuenta-anadir" data-steam="anadir" aria-expanded="${s.anadir}">${s.anadir ? 'Cancelar' : 'Añadir otra cuenta'}</button>` : ''}
      </div>`;
  };

  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-steam]');
    if (!b || !yo) return;
    const a = b.dataset.steam;
    if (a === 'guia') { s.guia = !s.guia; pintar(); return; }
    if (a === 'anadir') { s.anadir = !s.anadir; s.mensaje = null; pintar(); return; }
    if (a === 'pedir-quitar') { s.confirmarQuitar = b.dataset.id ?? ''; pintar(); return; }
    if (a === 'no-quitar') { s.confirmarQuitar = null; pintar(); return; }
    if (a === 'conectar') {
      steam.irAConectar(s.anadir ? cont.querySelector('#steam-etiqueta-nueva')?.value ?? '' : '');
      return;
    }
    s.ocupado = a; s.mensaje = null; pintar();
    let r;
    if (a === 'sincronizar') r = await steam.sincronizar(yo.id);
    else if (a === 'quitar') r = await steam.desconectar(yo.id, b.dataset.id || undefined);
    s.ocupado = null;
    if (!r) return;
    s.error = !r.ok;
    if (a === 'sincronizar') {
      s.mensaje = r.ok ? resumen(r) : steam.mensajeSteam(r);
      if (r.codigo === 'privado') s.guia = true;
    }
    if (a === 'quitar') {
      s.confirmarQuitar = r.ok ? null : s.confirmarQuitar;
      s.mensaje = r.ok ? null : steam.mensajeSteam(r);
      if (r.ok) aviso('Steam desconectada');
    }
    pintar();
  });

  const desuscribir = datos.suscribir(pintar);
  const sinEtiquetas = escucharEtiquetas(cont);
  pintar();
  return () => { desuscribir(); sinEtiquetas(); };
}

function resumen(r) {
  const partes = [`Sincronizado: ${r.juegos} ${r.juegos === 1 ? 'juego' : 'juegos'}`];
  if (r.horas) partes.push(metricas.textoHoras(r.horas));
  if (r.pendientes) partes.push(`identificando ${r.pendientes} en segundo plano`);
  if (r.nuevos) partes.push(`${r.nuevos} ${r.nuevos === 1 ? 'nuevo' : 'nuevos'} para revisar`);
  return partes.join(' · ') + '.';
}
