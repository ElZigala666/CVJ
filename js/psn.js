// PlayStation (no oficial): cada usuario conecta SU PROPIA cuenta pegando su
// código (NPSSO), que la función psn canjea al momento por un permiso de lectura.
// Todo es un extra: si algo falla, la app sigue igual y no se avisa a nadie
// salvo cuando la persona ha pulsado un botón de PSN (o su conexión caduca).
import { SUPABASE_BASE, SUPABASE_KEY } from './config.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';

const URL_PSN = `${SUPABASE_BASE}/functions/v1/psn`;
const AUTO_CADA_MS = 6 * 60 * 60 * 1000; // sincronizar solo si pasaron 6 h
const CLAVE_INTENTO = 'cvj.psn.intento';
export const LARGO_NPSSO = 64;

export const URL_INICIAR_SESION = 'https://www.playstation.com';
export const URL_CODIGO = 'https://ca.account.sony.com/api/v1/ssocookie';

/** Mensajes para cada código de error de la función. */
const MENSAJES = {
  codigo_no_valido: 'Ese código no vale: puede que haya caducado o que no sea el de tu sesión. Repite los pasos 1 y 2 y copia el código otra vez.',
  reconectar: 'Tu conexión con PlayStation ha caducado. Vuelve a conectarla con los tres pasos.',
  sin_conectar: 'Primero conecta tu cuenta de PlayStation.',
  sin_funcion: 'La conexión con PlayStation aún no está activada.',
  red: 'Sin conexión. Prueba otra vez en un momento.',
  psn_error: 'PlayStation no ha respondido bien. Prueba más tarde.',
  interno: 'Ha fallado por un error inesperado. Prueba más tarde.',
  bd: 'No se ha podido guardar en la base de datos. Prueba más tarde.',
};
export const mensajePsn = (r) => MENSAJES[r?.codigo] ?? r?.error ?? 'No se ha podido conectar con PlayStation.';

/**
 * Saca el NPSSO de lo que pegue la persona: el JSON entero ({"npsso":"..."})
 * o el valor suelto. Devuelve { npsso } o { error }.
 */
export function extraerNpsso(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return { error: 'Pega primero el código que copiaste en el paso 2.' };
  if (/"?error"?\s*:/i.test(t) && !/npsso/i.test(t)) {
    return { error: 'Eso es el mensaje de error de Sony: la sesión no estaba iniciada en este navegador. Repite el paso 1 en el mismo navegador.' };
  }
  const m = t.match(/"?npsso"?\s*[:=]\s*"?([A-Za-z0-9_-]+)/i);
  const npsso = (m ? m[1] : t).replace(/[\s"'{}]/g, '');
  if (!/^[A-Za-z0-9_-]+$/.test(npsso)) return { error: 'Ese texto no parece el código. Copia todo lo que sale en el paso 2 y pégalo tal cual.' };
  if (npsso.length !== LARGO_NPSSO) {
    return { error: `El código debe tener ${LARGO_NPSSO} caracteres y este tiene ${npsso.length}. Copia todo el texto del paso 2 y pégalo otra vez.` };
  }
  return { npsso };
}

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
/** Conecta la cuenta con el NPSSO ya validado; la función hace la primera sincronización. */
export async function conectar(usuarioId, npsso) {
  try { localStorage.setItem(CLAVE_INTENTO, String(Date.now())); } catch { /* nada */ }
  const r = await llamarPsn('conectar', { usuario_id: usuarioId, npsso });
  if (r.ok) { await datos.refrescar(); refrescarLuego(r.sincronizacion); }
  return r;
}

/** La función sigue identificando juegos en segundo plano: refrescar unas cuantas veces. */
function refrescarLuego(r) {
  if (!r?.pendientes) return;
  for (const ms of [15_000, 45_000, 100_000, 150_000]) setTimeout(() => datos.refrescar(), ms);
}

export async function desconectar(usuarioId) {
  const r = await llamarPsn('desconectar', { usuario_id: usuarioId });
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
      // "reconectar": la función ya lo ha apuntado en el usuario; refrescar para enseñar el aviso.
      if (r.ok || r.codigo === 'reconectar') await datos.refrescar();
      if (r.ok) refrescarLuego(r);
      return r;
    })
    .finally(() => { sincronizando = null; });
  return sincronizando;
}
export const estaSincronizando = () => !!sincronizando;

/** ¿Mi conexión con PlayStation ha caducado? (para el aviso de Inicio) */
export function hayQueReconectar() {
  const yo = usuarioActual();
  const u = yo && datos.usuario(yo.id);
  return !!(u?.psn_reconectar && u.psn_account_id);
}

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
  if (!u.psn_account_id || u.psn_reconectar) return;
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

/** Para cerrar sesión: que el siguiente usuario empiece de cero. */
export function olvidar() {
  autoHecha = false;
  try { localStorage.removeItem(CLAVE_INTENTO); localStorage.removeItem('cvj.psn.estado'); } catch { /* nada */ }
}

/** Abre el asistente de PlayStation (lo escucha app.js, que abre Ajustes). */
export function abrirAsistente() {
  window.dispatchEvent(new CustomEvent('cvj:psn-asistente'));
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
