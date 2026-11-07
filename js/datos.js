// Datos del grupo en memoria.
// Al arrancar se pinta al instante desde localStorage y se refresca en segundo plano.
// Todas las métricas se calculan en el cliente (son pocos datos).
import { cliente } from './supabase.js';
import { mediaGrupo, recomendacionGrupo, repartoLetras, desviacionTipica, redondear } from './notas.js';

const CLAVE = 'cvj.datos.v1';
const LIMITE_ACTIVIDAD = 60;
const VENTANA_ACTIVIDAD_MS = 10 * 60 * 1000; // agrupar cambios del mismo juego en 10 min

const vacio = () => ({ usuarios: [], valoraciones: [], juegos: [], actividad: [], biblioteca: [], psnIgdb: [], alias: [], rechazadas: [], sagas: [], servicios: [], cuentas: [], horasExtra: [], avisos: [], sagasG: [], sagasJuegos: [], valSagas: [], cargadoEn: null });

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

const firma = (s) => JSON.stringify([s.usuarios, s.valoraciones, s.juegos, s.actividad, s.biblioteca, s.psnIgdb, s.alias, s.rechazadas, s.sagas, s.servicios, s.cuentas, s.horasExtra, s.avisos, s.sagasG, s.sagasJuegos, s.valSagas]);

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
    const [u, v, j, a, bib, emp, ali, rech, sag, serv, cue, hex, avi, sg, sgj, vsg] = await Promise.all([
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
      extra(sb.from('estado_servicios').select('*'), estado.servicios),
      extra(sb.from('cuentas_plataforma').select('*').order('creado_en'), estado.cuentas),
      extra(sb.from('horas_extra').select('*'), estado.horasExtra),
      extra(sb.from('avisos').select('*').eq('leido', false), estado.avisos),
      extra(sb.from('sagas').select('*'), estado.sagasG),
      extra(sb.from('sagas_juegos').select('*'), estado.sagasJuegos),
      extra(sb.from('valoraciones_saga').select('*'), estado.valSagas),
    ]);
    const error = u.error || v.error || j.error || a.error;
    if (error) throw new Error(error.message);
    if (escriturasEnCurso) { refrescoAplazado = true; return; }
    const nuevo = {
      usuarios: u.data, valoraciones: v.data, juegos: j.data, actividad: a.data, biblioteca: bib.data ?? [], psnIgdb: emp.data ?? [],
      alias: ali.data ?? [], rechazadas: rech.data ?? [], sagas: sag.data ?? [], servicios: serv.data ?? [], cuentas: cue.data ?? [], horasExtra: hex.data ?? [], avisos: avi.data ?? [],
      sagasG: sg.data ?? [], sagasJuegos: sgj.data ?? [], valSagas: vsg.data ?? [],
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
/**
 * Usuarios con su foto y sus preferencias. Las cuentas de PSN, Xbox y Steam están en
 * cuentas_plataforma (los usuarios ya no guardan un resumen, migración 017).
 */
async function leerUsuarios(sb) {
  const r = await sb.from('usuarios').select(COLUMNAS_USUARIO + ', foto_url, es_admin, umbral_probados, xbox_incluir_pc, activo, plataformas_ocultas').order('creado_en');
  if (!r.error) return r;
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
  // Horas extra a mano por usuario y juego principal (las de versiones fusionadas se suman).
  const extraHoras = new Map();
  for (const h of s.horasExtra ?? []) {
    const k = `${h.usuario_id}:${canon(h.juego_id)}`;
    extraHoras.set(k, (extraHoras.get(k) ?? 0) + Number(h.horas ?? 0));
  }
  // Sagas del grupo: juego (principal) → saga y saga → juegos en orden.
  const sagas = new Map((s.sagasG ?? []).map((x) => [x.id, x]));
  const sagaDeJuego = new Map();
  const juegosDeSaga = new Map();
  for (const x of [...(s.sagasJuegos ?? [])].sort((a, b) => a.orden - b.orden)) {
    if (!sagas.has(x.saga_id)) continue;
    const id = canon(x.juego_id);
    if (sagaDeJuego.has(id)) continue;
    sagaDeJuego.set(id, x.saga_id);
    if (!juegosDeSaga.has(x.saga_id)) juegosDeSaga.set(x.saga_id, []);
    juegosDeSaga.get(x.saga_id).push(id);
  }
  const valsSaga = new Map();
  for (const v of s.valSagas ?? []) {
    if (!sagas.has(v.saga_id)) continue;
    if (!valsSaga.has(v.saga_id)) valsSaga.set(v.saga_id, []);
    valsSaga.get(v.saga_id).push(v);
  }
  return { usuarios, juegos, porJuego, psnIgdb, bibUsuario, bibJuego, canon, vals, aliasA, extraHoras, sagas, sagaDeJuego, juegosDeSaga, valsSaga };
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
/** Horas extra a mano de un usuario en un juego (0 si no hay). */
export const horasExtra = (usuarioId, igdbId) => indices.extraHoras.get(`${usuarioId}:${canonico(igdbId)}`) ?? 0;
/** ¿Hay tabla de horas extra? (migración 011) */
export const hayHorasExtra = () => Array.isArray(estado.horasExtra) && (estado.horasExtra.length > 0 || estado.cuentas?.length > 0);
/** Cuentas de plataforma de un usuario (opcionalmente de una fuente: psn, xbox, steam). */
export const cuentasDe = (usuarioId, fuente) => (estado.cuentas ?? []).filter((c) => c.usuario_id === usuarioId && (!fuente || c.fuente === fuente));
export const cuenta = (id) => (estado.cuentas ?? []).find((c) => c.id === id) ?? null;

// ---------------------------------------------------------------------------
// Sagas del grupo
// ---------------------------------------------------------------------------
/** ¿Hay tablas de sagas? (migración 013) */
export const haySagas = () => Array.isArray(estado.sagasG);
export const saga = (id) => indices.sagas.get(id) ?? null;
export const sagas = () => [...indices.sagas.values()];
/** Saga en la que está un juego (o null). */
export const sagaDeJuego = (igdbId) => saga(indices.sagaDeJuego.get(canonico(igdbId)));
/** Juegos de una saga, en su orden. */
export const juegosDeSaga = (sagaId) => indices.juegosDeSaga.get(sagaId) ?? [];
export const valoracionesDeSaga = (sagaId) => indices.valsSaga.get(sagaId) ?? [];
export const miValoracionSaga = (usuarioId, sagaId) => valoracionesDeSaga(sagaId).find((v) => v.usuario_id === usuarioId) ?? null;
export const valoracionesSagaDe = (usuarioId) => (estado.valSagas ?? []).filter((v) => v.usuario_id === usuarioId && indices.sagas.has(v.saga_id));
/** Portada de una saga: la elegida o la de su último juego. */
export function portadaSaga(s) {
  if (!s) return null;
  if (s.cover_id) return s.cover_id;
  const ids = juegosDeSaga(s.id);
  for (let i = ids.length - 1; i >= 0; i--) { const c = juegoConocido(ids[i])?.cover_id; if (c) return c; }
  return null;
}
/** Una saga "como un juego" para pintarla con las mismas piezas (portada, nombre...). */
export const comoJuego = (s) => (s ? { igdb_id: null, saga_id: s.id, nombre: s.nombre, cover_id: portadaSaga(s), anio: null, plataformas: [], es_online: !!s.es_online } : null);
/** ¿Saga online / sin final? (FIFA...: no se juega "hasta el final") */
export const sagaOnline = (sagaId) => !!saga(sagaId)?.es_online;

/** Plataformas de una valoración ("PS5", "PC"...): la lista nueva o, si es antigua, la única que tenía. */
export const plataformasDe = (v) => (v?.plataformas?.length ? v.plataformas : v?.plataforma ? [v.plataforma] : []);

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
    horasExtra: estado.horasExtra, cuentas: estado.cuentas, avisos: estado.avisos,
    sagasG: estado.sagasG, sagasJuegos: estado.sagasJuegos, valSagas: estado.valSagas,
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
  // La valoración se queda en la versión que jugó cada uno (cuenta en el principal):
  // la que ya tenía o, si es nueva y se valoró desde una versión, esa versión.
  const pedido = Number(v.igdbId);
  const destino = antes ? Number(antes.juego_origen ?? antes.juego_id) : (pedido !== id && aliasDe(id).includes(pedido) ? pedido : id);
  // Restos en otras versiones del mismo juego (no debería haber): fuera.
  const grupo = [id, ...aliasDe(id)];
  const sobran = estado.valoraciones.filter((x) => x.usuario_id === v.usuarioId && grupo.includes(Number(x.juego_id)) && Number(x.juego_id) !== destino).map((x) => x.id);
  const ahora = new Date().toISOString();
  const pendiente = v.estado === 'pendiente';
  const fila = {
    id: antes?.id ?? crypto.randomUUID(),
    usuario_id: v.usuarioId,
    juego_id: destino,
    estado: v.estado,
    nota: pendiente ? null : redondear(v.nota),
    recomendado: pendiente ? null : (v.recomendado ?? null),
    plataformas: (v.plataformas ?? []).length ? [...new Set(v.plataformas)] : null,
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
      s.valoraciones = [...s.valoraciones.filter((x) => x.id !== fila.id && !sobran.includes(x.id)), fila];
      if (act) s.actividad = [act, ...s.actividad.filter((x) => x.id !== act.id)];
    },
    async (sb) => {
      // La valoración apunta a juegos: el juego tiene que existir antes.
      if (faltaJuego) {
        comprobar(await sb.from('juegos').upsert(filaJuego(conocido), { onConflict: 'igdb_id', ignoreDuplicates: true }));
      }
      comprobar(await sb.from('valoraciones').upsert(fila, { onConflict: 'usuario_id,juego_id' }));
      if (sobran.length) comprobar(await sb.from('valoraciones').delete().in('id', sobran));
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

/**
 * Horas extra a mano (plataformas o cuentas que no se sincronizan) de un usuario en un
 * juego. null o 0 = quitarlas. La sincronización nunca las toca.
 */
export function guardarHorasExtra(usuarioId, igdbId, horas, onError) {
  const id = canonico(igdbId);
  const valor = horas != null && horas > 0 ? Math.round(horas * 10) / 10 : null;
  const fila = valor ? { usuario_id: usuarioId, juego_id: id, horas: valor, actualizado_en: new Date().toISOString() } : null;
  const conocido = juegoConocido(id);
  const faltaJuego = !juego(id) && conocido;
  return escribirOptimista(
    (s) => {
      if (faltaJuego) s.juegos = [...s.juegos, filaJuego(conocido)];
      s.horasExtra = [...(s.horasExtra ?? []).filter((h) => !(h.usuario_id === usuarioId && canonico(h.juego_id) === id)), ...(fila ? [fila] : [])];
    },
    async (sb) => {
      if (faltaJuego) comprobar(await sb.from('juegos').upsert(filaJuego(conocido), { onConflict: 'igdb_id', ignoreDuplicates: true }));
      const ids = [id, ...aliasDe(id)];
      comprobar(await sb.from('horas_extra').delete().eq('usuario_id', usuarioId).in('juego_id', ids));
      if (fila) comprobar(await sb.from('horas_extra').insert(fila));
    },
    onError,
    'No se han podido guardar las horas. Se ha deshecho el cambio.',
  );
}

/** Etiqueta de una cuenta de plataforma ("Cuenta principal", "Cuenta 2"...). */
export function cambiarEtiqueta(cuentaId, etiqueta, onError) {
  const valor = String(etiqueta ?? '').trim().slice(0, 40) || null;
  return escribirOptimista(
    (s) => { s.cuentas = (s.cuentas ?? []).map((c) => (c.id === cuentaId ? { ...c, etiqueta: valor } : c)); },
    async (sb) => { comprobar(await sb.from('cuentas_plataforma').update({ etiqueta: valor }).eq('id', cuentaId)); },
    onError,
    'No se ha podido guardar la etiqueta.',
  );
}

/** "Mis juegos" (true) o "Probados" (false) a mano; null = lo decide el umbral. */
export function ponerEnMisJuegos(usuarioId, psnTitleIds, valor, onError) {
  const ids = new Set(psnTitleIds);
  const cambios = { en_mis_juegos: valor, por_revisar: false };
  return escribirOptimista(
    (s) => { s.biblioteca = (s.biblioteca ?? []).map((b) => (b.usuario_id === usuarioId && ids.has(b.psn_title_id) ? { ...b, ...cambios } : b)); },
    async (sb) => { comprobar(await sb.from('biblioteca').update(cambios).eq('usuario_id', usuarioId).in('psn_title_id', [...ids])); },
    onError,
    'No se ha podido guardar. Se ha deshecho el cambio.',
  );
}

/** Interruptor "Incluir juegos de PC detectados" (Xbox): también muestra u oculta los que ya hay. */
export function cambiarIncluirPc(usuarioId, incluir, onError) {
  return escribirOptimista(
    (s) => {
      s.usuarios = s.usuarios.map((u) => (u.id === usuarioId ? { ...u, xbox_incluir_pc: incluir } : u));
      s.biblioteca = (s.biblioteca ?? []).map((b) => (b.usuario_id === usuarioId && b.detectado && b.oculto_usuario == null ? { ...b, oculto: !incluir } : b));
    },
    async (sb) => {
      comprobar(await sb.from('usuarios').update({ xbox_incluir_pc: incluir }).eq('id', usuarioId));
      comprobar(await sb.from('biblioteca').update({ oculto: !incluir }).eq('usuario_id', usuarioId).eq('detectado', true).is('oculto_usuario', null));
    },
    onError,
    'No se ha podido cambiar. Se ha deshecho.',
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
 * valoración queda una sola, en el principal, con la nota elegida.
 * @param {{ usuarioId, principal, alias, notaDe: 'principal'|'alias' }} f
 */
export function fusionar({ usuarioId, principal, alias, notaDe = 'principal' }, onError) {
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
        // Sin columnas que ya no existen (horas y plataforma, migración 017).
        const { juego_origen: _, horas: _h, plataforma: _p, ...fila } = quedan;
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

/** Que los juegos existan en la tabla antes de apuntar a ellos (los conocidos solo por Buscar). */
function juegosQueFaltan(ids) {
  return ids.map((id) => (!juego(id) ? juegoConocido(id) : null)).filter(Boolean);
}

/** Crea una saga con unos juegos (que salen de la saga en la que estuvieran). Devuelve su id. */
export function crearSaga({ nombre, juegos: ids = [], coleccionId = null, usuarioId }, onError) {
  const id = crypto.randomUUID();
  const ahora = new Date().toISOString();
  const lista = [...new Set(ids.map((x) => canonico(x)))];
  const faltan = juegosQueFaltan(lista);
  const fila = { id, nombre: String(nombre).trim().slice(0, 80) || 'Saga', cover_id: null, coleccion_id: coleccionId, creado_por: usuarioId, creado_en: ahora, actualizado_en: ahora };
  const filasJ = lista.map((j, i) => ({ juego_id: j, saga_id: id, orden: i + 1, creado_en: ahora }));
  escribirOptimista(
    (s) => {
      if (faltan.length) s.juegos = [...s.juegos, ...faltan.map(filaJuego)];
      s.sagasG = [...(s.sagasG ?? []), fila];
      s.sagasJuegos = [...(s.sagasJuegos ?? []).filter((x) => !lista.includes(canonico(x.juego_id))), ...filasJ];
    },
    async (sb) => {
      if (faltan.length) comprobar(await sb.from('juegos').upsert(faltan.map(filaJuego), { onConflict: 'igdb_id', ignoreDuplicates: true }));
      comprobar(await sb.from('sagas').insert(fila));
      if (filasJ.length) comprobar(await sb.from('sagas_juegos').upsert(filasJ, { onConflict: 'juego_id' }));
    },
    onError,
    'No se ha podido crear la saga. Se ha deshecho el cambio.',
  );
  return id;
}

/** Cambia el nombre o la portada de una saga. */
export function editarSaga(sagaId, cambios, onError) {
  const c = { ...cambios, actualizado_en: new Date().toISOString() };
  if ('nombre' in c) c.nombre = String(c.nombre).trim().slice(0, 80);
  if (c.nombre === '') return Promise.resolve(false);
  return escribirOptimista(
    (s) => { s.sagasG = (s.sagasG ?? []).map((x) => (x.id === sagaId ? { ...x, ...c } : x)); },
    async (sb) => { comprobar(await sb.from('sagas').update(c).eq('id', sagaId)); },
    onError,
    'No se ha podido guardar la saga. Se ha deshecho el cambio.',
  );
}

/** Añade juegos al final de una saga (si estaban en otra, se cambian a esta). */
export function anadirASaga(sagaId, ids, onError) {
  const ahora = new Date().toISOString();
  const lista = [...new Set(ids.map((x) => canonico(x)))].filter((j) => indices.sagaDeJuego.get(j) !== sagaId);
  if (!lista.length) return Promise.resolve(true);
  const faltan = juegosQueFaltan(lista);
  const max = juegosDeSaga(sagaId).length;
  const filas = lista.map((j, i) => ({ juego_id: j, saga_id: sagaId, orden: max + i + 1, creado_en: ahora }));
  return escribirOptimista(
    (s) => {
      if (faltan.length) s.juegos = [...s.juegos, ...faltan.map(filaJuego)];
      s.sagasJuegos = [...(s.sagasJuegos ?? []).filter((x) => !lista.includes(canonico(x.juego_id))), ...filas];
    },
    async (sb) => {
      if (faltan.length) comprobar(await sb.from('juegos').upsert(faltan.map(filaJuego), { onConflict: 'igdb_id', ignoreDuplicates: true }));
      comprobar(await sb.from('sagas_juegos').upsert(filas, { onConflict: 'juego_id' }));
    },
    onError,
    'No se han podido añadir. Se ha deshecho el cambio.',
  );
}

/** Saca un juego de su saga. */
export function quitarDeSaga(igdbId, onError) {
  const id = canonico(igdbId);
  const ids = [id, ...aliasDe(id)];
  return escribirOptimista(
    (s) => { s.sagasJuegos = (s.sagasJuegos ?? []).filter((x) => !ids.includes(Number(x.juego_id))); },
    async (sb) => { comprobar(await sb.from('sagas_juegos').delete().in('juego_id', ids)); },
    onError,
    'No se ha podido quitar de la saga. Se ha deshecho el cambio.',
  );
}

/** Nuevo orden de los juegos de una saga. */
export function ordenarSaga(sagaId, ids, onError) {
  const orden = new Map(ids.map((j, i) => [Number(j), i + 1]));
  return escribirOptimista(
    (s) => { s.sagasJuegos = (s.sagasJuegos ?? []).map((x) => (x.saga_id === sagaId && orden.has(canonico(x.juego_id)) ? { ...x, orden: orden.get(canonico(x.juego_id)) } : x)); },
    async (sb) => {
      const filas = (estado.sagasJuegos ?? []).filter((x) => x.saga_id === sagaId);
      comprobar(await sb.from('sagas_juegos').upsert(filas, { onConflict: 'juego_id' }));
    },
    onError,
    'No se ha podido reordenar. Se ha deshecho el cambio.',
  );
}

/** Junta la saga "origen" dentro de "destino" (sus juegos van al final). */
export function fusionarSagas(destino, origen, onError) {
  const max = juegosDeSaga(destino).length;
  return escribirOptimista(
    (s) => {
      s.sagasJuegos = (s.sagasJuegos ?? []).map((x) => (x.saga_id === origen ? { ...x, saga_id: destino, orden: max + x.orden } : x));
      const enDestino = new Set((s.valSagas ?? []).filter((v) => v.saga_id === destino).map((v) => v.usuario_id));
      s.valSagas = (s.valSagas ?? []).filter((v) => !(v.saga_id === origen && enDestino.has(v.usuario_id))).map((v) => (v.saga_id === origen ? { ...v, saga_id: destino } : v));
      s.sagasG = (s.sagasG ?? []).filter((x) => x.id !== origen);
    },
    async (sb) => { comprobar(await sb.rpc('fusionar_sagas', { p_destino: destino, p_origen: origen })); },
    onError,
    'No se han podido fusionar las sagas. Se ha deshecho el cambio.',
  );
}

/** Borra una saga (sus juegos vuelven a verse sueltos; las valoraciones de la saga se borran). */
export function eliminarSaga(sagaId, onError) {
  return escribirOptimista(
    (s) => {
      s.sagasG = (s.sagasG ?? []).filter((x) => x.id !== sagaId);
      s.sagasJuegos = (s.sagasJuegos ?? []).filter((x) => x.saga_id !== sagaId);
      s.valSagas = (s.valSagas ?? []).filter((x) => x.saga_id !== sagaId);
    },
    async (sb) => { comprobar(await sb.from('sagas').delete().eq('id', sagaId)); },
    onError,
    'No se ha podido eliminar la saga. Se ha deshecho el cambio.',
  );
}

/** Valorar una saga (La sigo / La dejé / Pendiente, nota, recomendación, reseña y horas extra). */
export function guardarValoracionSaga(v, onError) {
  const antes = miValoracionSaga(v.usuarioId, v.sagaId);
  const ahora = new Date().toISOString();
  const pendiente = v.estado === 'pendiente';
  const fila = {
    id: antes?.id ?? crypto.randomUUID(),
    usuario_id: v.usuarioId,
    saga_id: v.sagaId,
    estado: v.estado,
    nota: pendiente ? null : redondear(v.nota),
    recomendado: pendiente ? null : (v.recomendado ?? null),
    resena: (v.resena || '').trim() || null,
    horas_extra: v.horasExtra !== undefined ? (v.horasExtra > 0 ? Math.round(v.horasExtra * 10) / 10 : null) : (antes?.horas_extra ?? null),
    creado_en: antes?.creado_en ?? ahora,
    actualizado_en: ahora,
  };
  return escribirOptimista(
    (s) => { s.valSagas = [...(s.valSagas ?? []).filter((x) => x.id !== fila.id), fila]; },
    async (sb) => { comprobar(await sb.from('valoraciones_saga').upsert(fila, { onConflict: 'usuario_id,saga_id' })); },
    onError,
  );
}

export function quitarValoracionSaga(usuarioId, sagaId, onError) {
  return escribirOptimista(
    (s) => { s.valSagas = (s.valSagas ?? []).filter((x) => !(x.usuario_id === usuarioId && x.saga_id === sagaId)); },
    async (sb) => { comprobar(await sb.from('valoraciones_saga').delete().eq('usuario_id', usuarioId).eq('saga_id', sagaId)); },
    onError,
    'No se ha podido quitar. Se ha deshecho el cambio.',
  );
}

/** Separa una versión fusionada (solo admin): vuelve a contar aparte y no se fusiona sola otra vez. */
export function separarVersion(aliasId, usuarioId, onError) {
  const a = Number(aliasId);
  return escribirOptimista(
    (s) => { s.alias = (s.alias ?? []).filter((x) => Number(x.alias_id) !== a); },
    async (sb) => {
      const r = await sb.rpc('separar_version', { p_alias: a, p_usuario: usuarioId });
      comprobar(r);
    },
    onError,
    'No se ha podido separar. Se ha vuelto a como estaba.',
  );
}

/** Mis avisos sin leer (p. ej. "tenías valoración en dos versiones"). */
export const avisosDe = (usuarioId) => (estado.avisos ?? []).filter((x) => x.usuario_id === usuarioId && !x.leido);
export function marcarAvisoLeido(id, onError) {
  return escribirOptimista(
    (s) => { s.avisos = (s.avisos ?? []).filter((x) => x.id !== id); },
    async (sb) => { comprobar(await sb.from('avisos').update({ leido: true }).eq('id', id)); },
    onError,
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
