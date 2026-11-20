// Preferencias pequeñas de interfaz, guardadas en la cuenta (usuarios.preferencias, migración
// 049). Sin el dato, lo de cada dispositivo.
//   · tiers: 'compacta' | 'completa' (por defecto: compacta en el móvil, completa en escritorio).
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';
import { aviso } from './ui.js';

const mias = () => datos.usuario(usuarioActual()?.id)?.preferencias ?? {};

export function preferencia(clave, defecto = null) {
  const v = mias()[clave];
  return v === undefined || v === null ? defecto : v;
}

export function guardarPreferencia(clave, valor) {
  const yo = usuarioActual();
  if (!yo) return;
  datos.actualizarUsuario(yo.id, { preferencias: { ...mias(), [clave]: valor } }, aviso, 'No se ha podido guardar. Se ha deshecho el cambio.');
}

/** Vista de las tier lists: la elegida o, si no, la del dispositivo. */
export const modoTiers = () => preferencia('tiers') ?? (window.matchMedia?.('(min-width: 768px)').matches ? 'completa' : 'compacta');
