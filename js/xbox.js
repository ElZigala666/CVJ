// Xbox (OpenXBL): conectar con la cuenta de Microsoft, sincronizar y desconectar.
// Igual que PlayStation, es un extra: si falla, la app sigue igual.
// Límite gratuito de OpenXBL (~150 peticiones/hora): sincronización automática como
// mucho cada 12 h y "Sincronizar ahora" con 10 minutos de espera entre usos.
import { SUPABASE_BASE, SUPABASE_KEY } from './config.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';

const URL_XBOX = `${SUPABASE_BASE}/functions/v1/xbox`;
const AUTO_CADA_MS = 12 * 60 * 60 * 1000;
export const ESPERA_MS = 10 * 60 * 1000;
const CLAVE_INTENTO = 'cvj.xbox.intento';
const CLAVE_CODIGO = 'cvj.xbox.codigo';

const MENSAJES = {
  codigo_no_valido: 'Xbox no ha aceptado el inicio de sesión. Vuelve a pulsar «Conectar Xbox».',
  reconectar: 'Tu conexión con Xbox ha caducado. Vuelve a conectarla.',
  sin_conectar: 'Primero conecta tu cuenta de Xbox.',
  sin_funcion: 'La conexión con Xbox aún no está activada.',
  falta_clave: 'La conexión con Xbox aún no está configurada (falta la clave de la app de OpenXBL).',
  limite: 'Xbox ha llegado a su límite de peticiones por hora. Prueba más tarde.',
  red: 'Sin conexión. Prueba otra vez en un momento.',
  xbox_error: 'Xbox no ha respondido bien. Prueba más tarde.',
  interno: 'Ha fallado por un error inesperado. Prueba más tarde.',
  bd: 'No se ha podido guardar en la base de datos. Prueba más tarde.',
};
export const mensajeXbox = (r) => MENSAJES[r?.codigo] ?? r?.error ?? 'No se ha podido conectar con Xbox.';

/** Llama a la función xbox. Nunca lanza: devuelve { ok, codigo, error, ... }. */
export async function llamarXbox(accion, extra = {}) {
  try {
    const r = await fetch(URL_XBOX, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ accion, ...extra }),
    });
    const d = await r.json().catch(() => null);
    if (r.status === 404 && !d?.codigo) return { ok: false, codigo: 'sin_funcion', error: MENSAJES.sin_funcion };
    if (!d) return { ok: false, codigo: 'xbox_error', error: `Respuesta ${r.status}` };
    return d.ok === undefined ? { ok: r.ok, ...d } : d;
  } catch {
    return { ok: false, codigo: 'red', error: MENSAJES.red };
  }
}

/** "Conectar Xbox": pide la URL de inicio de sesión y va a ella (vuelve por xbox.html). */
export async function irAIniciarSesion() {
  const r = await llamarXbox('login');
  if (!r.ok || !r.url) return r;
  location.href = r.url;
  return { ok: true };
}

/** Código que dejó xbox.html al volver del inicio de sesión (y se borra). */
export function tomarCodigo() {
  try {
    const c = localStorage.getItem(CLAVE_CODIGO);
    localStorage.removeItem(CLAVE_CODIGO);
    return c;
  } catch { return null; }
}

/** Por si la URL de vuelta se configuró a la raíz de la web: ?code=... en la propia app. */
export function codigoEnLaUrl() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code');
  if (!code) return false;
  try { localStorage.setItem(CLAVE_CODIGO, code); } catch { /* nada */ }
  history.replaceState(history.state, '', location.pathname + '#conectar-xbox');
  return true;
}

let ultimaRespuesta = null;
/** Respuesta de la última sincronización (para refrescar luego si queda emparejado pendiente). */
function refrescarLuego(r) {
  ultimaRespuesta = r;
  if (!r?.pendientes) return;
  for (const ms of [15_000, 45_000, 100_000, 150_000]) setTimeout(() => datos.refrescar(), ms);
}

export async function conectar(usuarioId, code) {
  try { localStorage.setItem(CLAVE_INTENTO, String(Date.now())); } catch { /* nada */ }
  const r = await llamarXbox('conectar', { usuario_id: usuarioId, code });
  if (r.ok) { await datos.refrescar(); refrescarLuego(r.sincronizacion); }
  return r;
}

export async function desconectar(usuarioId) {
  const r = await llamarXbox('desconectar', { usuario_id: usuarioId });
  if (r.ok) await datos.refrescar();
  return r;
}

let sincronizando = null;
export function sincronizar(usuarioId) {
  if (sincronizando) return sincronizando;
  try { localStorage.setItem(CLAVE_INTENTO, String(Date.now())); } catch { /* nada */ }
  sincronizando = llamarXbox('sincronizar', { usuario_id: usuarioId })
    .then(async (r) => {
      if (r.ok || r.codigo === 'reconectar') await datos.refrescar();
      if (r.ok) refrescarLuego(r);
      return r;
    })
    .finally(() => { sincronizando = null; });
  return sincronizando;
}

/** Milisegundos que faltan para poder volver a pulsar "Sincronizar ahora" (0 si ya se puede). */
export function esperaRestante(u) {
  const ultima = u?.xbox_sincronizado_en ? new Date(u.xbox_sincronizado_en).getTime() : 0;
  return Math.max(0, ultima + ESPERA_MS - Date.now());
}

/** ¿Mi conexión con Xbox ha caducado? (aviso de Inicio) */
export function hayQueReconectar() {
  const yo = usuarioActual();
  const u = yo && datos.usuario(yo.id);
  return !!(u?.xbox_reconectar && u.xbox_xuid);
}

let autoHecha = false;
/** Sincronización automática al abrir la app: como mucho cada 12 h. */
export function revisarAutomatico() {
  if (autoHecha) return;
  const yo = usuarioActual();
  const u = yo && datos.usuario(yo.id);
  if (!u || !('xbox_xuid' in u)) return;
  autoHecha = true;
  if (!u.xbox_xuid || u.xbox_reconectar) return;
  const ultima = u.xbox_sincronizado_en ? new Date(u.xbox_sincronizado_en).getTime() : 0;
  let intento = 0;
  try { intento = Number(localStorage.getItem(CLAVE_INTENTO) || 0); } catch { /* nada */ }
  const ahora = Date.now();
  if (ahora - ultima < AUTO_CADA_MS || ahora - intento < AUTO_CADA_MS) return;
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 2500)))(() => {
    sincronizar(u.id).then((r) => { if (!r.ok) console.info('[xbox] Sincronización automática sin éxito:', r.codigo); });
  });
}

export function olvidar() {
  autoHecha = false;
  ultimaRespuesta = null;
  try { localStorage.removeItem(CLAVE_INTENTO); } catch { /* nada */ }
}

export const ultimaSincronizacion = () => ultimaRespuesta;
