// Propuestas de nuevos miembros (migración 037): nadie invita; se propone, el grupo vota
// (a favor / en contra, público) y el Dictador decide (invitar, aparcar o rechazar).
// Aquí, la lógica y las piezas que salen fuera de su pantalla: el acceso de "El grupo", el
// aviso de Inicio, las filas de la actividad y "Entró por propuesta de…". La pantalla está
// en js/pantallas/propuestas.js.
import * as datos from './datos.js';
import { icono } from './icons.js';
import { esc, avatar, tiempoRelativo } from './ui.js';
import { usuarioActual } from './sesion.js';
import { DICTADOR, historia } from './cementerio.js';

export const MAX_ABIERTAS = 2;
const DIA = 24 * 60 * 60 * 1000;

export const PLATAFORMAS = [
  ['playstation', 'PlayStation'],
  ['xbox', 'Xbox'],
  ['pc', 'PC'],
  ['switch', 'Switch'],
  ['movil', 'Móvil'],
];
export const nombrePlataforma = (id) => PLATAFORMAS.find(([k]) => k === id)?.[1] ?? id;

/** A favor y en contra (con quién y su comentario) y el apoyo neto. */
export function recuento(p) {
  const votos = datos.votosDe(p.id).filter((v) => datos.usuario(v.usuario_id));
  const orden = (a, b) => new Date(a.actualizado_en ?? a.creado_en) - new Date(b.actualizado_en ?? b.creado_en);
  const favor = votos.filter((v) => v.voto === 'favor').sort(orden);
  const contra = votos.filter((v) => v.voto === 'contra').sort(orden);
  return { favor, contra, apoyo: favor.length - contra.length, total: votos.length };
}

/** Por estado. Las abiertas, por apoyo (y la más reciente antes, si empatan). */
export function porEstado() {
  const todas = datos.propuestas();
  const recientes = (a, b) => new Date(b.resuelta_en ?? b.creado_en) - new Date(a.resuelta_en ?? a.creado_en);
  const abiertas = todas.filter((p) => p.estado === 'abierta')
    .map((p) => ({ p, r: recuento(p) }))
    .sort((a, b) => b.r.apoyo - a.r.apoyo || b.r.favor.length - a.r.favor.length || new Date(b.p.creado_en) - new Date(a.p.creado_en));
  return {
    abiertas,
    // Esperando a que el candidato acepte en su enlace (aún no se vota).
    esperando: todas.filter((p) => p.estado === 'esperando').sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en)),
    aparcadas: todas.filter((p) => p.estado === 'aparcada').sort(recientes).map((p) => ({ p, r: recuento(p) })),
    aceptadas: todas.filter((p) => p.estado === 'aceptada').sort(recientes),
    rechazadas: todas.filter((p) => p.estado === 'rechazada').sort(recientes),
  };
}

export const misAbiertas = (uid) => datos.propuestas().filter((p) => p.autor_id === uid && (p.estado === 'abierta' || p.estado === 'esperando')).length;
export const miVoto = (p, uid) => datos.votosDe(p.id).find((v) => v.usuario_id === uid) ?? null;

/** Quién propuso a esta persona (si entró por propuesta). */
export function padrino(uid) {
  const p = datos.propuestaDe(uid);
  return p ? datos.usuario(p.autor_id) : null;
}
/** "Entró por propuesta de Nico" (o ''). */
export function textoPadrino(uid) {
  const a = padrino(uid);
  return a ? `Entró por propuesta de ${a.nombre}` : '';
}

/**
 * Para las insignias de padrino: a quién ha traído (propuestas aceptadas con su persona) y
 * cómo les ha ido. Buen padrino = alguno aguantó vivo 30 días seguidos desde que entró;
 * mal padrino = alguno ha acabado en el cementerio (aunque luego volviera).
 */
export function ahijados(uid, ahora = Date.now()) {
  const lista = datos.propuestas().filter((p) => p.autor_id === uid && p.estado === 'aceptada' && p.usuario_id && datos.usuario(p.usuario_id));
  let bueno = false;
  let malo = false;
  for (const p of lista) {
    const h = historia(p.usuario_id);
    const primera = h.vidas[0];
    if (primera) {
      const fin = primera.hasta ? new Date(primera.hasta).getTime() : ahora;
      if (fin - new Date(primera.desde).getTime() >= 30 * DIA) bueno = true;
    }
    if (h.muertes > 0) malo = true;
  }
  return { bueno, malo, n: lista.length };
}

// ---------------------------------------------------------------------------
// Fuera de su pantalla
// ---------------------------------------------------------------------------
/** Al final de "El grupo" (junto al cementerio): el "+" para proponer, con las abiertas. */
export function accesoGrupo() {
  const n = datos.propuestas().filter((p) => p.estado === 'abierta').length;
  return `
    <a class="el-grupo-persona el-grupo-propuestas" href="#propuestas">
      <span class="propuestas-acceso" aria-hidden="true">${icono('mas', { tam: 24, color: 'currentColor' })}${n ? `<b class="propuestas-acceso-n">${n}</b>` : ''}</span>
      <span>Proponer</span>
    </a>`;
}

/** En Inicio: las propuestas abiertas que aún no he votado. */
export function avisosInicio() {
  const yo = usuarioActual();
  if (!yo || datos.usuario(yo.id)?.activo === false) return '';
  const pend = datos.propuestas()
    .filter((p) => p.estado === 'abierta' && !miVoto(p, yo.id) && datos.usuario(p.autor_id))
    .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
  return pend.map((p) => `
    <a class="aviso-propuesta" href="#propuestas/${esc(p.id)}">
      <span class="aviso-propuesta-icono">${icono('urna', { tam: 18, color: 'currentColor' })}</span>
      <span class="aviso-propuesta-texto"><span>Nueva propuesta: <strong>${esc(p.nombre)}</strong>, propuesto por ${esc(datos.usuario(p.autor_id).nombre)}</span><small>Tu voto cuenta. Más o menos.</small></span>
      <span class="aviso-propuesta-votar">Votar</span>
    </a>`).join('');
}

// ---------------------------------------------------------------------------
// Actividad
// ---------------------------------------------------------------------------
/** Propuestas nuevas, aceptadas y rechazadas (aparcar no sale: es estar en la nevera). */
export function eventosActividad() {
  const ev = [];
  for (const p of datos.propuestas()) {
    if (!datos.usuario(p.autor_id)) continue;
    // Sale cuando el candidato acepta (antes no es una propuesta de verdad). Las de antes de
    // la migración 043 no tienen confirmada_en: su fecha de creación.
    if (!['esperando', 'caducada'].includes(p.estado)) ev.push({ p, tipo: 'nueva', fecha: p.confirmada_en ?? p.creado_en });
    if (p.estado === 'aceptada' && p.resuelta_en) ev.push({ p, tipo: 'aceptada', fecha: p.resuelta_en });
    if (p.estado === 'rechazada' && p.resuelta_en) ev.push({ p, tipo: 'rechazada', fecha: p.resuelta_en });
  }
  return ev;
}

export function filaActividad({ p, tipo, fecha }, ahora = new Date()) {
  const autor = datos.usuario(p.autor_id);
  const nuevo = p.usuario_id ? datos.usuario(p.usuario_id) : null;
  let frase;
  let extra = '';
  if (tipo === 'nueva') {
    frase = `Nueva propuesta: <strong>${esc(p.nombre)}</strong>, propuesto por <strong>${esc(autor.nombre)}</strong>`;
    extra = p.motivo ? `«${esc(recortar(p.motivo, 110))}»` : '';
  } else if (tipo === 'aceptada') {
    frase = `<strong>${DICTADOR}</strong> ha aceptado a <strong>${esc(nuevo?.nombre ?? p.nombre)}</strong>`;
    extra = `Propuesto por ${esc(autor.nombre)}. Que no se acostumbre.`;
  } else {
    frase = `<strong>${esc(p.nombre)}</strong> no ha pasado el casting`;
    extra = p.motivo_rechazo ? `Motivo: ${esc(p.motivo_rechazo)}` : `${DICTADOR} no da explicaciones.`;
  }
  const destino = tipo === 'aceptada' && nuevo ? `#perfil/${esc(nuevo.id)}` : `#propuestas/${esc(p.id)}`;
  return `
    <a class="actividad-fila actividad-cementerio actividad-propuesta" href="${destino}">
      ${tipo === 'aceptada' && nuevo ? avatar(nuevo, 36) : avatar(autor, 36)}
      <div class="actividad-texto">
        <span class="actividad-frase">${frase}</span>
        ${extra ? `<span class="actividad-cementerio-extra">${extra}</span>` : ''}
        <span class="actividad-tiempo" data-fecha="${esc(fecha)}">${tiempoRelativo(fecha, ahora)}</span>
      </div>
      <span class="actividad-cementerio-icono propuesta-${tipo}" aria-hidden="true">${icono(tipo === 'rechazada' ? 'sello' : tipo === 'aceptada' ? 'completado' : 'urna', { tam: 24, color: 'currentColor', trazo: 'var(--acento-suave)' })}</span>
    </a>`;
}

export const recortar = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
