// PlayStation (no oficial): llamadas a la Edge Function "psn", sincronización
// automática y estado del token para el admin.
// Todo es un extra: si algo falla, la app sigue igual y no se avisa a nadie
// salvo cuando la persona ha pulsado un botón de PSN.
import { SUPABASE_BASE, SUPABASE_KEY } from './config.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';

const URL_PSN = `${SUPABASE_BASE}/functions/v1/psn`;
const AUTO_CADA_MS = 6 * 60 * 60 * 1000;      // sincronizar solo si pasaron 6 h
const ESTADO_CADA_MS = 12 * 60 * 60 * 1000;   // el admin revisa el token cada 12 h
const CLAVE_INTENTO = 'cvj.psn.intento';
const CLAVE_ESTADO = 'cvj.psn.estado';

export const GUIA_PRIVACIDAD = '#guia-psn';

/** Mensajes para cada código de error de la función. */
const MENSAJES = {
  privado: 'Tu perfil de PlayStation no deja ver los juegos o los trofeos. Cambia la privacidad y vuelve a sincronizar.',
  no_existe: 'No hay ningún usuario de PlayStation con ese ID online. Revisa que esté bien escrito.',
  id_no_valido: 'Ese ID online no parece válido: tiene entre 3 y 16 letras, números, - o _.',
  npsso_caducado: 'La conexión con PlayStation está caducada. El admin del grupo tiene que renovarla.',
  falta_npsso: 'La conexión con PlayStation aún no está configurada.',
  sin_funcion: 'La sincronización con PlayStation aún no está activada.',
  sin_vincular: 'Primero vincula tu ID online de PlayStation.',
  red: 'Sin conexión. Prueba otra vez en un momento.',
  psn_error: 'PlayStation no ha respondido bien. Prueba más tarde.',
  interno: 'La sincronización ha fallado por un error inesperado. Prueba más tarde.',
  bd: 'No se ha podido guardar en la base de datos. Prueba más tarde.',
};
export const mensajePsn = (r) => MENSAJES[r?.codigo] ?? r?.error ?? 'No se ha podido conectar con PlayStation.';

/** Llama a la función psn. Nunca lanza: devuelve { ok, codigo, error, ... }. */
export async function llamarPsn(accion, extra = {}, signal) {
  try {
    const r = await fetch(URL_PSN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ accion, ...extra }),
      signal,
    });
    const d = await r.json().catch(() => null);
    if (r.status === 404 && !d?.codigo) return { ok: false, codigo: 'sin_funcion', error: MENSAJES.sin_funcion };
    if (!d) return { ok: false, codigo: 'psn_error', error: `Respuesta ${r.status}` };
    return d.ok === undefined ? { ok: r.ok, ...d } : d;
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    return { ok: false, codigo: 'red', error: MENSAJES.red };
  }
}

// ---------------------------------------------------------------------------
// Acciones del usuario (botones de Ajustes)
// ---------------------------------------------------------------------------
export async function vincular(usuarioId, onlineId) {
  const r = await llamarPsn('vincular', { usuario_id: usuarioId, online_id: onlineId });
  if (r.ok) await datos.refrescar();
  return r;
}

export async function desvincular(usuarioId) {
  const r = await llamarPsn('desvincular', { usuario_id: usuarioId });
  if (r.ok) await datos.refrescar();
  return r;
}

let sincronizando = null;
/** Sincroniza (una sola a la vez) y refresca los datos al terminar. */
export function sincronizar(usuarioId) {
  if (sincronizando) return sincronizando;
  try { localStorage.setItem(CLAVE_INTENTO, String(Date.now())); } catch { /* nada */ }
  sincronizando = llamarPsn('sincronizar', { usuario_id: usuarioId })
    .then(async (r) => {
      if (r.ok) await datos.refrescar();
      return r;
    })
    .finally(() => { sincronizando = null; });
  return sincronizando;
}
export const estaSincronizando = () => !!sincronizando;

// ---------------------------------------------------------------------------
// Sincronización automática al abrir la app (en segundo plano, sin avisos)
// ---------------------------------------------------------------------------
let autoHecha = false;
/** Se llama cada vez que cambian los datos; actúa una sola vez por sesión. */
export function revisarAutomatico() {
  if (autoHecha) return;
  const yo = usuarioActual();
  const u = yo && datos.usuario(yo.id);
  if (!u || !('psn_account_id' in u)) return; // aún sin datos (o sin la migración de PSN)
  autoHecha = true;
  if (!u.psn_account_id) return;
  const ultima = u.psn_sincronizado_en ? new Date(u.psn_sincronizado_en).getTime() : 0;
  let intento = 0;
  try { intento = Number(localStorage.getItem(CLAVE_INTENTO) || 0); } catch { /* nada */ }
  const ahora = Date.now();
  if (ahora - ultima < AUTO_CADA_MS || ahora - intento < AUTO_CADA_MS) return;
  // Sin bloquear nada: cuando el navegador esté libre.
  const lanzar = () => sincronizar(u.id).then((r) => {
    if (!r.ok) console.info('[psn] Sincronización automática sin éxito:', r.codigo);
  });
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 2000)))(lanzar);
}

// ---------------------------------------------------------------------------
// Estado del token (solo admin)
// ---------------------------------------------------------------------------
const oyentes = new Set();
export function suscribirEstado(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function leerEstadoGuardado() {
  try { return JSON.parse(localStorage.getItem(CLAVE_ESTADO) || 'null'); } catch { return null; }
}

/** Último estado conocido del token (para el aviso de Inicio). */
export function estadoGuardado() {
  return leerEstadoGuardado()?.estado ?? null;
}

/** Pide el estado a la función y lo guarda. */
export async function pedirEstado() {
  const r = await llamarPsn('estado');
  if (r.ok || r.codigo !== 'red') {
    try { localStorage.setItem(CLAVE_ESTADO, JSON.stringify({ cuando: Date.now(), estado: r })); } catch { /* nada */ }
    oyentes.forEach((fn) => { try { fn(r); } catch (e) { console.error(e); } });
  }
  return r;
}

let adminRevisado = false;
/** Si soy admin, revisa el token como mucho cada 12 h (en segundo plano). */
export function revisarAdmin() {
  if (adminRevisado) return;
  const yo = usuarioActual();
  const u = yo && datos.usuario(yo.id);
  if (!u || !('es_admin' in u)) return;
  adminRevisado = true;
  if (!u.es_admin) return;
  const g = leerEstadoGuardado();
  if (g && Date.now() - g.cuando < ESTADO_CADA_MS) return;
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 3000)))(() => { pedirEstado(); });
}

/** ¿Hay que enseñarle al admin el aviso de renovar el token? */
export function hayQueRenovar() {
  const yo = usuarioActual();
  const u = yo && datos.usuario(yo.id);
  if (!u?.es_admin) return false;
  const e = estadoGuardado();
  return !!(e && (e.necesita_npsso || e.codigo === 'npsso_caducado' || e.codigo === 'falta_npsso'));
}

/** Para cerrar sesión: que el siguiente usuario empiece de cero. */
export function olvidar() {
  autoHecha = false;
  adminRevisado = false;
  try { localStorage.removeItem(CLAVE_ESTADO); localStorage.removeItem(CLAVE_INTENTO); } catch { /* nada */ }
}

/** Nombre de PSN para buscarlo: sin "™", "PS4 & PS5", "Edición Estándar"... (como en la función). */
export function limpiarNombrePsn(nombre) {
  return String(nombre ?? '')
    .replace(/[™®©]/g, '')
    .replace(/\b(ps4|ps5)\s+(versi[oó]n|version)\b/gi, ' ')
    .replace(/\bplay\s*station\s*(4|5)\b/gi, ' ')
    .replace(/\(?\b(ps4|ps5)\b(\s*(&|and|y|\/)\s*\b(ps4|ps5)\b)?\)?/gi, ' ')
    .replace(/\b(standard|digital|deluxe|ultimate|gold|complete|definitive|premium|game of the year|goty)\s+(edition|bundle)\b/gi, ' ')
    .replace(/\b(edici[oó]n)\s+(est[aá]ndar|digital|deluxe|completa|definitiva)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
