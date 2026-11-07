// Steam: conectar con el inicio de sesión OFICIAL de Steam (OpenID 2.0), sincronizar y
// desconectar. Steam vuelve a la propia app (?steam=vuelta&openid.…); la función
// "steam" valida esa respuesta con Steam antes de aceptar la cuenta.
// Como las demás plataformas, es un extra: si falla, la app sigue igual.
import { SUPABASE_BASE, SUPABASE_KEY } from './config.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';

const URL_STEAM = `${SUPABASE_BASE}/functions/v1/steam`;
const OPENID = 'https://steamcommunity.com/openid/login';
const AUTO_CADA_MS = 6 * 60 * 60 * 1000;
const CLAVE_INTENTO = 'cvj.steam.intento';
const CLAVE_ETIQUETA = 'cvj.steam.etiqueta';

const MENSAJES = {
  privado: 'Tu biblioteca de Steam es privada. Mira cómo hacerla pública aquí debajo.',
  no_valido: 'Steam no ha confirmado el inicio de sesión. Vuelve a intentarlo.',
  cancelado: 'No se ha completado el inicio de sesión en Steam.',
  sin_conectar: 'Primero conecta tu cuenta de Steam.',
  sin_funcion: 'La conexión con Steam aún no está activada.',
  sin_clave: 'La conexión con Steam aún no está configurada.',
  clave_api: 'La conexión del grupo con Steam no funciona ahora mismo.',
  limite: 'Steam pide esperar un poco. Prueba en unos minutos.',
  red: 'Sin conexión. Prueba otra vez en un momento.',
  steam_error: 'Steam no ha respondido bien. Prueba más tarde.',
  interno: 'Ha fallado por un error inesperado. Prueba más tarde.',
  bd: 'No se ha podido guardar en la base de datos. Prueba más tarde.',
};
export const mensajeSteam = (r) => MENSAJES[r?.codigo] ?? r?.error ?? 'No se ha podido conectar con Steam.';

/** Llama a la función steam. Nunca lanza: devuelve { ok, codigo, error, ... }. */
export async function llamarSteam(accion, extra = {}) {
  try {
    const r = await fetch(URL_STEAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ accion, ...extra }),
    });
    const d = await r.json().catch(() => null);
    if (r.status === 404 && !d?.codigo) return { ok: false, codigo: 'sin_funcion', error: MENSAJES.sin_funcion };
    if (!d) return { ok: false, codigo: 'steam_error', error: `Respuesta ${r.status}` };
    return d.ok === undefined ? { ok: r.ok, ...d } : d;
  } catch {
    return { ok: false, codigo: 'red', error: MENSAJES.red };
  }
}

/** Base de la web (https://…/CVJ/) a la que vuelve Steam. */
const base = () => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;

/** Lleva al inicio de sesión de Steam. etiqueta: opcional ("Cuenta 2"). */
export function irAConectar(etiqueta = '') {
  try { sessionStorage.setItem(CLAVE_ETIQUETA, etiqueta.trim()); } catch { /* nada */ }
  const p = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${base()}?steam=vuelta`,
    'openid.realm': base(),
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  location.href = `${OPENID}?${p}`;
}

let resultadoVuelta = null;
/** Lo que pasó al volver de Steam (para enseñarlo en Ajustes una vez). */
export function tomarResultado() {
  const r = resultadoVuelta;
  resultadoVuelta = null;
  return r;
}

/**
 * Al arrancar la app: si venimos de Steam (?steam=vuelta&openid.…), quita esos
 * parámetros de la dirección y manda la respuesta a validar. Devuelve una promesa
 * con el resultado (o null si no venimos de Steam).
 */
export function revisarVuelta() {
  const q = new URLSearchParams(location.search);
  if (q.get('steam') !== 'vuelta') return null;
  const openid = {};
  for (const [k, v] of q) if (k.startsWith('openid.')) openid[k] = v;
  history.replaceState(history.state, '', `${location.pathname}#perfil`);
  const yo = usuarioActual();
  if (!yo) return null;
  let etiqueta = '';
  try { etiqueta = sessionStorage.getItem(CLAVE_ETIQUETA) || ''; sessionStorage.removeItem(CLAVE_ETIQUETA); } catch { /* nada */ }
  return llamarSteam('conectar', { usuario_id: yo.id, openid, ...(etiqueta ? { etiqueta } : {}) }).then(async (r) => {
    resultadoVuelta = r;
    if (r.ok) { await datos.refrescar(); refrescarLuego(r.sincronizacion); }
    return r;
  });
}

function refrescarLuego(r) {
  if (!r?.pendientes) return;
  for (const ms of [15_000, 45_000, 100_000]) setTimeout(() => datos.refrescar(), ms);
}

export async function desconectar(usuarioId, cuentaId) {
  const r = await llamarSteam('desconectar', { usuario_id: usuarioId, ...(cuentaId ? { cuenta_id: cuentaId } : {}) });
  if (r.ok) await datos.refrescar();
  return r;
}

let sincronizando = null;
export function sincronizar(usuarioId) {
  if (sincronizando) return sincronizando;
  try { localStorage.setItem(CLAVE_INTENTO, String(Date.now())); } catch { /* nada */ }
  sincronizando = llamarSteam('sincronizar', { usuario_id: usuarioId })
    .then(async (r) => {
      if (r.ok) { await datos.refrescar(); refrescarLuego(r); }
      return r;
    })
    .finally(() => { sincronizando = null; });
  return sincronizando;
}
export const estaSincronizando = () => !!sincronizando;

let autoHecha = false;
/** Al abrir la app: si alguna cuenta de Steam lleva más de 6 h sin sincronizar. */
export function revisarAutomatico() {
  if (autoHecha) return;
  const yo = usuarioActual();
  if (!yo || !datos.usuario(yo.id)) return;
  autoHecha = true;
  const cs = datos.cuentasDe(yo.id, 'steam');
  if (!cs.length) return;
  const ultima = Math.min(...cs.map((c) => (c.sincronizado_en ? new Date(c.sincronizado_en).getTime() : 0)));
  let intento = 0;
  try { intento = Number(localStorage.getItem(CLAVE_INTENTO) || 0); } catch { /* nada */ }
  const ahora = Date.now();
  if (ahora - ultima < AUTO_CADA_MS || ahora - intento < AUTO_CADA_MS) return;
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 3000)))(() => {
    sincronizar(yo.id).then((r) => { if (!r.ok) console.info('[steam] Sincronización automática sin éxito:', r.codigo); });
  });
}

export function olvidar() {
  autoHecha = false;
  try { localStorage.removeItem(CLAVE_INTENTO); } catch { /* nada */ }
}
