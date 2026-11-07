// Xbox (OpenXBL): vincular por gamertag (con la clave de API del grupo), sincronizar y
// desvincular. Igual que PlayStation, es un extra: si falla, la app sigue igual.
// Límite gratuito de OpenXBL (~150 peticiones/hora PARA TODO EL GRUPO): sincronización
// automática como mucho cada 12 h y "Sincronizar ahora" con 10 minutos de espera.
import { SUPABASE_BASE, SUPABASE_KEY } from './config.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';

const URL_XBOX = `${SUPABASE_BASE}/functions/v1/xbox`;
const AUTO_CADA_MS = 12 * 60 * 60 * 1000;
export const ESPERA_MS = 10 * 60 * 1000;
const CLAVE_INTENTO = 'cvj.xbox.intento';

const MENSAJES = {
  no_existe: 'No hay ningún jugador de Xbox con ese gamertag. Revisa que esté bien escrito.',
  gamertag_no_valido: 'Ese gamertag no parece válido. Escríbelo tal cual sale en tu perfil de Xbox.',
  privado: 'No se ve tu historial de juegos de Xbox: es privado. Mira cómo hacerlo visible aquí debajo.',
  clave_api: 'La conexión del grupo con Xbox no funciona ahora mismo. Ya le sale el aviso al admin.',
  sin_vincular: 'Primero vincula tu gamertag de Xbox.',
  sin_funcion: 'La conexión con Xbox aún no está activada.',
  falta_clave: 'La conexión con Xbox aún no está configurada.',
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

let ultimaRespuesta = null;
/** Respuesta de la última sincronización (para refrescar luego si queda emparejado pendiente). */
function refrescarLuego(r) {
  ultimaRespuesta = r;
  if (!r?.pendientes) return;
  for (const ms of [15_000, 45_000, 100_000, 150_000]) setTimeout(() => datos.refrescar(), ms);
}

/** Vincula un gamertag (y la función hace la primera sincronización). */
export async function vincular(usuarioId, gamertag) {
  try { localStorage.setItem(CLAVE_INTENTO, String(Date.now())); } catch { /* nada */ }
  const r = await llamarXbox('vincular', { usuario_id: usuarioId, gamertag });
  if (r.ok) { await datos.refrescar(); refrescarLuego(r.sincronizacion); }
  return r;
}

export async function desvincular(usuarioId) {
  const r = await llamarXbox('desvincular', { usuario_id: usuarioId });
  if (r.ok) await datos.refrescar();
  return r;
}

let sincronizando = null;
export function sincronizar(usuarioId) {
  if (sincronizando) return sincronizando;
  try { localStorage.setItem(CLAVE_INTENTO, String(Date.now())); } catch { /* nada */ }
  sincronizando = llamarXbox('sincronizar', { usuario_id: usuarioId })
    .then(async (r) => {
      if (r.ok) await datos.refrescar();
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

/** Solo para el admin: ¿la clave de OpenXBL del grupo ha dejado de funcionar? */
export function claveConProblemas() {
  const yo = usuarioActual();
  if (!datos.usuario(yo?.id)?.es_admin) return null;
  const e = (datos.estado.servicios ?? []).find((x) => x.id === 'openxbl');
  return e && e.ok === false ? e : null;
}

let autoHecha = false;
/** Sincronización automática al abrir la app: como mucho cada 12 h. */
export function revisarAutomatico() {
  if (autoHecha) return;
  const yo = usuarioActual();
  const u = yo && datos.usuario(yo.id);
  if (!u || !('xbox_xuid' in u)) return;
  autoHecha = true;
  if (!u.xbox_xuid) return;
  const ultima = u.xbox_sincronizado_en ? new Date(u.xbox_sincronizado_en).getTime() : 0;
  let intento = 0;
  try { intento = Number(localStorage.getItem(CLAVE_INTENTO) || 0); } catch { /* nada */ }
  const ahora = Date.now();
  if (ahora - ultima < AUTO_CADA_MS || ahora - intento < AUTO_CADA_MS) return;
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 2500)))(() => {
    sincronizar(u.id).then((r) => { if (!r.ok) console.info('[xbox] Sincronización automática sin éxito:', r.codigo); });
  });
}

let horasPedidas = false;
/** Al abrir la app: si faltan horas de Xbox, pedir unas cuantas (como mucho cada 30 min). */
export function revisarHoras() {
  if (horasPedidas) return;
  const yo = usuarioActual();
  const u = yo && datos.usuario(yo.id);
  if (!u?.xbox_xuid) return;
  const filas = datos.bibliotecaDe(u.id).filter((f) => f.fuente === 'xbox' && !f.oculto);
  if (!filas.length || !('horas_en' in filas[0])) return;
  horasPedidas = true;
  const faltan = filas.some((f) => !f.horas_en || (f.ultima_vez && new Date(f.ultima_vez) > new Date(f.horas_en)));
  let ultima = 0;
  try { ultima = Number(localStorage.getItem('cvj.xbox.horas') || 0); } catch { /* nada */ }
  if (!faltan || Date.now() - ultima < 30 * 60 * 1000) return;
  try { localStorage.setItem('cvj.xbox.horas', String(Date.now())); } catch { /* nada */ }
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 4000)))(() => {
    llamarXbox('horas', { usuario_id: u.id }).then((r) => { if (r.ok && r.pedidas) datos.refrescar(); });
  });
}

export function olvidar() {
  horasPedidas = false;
  autoHecha = false;
  ultimaRespuesta = null;
  try { localStorage.removeItem(CLAVE_INTENTO); } catch { /* nada */ }
}

export const ultimaSincronizacion = () => ultimaRespuesta;
