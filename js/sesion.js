// Login con código personal. La sesión se guarda en localStorage y no se vuelve a pedir.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { normalizarCodigo, hashCodigo } from './codigo.js';

const CLAVE = 'cvj.sesion';

let sesion = leer();

function leer() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    return s && s.usuario && s.usuario.id ? s : null;
  } catch {
    return null;
  }
}

function guardar(s) {
  sesion = s;
  try {
    if (s) localStorage.setItem(CLAVE, JSON.stringify(s));
    else localStorage.removeItem(CLAVE);
  } catch { /* modo privado: la sesión dura lo que la pestaña */ }
}

/** Usuario con sesión iniciada, o null. */
export function usuarioActual() {
  return sesion?.usuario ?? null;
}

/**
 * Comprueba el código contra usuarios.codigo_hash.
 * @returns {Promise<object>} el usuario
 * @throws {Error} con .tipo = 'codigo' (no existe) o 'red'
 */
export async function entrar(codigo) {
  return entrarConHash(await hashCodigo(normalizarCodigo(codigo)));
}

/** Lo mismo con el hash ya calculado (al volver tras una apelación aceptada). */
export async function entrarConHash(hash) {
  let datos;
  try {
    // El hash no se puede leer con la clave pública (migración 043): lo comprueba el servidor.
    const r = await fetch(`${SUPABASE_URL}rpc/entrar`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_hash: hash }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const t = await r.text();
    datos = t ? JSON.parse(t) : null;
  } catch (e) {
    throw Object.assign(new Error('Sin conexión'), { tipo: 'red', causa: e });
  }
  return entrarCon(datos, hash);
}

/** Sin código, desde un dispositivo donde ya entró con él (al volver de la muerte). */
export async function entrarConDispositivo(id) {
  let datos;
  try {
    const r = await fetch(`${SUPABASE_URL}rpc/entrar_dispositivo`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_usuario: id, p_dispositivo: dispositivo() }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const t = await r.text();
    datos = t ? JSON.parse(t) : null;
  } catch (e) {
    throw Object.assign(new Error('Sin conexión'), { tipo: 'red', causa: e });
  }
  if (!datos || datos.activo === false) throw Object.assign(new Error('No reconocido'), { tipo: 'codigo' });
  return entrarCon(datos, null);
}

function entrarCon(datos, hash) {
  if (!datos) throw Object.assign(new Error('Código no válido'), { tipo: 'codigo' });
  // Expulsado: no entra; se queda en su pantalla de difunto (puede apelar con este código).
  if (datos.activo === false) {
    guardarDifunto({ id: datos.id, hash });
    throw Object.assign(new Error('Código enterrado'), { tipo: 'difunto', usuarioId: datos.id });
  }
  const { activo: _, ...usuario } = datos;
  olvidarDifunto();
  guardar({ usuario, hash: hash ?? null, desde: new Date().toISOString() });
  latido(true);
  return usuario;
}

/** El hash de mi código, si entré con él en este dispositivo (para no pedírmelo si me expulsan). */
export const hashSesion = () => sesion?.hash ?? null;

// ---------------------------------------------------------------------------
// Este dispositivo (un id al azar, para siempre) y el latido: "aquí está alguien activo".
// Sirve para que nadie acepte por otro un enlace de reanimar o proponer desde su móvil o
// su wifi, y para reconocer a un expulsado en su propio móvil sin pedirle el código.
// ---------------------------------------------------------------------------
const CLAVE_DISPOSITIVO = 'cvj.dispositivo';
let idDispositivo = null;
export function dispositivo() {
  if (idDispositivo) return idDispositivo;
  try { idDispositivo = localStorage.getItem(CLAVE_DISPOSITIVO); } catch { /* modo privado */ }
  if (!idDispositivo || !/^[0-9A-Za-z-]{8,64}$/.test(idDispositivo)) {
    idDispositivo = crypto.randomUUID?.() ?? `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    try { localStorage.setItem(CLAVE_DISPOSITIVO, idDispositivo); } catch { /* modo privado */ }
  }
  return idDispositivo;
}

let ultimoLatido = 0;
/** Como mucho cada 20 minutos (o ya, al entrar). */
export function latido(ya = false) {
  const u = sesion?.usuario;
  if (!u || (!ya && Date.now() - ultimoLatido < 20 * 60 * 1000)) return;
  ultimoLatido = Date.now();
  fetch(`${SUPABASE_URL}rpc/latido`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_usuario: u.id, p_dispositivo: dispositivo(), p_hash: sesion.hash ?? null }),
  }).catch(() => { ultimoLatido = 0; });
}

// Un expulsado en este dispositivo: su id y, si ha metido su código aquí, su hash (para
// apelar y ver la respuesta). Mientras esté, la app enseña su pantalla en vez del login.
const CLAVE_DIFUNTO = 'cvj.difunto';
export function difuntoGuardado() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_DIFUNTO) || 'null');
    return d?.id ? d : null;
  } catch { return null; }
}
export function guardarDifunto(d) {
  try { localStorage.setItem(CLAVE_DIFUNTO, JSON.stringify({ id: d.id, hash: d.hash ?? null })); } catch { /* modo privado */ }
}
export function olvidarDifunto() {
  try { localStorage.removeItem(CLAVE_DIFUNTO); } catch { /* nada */ }
}

/** Actualiza los datos del usuario guardado (nombre, color, acento...) si han cambiado. */
export function refrescarUsuario(usuario) {
  if (!sesion || !usuario || usuario.id !== sesion.usuario.id) return;
  const { id, nombre, inicial, color, acento } = usuario;
  guardar({ ...sesion, usuario: { id, nombre, inicial, color, acento, foto_url: usuario.foto_url ?? null } });
}

export function salir() {
  guardar(null);
}
