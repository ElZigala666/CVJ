// Datos del grupo en memoria.
// Al arrancar se pinta al instante desde localStorage y se refresca en segundo plano.
// Todas las métricas se calculan en el cliente (son pocos datos).
import { cliente } from './supabase.js';
import { mediaGrupo, recomendacionGrupo } from './notas.js';

const CLAVE = 'cvj.datos.v1';
const LIMITE_ACTIVIDAD = 60;

const vacio = () => ({ usuarios: [], valoraciones: [], juegos: [], actividad: [], cargadoEn: null });

export const estado = vacio();
let indices = construirIndices(estado);
const oyentes = new Set();
let refrescando = null;

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------
function leerCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (c && Array.isArray(c.usuarios)) Object.assign(estado, vacio(), c);
  } catch { /* caché rota: se ignora */ }
  indices = construirIndices(estado);
}

function guardarCache() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
  } catch { /* sin espacio o modo privado */ }
}

/** Pinta desde caché (síncrono) y lanza el refresco en segundo plano. */
export function iniciar() {
  leerCache();
  avisar();
  refrescar();
}

/** Descarga todo de Supabase de golpe. */
export function refrescar() {
  if (refrescando) return refrescando;
  refrescando = (async () => {
    const sb = await cliente();
    const [u, v, j, a] = await Promise.all([
      sb.from('usuarios').select('id, nombre, inicial, color, acento, creado_en').order('creado_en'),
      sb.from('valoraciones').select('*'),
      sb.from('juegos').select('*'),
      sb.from('actividad').select('*').order('creado_en', { ascending: false }).limit(LIMITE_ACTIVIDAD),
    ]);
    const error = u.error || v.error || j.error || a.error;
    if (error) throw new Error(error.message);
    Object.assign(estado, {
      usuarios: u.data,
      valoraciones: v.data,
      juegos: j.data,
      actividad: a.data,
      cargadoEn: new Date().toISOString(),
    });
    indices = construirIndices(estado);
    guardarCache();
    avisar();
  })()
    .catch((e) => {
      console.warn('[datos] No se ha podido refrescar:', e.message || e);
    })
    .finally(() => {
      refrescando = null;
    });
  return refrescando;
}

export function borrarCache() {
  try { localStorage.removeItem(CLAVE); } catch { /* nada */ }
  Object.assign(estado, vacio());
  indices = construirIndices(estado);
}

// ---------------------------------------------------------------------------
// Suscripción a cambios
// ---------------------------------------------------------------------------
export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function avisar() {
  for (const fn of oyentes) {
    try { fn(estado); } catch (e) { console.error(e); }
  }
}

// ---------------------------------------------------------------------------
// Índices y consultas
// ---------------------------------------------------------------------------
function construirIndices(s) {
  const usuarios = new Map(s.usuarios.map((u) => [u.id, u]));
  const juegos = new Map(s.juegos.map((j) => [Number(j.igdb_id), j]));
  const porJuego = new Map();
  for (const v of s.valoraciones) {
    const id = Number(v.juego_id);
    if (!porJuego.has(id)) porJuego.set(id, []);
    porJuego.get(id).push(v);
  }
  return { usuarios, juegos, porJuego };
}

export const usuario = (id) => indices.usuarios.get(id) ?? null;
export const juego = (igdbId) => indices.juegos.get(Number(igdbId)) ?? null;
export const valoracionesDeJuego = (igdbId) => indices.porJuego.get(Number(igdbId)) ?? [];

/** Métricas del grupo para un juego. */
export function statsJuego(igdbId) {
  const vals = valoracionesDeJuego(igdbId);
  return {
    ...mediaGrupo(vals),                 // media, letra, votos
    recomendacion: recomendacionGrupo(vals),
    jugadores: vals.filter((v) => v.estado !== 'pendiente').length,
    valoraciones: vals,
  };
}

/** Guarda o actualiza un juego en memoria (p. ej. tras pedir su ficha a IGDB). */
export function recordarJuego(fila) {
  const id = Number(fila.igdb_id);
  const i = estado.juegos.findIndex((j) => Number(j.igdb_id) === id);
  if (i >= 0) estado.juegos[i] = { ...estado.juegos[i], ...fila };
  else estado.juegos.push(fila);
  indices = construirIndices(estado);
  guardarCache();
}

// ---------------------------------------------------------------------------
// Escrituras optimistas
// ---------------------------------------------------------------------------
/**
 * Aplica un cambio en memoria al momento, guarda por detrás y, si falla,
 * lo deshace y avisa.
 * @param {{ aplicar: (estado)=>void, revertir: (estado)=>void, guardar: (sb)=>Promise<{error?:any}>, mensajeError?: string, onError?: (msg:string)=>void }} op
 */
export async function escribirOptimista({ aplicar, revertir, guardar, mensajeError = 'No se ha podido guardar. Se ha deshecho el cambio.', onError }) {
  aplicar(estado);
  indices = construirIndices(estado);
  avisar();
  try {
    const sb = await cliente();
    const r = await guardar(sb);
    if (r?.error) throw r.error;
    guardarCache();
    return true;
  } catch (e) {
    console.warn('[datos] Escritura fallida:', e?.message || e);
    revertir(estado);
    indices = construirIndices(estado);
    avisar();
    onError?.(mensajeError);
    return false;
  }
}
