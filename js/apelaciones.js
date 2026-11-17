// Apelaciones de los expulsados (migración 038): "quiero volver". El difunto apela desde su
// pantalla (js/pantallas/difunto.js) con su código; aquí, lo del resto de la app:
//   · admin: aviso destacado en Inicio, la sección de Gestionar grupo y la hoja con las
//     apelaciones (texto, fecha, su historial) para Aceptar o Rechazar (con respuesta);
//   · todos: "Ha apelado N veces" en la lápida y las filas de la actividad.
// El texto es privado: solo llega al admin (función admin, acción "apelaciones").
import * as datos from './datos.js';
import { icono } from './icons.js';
import { esc, avatar, tiempoRelativo, aviso } from './ui.js';
import { abrirHoja } from './hoja.js';
import { llamarAdmin } from './admin-api.js';
import { DICTADOR, historia, soyAdmin, fecha, fechaHora, duracionCorta } from './cementerio.js';

export const vecesApelado = (uid) => datos.apelacionesDe(uid).length;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
const pendientes = () => datos.apelacionesPendientes()
  .filter((a) => datos.usuario(a.usuario_id))
  .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));

/** Inicio (solo admin): "{nombre} apela desde el más allá". */
export function avisosInicio() {
  if (!soyAdmin()) return '';
  return pendientes().map((a) => {
    const u = datos.usuario(a.usuario_id);
    return `
      <button type="button" class="aviso-apelacion" data-apelaciones="${esc(u.id)}">
        <span class="aviso-apelacion-icono difunto-foto">${avatar(u, 30)}</span>
        <span class="aviso-apelacion-texto"><strong>${esc(u.nombre)} apela desde el más allá</strong><small>${a.exorcizado ? 'Exorcizado · ' : ''}${esc(tiempoRelativo(a.creado_en))}</small></span>
        <span class="aviso-apelacion-ver">Leer</span>
      </button>`;
  }).join('');
}

/** Gestionar grupo: el acceso a las apelaciones (con las pendientes). */
export function bloqueGrupo() {
  const todas = datos.apelaciones().filter((a) => datos.usuario(a.usuario_id));
  if (!todas.length) return '';
  const n = pendientes().length;
  return `
    <div class="grupo-apelaciones">
      <span class="campo-titulo">Apelaciones</span>
      <button type="button" class="boton-secundario${n ? '' : ' neutro'} con-icono" data-apelaciones="">
        ${icono('urna', { tam: 18, color: 'currentColor' })}<span>${n ? `${n} ${n === 1 ? 'pendiente' : 'pendientes'}` : 'Ver todas'} · ${todas.length} en total</span>
      </button>
    </div>`;
}

/** Clic en un aviso o acceso (data-apelaciones = id del difunto, o vacío = todas). */
export function clicApelaciones(e) {
  const b = e.target.closest('[data-apelaciones]');
  if (!b) return false;
  e.preventDefault();
  abrirApelaciones(b.dataset.apelaciones || null);
  return true;
}

const ESTADO = { pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada' };

/** Su historial: expulsiones (con causa) y apelaciones (sin la que se está viendo). */
function historial(uid, menos, conTexto) {
  const h = historia(uid);
  const filas = [
    ...h.vidas.filter((v) => v.hasta).map((v) => ({
      f: v.hasta,
      t: `${v.exorcismo ? 'Exorcizado' : 'Expulsado'} el ${fecha(v.hasta)}`,
      d: `${duracionCorta(v.desde, v.hasta)}${v.causa ? ` · ${v.causa}` : ''}`,
    })),
    ...conTexto.filter((a) => a.usuario_id === uid && a.id !== menos).map((a) => ({
      f: a.creado_en,
      t: `Apeló el ${fecha(a.creado_en)}`,
      d: `${ESTADO[a.estado]}${a.respuesta ? ` · «${a.respuesta}»` : ''}`,
    })),
  ].sort((a, b) => new Date(b.f) - new Date(a.f));
  if (!filas.length) return '';
  return `<ul class="apelacion-historial">${filas.map((x) => `<li><span>${esc(x.t)}</span><span>${esc(x.d)}</span></li>`).join('')}</ul>`;
}

function tarjeta(a, todas, rechazando) {
  const u = datos.usuario(a.usuario_id);
  if (!u) return '';
  const pend = a.estado === 'pendiente';
  return `
    <article class="apelacion${pend ? ' pendiente' : ''}" data-apelacion="${esc(a.id)}">
      <div class="apelacion-cab">
        <span class="${u.activo === false ? 'difunto-foto' : ''}">${avatar(u, 36)}</span>
        <div>
          <strong>${esc(u.nombre)}${a.exorcizado ? ' <small>(exorcizado)</small>' : ''}</strong>
          <small>${esc(fechaHora(a.creado_en))}${pend ? '' : ` · <span class="apelacion-estado">${ESTADO[a.estado]}</span>`}</small>
        </div>
      </div>
      <p class="apelacion-texto texto-seleccionable">${esc(a.texto || '')}</p>
      ${a.estado === 'rechazada' && a.respuesta ? `<p class="apelacion-respuesta">Tu respuesta: «${esc(a.respuesta)}»</p>` : ''}
      ${historial(u.id, a.id, todas)}
      ${pend ? (rechazando === a.id ? `
        <label class="campo-titulo" for="apel-resp-${esc(a.id)}">Respuesta <small>(opcional; la verá al intentar entrar)</small></label>
        <input id="apel-resp-${esc(a.id)}" class="psn-input" maxlength="300" autocomplete="off" data-respuesta placeholder="Por ejemplo: vuelve cuando completes algo">
        <div class="fila-botones">
          <button type="button" class="boton-secundario neutro" data-cancelar>Cancelar</button>
          <button type="button" class="boton-secundario peligro" data-confirmar-rechazo="${esc(a.id)}">Rechazar</button>
        </div>` : `
        <div class="fila-botones">
          <button type="button" class="boton-secundario neutro" data-rechazar="${esc(a.id)}">Rechazar</button>
          <button type="button" class="boton-principal" data-aceptar="${esc(a.id)}">Aceptar</button>
        </div>`) : ''}
    </article>`;
}

/** La hoja de apelaciones (de una persona o todas), con su texto. */
export function abrirApelaciones(uid = null) {
  let lista = null;
  let error = null;
  let rechazando = null;
  const u = uid ? datos.usuario(uid) : null;
  abrirHoja({
    titulo: u ? `Apelaciones de ${u.nombre}` : 'Apelaciones',
    html: '<div class="apelaciones-lista" data-ref="lista"><p class="ajustes-nota">Abriendo el buzón del más allá…</p></div>',
    alMontar(cuerpo, cerrar) {
      const cont = cuerpo.querySelector('[data-ref="lista"]');
      const pintar = () => {
        if (error) { cont.innerHTML = `<p class="psn-mensaje error">${esc(error)}</p>`; return; }
        if (!lista) return;
        const mias = lista.filter((a) => !uid || a.usuario_id === uid)
          .sort((a, b) => (a.estado !== 'pendiente') - (b.estado !== 'pendiente') || new Date(b.creado_en) - new Date(a.creado_en));
        cont.innerHTML = mias.length
          ? mias.map((a) => tarjeta(a, lista, rechazando)).join('')
          : '<p class="ajustes-nota">Nadie ha apelado. Descansan en paz.</p>';
      };
      const cargar = async () => {
        const r = await llamarAdmin('apelaciones');
        if (!r.ok) error = r.error ?? 'No se han podido leer.';
        else { error = null; lista = r.apelaciones ?? []; }
        pintar();
      };
      const decidir = async (b, accion, id, respuesta = null) => {
        b.disabled = true;
        const a = lista.find((x) => x.id === id);
        const nombre = datos.usuario(a?.usuario_id)?.nombre ?? 'El difunto';
        const r = await llamarAdmin(accion === 'aceptar' ? 'apelacion_aceptar' : 'apelacion_rechazar', { apelacion_id: id, respuesta });
        b.disabled = false;
        if (!r.ok) { aviso(r.error ?? 'No se ha podido'); return; }
        rechazando = null;
        aviso(accion === 'aceptar' ? `${nombre} ha vuelto tras apelar` : `Apelación de ${nombre} rechazada`, 3000);
        await Promise.all([datos.refrescar(), cargar()]);
        if (uid && !lista.some((x) => x.usuario_id === uid && x.estado === 'pendiente') && accion === 'aceptar') cerrar(true);
      };
      cont.addEventListener('click', (e) => {
        const ac = e.target.closest('[data-aceptar]');
        if (ac) { decidir(ac, 'aceptar', ac.dataset.aceptar); return; }
        const re = e.target.closest('[data-rechazar]');
        if (re) { rechazando = re.dataset.rechazar; pintar(); cont.querySelector('[data-respuesta]')?.focus(); return; }
        if (e.target.closest('[data-cancelar]')) { rechazando = null; pintar(); return; }
        const cr = e.target.closest('[data-confirmar-rechazo]');
        if (cr) decidir(cr, 'rechazar', cr.dataset.confirmarRechazo, cont.querySelector('[data-respuesta]')?.value.trim() || null);
      });
      cargar();
    },
  });
}

// ---------------------------------------------------------------------------
// Actividad: nuevas apelaciones y rechazos ("ha vuelto tras apelar" sale de vidas, en
// js/cementerio.js). Sin el texto: es privado.
// ---------------------------------------------------------------------------
export function eventosActividad() {
  const ev = [];
  for (const a of datos.apelaciones()) {
    if (!datos.usuario(a.usuario_id)) continue;
    ev.push({ a, tipo: 'nueva', fecha: a.creado_en });
    if (a.estado === 'rechazada' && a.resuelta_en) ev.push({ a, tipo: 'rechazada', fecha: a.resuelta_en });
  }
  return ev;
}

export function filaActividad({ a, tipo, fecha: f }, ahora = new Date()) {
  const u = datos.usuario(a.usuario_id);
  const admin = soyAdmin();
  const frase = tipo === 'nueva'
    ? `<strong>${esc(u.nombre)}</strong> ha apelado desde el más allá`
    : `<strong>${DICTADOR}</strong> ha rechazado la apelación de <strong>${esc(u.nombre)}</strong>`;
  const extra = tipo === 'nueva'
    ? (a.estado === 'pendiente' ? `Lo que diga, solo lo sabe ${DICTADOR}.` : '')
    : 'Sigue bajo tierra.';
  const atrib = admin ? `data-apelaciones="${esc(u.id)}"` : '';
  return `
    <a class="actividad-fila actividad-cementerio" href="#cementerio" ${atrib}>
      <span class="difunto-foto">${avatar(u, 36)}</span>
      <div class="actividad-texto">
        <span class="actividad-frase">${frase}</span>
        ${extra ? `<span class="actividad-cementerio-extra">${extra}</span>` : ''}
        <span class="actividad-tiempo" data-fecha="${esc(f)}">${tiempoRelativo(f, ahora)}</span>
      </div>
      <span class="actividad-cementerio-icono${tipo === 'rechazada' ? ' sellado' : ''}" aria-hidden="true">${icono(tipo === 'rechazada' ? 'sello' : 'urna', { tam: 24, color: 'currentColor', trazo: 'var(--piedra-1)' })}</span>
    </a>`;
}
