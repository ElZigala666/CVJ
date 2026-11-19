// #llamada/{token}: la página del enlace de confirmación (migración 043). La abre el
// interesado, con o sin sesión: un difunto al que intentan reanimar o alguien a quien han
// propuesto. Breve, un botón grande "Aceptar" y nada de datos personales. Si este
// dispositivo o esta red son de alguien activo del grupo, no deja ("Desde aquí no puedes
// aceptar por otro") y ofrece escribir al Dictador por si es un falso positivo.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { esc, avatar, aviso } from '../ui.js';
import { fechaHora, queda, DICTADOR } from '../cementerio.js';
import { usuarioActual, dispositivo, difuntoGuardado, guardarDifunto } from '../sesion.js';
import { hashCodigo, normalizarCodigo, LARGO_CODIGO } from '../codigo.js';
import { botonWhatsapp } from '../llamada.js';

export function render(el, { token, alSalir }) {
  let info = null;
  let ocupado = false;
  const sesionId = () => usuarioActual()?.id ?? null;

  async function cargar() {
    const r = await datos.verEnlace(token, dispositivo(), sesionId());
    if (!el.isConnected) return;
    info = r;
    pintar();
  }

  const marco = (contenido) => `
    <section class="difunto llamada">
      <p class="difunto-desde">CVJ · Críticas de VideoJuegos</p>
      <div class="difunto-vuelta llamada-caja">${contenido}</div>
      <button type="button" class="enlace-discreto" data-accion="salir">${usuarioActual() ? 'Volver a CVJ' : 'Ir a CVJ'}</button>
    </section>`;

  const cabeza = (iconoNombre, titulo, sub, persona = null, muerto = false) => `
    ${persona?.id ? `<span class="${muerto ? 'difunto-foto ' : ''}llamada-foto">${avatar(persona, 84)}</span>`
      : `<span class="difunto-vuelta-icono">${icono(iconoNombre, { tam: 34, color: 'currentColor' })}</span>`}
    <h1 class="difunto-titulo">${titulo}</h1>
    ${sub ? `<p class="difunto-sub">${sub}</p>` : ''}`;

  function pintar(error = '') {
    const i = info;
    if (!i) { el.innerHTML = marco('<p class="difunto-sub">Conectando…</p>'); return; }
    if (!i.ok) {
      el.innerHTML = marco(i.codigo === 'red'
        ? `${cabeza('alerta', 'Sin conexión', esc(i.error ?? ''))}<button type="button" class="boton-principal" data-accion="reintentar">Reintentar</button>`
        : cabeza('alerta', 'Este enlace no existe', 'Puede que esté mal copiado. Pide que te lo manden otra vez.'));
      return;
    }
    const autor = i.autor?.es_admin ? DICTADOR : esc(i.autor?.nombre ?? 'Alguien');
    const nombre = esc(i.persona?.nombre ?? '');
    const err = error ? `<p class="psn-mensaje error">${esc(error)}</p>` : '';
    const wa = (tipo) => botonWhatsapp(i.whatsapp, tipo);

    if (i.estado === 'pendiente' && i.bloqueado) {
      el.innerHTML = marco(`
        ${cabeza('candado', 'Desde aquí no puedes aceptar por otro', `Este móvil o esta conexión los usa alguien del grupo. ${nombre ? `Tiene que aceptarlo ${nombre}, desde su móvil y su conexión.` : ''}`)}
        <p class="ajustes-nota">¿Eres tú de verdad y compartís wifi? Díselo al Dictador.</p>
        ${wa('por_otro') || `<p class="ajustes-nota">Pídele a ${autor} que avise a ${DICTADOR}.</p>`}`);
      return;
    }

    if (i.tipo === 'reanimacion') {
      if (i.estado === 'pendiente') {
        const pideCodigo = !i.reconocido;
        el.innerHTML = marco(`
          ${cabeza('rayo', `${autor} está intentando reanimarte`, `${nombre}, si quieres volver de entre los muertos, acepta. Después, ${DICTADOR} tiene 12 horas para vetarlo.`, i.persona, true)}
          ${pideCodigo ? `
            <label class="campo-titulo" for="llamada-codigo">Tu código de CVJ</label>
            <input id="llamada-codigo" class="psn-input llamada-codigo" maxlength="${LARGO_CODIGO + 4}" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="······">` : ''}
          ${err}
          <button type="button" class="boton-principal llamada-aceptar" data-accion="aceptar">Aceptar</button>
          ${pideCodigo ? '<button type="button" class="enlace-discreto" data-accion="sin-codigo">No tengo mi código</button>' : ''}
          <p class="ajustes-nota">Caduca el ${esc(fechaHora(i.caduca_en))}. ¿No eres ${nombre}? No toques nada.</p>`);
        return;
      }
      if (i.estado === 'respondido') {
        el.innerHTML = marco(`
          ${cabeza('rayo', 'Has respondido a la llamada', `Quedan <b>${esc(queda({ termina_en: i.termina_en }))}</b>. Si ${DICTADOR} no lo veta, volverás solo con tu código de siempre. Abre CVJ en este móvil y entrarás directamente.`, i.persona, true)}`);
        return;
      }
      if (i.estado === 'sin_codigo') {
        el.innerHTML = marco(`
          ${cabeza('rayo', 'Hecho. Ahora decide ' + DICTADOR, `Sin tu código no hay cuenta atrás: volverás si ${DICTADOR} lo aprueba, y te dará un código nuevo.`, i.persona, true)}
          ${wa('reanimacion')}`);
        return;
      }
      const fin = {
        caducado: ['lapida', 'Llegas tarde', 'Esta llamada ha caducado. Si alguien vuelve a intentarlo, te mandará otro enlace.'],
        vetada: ['sello', `${DICTADOR} lo ha vetado`, 'Sigues bajo tierra. De momento.'],
        anulada: ['lapida', 'Esta llamada ya no vale', 'Se ha cancelado.'],
        completada: ['rayo', 'Ya has vuelto', 'Entra en CVJ con tu código.'],
      }[i.estado] ?? ['lapida', 'Esta llamada ya no vale', ''];
      el.innerHTML = marco(cabeza(fin[0], fin[1], fin[2]));
      return;
    }

    // Propuesta
    if (i.estado === 'pendiente') {
      el.innerHTML = marco(`
        ${cabeza('urna', `${autor} te ha propuesto para CVJ`, `${nombre ? `${nombre}: ` : ''}CVJ es un grupo pequeño de amigos que valora juegos, compara horas y discute rankings. Si aceptas, el grupo votará y ${DICTADOR} decidirá.`)}
        ${err}
        <button type="button" class="boton-principal llamada-aceptar" data-accion="aceptar">Aceptar</button>
        <p class="ajustes-nota">No hace falta que des ningún dato. Caduca el ${esc(fechaHora(i.caduca_en))}.</p>`);
      return;
    }
    if (i.estado === 'aceptado') {
      el.innerHTML = marco(`
        ${cabeza('urna', 'Aceptado', `Ya pueden votar. Si el grupo te quiere, ${DICTADOR} te dará tu código en persona. O se lo pides tú:`)}
        ${wa('propuesta')}`);
      return;
    }
    const fin = {
      dentro: ['completado', 'Ya estás dentro', 'Entra en CVJ con tu código.'],
      rechazado: ['sello', 'No pasó el casting', `${DICTADOR} ha decidido. Otra vez será.`],
      caducado: ['urna', 'Llegas tarde', 'Esta propuesta ha caducado. Si te vuelven a proponer, te llegará otro enlace.'],
    }[i.estado] ?? ['urna', 'Esta propuesta ya no vale', ''];
    el.innerHTML = marco(cabeza(fin[0], fin[1], fin[2]));
  }

  async function aceptar(sinCodigo = false) {
    if (ocupado) return;
    let hash = null;
    if (info.tipo === 'reanimacion' && !info.reconocido && !sinCodigo) {
      const cod = normalizarCodigo(el.querySelector('#llamada-codigo')?.value ?? '');
      if (cod.length !== LARGO_CODIGO) { pintar(`Escribe tu código (${LARGO_CODIGO} caracteres).`); return; }
      hash = await hashCodigo(cod);
    }
    ocupado = true;
    for (const b of el.querySelectorAll('button')) b.disabled = true;
    const r = await datos.aceptarEnlace({ token, dispositivo: dispositivo(), sesionId: sesionId(), hash, sinCodigo });
    ocupado = false;
    if (!el.isConnected) return;
    if (!r.ok) {
      if (r.codigo === 'por_otro') { info = { ...info, bloqueado: true }; pintar(); return; }
      if (['usado', 'caducado', 'resuelta'].includes(r.codigo)) { await cargar(); return; }
      pintar(r.error ?? 'No se ha podido.');
      return;
    }
    // El difunto queda recordado aquí: al volver a la vida, la app le reconoce sola.
    if (info.tipo === 'reanimacion' && info.persona?.id) {
      const antes = difuntoGuardado();
      guardarDifunto({ id: info.persona.id, hash: hash ?? (antes?.id === info.persona.id ? antes.hash : null) });
    }
    aviso(info.tipo === 'propuesta' ? 'Aceptado. Que voten.' : sinCodigo ? 'Recibido en el más allá' : 'Has respondido a la llamada', 3000);
    await cargar();
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'aceptar') aceptar(false);
    else if (b.dataset.accion === 'sin-codigo') aceptar(true);
    else if (b.dataset.accion === 'reintentar') { info = null; pintar(); cargar(); }
    else if (b.dataset.accion === 'salir') alSalir();
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'llamada-codigo') aceptar(false); });

  pintar();
  cargar();
}
