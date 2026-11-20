// Barra de navegación del móvil, personalizable (Ajustes → Barra de navegación):
//   · fijos: Inicio (siempre, la primera) y el "+" (siempre, en el centro);
//   · el resto, de 2 a 4 pestañas elegidas y ordenadas entre OPCIONES;
//   · "Pestaña al abrir la app": Inicio o cualquiera de las elegidas.
// Se guarda en la cuenta (usuarios.barra, migración 048) y una copia en este dispositivo
// ("cvj.barra") para abrir ya en la pestaña buena. El deslizamiento entre pestañas sigue
// este orden (principales()). En escritorio la barra lateral no cambia (js/app.js).
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';

export const OPCIONES = [
  { id: 'buscar', texto: 'Buscar', icono: 'buscar' },
  { id: 'rankings', texto: 'Rankings', icono: 'rankings' },
  { id: 'perfil', texto: 'Perfil', icono: 'perfil' },
  { id: 'columnas', texto: 'Columnas', icono: 'columnas' },
  { id: 'tierlist', texto: 'Tier list', icono: 'trofeo' },
  { id: 'cifras', texto: 'Estadísticas', icono: 'diana' },
  { id: 'biblioteca', texto: 'Biblioteca', icono: 'monitor' },
  { id: 'cementerio', texto: 'Cementerio', icono: 'lapida' },
  { id: 'propuestas', texto: 'Propuestas', icono: 'urna' },
  { id: 'avisos', texto: 'Avisos', icono: 'aviso' },
];
export const INICIO = { id: 'inicio', texto: 'Inicio', icono: 'inicio' };
export const MIN = 2;
export const MAX = 4;
export const DEFECTO = Object.freeze({ pestanas: ['buscar', 'rankings', 'perfil'], inicio: 'inicio' });
const IDS = new Set(OPCIONES.map((o) => o.id));
export const opcion = (id) => (id === 'inicio' ? INICIO : OPCIONES.find((o) => o.id === id) ?? null);

/** Una configuración válida (lo que no lo sea, la de siempre). */
export function normalizar(c) {
  const pestanas = [...new Set((Array.isArray(c?.pestanas) ? c.pestanas : []).filter((x) => IDS.has(x)))].slice(0, MAX);
  if (pestanas.length < MIN) return { ...DEFECTO, pestanas: [...DEFECTO.pestanas] };
  const inicio = c?.inicio === 'inicio' || pestanas.includes(c?.inicio) ? c.inicio : 'inicio';
  return { pestanas, inicio };
}

const leerLocal = () => { try { return JSON.parse(localStorage.getItem('cvj.barra') || 'null'); } catch { return null; } };
const guardarLocal = (c) => { try { localStorage.setItem('cvj.barra', JSON.stringify(c)); } catch { /* nada */ } };

/** La configuración de ahora: la de la cuenta (o, mientras llega, la de este dispositivo). */
export function config() {
  const u = datos.usuario(usuarioActual()?.id);
  if (u && 'barra' in u && u.barra) {
    const c = normalizar(u.barra);
    const l = leerLocal();
    if (JSON.stringify(l) !== JSON.stringify(c)) guardarLocal(c);
    return c;
  }
  return normalizar(leerLocal() ?? DEFECTO);
}

/** Las pestañas principales, en orden (Inicio la primera): las de la barra y las de deslizar. */
export const principales = () => ['inicio', ...config().pestanas];

/** Guardar (en este dispositivo al momento y en la cuenta). */
export function guardar(c, onError) {
  const n = normalizar(c);
  guardarLocal(n);
  const yo = usuarioActual();
  if (yo) datos.actualizarUsuario(yo.id, { barra: n }, onError, 'No se ha podido guardar la barra. Se ha deshecho el cambio.');
  return n;
}
