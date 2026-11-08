// Datos del grupo en memoria.
// Al arrancar se pinta al instante desde localStorage y se refresca en segundo plano.
// Todas las métricas se calculan en el cliente (son pocos datos).
import { cliente } from './supabase.js';
import { mediaGrupo, recomendacionGrupo, repartoLetras, desviacionTipica, redondear } from './notas.js';

const CLAVE = 'cvj.datos.v1';
const LIMITE_ACTIVIDAD = 60;
const VENTANA_ACTIVIDAD_MS = 10 * 60 * 1000; // agrupar cambios del mismo juego en 10 min

const vacio = () => ({ usuarios: [], valoraciones: [], juegos: [], actividad: [], biblioteca: [], psnIgdb: [], alias: [], rechazadas: [], sugRechazadas: [], servicios: [], cuentas: [], horasExtra: [], avisos: [], coleccionesG: [], coleccionesJuegos: [], valColecciones: [], sagas: [], sagasJuegos: [], columnas: [], entradas: [], lecturas: [], horasAjustes: [], cargadoEn: null });

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

const firma = (s) => JSON.stringify([s.usuarios, s.valoraciones, s.juegos, s.actividad, s.biblioteca, s.psnIgdb, s.alias, s.rechazadas, s.sugRechazadas, s.servicios, s.cuentas, s.horasExtra, s.avisos, s.coleccionesG, s.coleccionesJuegos, s.valColecciones, s.sagas, s.sagasJuegos, s.columnas, s.entradas, s.lecturas, s.horasAjustes]);

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
    const [u, v, j, a, bib, emp, ali, rech, sag, serv, cue, hex, avi, sg, sgj, vsg, sa, saj, col, ent, lec, haj] = await Promise.all([
      leerUsuarios(sb),
      sb.from('valoraciones').select('*'),
      sb.from('juegos').select('*'),
      sb.from('actividad').select('*').order('creado_en', { ascending: false }).limit(LIMITE_ACTIVIDAD),
      // PSN es un extra: si falla (o aún no existe la tabla), se sigue sin ello.
      sb.from('biblioteca').select('*').then((r) => (r.error ? { data: estado.biblioteca } : r), () => ({ data: estado.biblioteca })),
      sb.from('psn_igdb').select('*').then((r) => (r.error ? { data: estado.psnIgdb } : r), () => ({ data: estado.psnIgdb })),
      extra(sb.from('juegos_alias').select('*'), estado.alias),
      extra(sb.from('fusiones_rechazadas').select('*'), estado.rechazadas),
      extra(sb.from('sagas_usuario').select('*'), estado.sugRechazadas),
      extra(sb.from('estado_servicios').select('*'), estado.servicios),
      extra(sb.from('cuentas_plataforma').select('*').order('creado_en'), estado.cuentas),
      extra(sb.from('horas_extra').select('*'), estado.horasExtra),
      extra(sb.from('avisos').select('*').eq('leido', false), estado.avisos),
      extra(sb.from('colecciones').select('*'), estado.coleccionesG),
      extra(sb.from('colecciones_juegos').select('*'), estado.coleccionesJuegos),
      extra(sb.from('valoraciones_coleccion').select('*'), estado.valColecciones),
      extra(sb.from('sagas').select('*'), estado.sagas),
      extra(sb.from('sagas_juegos').select('*'), estado.sagasJuegos),
      extra(sb.from('columnas').select('*'), estado.columnas),
      // Entradas de las columnas: sin el texto (puede ser larguísimo; se pide al leer).
      // Las publicadas de todos y los borradores propios.
      extra(sb.from('entradas').select(COLUMNAS_ENTRADA).or(`estado.eq.publicada,usuario_id.eq.${usuarioDeSesion() ?? '00000000-0000-0000-0000-000000000000'}`), estado.entradas),
      extra(sb.from('lecturas').select('*').eq('usuario_id', usuarioDeSesion() ?? '00000000-0000-0000-0000-000000000000'), estado.lecturas),
      extra(sb.from('horas_ajustes').select('*'), estado.horasAjustes),
    ]);
    const error = u.error || v.error || j.error || a.error;
    if (error) throw new Error(error.message);
    if (escriturasEnCurso) { refrescoAplazado = true; return; }
    const nuevo = {
      usuarios: u.data, valoraciones: v.data, juegos: j.data, actividad: a.data, biblioteca: bib.data ?? [], psnIgdb: emp.data ?? [],
      alias: ali.data ?? [], rechazadas: rech.data ?? [], sugRechazadas: sag.data ?? [], servicios: serv.data ?? [], cuentas: cue.data ?? [], horasExtra: hex.data ?? [], avisos: avi.data ?? [],
      coleccionesG: sg.data ?? [], coleccionesJuegos: sgj.data ?? [], valColecciones: vsg.data ?? [],
      sagas: sa.data ?? [], sagasJuegos: saj.data ?? [], columnas: col.data ?? [], entradas: ent.data ?? [], lecturas: lec.data ?? [],
      horasAjustes: haj.data ?? [],
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
const COLUMNAS_ENTRADA = 'id, columna_id, usuario_id, juego_id, coleccion_id, saga_id, titulo, subtitulo, palabras, estado, publicada_en, creado_en, actualizado_en';
/** Usuario con sesión (de localStorage, sin importar sesion.js para no crear un ciclo). */
function usuarioDeSesion() {
  try { return JSON.parse(localStorage.getItem('cvj.sesion') || 'null')?.usuario?.id ?? null; } catch { return null; }
}
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
  // Colecciones del grupo: juego (principal) → coleccion y coleccion → juegos en orden.
  const colecciones = new Map((s.coleccionesG ?? []).map((x) => [x.id, x]));
  const coleccionDeJuego = new Map();
  const juegosDeColeccion = new Map();
  for (const x of [...(s.coleccionesJuegos ?? [])].sort((a, b) => a.orden - b.orden)) {
    if (!colecciones.has(x.coleccion_id)) continue;
    const id = canon(x.juego_id);
    if (coleccionDeJuego.has(id)) continue;
    coleccionDeJuego.set(id, x.coleccion_id);
    if (!juegosDeColeccion.has(x.coleccion_id)) juegosDeColeccion.set(x.coleccion_id, []);
    juegosDeColeccion.get(x.coleccion_id).push(id);
  }
  const valsColeccion = new Map();
  for (const v of s.valColecciones ?? []) {
    if (!colecciones.has(v.coleccion_id)) continue;
    if (!valsColeccion.has(v.coleccion_id)) valsColeccion.set(v.coleccion_id, []);
    valsColeccion.get(v.coleccion_id).push(v);
  }
  // Sagas (Persona, Zelda...): juegos independientes que se ven juntos.
  const sagas = new Map((s.sagas ?? []).map((x) => [x.id, x]));
  const juegosDeSaga = new Map();
  const sagasDeJuego = new Map();
  for (const x of s.sagasJuegos ?? []) {
    if (x.excluido || !sagas.has(x.saga_id)) continue;
    const id = canon(x.juego_id);
    if (!juegosDeSaga.has(x.saga_id)) juegosDeSaga.set(x.saga_id, []);
    const l = juegosDeSaga.get(x.saga_id);
    if (!l.includes(id)) l.push(id);
  }
  for (const l of juegosDeSaga.values()) {
    // En orden de salida.
    l.sort((a, b) => (juegos.get(a)?.anio ?? 9999) - (juegos.get(b)?.anio ?? 9999) || (juegos.get(a)?.nombre ?? '').localeCompare(juegos.get(b)?.nombre ?? ''));
  }
  // Una saga cuyos juegos están todos en otra más grande (IGDB tiene "Persona 3" dentro
  // de "Persona") no sale aparte en las fichas: se ve la grande.
  const contenidas = new Set();
  const visibles = [...juegosDeSaga.entries()].filter(([sid, l]) => !sagas.get(sid).oculta && !sagas.get(sid).fusionada_en && l.length >= 2);
  for (const [a, la] of visibles) {
    for (const [b, lb] of visibles) {
      if (a !== b && la.length < lb.length && la.every((x) => lb.includes(x))) { contenidas.add(a); break; }
    }
  }
  for (const [sid, l] of juegosDeSaga) {
    const sg = sagas.get(sid);
    if (sg.oculta || sg.fusionada_en || l.length < 2 || contenidas.has(sid)) continue;
    for (const id of l) {
      if (!sagasDeJuego.has(id)) sagasDeJuego.set(id, []);
      sagasDeJuego.get(id).push(sid);
    }
  }
  return { usuarios, juegos, porJuego, psnIgdb, bibUsuario, bibJuego, canon, vals, aliasA, extraHoras, colecciones, coleccionDeJuego, juegosDeColeccion, valsColeccion, sagas, juegosDeSaga, sagasDeJuego, contenidas };
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

// ---------------------------------------------------------------------------
// Horas que se repiten entre fuentes: qué cuenta (lo decide cada usuario; por
// defecto todo suma). Clave de línea: "{cuenta_id o fuente}|{plataforma original}".
// ---------------------------------------------------------------------------
export const claveLineaHoras = (f) => `${f.cuenta_id ?? f.fuente ?? 'psn'}|${f.plataforma ?? 'Otra'}`;
const AJUSTE_VACIO = Object.freeze({ excluidas: [], plataformas: {}, distintas: false });
/** Lo decidido por un usuario en un juego (o el ajuste vacío: todo cuenta). */
export function ajusteHoras(usuarioId, igdbId) {
  if (igdbId == null) return AJUSTE_VACIO;
  const id = canonico(igdbId);
  return (estado.horasAjustes ?? []).find((x) => x.usuario_id === usuarioId && Number(x.juego_id) === id) ?? AJUSTE_VACIO;
}
export const hayAjustesHoras = () => Array.isArray(estado.horasAjustes);

/**
 * Cambia lo decidido en varios juegos con una sola escritura.
 * @param {(antes: {excluidas, plataformas, distintas}, id) => object|null} cambiar
 */
export function ajustesHorasEnLote(usuarioId, igdbIds, cambiar, onError) {
  const ahora = new Date().toISOString();
  const ids = [...new Set(igdbIds.map((x) => canonico(x)))];
  const antes = [];
  const creadas = [];
  const nuevas = [];
  for (const id of ids) {
    const previa = (estado.horasAjustes ?? []).find((x) => x.usuario_id === usuarioId && Number(x.juego_id) === id) ?? null;
    const c = cambiar(previa ?? AJUSTE_VACIO, id);
    if (!c) continue;
    const fila = { usuario_id: usuarioId, juego_id: id, excluidas: [], plataformas: {}, distintas: false, ...(previa ?? {}), ...c, actualizado_en: ahora };
    fila.excluidas = [...new Set(fila.excluidas)];
    nuevas.push(fila);
    if (previa) antes.push(previa); else creadas.push(id);
  }
  if (!nuevas.length) return { ok: Promise.resolve(true), deshacer: () => Promise.resolve(true), cuantos: 0 };
  const es = (x, lista) => x.usuario_id === usuarioId && lista.includes(Number(x.juego_id));
  const tocados = nuevas.map((f) => f.juego_id);
  const ok = escribirOptimista(
    (s) => { s.horasAjustes = [...(s.horasAjustes ?? []).filter((x) => !es(x, tocados)), ...nuevas]; },
    async (sb) => { comprobar(await sb.from('horas_ajustes').upsert(nuevas, { onConflict: 'usuario_id,juego_id' })); },
    onError,
    'No se han podido guardar las horas. Se ha deshecho el cambio.',
  );
  const deshacer = () => escribirOptimista(
    (s) => { s.horasAjustes = [...(s.horasAjustes ?? []).filter((x) => !es(x, tocados)), ...antes]; },
    async (sb) => {
      if (antes.length) comprobar(await sb.from('horas_ajustes').upsert(antes, { onConflict: 'usuario_id,juego_id' }));
      if (creadas.length) comprobar(await sb.from('horas_ajustes').delete().eq('usuario_id', usuarioId).in('juego_id', creadas));
    },
    onError,
    'No se ha podido deshacer.',
  );
  return { ok, deshacer, cuantos: nuevas.length };
}
/** ¿Hay tabla de horas extra? (migración 011) */
export const hayHorasExtra = () => Array.isArray(estado.horasExtra) && (estado.horasExtra.length > 0 || estado.cuentas?.length > 0);
/** Cuentas de plataforma de un usuario (opcionalmente de una fuente: psn, xbox, steam). */
export const cuentasDe = (usuarioId, fuente) => (estado.cuentas ?? []).filter((c) => c.usuario_id === usuarioId && (!fuente || c.fuente === fuente));
export const cuenta = (id) => (estado.cuentas ?? []).find((c) => c.id === id) ?? null;

// ---------------------------------------------------------------------------
// Colecciones del grupo
// ---------------------------------------------------------------------------
/** ¿Hay tablas de colecciones? (migración 013) */
export const hayColecciones = () => Array.isArray(estado.coleccionesG);
export const coleccion = (id) => indices.colecciones.get(id) ?? null;
export const colecciones = () => [...indices.colecciones.values()];
/** Colección en la que está un juego (o null). */
export const coleccionDeJuego = (igdbId) => coleccion(indices.coleccionDeJuego.get(canonico(igdbId)));
/** Juegos de una colección, en su orden. */
export const juegosDeColeccion = (coleccionId) => indices.juegosDeColeccion.get(coleccionId) ?? [];
export const valoracionesDeColeccion = (coleccionId) => indices.valsColeccion.get(coleccionId) ?? [];
export const miValoracionColeccion = (usuarioId, coleccionId) => valoracionesDeColeccion(coleccionId).find((v) => v.usuario_id === usuarioId) ?? null;
export const valoracionesColeccionDe = (usuarioId) => (estado.valColecciones ?? []).filter((v) => v.usuario_id === usuarioId && indices.colecciones.has(v.coleccion_id));
/** Portada de una colección: la elegida o la de su último juego. */
export function portadaColeccion(s) {
  if (!s) return null;
  if (s.cover_id) return s.cover_id;
  const ids = juegosDeColeccion(s.id);
  for (let i = ids.length - 1; i >= 0; i--) { const c = juegoConocido(ids[i])?.cover_id; if (c) return c; }
  return null;
}
/** Una colección "como un juego" para pintarla con las mismas piezas (portada, nombre...). */
export const comoJuego = (s) => (s ? { igdb_id: null, coleccion_id: s.id, nombre: s.nombre, cover_id: portadaColeccion(s), anio: null, plataformas: [], es_online: !!s.es_online } : null);
/** ¿Colección online / sin final? (FIFA...: no se juega "hasta el final") */
export const coleccionOnline = (coleccionId) => !!coleccion(coleccionId)?.es_online;

// ---------------------------------------------------------------------------
// Sagas (Persona, Zelda...): se generan solas desde IGDB; el admin las retoca
// ---------------------------------------------------------------------------
export const saga = (id) => indices.sagas?.get(id) ?? null;
/** Juegos de una saga (principales, en orden de salida). */
export const juegosDeSaga = (sagaId) => indices.juegosDeSaga?.get(sagaId) ?? [];
/** ¿Se ve? (no oculta, no fusionada con otra y con 2 juegos o más) */
export const sagaVisible = (sg) => !!sg && !sg.oculta && !sg.fusionada_en && juegosDeSaga(sg.id).length >= 2;
/** Sagas que se ven (las ocultas solo las ve el admin, en Gestionar grupo). */
export const sagas = () => [...(indices.sagas?.values() ?? [])].filter((x) => sagaVisible(x) && !indices.contenidas?.has(x.id));
export const sagasOcultas = () => [...(indices.sagas?.values() ?? [])].filter((x) => x.oculta && !x.fusionada_en);
/** Sagas (visibles) de un juego. */
export const sagasDeJuego = (igdbId) => (indices.sagasDeJuego?.get(canonico(igdbId)) ?? []).map(saga).filter(Boolean);

/** Admin: renombrar u ocultar / mostrar una saga. */
export function editarSaga(sagaId, cambios, onError) {
  const c = { ...cambios, actualizado_en: new Date().toISOString() };
  if ('nombre' in c) { c.nombre = String(c.nombre).trim().slice(0, 80); c.nombre_manual = true; if (!c.nombre) return Promise.resolve(false); }
  return escribirOptimista(
    (s) => { s.sagas = (s.sagas ?? []).map((x) => (x.id === sagaId ? { ...x, ...c } : x)); },
    async (sb) => { comprobar(await sb.from('sagas').update(c).eq('id', sagaId)); },
    onError,
    'No se ha podido guardar la saga. Se ha deshecho el cambio.',
  );
}

/** Admin: quitar un juego de una saga (IGDB no lo vuelve a poner). */
export function quitarDeSaga(sagaId, igdbId, onError) {
  const id = canonico(igdbId);
  const ids = [id, ...aliasDe(id)];
  const filas = (estado.sagasJuegos ?? []).filter((x) => x.saga_id === sagaId && ids.includes(Number(x.juego_id))).map((x) => ({ ...x, excluido: true, manual: false }));
  return escribirOptimista(
    (s) => { s.sagasJuegos = (s.sagasJuegos ?? []).map((x) => (x.saga_id === sagaId && ids.includes(Number(x.juego_id)) ? { ...x, excluido: true, manual: false } : x)); },
    async (sb) => { if (filas.length) comprobar(await sb.from('sagas_juegos').upsert(filas, { onConflict: 'saga_id,juego_id' })); },
    onError,
    'No se ha podido quitar. Se ha deshecho el cambio.',
  );
}

/** Admin: añadir juegos a una saga (también los que se quitaron antes). */
export function anadirASaga(sagaId, ids, onError) {
  const lista = [...new Set(ids.map((x) => canonico(x)))];
  const faltan = juegosQueFaltan(lista);
  const filas = lista.map((j) => ({ saga_id: sagaId, juego_id: j, manual: true, excluido: false, creado_en: new Date().toISOString() }));
  return escribirOptimista(
    (s) => {
      if (faltan.length) s.juegos = [...s.juegos, ...faltan.map(filaJuego)];
      s.sagasJuegos = [...(s.sagasJuegos ?? []).filter((x) => !(x.saga_id === sagaId && lista.includes(canonico(x.juego_id)))), ...filas];
    },
    async (sb) => {
      if (faltan.length) comprobar(await sb.from('juegos').upsert(faltan.map(filaJuego), { onConflict: 'igdb_id', ignoreDuplicates: true }));
      comprobar(await sb.from('sagas_juegos').upsert(filas, { onConflict: 'saga_id,juego_id' }));
    },
    onError,
    'No se han podido añadir. Se ha deshecho el cambio.',
  );
}

/** Admin: fusionar la saga "origen" en "destino" (sus juegos pasan a destino; IGDB lo respeta). */
export function fusionarSagas(destino, origen, onError) {
  const ahora = new Date().toISOString();
  const yaEnDestino = new Set((estado.sagasJuegos ?? []).filter((x) => x.saga_id === destino).map((x) => Number(x.juego_id)));
  const nuevas = (estado.sagasJuegos ?? []).filter((x) => x.saga_id === origen && !x.excluido && !yaEnDestino.has(Number(x.juego_id)))
    .map((x) => ({ saga_id: destino, juego_id: x.juego_id, manual: false, excluido: false, creado_en: ahora }));
  return escribirOptimista(
    (s) => {
      s.sagasJuegos = [...(s.sagasJuegos ?? []), ...nuevas];
      s.sagas = (s.sagas ?? []).map((x) => (x.id === origen ? { ...x, fusionada_en: destino, actualizado_en: ahora } : x));
    },
    async (sb) => {
      if (nuevas.length) comprobar(await sb.from('sagas_juegos').upsert(nuevas, { onConflict: 'saga_id,juego_id', ignoreDuplicates: true }));
      comprobar(await sb.from('sagas').update({ fusionada_en: destino, actualizado_en: ahora }).eq('id', origen));
    },
    onError,
    'No se han podido fusionar las sagas. Se ha deshecho el cambio.',
  );
}

// ---------------------------------------------------------------------------
// Columnas de opinión ("El Diario de Mateo")
// ---------------------------------------------------------------------------
export const columnas = () => (estado.columnas ?? []).filter((c) => c.activa !== false);
export const columna = (id) => (estado.columnas ?? []).find((c) => c.id === id) ?? null;
/** La columna de un usuario (si es columnista). */
export const columnaDe = (usuarioId) => (estado.columnas ?? []).find((c) => c.usuario_id === usuarioId && c.activa !== false) ?? null;
export const entrada = (id) => (estado.entradas ?? []).find((e) => e.id === id) ?? null;
const porFechaPub = (a, b) => (b.publicada_en ?? b.actualizado_en ?? '').localeCompare(a.publicada_en ?? a.actualizado_en ?? '');
/** Entradas publicadas (de una columna, o de todas), de la más reciente a la más antigua. */
export const entradasPublicadas = (columnaId = null) => (estado.entradas ?? [])
  .filter((e) => e.estado === 'publicada' && (!columnaId || e.columna_id === columnaId) && columna(e.columna_id)?.activa !== false)
  .sort(porFechaPub);
/** Borradores de un usuario. */
export const borradoresDe = (usuarioId) => (estado.entradas ?? []).filter((e) => e.estado === 'borrador' && e.usuario_id === usuarioId).sort(porFechaPub);
/** Entradas publicadas sobre un juego (o su versión principal), una colección o una saga. */
export function entradasSobre({ juego = null, coleccion = null, saga = null }) {
  const c = juego != null ? canonico(juego) : null;
  return entradasPublicadas().filter((e) => (c != null && e.juego_id != null && canonico(e.juego_id) === c)
    || (coleccion && e.coleccion_id === coleccion) || (saga && e.saga_id === saga));
}
export const leida = (usuarioId, entradaId) => (estado.lecturas ?? []).some((l) => l.usuario_id === usuarioId && l.entrada_id === entradaId);

/** El texto de una entrada (no se carga con lo demás). */
export async function cuerpoDe(entradaId) {
  const sb = await cliente();
  const r = await sb.from('entradas').select('cuerpo').eq('id', entradaId).maybeSingle();
  if (r.error) throw r.error;
  return r.data?.cuerpo ?? '';
}

/** Admin: crear o cambiar la columna de alguien (nombre, logo, color, activa). */
export function guardarColumna(fila, onError) {
  const f = { ...fila, nombre: String(fila.nombre ?? '').trim().slice(0, 60) };
  if (!f.id) f.id = crypto.randomUUID();
  return escribirOptimista(
    (s) => { s.columnas = [...(s.columnas ?? []).filter((c) => c.id !== f.id), { ...(columna(f.id) ?? {}), ...f }]; },
    async (sb) => { comprobar(await sb.from('columnas').upsert(f, { onConflict: 'id' })); },
    onError,
    'No se ha podido guardar la columna. Se ha deshecho el cambio.',
  ).then((ok) => (ok === false ? null : f.id));
}

/**
 * Guarda una entrada (borrador o publicada) con su texto. Sin aviso optimista de
 * error repetido: el editor guarda cada pocos segundos y avisa él si falla.
 */
export async function guardarEntrada(e) {
  const ahora = new Date().toISOString();
  const antes = entrada(e.id);
  const meta = {
    id: e.id, columna_id: e.columna_id, usuario_id: e.usuario_id,
    juego_id: e.juego_id ?? null, coleccion_id: e.coleccion_id ?? null, saga_id: e.saga_id ?? null,
    titulo: String(e.titulo ?? '').slice(0, 200), subtitulo: String(e.subtitulo ?? '').trim().slice(0, 300) || null,
    palabras: e.palabras ?? 0, estado: e.estado ?? antes?.estado ?? 'borrador',
    publicada_en: e.estado === 'publicada' ? (antes?.publicada_en ?? ahora) : (e.estado === 'borrador' ? null : antes?.publicada_en ?? null),
    creado_en: antes?.creado_en ?? ahora, actualizado_en: ahora,
  };
  const sb = await cliente();
  const r = await sb.from('entradas').upsert({ ...meta, cuerpo: String(e.cuerpo ?? '').slice(0, 100000) }, { onConflict: 'id' });
  if (r.error) throw r.error;
  estado.entradas = [...(estado.entradas ?? []).filter((x) => x.id !== meta.id), meta];
  indices = construirIndices(estado);
  guardarCache();
  avisar();
  return meta;
}

/** Borra una entrada (borrador o publicada). */
export function borrarEntrada(id, onError) {
  return escribirOptimista(
    (s) => { s.entradas = (s.entradas ?? []).filter((x) => x.id !== id); },
    async (sb) => { comprobar(await sb.from('entradas').delete().eq('id', id)); },
    onError,
    'No se ha podido borrar. Se ha deshecho el cambio.',
  );
}

/** Despublicar: vuelve a borrador (deja de verse). */
export function despublicarEntrada(id, onError) {
  return escribirOptimista(
    (s) => { s.entradas = (s.entradas ?? []).map((x) => (x.id === id ? { ...x, estado: 'borrador', publicada_en: null } : x)); },
    async (sb) => { comprobar(await sb.from('entradas').update({ estado: 'borrador', publicada_en: null, actualizado_en: new Date().toISOString() }).eq('id', id)); },
    onError,
    'No se ha podido despublicar. Se ha deshecho el cambio.',
  );
}

/** Marca una entrada como leída (quita el aviso "Nuevo en …" de Inicio). Sin avisos. */
export function marcarLeida(usuarioId, entradaId) {
  if (!usuarioId || leida(usuarioId, entradaId)) return;
  const fila = { usuario_id: usuarioId, entrada_id: entradaId, leida_en: new Date().toISOString() };
  escribirOptimista(
    (s) => { s.lecturas = [...(s.lecturas ?? []), fila]; },
    async (sb) => { comprobar(await sb.from('lecturas').upsert(fila, { onConflict: 'usuario_id,entrada_id', ignoreDuplicates: true })); },
  );
}

/** Sube una imagen al Storage de las columnas. Devuelve su URL pública. */
export async function subirImagenColumna(ruta, blob) {
  const sb = await cliente();
  const r = await sb.storage.from('columnas').upload(ruta, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (r.error) throw r.error;
  return sb.storage.from('columnas').getPublicUrl(ruta).data.publicUrl;
}

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
/** Colecciones sugeridas que alguien rechazó ("No, son distintos"): Map(colección de IGDB → fila). Tabla sagas_usuario. */
export const coleccionesRechazadasDe = (usuarioId) => new Map((estado.sugRechazadas ?? []).filter((x) => x.usuario_id === usuarioId).map((x) => [Number(x.coleccion_id), x]));

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
/**
 * Valoraciones de un juego con las heredadas de su colección (regla 1): quien valoró la
 * colección y NO tiene valoración propia de este juego sale con la de la colección
 * (calculada, no copiada: si cambia la de la colección, cambia aquí). La propia manda.
 * Las heredadas llevan heredada: { coleccionId, nombre }.
 */
export function valoracionesConHeredadas(igdbId) {
  const id = canonico(igdbId);
  const propias = valoracionesDeJuego(id);
  const sg = coleccionDeJuego(id);
  if (!sg) return propias;
  const con = new Set(propias.map((v) => v.usuario_id));
  const heredadas = valoracionesDeColeccion(sg.id)
    .filter((v) => !con.has(v.usuario_id))
    .map((v) => ({ ...v, id: `coleccion:${v.id}`, juego_id: id, plataformas: null, heredada: { coleccionId: sg.id, nombre: sg.nombre } }));
  return [...propias, ...heredadas];
}

export function statsJuego(igdbId) {
  const vals = valoracionesConHeredadas(igdbId).filter((v) => indices.usuarios.size === 0 || indices.usuarios.has(v.usuario_id));
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
    psnIgdb: estado.psnIgdb, biblioteca: estado.biblioteca, alias: estado.alias, rechazadas: estado.rechazadas, sugRechazadas: estado.sugRechazadas,
    horasExtra: estado.horasExtra, cuentas: estado.cuentas, avisos: estado.avisos,
    coleccionesG: estado.coleccionesG, coleccionesJuegos: estado.coleccionesJuegos, valColecciones: estado.valColecciones,
    sagas: estado.sagas, sagasJuegos: estado.sagasJuegos, columnas: estado.columnas, entradas: estado.entradas, lecturas: estado.lecturas,
    horasAjustes: estado.horasAjustes,
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
    // ¿Cuenta en mi tier list y los rankings? Por defecto sí, salvo en juegos sin final.
    cuenta_ranking: typeof v.cuentaRanking === 'boolean' ? v.cuentaRanking
      : typeof antes?.cuenta_ranking === 'boolean' ? antes.cuenta_ranking : !esOnline(id),
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

/** ¿Juego sin final (online, competitivo...)? Lo marca el admin; lo manual manda sobre lo automático. */
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

/** Crea una colección con unos juegos (que salen de la colección en la que estuvieran). Devuelve su id. */
export function crearColeccion({ nombre, juegos: ids = [], igdbColeccionId = null, usuarioId }, onError) {
  const id = crypto.randomUUID();
  const ahora = new Date().toISOString();
  const lista = [...new Set(ids.map((x) => canonico(x)))];
  const faltan = juegosQueFaltan(lista);
  const fila = { id, nombre: String(nombre).trim().slice(0, 80) || 'Colección', cover_id: null, igdb_coleccion_id: igdbColeccionId, creado_por: usuarioId, creado_en: ahora, actualizado_en: ahora };
  const filasJ = lista.map((j, i) => ({ juego_id: j, coleccion_id: id, orden: i + 1, creado_en: ahora }));
  escribirOptimista(
    (s) => {
      if (faltan.length) s.juegos = [...s.juegos, ...faltan.map(filaJuego)];
      s.coleccionesG = [...(s.coleccionesG ?? []), fila];
      s.coleccionesJuegos = [...(s.coleccionesJuegos ?? []).filter((x) => !lista.includes(canonico(x.juego_id))), ...filasJ];
    },
    async (sb) => {
      if (faltan.length) comprobar(await sb.from('juegos').upsert(faltan.map(filaJuego), { onConflict: 'igdb_id', ignoreDuplicates: true }));
      comprobar(await sb.from('colecciones').insert(fila));
      if (filasJ.length) comprobar(await sb.from('colecciones_juegos').upsert(filasJ, { onConflict: 'juego_id' }));
    },
    onError,
    'No se ha podido crear la colección. Se ha deshecho el cambio.',
  );
  return id;
}

/** Cambia el nombre o la portada de una colección. */
export function editarColeccion(coleccionId, cambios, onError) {
  const c = { ...cambios, actualizado_en: new Date().toISOString() };
  if ('nombre' in c) c.nombre = String(c.nombre).trim().slice(0, 80);
  if (c.nombre === '') return Promise.resolve(false);
  return escribirOptimista(
    (s) => { s.coleccionesG = (s.coleccionesG ?? []).map((x) => (x.id === coleccionId ? { ...x, ...c } : x)); },
    async (sb) => { comprobar(await sb.from('colecciones').update(c).eq('id', coleccionId)); },
    onError,
    'No se ha podido guardar la colección. Se ha deshecho el cambio.',
  );
}

/** Añade juegos al final de una colección (si estaban en otra, se cambian a esta). */
export function anadirAColeccion(coleccionId, ids, onError) {
  const ahora = new Date().toISOString();
  const lista = [...new Set(ids.map((x) => canonico(x)))].filter((j) => indices.coleccionDeJuego.get(j) !== coleccionId);
  if (!lista.length) return Promise.resolve(true);
  const faltan = juegosQueFaltan(lista);
  const max = juegosDeColeccion(coleccionId).length;
  const filas = lista.map((j, i) => ({ juego_id: j, coleccion_id: coleccionId, orden: max + i + 1, creado_en: ahora }));
  return escribirOptimista(
    (s) => {
      if (faltan.length) s.juegos = [...s.juegos, ...faltan.map(filaJuego)];
      s.coleccionesJuegos = [...(s.coleccionesJuegos ?? []).filter((x) => !lista.includes(canonico(x.juego_id))), ...filas];
    },
    async (sb) => {
      if (faltan.length) comprobar(await sb.from('juegos').upsert(faltan.map(filaJuego), { onConflict: 'igdb_id', ignoreDuplicates: true }));
      comprobar(await sb.from('colecciones_juegos').upsert(filas, { onConflict: 'juego_id' }));
    },
    onError,
    'No se han podido añadir. Se ha deshecho el cambio.',
  );
}

/** Saca un juego de su colección. */
export function quitarDeColeccion(igdbId, onError) {
  const id = canonico(igdbId);
  const ids = [id, ...aliasDe(id)];
  return escribirOptimista(
    (s) => { s.coleccionesJuegos = (s.coleccionesJuegos ?? []).filter((x) => !ids.includes(Number(x.juego_id))); },
    async (sb) => { comprobar(await sb.from('colecciones_juegos').delete().in('juego_id', ids)); },
    onError,
    'No se ha podido quitar de la colección. Se ha deshecho el cambio.',
  );
}

/** Nuevo orden de los juegos de una colección. */
export function ordenarColeccion(coleccionId, ids, onError) {
  const orden = new Map(ids.map((j, i) => [Number(j), i + 1]));
  return escribirOptimista(
    (s) => { s.coleccionesJuegos = (s.coleccionesJuegos ?? []).map((x) => (x.coleccion_id === coleccionId && orden.has(canonico(x.juego_id)) ? { ...x, orden: orden.get(canonico(x.juego_id)) } : x)); },
    async (sb) => {
      const filas = (estado.coleccionesJuegos ?? []).filter((x) => x.coleccion_id === coleccionId);
      comprobar(await sb.from('colecciones_juegos').upsert(filas, { onConflict: 'juego_id' }));
    },
    onError,
    'No se ha podido reordenar. Se ha deshecho el cambio.',
  );
}

/** Junta la colección "origen" dentro de "destino" (sus juegos van al final). */
export function fusionarColecciones(destino, origen, onError) {
  const max = juegosDeColeccion(destino).length;
  return escribirOptimista(
    (s) => {
      s.coleccionesJuegos = (s.coleccionesJuegos ?? []).map((x) => (x.coleccion_id === origen ? { ...x, coleccion_id: destino, orden: max + x.orden } : x));
      const enDestino = new Set((s.valColecciones ?? []).filter((v) => v.coleccion_id === destino).map((v) => v.usuario_id));
      s.valColecciones = (s.valColecciones ?? []).filter((v) => !(v.coleccion_id === origen && enDestino.has(v.usuario_id))).map((v) => (v.coleccion_id === origen ? { ...v, coleccion_id: destino } : v));
      s.coleccionesG = (s.coleccionesG ?? []).filter((x) => x.id !== origen);
    },
    async (sb) => { comprobar(await sb.rpc('fusionar_colecciones', { p_destino: destino, p_origen: origen })); },
    onError,
    'No se han podido fusionar las colecciones. Se ha deshecho el cambio.',
  );
}

/** Borra una colección (sus juegos vuelven a verse sueltos; las valoraciones de la colección se borran). */
export function eliminarColeccion(coleccionId, onError) {
  return escribirOptimista(
    (s) => {
      s.coleccionesG = (s.coleccionesG ?? []).filter((x) => x.id !== coleccionId);
      s.coleccionesJuegos = (s.coleccionesJuegos ?? []).filter((x) => x.coleccion_id !== coleccionId);
      s.valColecciones = (s.valColecciones ?? []).filter((x) => x.coleccion_id !== coleccionId);
    },
    async (sb) => { comprobar(await sb.from('colecciones').delete().eq('id', coleccionId)); },
    onError,
    'No se ha podido eliminar la colección. Se ha deshecho el cambio.',
  );
}

/** Valorar una colección (La sigo / La dejé / Pendiente, nota, recomendación, reseña y horas extra). */
export function guardarValoracionColeccion(v, onError) {
  const antes = miValoracionColeccion(v.usuarioId, v.coleccionId);
  const ahora = new Date().toISOString();
  const pendiente = v.estado === 'pendiente';
  const fila = {
    id: antes?.id ?? crypto.randomUUID(),
    usuario_id: v.usuarioId,
    coleccion_id: v.coleccionId,
    estado: v.estado,
    nota: pendiente ? null : redondear(v.nota),
    recomendado: pendiente ? null : (v.recomendado ?? null),
    resena: (v.resena || '').trim() || null,
    horas_extra: v.horasExtra !== undefined ? (v.horasExtra > 0 ? Math.round(v.horasExtra * 10) / 10 : null) : (antes?.horas_extra ?? null),
    cuenta_ranking: typeof v.cuentaRanking === 'boolean' ? v.cuentaRanking
      : typeof antes?.cuenta_ranking === 'boolean' ? antes.cuenta_ranking : !coleccion(v.coleccionId)?.es_online,
    creado_en: antes?.creado_en ?? ahora,
    actualizado_en: ahora,
  };
  // Actividad: UNA entrada por la colección ("Marcos valoró la colección FIFA").
  let tipo = null;
  if (!antes || antes.estado !== fila.estado) tipo = fila.nota != null ? 'valoro' : TIPO_POR_ESTADO[fila.estado];
  else if (redondear(antes.nota) !== fila.nota || (antes.recomendado ?? null) !== fila.recomendado || (antes.resena || null) !== fila.resena) tipo = 'valoro';
  let act = null;
  let actualizarAct = false;
  if (tipo) {
    const reciente = estado.actividad.find((a) => a.usuario_id === v.usuarioId && a.coleccion_id === v.coleccionId
      && Date.now() - new Date(a.creado_en).getTime() < VENTANA_ACTIVIDAD_MS);
    const comun = { nota: fila.nota, recomendado: fila.recomendado, texto: fila.resena, creado_en: ahora };
    if (reciente) { act = { ...reciente, ...comun, tipo: tipo === 'valoro' && reciente.tipo !== 'valoro' && fila.nota == null ? reciente.tipo : tipo }; actualizarAct = true; }
    else act = { id: crypto.randomUUID(), usuario_id: v.usuarioId, juego_id: null, coleccion_id: v.coleccionId, tipo, ...comun };
  }
  return escribirOptimista(
    (s) => {
      s.valColecciones = [...(s.valColecciones ?? []).filter((x) => x.id !== fila.id), fila];
      if (act) s.actividad = [act, ...s.actividad.filter((x) => x.id !== act.id)];
    },
    async (sb) => {
      comprobar(await sb.from('valoraciones_coleccion').upsert(fila, { onConflict: 'usuario_id,coleccion_id' }));
      if (act) {
        if (actualizarAct) { const { id: idAct, ...cambios } = act; comprobar(await sb.from('actividad').update(cambios).eq('id', idAct)); }
        else comprobar(await sb.from('actividad').insert(act));
      }
    },
    onError,
  );
}

export function quitarValoracionColeccion(usuarioId, coleccionId, onError) {
  return escribirOptimista(
    (s) => {
      s.valColecciones = (s.valColecciones ?? []).filter((x) => !(x.usuario_id === usuarioId && x.coleccion_id === coleccionId));
      s.actividad = s.actividad.filter((x) => !(x.usuario_id === usuarioId && x.coleccion_id === coleccionId));
    },
    async (sb) => {
      comprobar(await sb.from('valoraciones_coleccion').delete().eq('usuario_id', usuarioId).eq('coleccion_id', coleccionId));
      comprobar(await sb.from('actividad').delete().eq('usuario_id', usuarioId).eq('coleccion_id', coleccionId));
    },
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

/** Agrupar (o "no, son distintos") una colección en la biblioteca y el historial de un usuario. */
export function guardarSugerenciaColeccion(usuarioId, igdbColeccionId, nombre, agrupada, onError) {
  const fila = { usuario_id: usuarioId, coleccion_id: Number(igdbColeccionId), nombre, agrupada, creado_en: new Date().toISOString() };
  return escribirOptimista(
    (s) => { s.sugRechazadas = [...(s.sugRechazadas ?? []).filter((x) => !(x.usuario_id === usuarioId && Number(x.coleccion_id) === fila.coleccion_id)), fila]; },
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

// ---------------------------------------------------------------------------
// Cambios en lote (selección múltiple): pocas peticiones para todos los juegos
// y una función para deshacerlo todo de golpe.
// Cada función devuelve { ok: Promise<boolean>, deshacer: () => Promise<boolean> }.
// ---------------------------------------------------------------------------
const sinColumnasViejas = ({ juego_origen: _o, horas: _h, plataforma: _p, ...fila }) => fila;

/** Mi fila de verdad (no la "efectiva") de un juego, en cualquiera de sus versiones. */
function filaValoracion(usuarioId, igdbId) {
  const v = miValoracion(usuarioId, igdbId);
  return v ? estado.valoraciones.find((x) => x.id === v.id) ?? null : null;
}

/**
 * Cambia mis valoraciones de varios juegos con una sola escritura.
 * @param {(antes: object|null, id: number) => object|null} cambiar  devuelve los campos
 *   nuevos (o null para no tocar ese juego). Si no había valoración y devuelve algo, se crea.
 */
export function valoracionesEnLote(usuarioId, igdbIds, cambiar, onError) {
  const ahora = new Date().toISOString();
  const ids = [...new Set(igdbIds.map((x) => canonico(x)))];
  const antes = [];
  const nuevas = [];
  const creadas = [];
  for (const id of ids) {
    const previa = filaValoracion(usuarioId, id);
    const cambios = cambiar(previa, id);
    if (!cambios) continue;
    const base = previa ?? {
      id: crypto.randomUUID(), usuario_id: usuarioId, juego_id: id, estado: 'pendiente', nota: null, recomendado: null,
      plataformas: null, resena: null, cuenta_ranking: !esOnline(id), creado_en: ahora,
    };
    const fila = { ...base, ...cambios, actualizado_en: ahora };
    if (fila.estado === 'pendiente') { fila.nota = null; fila.recomendado = null; }
    if (Array.isArray(fila.plataformas) && !fila.plataformas.length) fila.plataformas = null;
    nuevas.push(fila);
    if (previa) antes.push(previa); else creadas.push(fila.id);
  }
  // Actividad: los cambios de estado. Si son varios, una sola entrada agrupada (mismo "lote").
  const conCambio = nuevas.filter((f) => !antes.some((a) => a.id === f.id && a.estado === f.estado));
  const lote = conCambio.length > 1 ? crypto.randomUUID() : null;
  const acts = conCambio.map((f) => ({
    id: crypto.randomUUID(), usuario_id: usuarioId, juego_id: canonico(f.juego_id), tipo: TIPO_POR_ESTADO[f.estado],
    nota: f.nota, recomendado: f.recomendado, texto: null, creado_en: ahora, ...(lote ? { lote } : {}),
  })).filter((a) => a.tipo);
  const faltan = juegosQueFaltan(creadas.map((cid) => Number(nuevas.find((f) => f.id === cid).juego_id)));
  const tocadas = new Set(nuevas.map((f) => f.id));
  const idsActs = new Set(acts.map((a) => a.id));

  if (!nuevas.length) return { ok: Promise.resolve(true), deshacer: () => Promise.resolve(true), cuantos: 0 };
  const ok = escribirOptimista(
    (s) => {
      if (faltan.length) s.juegos = [...s.juegos, ...faltan.map(filaJuego)];
      s.valoraciones = [...s.valoraciones.filter((x) => !tocadas.has(x.id)), ...nuevas];
      if (acts.length) s.actividad = [...acts, ...s.actividad];
    },
    async (sb) => {
      if (faltan.length) comprobar(await sb.from('juegos').upsert(faltan.map(filaJuego), { onConflict: 'igdb_id', ignoreDuplicates: true }));
      comprobar(await sb.from('valoraciones').upsert(nuevas.map(sinColumnasViejas), { onConflict: 'usuario_id,juego_id' }));
      if (acts.length) comprobar(await sb.from('actividad').insert(acts));
    },
    onError,
    'No se han podido guardar los cambios. Se han deshecho.',
  );
  const deshacer = () => escribirOptimista(
    (s) => {
      s.valoraciones = [...s.valoraciones.filter((x) => !tocadas.has(x.id)), ...antes];
      s.actividad = s.actividad.filter((x) => !idsActs.has(x.id));
    },
    async (sb) => {
      if (antes.length) comprobar(await sb.from('valoraciones').upsert(antes.map(sinColumnasViejas), { onConflict: 'usuario_id,juego_id' }));
      if (creadas.length) comprobar(await sb.from('valoraciones').delete().in('id', creadas));
      if (idsActs.size) comprobar(await sb.from('actividad').delete().in('id', [...idsActs]));
    },
    onError,
    'No se ha podido deshacer.',
  );
  return { ok, deshacer, cuantos: nuevas.length };
}

/** Lo que se guarda al ocultar o mostrar algo de la biblioteca. */
function cambiosOcultar(oculto) {
  const con006 = (estado.biblioteca ?? []).some((b) => 'oculto_usuario' in b);
  return con006 ? { oculto, oculto_usuario: oculto, por_revisar: false } : { oculto };
}

/**
 * Cambia filas de mi biblioteca (Probados / Mis juegos, ocultar / mostrar) y guarda
 * cómo estaban para deshacerlo (agrupadas por valor: una petición por cada combinación).
 */
export function bibliotecaEnLote(usuarioId, psnTitleIds, que, onError) {
  const ids = new Set(psnTitleIds);
  const cambios = que === 'ocultar' ? cambiosOcultar(true) : que === 'mostrar' ? cambiosOcultar(false)
    : { en_mis_juegos: que === 'mis', por_revisar: false };
  const campos = Object.keys(cambios);
  const mias = (estado.biblioteca ?? []).filter((b) => b.usuario_id === usuarioId && ids.has(b.psn_title_id));
  const previos = new Map(); // JSON de los valores anteriores → títulos
  for (const b of mias) {
    const v = JSON.stringify(Object.fromEntries(campos.map((c) => [c, b[c] ?? null])));
    if (!previos.has(v)) previos.set(v, new Set());
    previos.get(v).add(b.psn_title_id);
  }
  const ok = escribirOptimista(
    (s) => { s.biblioteca = (s.biblioteca ?? []).map((b) => (b.usuario_id === usuarioId && ids.has(b.psn_title_id) ? { ...b, ...cambios } : b)); },
    async (sb) => { comprobar(await sb.from('biblioteca').update(cambios).eq('usuario_id', usuarioId).in('psn_title_id', [...ids])); },
    onError,
    'No se ha podido guardar. Se ha deshecho el cambio.',
  );
  const deshacer = () => escribirOptimista(
    (s) => {
      s.biblioteca = (s.biblioteca ?? []).map((b) => {
        if (b.usuario_id !== usuarioId || !ids.has(b.psn_title_id)) return b;
        for (const [v, tits] of previos) if (tits.has(b.psn_title_id)) return { ...b, ...JSON.parse(v) };
        return b;
      });
    },
    async (sb) => {
      for (const [v, tits] of previos) comprobar(await sb.from('biblioteca').update(JSON.parse(v)).eq('usuario_id', usuarioId).in('psn_title_id', [...tits]));
    },
    onError,
    'No se ha podido deshacer.',
  );
  return { ok, deshacer };
}

/** Admin: marcar o desmarcar varios juegos como "sin final" (una petición). */
export function marcarOnlineEnLote(igdbIds, valor, onError) {
  const ids = [...new Set(igdbIds.map((x) => canonico(x)))].filter((id) => juego(id));
  const cambios = { es_online: !!valor, es_online_manual: !!valor };
  const previos = new Map();
  for (const id of ids) {
    const j = juego(id);
    const v = JSON.stringify({ es_online: j.es_online ?? false, es_online_manual: j.es_online_manual ?? null });
    if (!previos.has(v)) previos.set(v, []);
    previos.get(v).push(id);
  }
  const ok = escribirOptimista(
    (s) => { s.juegos = s.juegos.map((x) => (ids.includes(Number(x.igdb_id)) ? { ...x, ...cambios } : x)); },
    async (sb) => { comprobar(await sb.from('juegos').update(cambios).in('igdb_id', ids)); },
    onError,
    'No se ha podido cambiar. Se ha deshecho el cambio.',
  );
  const deshacer = () => escribirOptimista(
    (s) => {
      s.juegos = s.juegos.map((x) => {
        for (const [v, lista] of previos) if (lista.includes(Number(x.igdb_id))) return { ...x, ...JSON.parse(v) };
        return x;
      });
    },
    async (sb) => { for (const [v, lista] of previos) comprobar(await sb.from('juegos').update(JSON.parse(v)).in('igdb_id', lista)); },
    onError,
    'No se ha podido deshacer.',
  );
  return { ok, deshacer, cuantos: ids.length };
}

/** Filas de colecciones_juegos de esos juegos (y sus versiones), para deshacer. */
const filasColeccion = (ids) => {
  const todos = new Set(ids.flatMap((id) => [id, ...aliasDe(id)]));
  return (estado.coleccionesJuegos ?? []).filter((x) => todos.has(Number(x.juego_id)));
};
const restaurarColecciones = (ids, antes, onError) => {
  const todos = [...new Set(ids.flatMap((id) => [id, ...aliasDe(id)]))];
  return escribirOptimista(
    (s) => { s.coleccionesJuegos = [...(s.coleccionesJuegos ?? []).filter((x) => !todos.includes(Number(x.juego_id))), ...antes]; },
    async (sb) => {
      comprobar(await sb.from('colecciones_juegos').delete().in('juego_id', todos));
      if (antes.length) comprobar(await sb.from('colecciones_juegos').upsert(antes, { onConflict: 'juego_id' }));
    },
    onError,
    'No se ha podido deshacer.',
  );
};

/** Admin: varios juegos a una colección (sacándolos de la que tuvieran). */
export function anadirAColeccionEnLote(coleccionId, igdbIds, onError) {
  const ids = [...new Set(igdbIds.map((x) => canonico(x)))];
  const antes = filasColeccion(ids);
  return { ok: anadirAColeccion(coleccionId, ids, onError), deshacer: () => restaurarColecciones(ids, antes, onError) };
}

/** Admin: sacar varios juegos de su colección (una petición). */
export function quitarDeColeccionEnLote(igdbIds, onError) {
  const ids = [...new Set(igdbIds.map((x) => canonico(x)))];
  const antes = filasColeccion(ids);
  const todos = [...new Set(antes.map((x) => Number(x.juego_id)))];
  const ok = !todos.length ? Promise.resolve(true) : escribirOptimista(
    (s) => { s.coleccionesJuegos = (s.coleccionesJuegos ?? []).filter((x) => !todos.includes(Number(x.juego_id))); },
    async (sb) => { comprobar(await sb.from('colecciones_juegos').delete().in('juego_id', todos)); },
    onError,
    'No se ha podido quitar de la colección. Se ha deshecho el cambio.',
  );
  return { ok, deshacer: () => restaurarColecciones(ids, antes, onError), cuantos: todos.length };
}

/** Filas de sagas_juegos de una saga para esos juegos (y sus versiones). */
const filasSaga = (sagaId, ids) => {
  const todos = new Set(ids.flatMap((id) => [id, ...aliasDe(id)]));
  return (estado.sagasJuegos ?? []).filter((x) => x.saga_id === sagaId && todos.has(Number(x.juego_id)));
};
const restaurarSaga = (sagaId, ids, antes, onError) => {
  const todos = [...new Set(ids.flatMap((id) => [id, ...aliasDe(id)]))];
  const nuevas = todos.filter((j) => !antes.some((x) => Number(x.juego_id) === j));
  return escribirOptimista(
    (s) => { s.sagasJuegos = [...(s.sagasJuegos ?? []).filter((x) => !(x.saga_id === sagaId && todos.includes(Number(x.juego_id)))), ...antes]; },
    async (sb) => {
      if (antes.length) comprobar(await sb.from('sagas_juegos').upsert(antes, { onConflict: 'saga_id,juego_id' }));
      if (nuevas.length) comprobar(await sb.from('sagas_juegos').delete().eq('saga_id', sagaId).in('juego_id', nuevas));
    },
    onError,
    'No se ha podido deshacer.',
  );
};

/** Admin: varios juegos a una saga. */
export function anadirASagaEnLote(sagaId, igdbIds, onError) {
  const ids = [...new Set(igdbIds.map((x) => canonico(x)))];
  const antes = filasSaga(sagaId, ids);
  return { ok: anadirASaga(sagaId, ids, onError), deshacer: () => restaurarSaga(sagaId, ids, antes, onError) };
}

/** Admin: quitar varios juegos de una saga (IGDB no los vuelve a poner). */
export function quitarDeSagaEnLote(sagaId, igdbIds, onError) {
  const ids = [...new Set(igdbIds.map((x) => canonico(x)))];
  const antes = filasSaga(sagaId, ids);
  const filas = antes.map((x) => ({ ...x, excluido: true, manual: false }));
  const ok = !filas.length ? Promise.resolve(true) : escribirOptimista(
    (s) => {
      const quitar = new Set(filas.map((x) => Number(x.juego_id)));
      s.sagasJuegos = (s.sagasJuegos ?? []).map((x) => (x.saga_id === sagaId && quitar.has(Number(x.juego_id)) ? { ...x, excluido: true, manual: false } : x));
    },
    async (sb) => { comprobar(await sb.from('sagas_juegos').upsert(filas, { onConflict: 'saga_id,juego_id' })); },
    onError,
    'No se ha podido quitar. Se ha deshecho el cambio.',
  );
  return { ok, deshacer: () => restaurarSaga(sagaId, ids, antes, onError), cuantos: filas.length };
}

// Para probar a mano desde la consola sin Supabase (no se usa en la app).
export const _interno = {
  cargar(datos) {
    Object.assign(estado, vacio(), datos);
    indices = construirIndices(estado);
    avisar();
  },
};
