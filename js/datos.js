// Datos del grupo en memoria.
// Al arrancar se pinta al instante desde localStorage y se refresca en segundo plano.
// Todas las métricas se calculan en el cliente (son pocos datos).
import { cliente } from './supabase.js';
import { mediaGrupo, recomendacionGrupo, repartoLetras, desviacionTipica, redondear } from './notas.js';

const CLAVE = 'cvj.datos.v1';
const LIMITE_ACTIVIDAD = 60;
const VENTANA_ACTIVIDAD_MS = 10 * 60 * 1000; // agrupar cambios del mismo juego en 10 min

const vacio = () => ({ usuarios: [], valoraciones: [], juegos: [], actividad: [], cargadoEn: null });

// Versión de los datos: sube cada vez que cambian (refresco, escritura o reversión).
// metricas.js la usa para memoizar los cálculos.
let version = 0;
export const versionDatos = () => version;

export const estado = vacio();
let indices = construirIndices(estado);
const oyentes = new Set();
const parciales = new Map(); // juegos vistos en Buscar que aún no están en la tabla
let refrescando = null;
let escriturasEnCurso = 0;
let refrescoAplazado = false;

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

const firma = (s) => JSON.stringify([s.usuarios, s.valoraciones, s.juegos, s.actividad]);

/** Pinta desde caché (síncrono) y lanza el refresco en segundo plano. */
export function iniciar() {
  leerCache();
  avisar();
  refrescar();
}

/** Descarga todo de Supabase de golpe. Si nada ha cambiado, no repinta. */
export function refrescar() {
  if (escriturasEnCurso) {
    // No pisar un cambio optimista con datos del servidor que aún no lo tienen.
    refrescoAplazado = true;
    return Promise.resolve();
  }
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
    if (escriturasEnCurso) { refrescoAplazado = true; return; }
    const nuevo = { usuarios: u.data, valoraciones: v.data, juegos: j.data, actividad: a.data };
    const cambia = firma(nuevo) !== firma(estado);
    Object.assign(estado, nuevo, { cargadoEn: new Date().toISOString() });
    guardarCache();
    if (cambia) {
      indices = construirIndices(estado);
      avisar();
    }
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
  parciales.clear();
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
  version++;
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
/** Juego de la tabla juegos (completo). */
export const juego = (igdbId) => indices.juegos.get(Number(igdbId)) ?? null;
/** Juego de la tabla o, si no está, lo que se sepa de él por Buscar. */
export const juegoConocido = (igdbId) => juego(igdbId) ?? parciales.get(Number(igdbId)) ?? null;
export const valoracionesDeJuego = (igdbId) => indices.porJuego.get(Number(igdbId)) ?? [];
export const miValoracion = (usuarioId, igdbId) =>
  valoracionesDeJuego(igdbId).find((v) => v.usuario_id === usuarioId) ?? null;

/** Métricas del grupo para un juego. */
export function statsJuego(igdbId) {
  const vals = valoracionesDeJuego(igdbId).filter((v) => indices.usuarios.size === 0 || indices.usuarios.has(v.usuario_id));
  return {
    ...mediaGrupo(vals),                 // media, letra, votos
    recomendacion: recomendacionGrupo(vals),
    reparto: repartoLetras(vals),
    desviacion: desviacionTipica(vals),
    jugadores: vals.filter((v) => v.estado !== 'pendiente').length,
    valoraciones: vals,
  };
}

/** Recuerda en memoria los juegos que salen en Buscar (no se guardan en la tabla). */
export function recordarParciales(lista) {
  for (const j of lista || []) {
    const id = Number(j.igdb_id);
    if (!indices.juegos.has(id)) parciales.set(id, { ...parciales.get(id), ...j });
  }
}

/** Guarda o actualiza un juego completo en memoria (tras pedir su ficha a IGDB). */
export function recordarJuego(fila) {
  const id = Number(fila.igdb_id);
  const i = estado.juegos.findIndex((j) => Number(j.igdb_id) === id);
  if (i >= 0) estado.juegos[i] = { ...estado.juegos[i], ...fila };
  else estado.juegos.push(fila);
  parciales.delete(id);
  indices = construirIndices(estado);
  guardarCache();
  avisar();
}

// ---------------------------------------------------------------------------
// Escrituras optimistas
// ---------------------------------------------------------------------------
/**
 * Aplica un cambio en memoria al momento, guarda por detrás y, si falla,
 * vuelve al estado anterior y avisa.
 * @param {(estado)=>void} aplicar  cambia estado.* (sustituyendo arrays, sin mutar filas)
 * @param {(sb)=>Promise<void>} guardar  lanza error si algo falla
 * @param {(msg:string)=>void} [onError]
 */
async function escribirOptimista(aplicar, guardar, onError, mensajeError = 'No se ha podido guardar. Se ha deshecho el cambio.') {
  const copia = { valoraciones: estado.valoraciones, actividad: estado.actividad, juegos: estado.juegos };
  escriturasEnCurso++;
  aplicar(estado);
  indices = construirIndices(estado);
  avisar();
  try {
    const sb = await cliente();
    await guardar(sb);
    guardarCache();
    return true;
  } catch (e) {
    console.warn('[datos] Escritura fallida:', e?.message || e);
    Object.assign(estado, copia);
    indices = construirIndices(estado);
    avisar();
    onError?.(mensajeError);
    return false;
  } finally {
    escriturasEnCurso--;
    if (!escriturasEnCurso && refrescoAplazado) {
      refrescoAplazado = false;
      refrescar();
    }
  }
}

const comprobar = (r) => { if (r?.error) throw r.error; return r; };

const TIPO_POR_ESTADO = { jugando: 'empezo', completado: 'completo', abandonado: 'abandono', pendiente: 'pendiente' };

/** Columnas de la tabla juegos a partir de lo que se sepa del juego. */
function filaJuego(j) {
  return {
    igdb_id: Number(j.igdb_id),
    nombre: j.nombre,
    slug: j.slug ?? null,
    cover_id: j.cover_id ?? null,
    anio: j.anio ?? null,
    plataformas: j.plataformas ?? [],
    desarrolladora: j.desarrolladora ?? null,
    generos: j.generos ?? [],
    resumen: j.resumen ?? null,
  };
}

/**
 * Crea o actualiza mi valoración de un juego (y su entrada en la actividad).
 * @param {{usuarioId:string, igdbId:number, estado:string, nota:number|null, recomendado:boolean|null, plataforma:string|null, resena:string|null}} v
 */
export function guardarValoracion(v, onError) {
  const id = Number(v.igdbId);
  const antes = miValoracion(v.usuarioId, id);
  const ahora = new Date().toISOString();
  const pendiente = v.estado === 'pendiente';
  const fila = {
    id: antes?.id ?? crypto.randomUUID(),
    usuario_id: v.usuarioId,
    juego_id: id,
    estado: v.estado,
    nota: pendiente ? null : redondear(v.nota),
    recomendado: pendiente ? null : (v.recomendado ?? null),
    plataforma: v.plataforma || null,
    resena: (v.resena || '').trim() || null,
    creado_en: antes?.creado_en ?? ahora,
    actualizado_en: ahora,
  };

  // ¿Qué se cuenta en la actividad?
  let tipo = null;
  if (!antes || antes.estado !== fila.estado) tipo = TIPO_POR_ESTADO[fila.estado];
  else if (redondear(antes.nota) !== fila.nota || (antes.recomendado ?? null) !== fila.recomendado || (antes.resena || null) !== fila.resena) tipo = 'valoro';

  let act = null;
  let actualizarAct = false;
  if (tipo) {
    const reciente = estado.actividad.find((a) =>
      a.usuario_id === v.usuarioId && Number(a.juego_id) === id && Date.now() - new Date(a.creado_en).getTime() < VENTANA_ACTIVIDAD_MS);
    const comun = { nota: fila.nota, recomendado: fila.recomendado, texto: fila.resena, creado_en: ahora };
    if (reciente) {
      // Mismo juego hace menos de 10 min: se actualiza esa entrada.
      // Si ahora solo cambia la nota o la reseña, se conserva lo que contaba (completó, empezó...).
      act = { ...reciente, ...comun, tipo: tipo === 'valoro' ? reciente.tipo : tipo };
      actualizarAct = true;
    } else {
      act = { id: crypto.randomUUID(), usuario_id: v.usuarioId, juego_id: id, tipo, ...comun };
    }
  }

  const conocido = juegoConocido(id);
  const faltaJuego = !juego(id) && conocido;

  return escribirOptimista(
    (s) => {
      if (faltaJuego) s.juegos = [...s.juegos, filaJuego(conocido)];
      s.valoraciones = [...s.valoraciones.filter((x) => x.id !== fila.id && !(x.usuario_id === fila.usuario_id && Number(x.juego_id) === id)), fila];
      if (act) s.actividad = [act, ...s.actividad.filter((x) => x.id !== act.id)];
    },
    async (sb) => {
      // La valoración apunta a juegos: el juego tiene que existir antes.
      if (faltaJuego) {
        comprobar(await sb.from('juegos').upsert(filaJuego(conocido), { onConflict: 'igdb_id', ignoreDuplicates: true }));
      }
      comprobar(await sb.from('valoraciones').upsert(fila, { onConflict: 'usuario_id,juego_id' }));
      if (act) {
        if (actualizarAct) {
          const { id: idAct, ...cambios } = act;
          comprobar(await sb.from('actividad').update(cambios).eq('id', idAct));
        } else {
          comprobar(await sb.from('actividad').insert(act));
        }
      }
    },
    onError,
  );
}

/** Quita mi valoración de un juego (y mis entradas de actividad de ese juego). */
export function quitarValoracion(usuarioId, igdbId, onError) {
  const id = Number(igdbId);
  const mia = (x) => x.usuario_id === usuarioId && Number(x.juego_id) === id;
  return escribirOptimista(
    (s) => {
      s.valoraciones = s.valoraciones.filter((x) => !mia(x));
      s.actividad = s.actividad.filter((x) => !mia(x));
    },
    async (sb) => {
      comprobar(await sb.from('valoraciones').delete().eq('usuario_id', usuarioId).eq('juego_id', id));
      comprobar(await sb.from('actividad').delete().eq('usuario_id', usuarioId).eq('juego_id', id));
    },
    onError,
    'No se ha podido quitar. Se ha deshecho el cambio.',
  );
}

// Para probar a mano desde la consola sin Supabase (no se usa en la app).
export const _interno = {
  cargar(datos) {
    Object.assign(estado, vacio(), datos);
    indices = construirIndices(estado);
    avisar();
  },
};
