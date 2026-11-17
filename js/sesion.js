// Login con código personal. La sesión se guarda en localStorage y no se vuelve a pedir.
import { cliente } from './supabase.js';
import { normalizarCodigo, hashCodigo } from './codigo.js';

const CLAVE = 'cvj.sesion';
const CAMPOS_USUARIO = 'id, nombre, inicial, color, acento';

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
  let resp;
  try {
    const sb = await cliente();
    resp = await sb.from('usuarios').select(CAMPOS_USUARIO + ', activo').eq('codigo_hash', hash).maybeSingle();
    if (resp.error && /activo/.test(resp.error.message)) resp = await sb.from('usuarios').select(CAMPOS_USUARIO).eq('codigo_hash', hash).maybeSingle();
  } catch (e) {
    throw Object.assign(new Error('Sin conexión'), { tipo: 'red', causa: e });
  }
  if (resp.error) throw Object.assign(new Error(resp.error.message), { tipo: 'red' });
  if (!resp.data) throw Object.assign(new Error('Código no válido'), { tipo: 'codigo' });
  // Desactivado por el admin: no puede entrar (se dice igual que un código que no vale).
  // Expulsado: no entra; se queda en su pantalla de difunto (puede apelar con este código).
  if (resp.data.activo === false) {
    guardarDifunto({ id: resp.data.id, hash });
    throw Object.assign(new Error('Código enterrado'), { tipo: 'difunto', usuarioId: resp.data.id });
  }
  const { activo: _, ...usuario } = resp.data;
  olvidarDifunto();
  guardar({ usuario, desde: new Date().toISOString() });
  return usuario;
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
