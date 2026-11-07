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
  const cod = normalizarCodigo(codigo);
  const hash = await hashCodigo(cod);
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
  if (resp.data.activo === false) throw Object.assign(new Error('Código no válido'), { tipo: 'codigo' });
  const { activo: _, ...usuario } = resp.data;
  guardar({ usuario, desde: new Date().toISOString() });
  return usuario;
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
