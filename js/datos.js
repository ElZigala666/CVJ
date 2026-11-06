// Datos del grupo en memoria.
// Al arrancar se pinta al instante desde localStorage y se refresca en segundo plano.
// Todas las métricas se calculan en el cliente (son pocos datos).
import { cliente } from './supabase.js';
import { mediaGrupo, recomendacionGrupo, repartoLetras, desviacionTipica, redondear } from './notas.js';

const CLAVE = 'cvj.datos.v1';
const LIMITE_ACTIVIDAD = 60;
const VENTANA_ACTIVIDAD_MS = 10 * 60 * 1000; // agrupar cambios del mismo juego en 10 min

const vacio = () => ({ usuarios: [], valoraciones: [], juegos: [], actividad: [], biblioteca: [], psnIgdb: [], alias: [], rechazadas: [], sagas: [], cargadoEn: null });

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

const firma = (s) => JSON.stringify([s.usuarios, s.valoraciones, s.juegos, s.actividad, s.biblioteca, s.psnIgdb, s.alias, s.rechazadas, s.sagas]);

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
    // Extras que pueden no existir aún (migraciones): si fallan, se sigue con lo de antes.
    const extra = (q, previo) => q.then((r) => (r.error ? { data: previo } : r), () => ({ data: previo }));
    const [u, v, j, a, bib, emp, ali, rech, sag] = await Promise.all([
      leerUsuarios(sb),
      sb.from('valoraciones').select('*'),
      sb.from('juegos').select('*'),
      sb.from('actividad').select('*').order('creado_en', { ascending: false }).limit(LIMITE_ACTIVIDAD),
      // PSN es un extra: si falla (o aún no existe la tabla), se sigue sin ello.
      sb.from('biblioteca').select('*').then((r) => (r.error ? { data: estado.biblioteca } : r), () => ({ data: estado.biblioteca })),
      sb.from('psn_igdb').select('*').then((r) => (r.error ? { data: estado.psnIgdb } : r), () => ({ data: estado.psnIgdb })),
      extra(sb.from('juegos_alias').select('*'), estado.alias),
      extra(sb.from('fusiones_rechazadas').select('*'), estado.rechazadas),
      extra(sb.from('sagas_usuario').select('*'), estado.sagas),
    ]);
    const error = u.error || v.error || j.error || a.error;
    if (error) throw new Error(error.message);
    if (escriturasEnCurso) { refrescoAplazado = true; return; }
    const nuevo = {
      usuarios: u.data, valoraciones: v.data, juegos: j.data, actividad: a.data, biblioteca: bib.data ?? [], psnIgdb: emp.data ?? [],
      alias: ali.data ?? [], rechazadas: rech.data ?? [], sagas: sag.data ?? [],
    };
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

const COLUMNAS_USUARIO = 'id, nombre, inicial, color, acento, creado_en';
const COLUMNAS_PSN = ', psn_online_id, psn_account_id, psn_sincronizado_en';
/** Usuarios con sus datos de PSN y su foto; si faltan las migraciones 005, 004 o 003, con lo que haya. */
async function leerUsuarios(sb) {
  const xboxCols = ', xbox_gamertag, xbox_xuid, xbox_sincronizado_en, xbox_reconectar';
  for (const extra of [COLUMNAS_PSN + ', psn_reconectar, foto_url, es_admin' + xboxCols, COLUMNAS_PSN + ', psn_reconectar, foto_url, es_admin', COLUMNAS_PSN + ', psn_reconectar', COLUMNAS_PSN]) {
    const r = await sb.from('usuarios').select(COLUMNAS_USUARIO + extra).order('creado_en');
    if (!r.error) return r;
  }
  return sb.from('usuarios').select(COLUMNAS_USUARIO).order('creado_en');
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
  // Versiones fusionadas: alias → principal (siguiendo cadenas, sin bucles).
  const aliasA = new Map((s.alias ?? []).map((x) => [Number(x.alias_id), Number(x.principal_id)]));
  const canon = (id) => {
    let x = Number(id);
    for (let i = 0; i < 6 && aliasA.has(x); i++) x = aliasA.get(x);
    return x;
  };
  // Valoraciones "efectivas": con el juego principal y una sola por usuario y juego
  // (si alguien tiene las dos versiones sin fusionar, cuenta la más reciente).
  const efectivas = new Map();
  for (const v of s.valoraciones) {
    const id = canon(v.juego_id);
    const e = id === Number(v.juego_id) ? v : { ...v, juego_id: id, juego_origen: Number(v.juego_id) };
    const k = `${v.usuario_id}:${id}`;
    const prev = efectivas.get(k);
    if (!prev || new Date(e.actualizado_en || 0) > new Date(prev.actualizado_en || 0)) efectivas.set(k, e);
  }
  const vals = [...efectivas.values()];
  const porJuego = new Map();
  for (const v of vals) {
    const id = Number(v.juego_id);
    if (!porJuego.has(id)) porJuego.set(id, []);
    porJuego.get(id).push(v);
  }
  // PSN: emparejamientos compartidos y biblioteca por usuario y por juego.
  const psnIgdb = new Map((s.psnIgdb ?? []).map((x) => [x.psn_title_id, x]));
  const bibUsuario = new Map();
  const bibJuego = new Map();
  for (const b of s.biblioteca ?? []) {
    if (!bibUsuario.has(b.usuario_id)) bibUsuario.set(b.usuario_id, []);
    bibUsuario.get(b.usuario_id).push(b);
    const jid = idDeFila(b, psnIgdb, canon);
    if (jid == null) continue;
    if (!bibJuego.has(jid)) bibJuego.set(jid, []);
    bibJuego.get(jid).push(b);
  }
  return { usuarios, juegos, porJuego, psnIgdb, bibUsuario, bibJuego, canon, vals, aliasA };
}

/** Juego (principal) de una fila de biblioteca: lo de psn_igdb manda; colecciones y no-juegos, ninguno. */
function idDeFila(f, psnIgdb, canon) {
  const emp = psnIgdb.get(f.psn_title_id);
  if (emp && (emp.tipo === 'coleccion' || emp.tipo === 'no_juego')) return null;
  const id = emp ? emp.igdb_id : f.juego_id;
  return id == null ? null : canon(id);
}

export const usuario = (id) => indices.usuarios.get(id) ?? null;
/** Juego de la tabla juegos (completo). */
export const juego = (igdbId) => indices.juegos.get(Number(igdbId)) ?? null;
/** Juego de la tabla o, si no está, lo que se sepa de él por Buscar. */
export const juegoConocido = (igdbId) => juego(igdbId) ?? parciales.get(Number(igdbId)) ?? null;
/** Juego principal de un juego (el mismo si no está fusionado con otro). */
export const canonico = (igdbId) => indices.canon(igdbId);
/** Versiones fusionadas con este principal. */
export const aliasDe = (principalId) => (estado.alias ?? []).filter((x) => Number(x.principal_id) === Number(principalId)).map((x) => Number(x.alias_id));
/** Todas las valoraciones contando las versiones fusionadas como un solo juego. */
export const valoracionesEfectivas = () => indices.vals;
export const valoracionesDeJuego = (igdbId) => indices.porJuego.get(canonico(igdbId)) ?? [];
export const miValoracion = (usuarioId, igdbId) =>
  valoracionesDeJuego(igdbId).find((v) => v.usuario_id === usuarioId) ?? null;
/** ¿Este usuario dijo que A y B no son el mismo juego? */
export const fusionRechazada = (usuarioId, a, b) => {
  const [x, y] = [Number(a), Number(b)].sort((m, n) => m - n);
  return (estado.rechazadas ?? []).some((r) => r.usuario_id === usuarioId && Number(r.juego_a) === x && Number(r.juego_b) === y);
};
/** Preferencias de sagas de un usuario: Map(coleccion_id → { agrupada, nombre }). */
export const sagasDe = (usuarioId) => new Map((estado.sagas ?? []).filter((x) => x.usuario_id === usuarioId).map((x) => [Number(x.coleccion_id), x]));

// ---------------------------------------------------------------------------
// PlayStation
// ---------------------------------------------------------------------------
/** Juego de IGDB de una fila de la biblioteca (o null si está sin emparejar). */
export function igdbDeBiblioteca(fila) {
  return idDeFila(fila, indices.psnIgdb, indices.canon);
}
export const emparejamiento = (psnTitleId) => indices.psnIgdb.get(psnTitleId) ?? null;
export const bibliotecaDe = (uid) => indices.bibUsuario.get(uid) ?? [];
export const bibliotecaDeJuego = (igdbId) => indices.bibJuego.get(Number(igdbId)) ?? [];
export const filaBiblioteca = (psnTitleId) => (estado.biblioteca ?? []).find((b) => b.psn_title_id === psnTitleId) ?? null;

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
  const copia = {
    valoraciones: estado.valoraciones, actividad: estado.actividad, juegos: estado.juegos, usuarios: estado.usuarios,
    psnIgdb: estado.psnIgdb, biblioteca: estado.biblioteca, alias: estado.alias, rechazadas: estado.rechazadas, sagas: estado.sagas,
  };
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
 * @param {{usuarioId:string, igdbId:number, estado:string, nota:number|null, recomendado:boolean|null, plataforma:string|null, resena:string|null, horas?:number|null}} v
 */
export function guardarValoracion(v, onError) {
  const id = canonico(v.igdbId);
  const antes = miValoracion(v.usuarioId, id);
  // Si la que había es de una versión fusionada, se pasa al principal (y se borra aquella).
  const mover = antes?.juego_origen != null && antes.juego_origen !== id ? antes : null;
  const ahora = new Date().toISOString();
  const pendiente = v.estado === 'pendiente';
  const fila = {
    id: mover ? crypto.randomUUID() : antes?.id ?? crypto.randomUUID(),
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
  // Horas a mano: solo si la columna existe (migración 005) o se han escrito.
  if (v.horas !== undefined && (v.horas != null || antes?.horas != null)) fila.horas = v.horas;
  else if (antes && 'horas' in antes) fila.horas = antes.horas;

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
      s.valoraciones = [...s.valoraciones.filter((x) => x.id !== fila.id && x.id !== mover?.id && !(x.usuario_id === fila.usuario_id && Number(x.juego_id) === id)), fila];
      if (act) s.actividad = [act, ...s.actividad.filter((x) => x.id !== act.id)];
    },
    async (sb) => {
      // La valoración apunta a juegos: el juego tiene que existir antes.
      if (faltaJuego) {
        comprobar(await sb.from('juegos').upsert(filaJuego(conocido), { onConflict: 'igdb_id', ignoreDuplicates: true }));
      }
      comprobar(await sb.from('valoraciones').upsert(fila, { onConflict: 'usuario_id,juego_id' }));
      if (mover) comprobar(await sb.from('valoraciones').delete().eq('id', mover.id));
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

/** Cambia datos de un usuario (su color de acento, su foto...). */
export function actualizarUsuario(id, cambios, onError, mensajeError = 'No se ha podido guardar el color. Se ha deshecho el cambio.') {
  return escribirOptimista(
    (s) => { s.usuarios = s.usuarios.map((u) => (u.id === id ? { ...u, ...cambios } : u)); },
    async (sb) => { comprobar(await sb.from('usuarios').update(cambios).eq('id', id)); },
    onError,
    mensajeError,
  );
}

/**
 * Guarda el color dominante de la portada de un juego (se calcula una sola vez).
 * Sin avisos: si falla, se volverá a calcular otro día.
 */
export async function guardarColorDominante(igdbId, hex) {
  const id = Number(igdbId);
  const j = juego(id);
  if (!j || !('color_dominante' in j) || j.color_dominante === hex) return;
  estado.juegos = estado.juegos.map((x) => (Number(x.igdb_id) === id ? { ...x, color_dominante: hex } : x));
  indices = construirIndices(estado);
  guardarCache();
  try {
    const sb = await cliente();
    const r = await sb.from('juegos').update({ color_dominante: hex }).eq('igdb_id', id);
    if (r.error) throw r.error;
  } catch (e) {
    console.info('[datos] Color dominante sin guardar:', e?.message || e);
  }
}

/** ¿Es un juego online / sin final? (lo elegido a mano manda sobre lo automático) */
export const esOnline = (igdbId) => juego(igdbId)?.es_online === true;

/** Marca o desmarca un juego como online / sin final (para todo el grupo). */
export function marcarOnline(igdbId, valor, onError) {
  const id = Number(igdbId);
  const cambios = { es_online: !!valor, es_online_manual: !!valor };
  return escribirOptimista(
    (s) => { s.juegos = s.juegos.map((x) => (Number(x.igdb_id) === id ? { ...x, ...cambios } : x)); },
    async (sb) => { comprobar(await sb.from('juegos').update(cambios).eq('igdb_id', id)); },
    onError,
    'No se ha podido cambiar. Se ha deshecho el cambio.',
  );
}

/** Oculta (o vuelve a mostrar) entradas de mi biblioteca de PSN. */
export function ocultarBiblioteca(usuarioId, psnTitleIds, oculto, onError) {
  const ids = new Set(psnTitleIds);
  // Con la migración 006 se guarda que lo decidió el usuario (la sincronización lo respeta).
  const con006 = (estado.biblioteca ?? []).some((b) => 'oculto_usuario' in b);
  const cambios = con006 ? { oculto, oculto_usuario: oculto, por_revisar: false } : { oculto };
  return escribirOptimista(
    (s) => {
      s.biblioteca = (s.biblioteca ?? []).map((b) => (b.usuario_id === usuarioId && ids.has(b.psn_title_id) ? { ...b, ...cambios } : b));
    },
    async (sb) => {
      comprobar(await sb.from('biblioteca').update(cambios).eq('usuario_id', usuarioId).in('psn_title_id', [...ids]));
    },
    onError,
    'No se ha podido guardar. Se ha deshecho el cambio.',
  );
}

/**
 * Empareja a mano un título de PSN con un juego de IGDB (vale para todo el grupo).
 * @param {string} psnTitleId
 * @param {object} juegoElegido juego de IGDB (de Buscar o de la tabla)
 */
export function emparejarPsn(psnTitleId, juegoElegido, onError) {
  const id = Number(juegoElegido.igdb_id);
  const con006 = (estado.psnIgdb ?? []).some((x) => 'tipo' in x);
  const fila = {
    psn_title_id: psnTitleId,
    igdb_id: id,
    confirmado: true,
    nombre_psn: filaBiblioteca(psnTitleId)?.nombre_psn ?? null,
    actualizado_en: new Date().toISOString(),
    ...(con006 ? { tipo: 'juego', juegos: null, confianza: 100, propuesta_id: null } : {}),
  };
  const faltaJuego = !juego(id);
  const yo = (estado.biblioteca ?? []).find((b) => b.psn_title_id === psnTitleId && 'por_revisar' in b)?.usuario_id;
  return escribirOptimista(
    (s) => {
      if (faltaJuego) s.juegos = [...s.juegos, filaJuego(juegoElegido)];
      s.psnIgdb = [...(s.psnIgdb ?? []).filter((x) => x.psn_title_id !== psnTitleId), fila];
      s.biblioteca = (s.biblioteca ?? []).map((b) => (b.psn_title_id === psnTitleId && 'por_revisar' in b ? { ...b, por_revisar: false } : b));
    },
    async (sb) => {
      if (faltaJuego) comprobar(await sb.from('juegos').upsert(filaJuego(juegoElegido), { onConflict: 'igdb_id', ignoreDuplicates: true }));
      comprobar(await sb.from('psn_igdb').upsert(fila, { onConflict: 'psn_title_id' }));
      if (yo) comprobar(await sb.from('biblioteca').update({ por_revisar: false }).eq('psn_title_id', psnTitleId));
    },
    onError,
    'No se ha podido guardar el emparejamiento. Se ha deshecho.',
  );
}

/**
 * "Revisa tu biblioteca" → Confirmar: lo propuesto queda confirmado a mano (para todo
 * el grupo, y la sincronización ya no lo toca) y deja de estar por revisar.
 * @param {{ titulo: string, igdbId: number|null, tipo: string, juegos?: number[]|null }[]} items
 */
export function confirmarRevision(usuarioId, items, onError) {
  const ahora = new Date().toISOString();
  const filas = items.filter((x) => x.tipo === 'coleccion' || x.igdbId != null).map((x) => ({
    psn_title_id: x.titulo,
    igdb_id: x.tipo === 'coleccion' ? (x.igdbId ?? null) : x.igdbId,
    confirmado: true,
    nombre_psn: filaBiblioteca(x.titulo)?.nombre_psn ?? null,
    tipo: x.tipo,
    juegos: x.juegos ?? null,
    confianza: 100,
    propuesta_id: null,
    actualizado_en: ahora,
  }));
  const titulos = new Set(items.map((x) => x.titulo));
  return escribirOptimista(
    (s) => {
      const nuevas = new Map(filas.map((f) => [f.psn_title_id, f]));
      s.psnIgdb = (s.psnIgdb ?? []).filter((x) => !nuevas.has(x.psn_title_id)).concat(filas);
      s.biblioteca = (s.biblioteca ?? []).map((b) => (b.usuario_id === usuarioId && titulos.has(b.psn_title_id) ? { ...b, por_revisar: false } : b));
    },
    async (sb) => {
      if (filas.length) comprobar(await sb.from('psn_igdb').upsert(filas, { onConflict: 'psn_title_id' }));
      comprobar(await sb.from('biblioteca').update({ por_revisar: false }).eq('usuario_id', usuarioId).in('psn_title_id', [...titulos]));
    },
    onError,
    'No se ha podido confirmar. Se ha deshecho el cambio.',
  );
}

/**
 * Fusiona dos versiones del mismo juego: para todo el grupo, "alias" cuenta como
 * "principal" (si alguno ya era parte de una fusión, se respeta la que había). Mi
 * valoración queda una sola, en el principal, con la nota elegida y las horas sumadas.
 * @param {{ usuarioId, principal, alias, notaDe: 'principal'|'alias', horas: number|null }} f
 */
export function fusionar({ usuarioId, principal, alias, notaDe = 'principal', horas = null }, onError) {
  let p = canonico(principal);
  let a = canonico(alias);
  // Si "alias" ya es el principal de otras versiones y "principal" no, se respeta el que existía.
  if (aliasDe(a).length && !aliasDe(p).length) [p, a] = [a, p];
  if (p === a) return Promise.resolve(true);
  const ahora = new Date().toISOString();
  const filaAlias = { alias_id: a, principal_id: p, creado_por: usuarioId, creado_en: ahora };
  const reapuntar = aliasDe(a); // las que apuntaban al que deja de ser principal

  // Valoraciones de este usuario en las dos versiones (sin efectivas: las de verdad).
  const deVersion = (id) => estado.valoraciones.filter((v) => v.usuario_id === usuarioId && [id, ...aliasDe(id)].includes(Number(v.juego_id)))
    .sort((x, y) => new Date(y.actualizado_en) - new Date(x.actualizado_en))[0] ?? null;
  const vp = deVersion(p);
  const va = deVersion(a);
  const base = notaDe === 'alias' ? (va ?? vp) : (vp ?? va);
  const quedan = base ? {
    ...base,
    id: vp?.id ?? crypto.randomUUID(),
    juego_id: p,
    actualizado_en: ahora,
    ...(horas != null ? { horas } : {}),
  } : null;
  const borrar = [vp, va].filter((x) => x && x.id !== quedan?.id).map((x) => x.id);
  return escribirOptimista(
    (s) => {
      s.alias = [...(s.alias ?? []).filter((x) => Number(x.alias_id) !== a).map((x) => (reapuntar.includes(Number(x.alias_id)) ? { ...x, principal_id: p } : x)), filaAlias];
      if (quedan) s.valoraciones = [...s.valoraciones.filter((x) => x.id !== quedan.id && !borrar.includes(x.id)), quedan];
    },
    async (sb) => {
      comprobar(await sb.from('juegos_alias').upsert(filaAlias, { onConflict: 'alias_id' }));
      if (reapuntar.length) comprobar(await sb.from('juegos_alias').update({ principal_id: p }).in('alias_id', reapuntar));
      if (borrar.length) comprobar(await sb.from('valoraciones').delete().in('id', borrar));
      if (quedan) {
        const { juego_origen: _, ...fila } = quedan;
        comprobar(await sb.from('valoraciones').upsert(fila, { onConflict: 'usuario_id,juego_id' }));
      }
    },
    onError,
    'No se ha podido fusionar. Se ha deshecho el cambio.',
  );
}

/** Deshace una fusión (la versión vuelve a contar por separado; las valoraciones se quedan donde están). */
export function deshacerFusion(aliasId, onError) {
  const a = Number(aliasId);
  return escribirOptimista(
    (s) => { s.alias = (s.alias ?? []).filter((x) => Number(x.alias_id) !== a); },
    async (sb) => { comprobar(await sb.from('juegos_alias').delete().eq('alias_id', a)); },
    onError,
    'No se ha podido deshacer. Se ha vuelto a como estaba.',
  );
}

/** "No, son distintos": no se vuelve a preguntar por esa pareja a este usuario. */
export function rechazarFusion(usuarioId, a, b, onError) {
  const [x, y] = [Number(a), Number(b)].sort((m, n) => m - n);
  const fila = { usuario_id: usuarioId, juego_a: x, juego_b: y, creado_en: new Date().toISOString() };
  return escribirOptimista(
    (s) => { s.rechazadas = [...(s.rechazadas ?? []), fila]; },
    async (sb) => { comprobar(await sb.from('fusiones_rechazadas').upsert(fila, { onConflict: 'usuario_id,juego_a,juego_b', ignoreDuplicates: true })); },
    onError,
  );
}

/** Agrupar (o "no, son distintos") una saga en la biblioteca y el historial de un usuario. */
export function guardarSaga(usuarioId, coleccionId, nombre, agrupada, onError) {
  const fila = { usuario_id: usuarioId, coleccion_id: Number(coleccionId), nombre, agrupada, creado_en: new Date().toISOString() };
  return escribirOptimista(
    (s) => { s.sagas = [...(s.sagas ?? []).filter((x) => !(x.usuario_id === usuarioId && Number(x.coleccion_id) === fila.coleccion_id)), fila]; },
    async (sb) => { comprobar(await sb.from('sagas_usuario').upsert(fila, { onConflict: 'usuario_id,coleccion_id' })); },
    onError,
  );
}

/** Quita mi valoración de un juego (y mis entradas de actividad de ese juego). */
export function quitarValoracion(usuarioId, igdbId, onError) {
  const id = canonico(igdbId);
  const ids = [id, ...aliasDe(id)];
  const mia = (x) => x.usuario_id === usuarioId && ids.includes(Number(x.juego_id));
  return escribirOptimista(
    (s) => {
      s.valoraciones = s.valoraciones.filter((x) => !mia(x));
      s.actividad = s.actividad.filter((x) => !mia(x));
    },
    async (sb) => {
      comprobar(await sb.from('valoraciones').delete().eq('usuario_id', usuarioId).in('juego_id', ids));
      comprobar(await sb.from('actividad').delete().eq('usuario_id', usuarioId).in('juego_id', ids));
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
