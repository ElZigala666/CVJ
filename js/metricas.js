// Métricas de perfiles, tier list, estadísticas, rankings y comparar.
// Todo se calcula en el cliente y se memoiza por versión de datos: cambiar de
// pestaña o de usuario no recalcula nada si los datos no han cambiado.
import * as datos from './datos.js';
import { mediaGrupo, recomendacionGrupo, repartoLetras, desviacionTipica, notaALetra, redondear, LETRAS } from './notas.js';
import { claveNombrePsn, nucleoNombre, sinNumeros } from './psn-nombres.js';

// ---------------------------------------------------------------------------
// Memo por versión de datos
// ---------------------------------------------------------------------------
let versionMemo = -1;
const memo = new Map();
function memoizar(clave, fn) {
  const v = datos.versionDatos();
  if (v !== versionMemo) {
    memo.clear();
    versionMemo = v;
  }
  if (!memo.has(clave)) memo.set(clave, fn());
  return memo.get(clave);
}

const nota = (v) => redondear(v?.nota);
const tieneNota = (v) => nota(v) !== null;
const usuarioValido = (v) => !!datos.usuario(v.usuario_id);
const porFecha = (a, b) => new Date(b.actualizado_en || b.creado_en) - new Date(a.actualizado_en || a.creado_en);
const porNota = (a, b) => nota(b) - nota(a) || porFecha(a, b);
/** ¿Juego online / sin final? (no cuentan en la tier list ni en Nota media y Más polémicos) */
const online = (v) => datos.esOnline(v.juego_id);

/** Valoraciones de todo el grupo agrupadas por usuario (solo usuarios existentes). */
function porUsuario() {
  return memoizar('porUsuario', () => {
    const m = new Map();
    for (const v of datos.valoracionesEfectivas()) {
      if (!usuarioValido(v) || !datos.juegoConocido(v.juego_id)) continue;
      if (!m.has(v.usuario_id)) m.set(v.usuario_id, []);
      m.get(v.usuario_id).push(v);
    }
    return m;
  });
}

export const valoracionesDe = (uid) => porUsuario().get(uid) ?? [];

/** Usuarios ordenados por nombre. */
export function usuarios() {
  return memoizar('usuarios', () => [...datos.estado.usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------
export const ESTADOS_HISTORIAL = ['jugando', 'completado', 'abandonado', 'pendiente'];

export function perfil(uid) {
  return memoizar(`perfil:${uid}`, () => {
    const vals = valoracionesDe(uid);
    const historial = Object.fromEntries(ESTADOS_HISTORIAL.map((e) => [e, []]));
    const juegosOnline = [];
    for (const v of vals) {
      if (online(v)) juegosOnline.push(v);
      else historial[v.estado]?.push(v);
    }
    juegosOnline.sort((a, b) => (nota(b) ?? -1) - (nota(a) ?? -1) || porFecha(a, b));
    // Completados y abandonados: por nota (los que no tienen nota, al final por fecha).
    for (const e of ['completado', 'abandonado']) {
      historial[e] = [
        ...historial[e].filter(tieneNota).sort(porNota),
        ...historial[e].filter((v) => !tieneNota(v)).sort(porFecha),
      ];
    }
    // Sagas valoradas: una tarjeta más en su pestaña (La sigo → Jugando, La dejé → Abandonados).
    // Las sagas online / sin final van con los juegos online.
    for (const v of valoracionesSagaComoItems(uid)) {
      if (datos.sagaOnline(v.saga_id)) juegosOnline.push(v);
      else historial[v.estado]?.push(v);
    }
    juegosOnline.sort((a, b) => (nota(b) ?? -1) - (nota(a) ?? -1) || porFecha(a, b));
    for (const e of ['abandonado']) {
      historial[e] = [...historial[e].filter(tieneNota).sort(porNota), ...historial[e].filter((v) => !tieneNota(v)).sort(porFecha)];
    }
    // Jugando y pendientes: lo más reciente primero.
    historial.jugando.sort(porFecha);
    historial.pendiente.sort(porFecha);

    const jugados = vals.filter((v) => v.estado !== 'pendiente');
    const media = mediaGrupo(vals);
    const conteoPlat = new Map();
    for (const v of jugados) if (v.plataforma) conteoPlat.set(v.plataforma, (conteoPlat.get(v.plataforma) ?? 0) + 1);
    const plataformas = [...conteoPlat.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, n]) => ({ nombre, n }));

    return {
      historial,
      online: juegosOnline,
      jugados: jugados.length,
      completados: historial.completado.length,
      abandonados: historial.abandonado.length,
      jugando: historial.jugando.length,
      pendientes: historial.pendiente.length,
      media: media.media,
      letra: media.letra,
      conNota: media.votos,
      plataformas,
      plataformaPrincipal: plataformas[0]?.nombre ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Tier list
// ---------------------------------------------------------------------------
export function tierList(uid) {
  return memoizar(`tiers:${uid}`, () => {
    const filas = Object.fromEntries(LETRAS.map((l) => [l, []]));
    const conNota = [...valoracionesDe(uid).filter((v) => tieneNota(v) && !online(v)), ...valoracionesSagaComoItems(uid).filter((v) => tieneNota(v) && !datos.sagaOnline(v.saga_id))].sort(porNota);
    for (const v of conNota) filas[notaALetra(v.nota)].push(v);
    return { filas, total: conNota.length };
  });
}

// ---------------------------------------------------------------------------
// Estadísticas
// ---------------------------------------------------------------------------
export function estadisticas(uid) {
  return memoizar(`stats:${uid}`, () => {
    const p = perfil(uid);
    const vals = valoracionesDe(uid);

    // "vs grupo": media de (mi nota − media de los DEMÁS en ese juego),
    // solo en juegos que también tienen nota de al menos otra persona.
    const difs = [];
    for (const v of vals.filter(tieneNota)) {
      const otros = datos.valoracionesDeJuego(v.juego_id).filter((o) => o.usuario_id !== uid && usuarioValido(o) && tieneNota(o));
      if (!otros.length) continue;
      const mediaOtros = otros.reduce((a, o) => a + nota(o), 0) / otros.length;
      difs.push(nota(v) - mediaOtros);
    }
    const vsGrupo = difs.length ? Math.round((difs.reduce((a, b) => a + b, 0) / difs.length) * 10) / 10 : null;

    return {
      ...p,
      vsGrupo,
      comparables: difs.length,
      recomendacion: recomendacionGrupo(vals),
      reparto: repartoLetras(vals),
    };
  });
}

// ---------------------------------------------------------------------------
// Ranking del grupo
// ---------------------------------------------------------------------------
export const ORDENES = [
  { id: 'nota', nombre: 'Nota media' },
  { id: 'recomendados', nombre: 'Más recomendados' },
  { id: 'jugados', nombre: 'Más jugados' },
  { id: 'horas', nombre: 'Más horas' },
  { id: 'polemicos', nombre: 'Más polémicos' },
  { id: 'online', nombre: 'Online' },
];

function juegosDelGrupo() {
  return memoizar('juegosDelGrupo', () => {
    const m = new Map();
    for (const v of datos.valoracionesEfectivas()) {
      if (!usuarioValido(v)) continue;
      const id = Number(v.juego_id);
      if (!m.has(id)) m.set(id, []);
      m.get(id).push(v);
    }
    return [...m.entries()]
      .map(([id, vals]) => {
        const media = mediaGrupo(vals);
        return {
          juego: datos.juegoConocido(id),
          vals,
          media: media.media,
          letra: media.letra,
          votos: media.votos,
          rec: recomendacionGrupo(vals),
          jugadores: vals.filter((v) => v.estado !== 'pendiente').length,
          desviacion: desviacionTipica(vals),
          online: datos.esOnline(id),
          // Horas de todo el grupo (sincronizadas + extra de cada uno)
          horas: Math.round(usuarios().reduce((t, u) => t + (horasDe(u.id, id) ?? 0), 0) * 10) / 10,
        };
      })
      .filter((x) => x.juego)
      .concat(sagasDelGrupo());
  });
}

/** Sagas en los rankings: con sus valoraciones de saga y las horas de todos en sus juegos. */
function sagasDelGrupo() {
  return datos.sagas().map((sg) => {
    const vals = datos.valoracionesDeSaga(sg.id).filter(usuarioValido);
    const media = mediaGrupo(vals);
    return {
      juego: datos.comoJuego(sg),
      saga: sg,
      vals,
      media: media.media,
      letra: media.letra,
      votos: media.votos,
      rec: recomendacionGrupo(vals),
      jugadores: vals.filter((v) => v.estado !== 'pendiente').length,
      desviacion: desviacionTipica(vals),
      online: !!sg.es_online,
      horas: Math.round(usuarios().reduce((t, u) => t + horasSaga(u.id, sg.id).total, 0) * 10) / 10,
    };
  });
}

export function ranking(orden) {
  return memoizar(`ranking:${orden}`, () => {
    const l = juegosDelGrupo();
    const nombre = (a, b) => a.juego.nombre.localeCompare(b.juego.nombre, 'es');
    if (orden === 'recomendados') {
      return l.filter((x) => x.rec.total >= 2)
        .sort((a, b) => b.rec.porcentaje - a.rec.porcentaje || b.rec.total - a.rec.total || (b.media ?? -1) - (a.media ?? -1) || nombre(a, b));
    }
    if (orden === 'jugados') {
      return l.filter((x) => x.jugadores > 0)
        .sort((a, b) => b.jugadores - a.jugadores || (b.media ?? -1) - (a.media ?? -1) || nombre(a, b));
    }
    if (orden === 'horas') {
      // Los juegos de una saga cuentan dentro de la saga ("cuántas horas al FIFA").
      return l.filter((x) => x.horas > 0 && (x.saga || !datos.sagaDeJuego(x.juego.igdb_id)))
        .sort((a, b) => b.horas - a.horas || (b.media ?? -1) - (a.media ?? -1) || nombre(a, b));
    }
    if (orden === 'online') {
      return l.filter((x) => x.online && x.votos >= 1)
        .sort((a, b) => b.media - a.media || b.votos - a.votos || nombre(a, b));
    }
    if (orden === 'polemicos') {
      return l.filter((x) => x.votos >= 2 && !x.online)
        .sort((a, b) => b.desviacion - a.desviacion || b.votos - a.votos || nombre(a, b));
    }
    return l.filter((x) => x.votos >= 2 && !x.online).sort((a, b) => b.media - a.media || b.votos - a.votos || nombre(a, b));
  });
}

// ---------------------------------------------------------------------------
// Comparar
// ---------------------------------------------------------------------------
/** Juegos que ambos tienen con nota: [{ juego, a, b, dif }] */
function comunes(idA, idB) {
  return memoizar(`comunes:${idA}:${idB}`, () => {
    const deB = new Map(valoracionesDe(idB).filter(tieneNota).map((v) => [Number(v.juego_id), v]));
    return valoracionesDe(idA)
      .filter(tieneNota)
      .filter((v) => deB.has(Number(v.juego_id)))
      .map((a) => {
        const b = deB.get(Number(a.juego_id));
        return { juego: datos.juegoConocido(a.juego_id), a, b, dif: Math.abs(nota(a) - nota(b)) };
      })
      .filter((x) => x.juego);
  });
}

export const juegosEnComun = (idA, idB) => comunes(idA, idB).length;

/** El usuario con más juegos en común con nota (para el lado B por defecto). */
export function masAfin(uid) {
  return memoizar(`masAfin:${uid}`, () => {
    const otros = usuarios().filter((u) => u.id !== uid);
    if (!otros.length) return null;
    return otros
      .map((u) => ({ u, n: juegosEnComun(uid, u.id) }))
      .sort((a, b) => b.n - a.n || a.u.nombre.localeCompare(b.u.nombre, 'es'))[0].u;
  });
}

export function comparar(idA, idB) {
  return memoizar(`comparar:${idA}:${idB}`, () => {
    const l = comunes(idA, idB);
    if (!l.length) return { comunes: 0, afinidad: null, diferenciaMedia: null, recCoinciden: 0, recTotal: 0, discrepan: [], coinciden: [] };
    const diferenciaMedia = l.reduce((s, x) => s + x.dif, 0) / l.length;
    const opinan = l.filter((x) => typeof x.a.recomendado === 'boolean' && typeof x.b.recomendado === 'boolean');
    return {
      comunes: l.length,
      afinidad: Math.max(0, Math.round(100 - diferenciaMedia * 20)),
      diferenciaMedia: Math.round(diferenciaMedia * 10) / 10,
      recCoinciden: opinan.filter((x) => x.a.recomendado === x.b.recomendado).length,
      recTotal: opinan.length,
      discrepan: [...l].sort((x, y) => y.dif - x.dif || (nota(y.a) + nota(y.b)) - (nota(x.a) + nota(x.b))).slice(0, 5),
      coinciden: [...l].sort((x, y) => x.dif - y.dif || (nota(y.a) + nota(y.b)) - (nota(x.a) + nota(x.b))).slice(0, 5),
    };
  });
}

// ---------------------------------------------------------------------------
// Biblioteca de PlayStation
// ---------------------------------------------------------------------------
/**
 * Biblioteca de un usuario agrupada por juego, sin duplicados: se juntan las
 * entradas que acaban en el mismo juego de IGDB o, si no lo tienen, con el mismo
 * nombre limpio (p. ej. la versión de PS4 y la de PS5). Una sola entrada con las
 * horas sumadas y las plataformas combinadas.
 * Cada entrada: { clave, igdbId, juego, filas, nombre, imagen, horas, horasSinc,
 *                 horasExtra, desglose, plataformas, plataformaPrincipal, ultimaVez,
 *                 progreso, valoracion, oculto }
 * horas = sincronizadas (todas las cuentas, sin repetir) + extra a mano.
 */
export function biblioteca(uid) {
  return memoizar(`biblioteca:${uid}`, () => {
    const filas = datos.bibliotecaDe(uid);
    // Nombre limpio de lo ya emparejado → su juego (para unir títulos sin emparejar que se llamen igual).
    const nombreAJuego = new Map();
    for (const f of filas) {
      const id = datos.igdbDeBiblioteca(f);
      if (id != null) nombreAJuego.set(claveNombrePsn(f.nombre_psn), id);
    }
    const grupos = new Map();
    for (const f of filas) {
      const emp = datos.emparejamiento(f.psn_title_id);
      const coleccion = emp?.tipo === 'coleccion' && emp.juegos?.length ? emp : null;
      const cn = claveNombrePsn(f.nombre_psn);
      const igdbId = coleccion ? null : datos.igdbDeBiblioteca(f) ?? nombreAJuego.get(cn) ?? null;
      const clave = coleccion ? `col:${coleccion.igdb_id ?? f.psn_title_id}` : igdbId != null ? `igdb:${igdbId}` : `nombre:${cn || f.psn_title_id}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          clave, igdbId, juego: igdbId != null ? datos.juegoConocido(igdbId) : null, filas: [], ultimaVez: null, progreso: null,
          // Colección (bundle): sus juegos; las horas de PSN son de la colección entera.
          coleccion: coleccion ? {
            id: coleccion.igdb_id ?? null,
            juego: coleccion.igdb_id ? datos.juegoConocido(coleccion.igdb_id) : null,
            juegos: [...new Set(coleccion.juegos.map((id) => datos.canonico(id)))].map((id) => datos.juegoConocido(id)).filter(Boolean),
          } : null,
          emp,
        });
      }
      const g = grupos.get(clave);
      g.filas.push(f);
      if (f.ultima_vez && (!g.ultimaVez || f.ultima_vez > g.ultimaVez)) g.ultimaVez = f.ultima_vez;
      if (f.progreso_trofeos != null) g.progreso = Math.max(g.progreso ?? 0, Number(f.progreso_trofeos));
    }
    const todos = [...grupos.values()].map((g) => {
      // La fila con más horas da el nombre, la imagen y la plataforma "principal".
      const principal = [...g.filas].sort((a, b) => Number(b.horas ?? 0) - Number(a.horas ?? 0))[0];
      const valoracion = g.igdbId != null ? datos.miValoracion(uid, g.igdbId) : null;
      // Horas = sincronizadas (todas las fuentes y cuentas, sin repetir el mismo dato) + extra a mano.
      const visibles = g.filas.filter((f) => !f.oculto);
      const sinc = sumarHoras(visibles.length ? visibles : g.filas, uid);
      const extra = g.igdbId != null ? datos.horasExtra(uid, g.igdbId) : 0;
      return {
        ...g,
        horasSinc: sinc.total,
        horasExtra: extra,
        horas: Math.round((sinc.total + extra) * 10) / 10,
        nombre: g.juego?.nombre ?? principal.nombre_psn,
        imagen: principal.imagen_psn,
        psnTitleId: principal.psn_title_id,
        titulos: g.filas.map((f) => f.psn_title_id),
        plataformas: [...new Set(g.filas.map((f) => f.plataforma).filter(Boolean))].sort().reverse(),
        plataformaPrincipal: principal.plataforma,
        valoracion,
        online: g.igdbId != null && datos.esOnline(g.igdbId),
        // Oculto si lo ocultó el usuario o si no es un juego (y él no dijo lo contrario).
        oculto: g.filas.every((f) => f.oculto || (g.emp?.tipo === 'no_juego' && f.oculto_usuario == null)),
        porRevisar: g.filas.some((f) => f.por_revisar),
        revision: revisionDe(g),
        // "PS5 40 h · Xbox Series 12 h · Extra 50 h"
        desglose: [...sinc.desglose, ...(extra ? [{ plataforma: 'Extra', cuenta: null, horas: extra, extra: true }] : [])],
        fuentes: [...new Set(g.filas.map((f) => f.fuente ?? 'psn'))],
        enMisJuegos: g.filas.some((f) => f.en_mis_juegos === true) ? true : g.filas.some((f) => f.en_mis_juegos === false) ? false : null,
      };
    }).sort((a, b) => b.horas - a.horas || (b.ultimaVez ?? '').localeCompare(a.ultimaVez ?? ''));

    const juegos = todos.filter((x) => !x.oculto);
    const identificados = juegos.filter((x) => x.coleccion || (x.igdbId != null && x.juego));
    // "Mis juegos" y "Probados" (lo de relleno: poco tiempo, sin valorar y nada reciente).
    const umbral = umbralProbados(uid);
    for (const x of juegos) x.probado = esProbado(x, umbral);
    // Por plataforma (todas las fuentes): juegos y horas de cada una.
    const plat = new Map();
    for (const x of juegos) {
      for (const p of x.plataformas) {
        if (!plat.has(p)) plat.set(p, { nombre: p, juegos: 0, horas: 0 });
        plat.get(p).juegos++;
      }
      for (const d of x.desglose) if (plat.has(d.plataforma)) plat.get(d.plataforma).horas += d.horas;
    }
    const porFuente = {};
    for (const x of juegos) {
      for (const fu of new Set(x.filas.map((f) => f.fuente ?? 'psn'))) porFuente[fu] = (porFuente[fu] ?? 0) + 1;
    }
    const horas = juegos.reduce((t, x) => t + x.horas, 0);
    return {
      juegos,
      identificados,
      sinIdentificar: juegos.filter((x) => !x.coleccion && !(x.igdbId != null && x.juego)),
      // "Revisa tu biblioteca": lo dudoso primero.
      porRevisar: juegos.filter((x) => x.porRevisar).sort((a, b) => Number(a.revision.seguro) - Number(b.revision.seguro) || b.horas - a.horas),
      ocultos: todos.filter((x) => x.oculto),
      total: juegos.length,
      horas: Math.round(horas),
      plataformas: [...plat.values()].map((x) => ({ ...x, horas: Math.round(x.horas) })).sort((a, b) => b.juegos - a.juegos),
      porFuente, // juegos de cada fuente (psn, xbox...)
      misJuegos: identificados.filter((x) => !x.probado),
      probados: juegos.filter((x) => x.probado),
      umbral,
      top: juegos.filter((x) => x.horas > 0).slice(0, 5),
      sinValorar: identificados.filter((x) => !x.valoracion),
      ultimaVez: juegos.reduce((m, x) => (x.ultimaVez && (!m || x.ultimaVez > m) ? x.ultimaVez : m), null),
    };
  });
}

/**
 * Tiempo de juego de un usuario: su biblioteca (sin ocultos; sincronizadas + extra) más
 * las horas extra de juegos que no están en ella. { total, top, juegos: Map(igdbId → horas) }
 */
export function tiempo(uid) {
  return memoizar(`tiempo:${uid}`, () => {
    const bib = biblioteca(uid);
    const lista = bib.juegos.map((x) => ({ nombre: x.nombre, horas: x.horas, igdbId: x.igdbId }));
    const enBib = new Set(bib.juegos.filter((x) => x.igdbId != null).map((x) => x.igdbId));
    for (const h of datos.estado.horasExtra ?? []) {
      const id = datos.canonico(h.juego_id);
      if (h.usuario_id !== uid || enBib.has(id)) continue;
      enBib.add(id);
      lista.push({ nombre: datos.juegoConocido(id)?.nombre ?? '', horas: datos.horasExtra(uid, id), igdbId: id });
    }
    lista.sort((a, b) => b.horas - a.horas);
    return {
      total: Math.round(lista.reduce((t, x) => t + x.horas, 0)),
      top: lista.filter((x) => x.horas > 0).slice(0, 5),
      juegos: new Map(lista.filter((x) => x.igdbId != null).map((x) => [x.igdbId, x.horas])),
    };
  });
}

/**
 * Horas sincronizadas de unas filas de biblioteca (de un usuario y un juego):
 *  - se suman por cuenta y plataforma (son partidas distintas);
 *  - dentro de una MISMA cuenta, dos filas con las mismas horas y la misma última vez
 *    son el mismo dato repetido (p. ej. las versiones de PS4 y PS5) y cuentan una vez;
 *  - si el juego está en Steam, los "PC detectado" de Xbox no suman (mandan las de Steam).
 * → { total, desglose: [{ plataforma, cuenta, horas }] }
 */
export function sumarHoras(filas, uid) {
  const conSteam = filas.some((f) => f.fuente === 'steam' && f.horas != null);
  const variasCuentas = (fuente) => datos.cuentasDe(uid, fuente).length > 1;
  const vistas = new Set();
  const porClave = new Map();
  let total = 0;
  for (const f of filas) {
    if (f.horas == null) continue;
    if (conSteam && f.fuente === 'xbox' && f.detectado) continue;
    const huella = `${f.cuenta_id ?? f.fuente ?? 'psn'}|${f.horas}|${f.ultima_vez ?? ''}`;
    if (vistas.has(huella)) continue;
    vistas.add(huella);
    const c = f.cuenta_id ? datos.cuenta(f.cuenta_id) : null;
    const cuenta = c && variasCuentas(f.fuente) ? (c.etiqueta || c.nombre) : null;
    const clave = `${f.plataforma ?? 'Otra'}|${cuenta ?? ''}`;
    const d = porClave.get(clave) ?? { plataforma: f.plataforma ?? 'Otra', cuenta, horas: 0 };
    d.horas += Number(f.horas);
    porClave.set(clave, d);
    total += Number(f.horas);
  }
  const desglose = [...porClave.values()].map((d) => ({ ...d, horas: Math.round(d.horas * 10) / 10 })).filter((d) => d.horas > 0).sort((a, b) => b.horas - a.horas);
  return { total: Math.round(total * 10) / 10, desglose };
}

// ---------------------------------------------------------------------------
// "Mis juegos" y "Probados"
// ---------------------------------------------------------------------------
const DIAS_RECIENTE = 30;
/** Horas por debajo de las cuales un juego va a "Probados" (0 = nunca). */
export function umbralProbados(uid) {
  const u = datos.usuario(uid);
  const v = u?.umbral_probados;
  return v == null ? 1 : Number(v);
}

/**
 * ¿Va a "Probados"? Nunca si está valorado o si el usuario lo subió a mano; siempre si
 * lo mandó él. Si no: por debajo del umbral de horas (o, sin horas, con menos de un 5 %
 * de logros) y sin jugar en los últimos 30 días.
 */
export function esProbado(x, umbral) {
  if (x.valoracion || x.enMisJuegos === true) return false;
  if (x.enMisJuegos === false) return true;
  if (!umbral) return false;
  const reciente = x.ultimaVez && Date.now() - new Date(x.ultimaVez).getTime() < DIAS_RECIENTE * 86400000;
  if (reciente) return false;
  const conHoras = x.horas > 0 || x.filas.some((f) => f.horas != null);
  if (conHoras) return x.horas < umbral;
  return x.progreso == null || x.progreso < 5;
}

/** "PS5 40 h", "Xbox Series (Cuenta 2) 12 h", "Extra 50 h" */
export const textoParte = (p) => `${p.plataforma}${p.cuenta ? ` (${p.cuenta})` : ''} ${textoHoras(p.horas)}`;

/** Texto "PS5 40 h · Xbox Series 12 h · Extra 50 h · Total 102 h" (vacío si hay una sola parte). */
export function textoDesglose(x) {
  const d = x?.desglose ?? [];
  if (d.length < 2) return '';
  return [...d.map(textoParte), `Total ${textoHoras(d.reduce((t, p) => t + p.horas, 0))}`].join(' · ');
}

/** Horas totales de un usuario en un juego: sincronizadas (todas sus cuentas) + extra a mano. */
export function horasDe(uid, igdbId) {
  const b = bibliotecaDeJuego(igdbId).get(uid);
  const total = (b?.horasSinc ?? 0) + datos.horasExtra(uid, igdbId);
  return total > 0 ? Math.round(total * 10) / 10 : null;
}

/** Desglose de horas de un usuario en un juego: sincronizadas por plataforma y cuenta + extra. */
export function desgloseDe(uid, igdbId) {
  const b = bibliotecaDeJuego(igdbId).get(uid);
  const extra = datos.horasExtra(uid, igdbId);
  return {
    sinc: b?.desgloseSinc ?? [],
    horasSinc: b?.horasSinc ?? 0,
    extra,
    total: Math.round(((b?.horasSinc ?? 0) + extra) * 10) / 10,
  };
}

/** Horas y trofeos de cada usuario en un juego: Map(usuario_id → { horas, progreso, plataformas }). */
export function bibliotecaDeJuego(igdbId) {
  igdbId = datos.canonico(igdbId); // una versión fusionada da lo del juego principal
  return memoizar(`bibJuego:${igdbId}`, () => {
    const m = new Map();
    for (const f of datos.bibliotecaDeJuego(igdbId)) {
      if (!datos.usuario(f.usuario_id) || f.oculto) continue;
      const x = m.get(f.usuario_id) ?? { horas: 0, progreso: null, plataformas: [], filas: [] };
      if (f.progreso_trofeos != null) x.progreso = Math.max(x.progreso ?? 0, Number(f.progreso_trofeos));
      if (f.plataforma && !x.plataformas.includes(f.plataforma)) x.plataformas.push(f.plataforma);
      x.filas.push(f);
      m.set(f.usuario_id, x);
    }
    // Horas: sincronizadas (sin repetir el mismo dato) + extra; desglose con las dos.
    for (const [uid, x] of m) {
      const sinc = sumarHoras(x.filas, uid);
      const extra = datos.horasExtra(uid, igdbId);
      x.horasSinc = sinc.total;
      x.desgloseSinc = sinc.desglose;
      x.horas = Math.round((sinc.total + extra) * 10) / 10;
      x.desglose = [...sinc.desglose, ...(extra ? [{ plataforma: 'Extra', cuenta: null, horas: extra, extra: true }] : [])];
    }
    return m;
  });
}

/** "42 h", "1,5 h", "35 min" */
export function textoHoras(h) {
  const n = Number(h ?? 0);
  if (n <= 0) return '';
  if (n < 1) return `${Math.max(1, Math.round(n * 60))} min`;
  if (n < 10) return `${(Math.round(n * 10) / 10).toString().replace('.', ',')} h`;
  return `${Math.round(n)} h`;
}

// ---------------------------------------------------------------------------
// Revisión, fusiones y sagas
// ---------------------------------------------------------------------------
/**
 * Estado del emparejamiento de una entrada de la biblioteca:
 * { seguro, confirmado, confianza, propuesta (juego propuesto si es dudoso) }
 */
function revisionDe(g) {
  const e = g.emp;
  if (g.coleccion) return { seguro: true, confirmado: !!e?.confirmado, confianza: e?.confianza ?? 100, propuesta: null };
  if (g.igdbId != null) return { seguro: true, confirmado: !!e?.confirmado, confianza: e?.confianza ?? 100, propuesta: null };
  const prop = e?.propuesta_id ? datos.juegoConocido(datos.canonico(e.propuesta_id)) : null;
  return { seguro: false, confirmado: false, confianza: e?.confianza ?? 0, propuesta: prop };
}

/** Juegos (principales) que tiene un usuario: valorados y de su biblioteca. */
function idsDe(uid) {
  const ids = new Set(valoracionesDe(uid).map((v) => Number(v.juego_id)));
  for (const x of biblioteca(uid).identificados) {
    if (x.igdbId != null) ids.add(x.igdbId);
    for (const j of x.coleccion?.juegos ?? []) ids.add(Number(j.igdb_id));
  }
  return ids;
}

/**
 * "¿Es el mismo juego?": parejas de juegos de un usuario que IGDB relaciona
 * (edición o versión, remaster, port, versión ampliada, o misma saga con el nombre
 * casi igual). Los remakes no: son juegos distintos salvo que él los fusione.
 * [{ a, b, motivo }] sin las que ya rechazó.
 */
export function parejasFusion(uid) {
  return memoizar(`parejas:${uid}`, () => {
    const ids = idsDe(uid);
    const lista = [...ids];
    const parejas = new Map();
    const anadir = (a, b, motivo) => {
      if (a === b || !ids.has(b)) return;
      const [x, y] = [a, b].sort((m, n) => m - n);
      if (datos.fusionRechazada(uid, x, y) || parejas.has(`${x}:${y}`)) return;
      const ra = datos.juegoConocido(x)?.relaciones ?? {};
      const rb = datos.juegoConocido(y)?.relaciones ?? {};
      if ((ra.remakes ?? []).includes(y) || (rb.remakes ?? []).includes(x)) return;
      parejas.set(`${x}:${y}`, { a: x, b: y, motivo });
    };
    for (const a of lista) {
      const j = datos.juegoConocido(a);
      const r = j?.relaciones;
      if (!r) continue;
      for (const b of [r.version_parent, r.parent_game].filter(Boolean)) anadir(a, datos.canonico(b), 'version');
      for (const b of r.remasters ?? []) anadir(a, datos.canonico(b), 'remaster');
      for (const b of r.ports ?? []) anadir(a, datos.canonico(b), 'port');
      for (const b of r.expanded_games ?? []) anadir(a, datos.canonico(b), 'ampliado');
      // Misma saga y nombre casi igual ("Mafia II" / "Mafia II: Definitive Edition").
      const sagas = new Set((r.colecciones ?? []).map((c) => c.id));
      if (!sagas.size) continue;
      for (const b of lista) {
        if (b <= a) continue;
        const jb = datos.juegoConocido(b);
        if (!(jb?.relaciones?.colecciones ?? []).some((c) => sagas.has(c.id))) continue;
        if (nucleoNombre(j.nombre) && nucleoNombre(j.nombre) === nucleoNombre(jb.nombre)) anadir(a, b, 'saga');
      }
    }
    return [...parejas.values()];
  });
}

/** Parejas para "¿Es el mismo juego?" en la ficha de un juego. */
export const parejasDeJuego = (uid, igdbId) => parejasFusion(uid).filter((x) => x.a === Number(igdbId) || x.b === Number(igdbId));

// ---------------------------------------------------------------------------
// Sagas del grupo (como un juego más)
// ---------------------------------------------------------------------------
/** Ruta de algo que se pinta como juego: un juego o una saga. */
export const rutaDe = (j) => (j?.saga_id ? `#saga/${j.saga_id}` : `#juego/${j?.igdb_id}`);

/** Valoraciones de sagas de un usuario con forma de valoración de juego (para listas). */
export function valoracionesSagaComoItems(uid) {
  return memoizar(`valsSaga:${uid}`, () => datos.valoracionesSagaDe(uid).map((v) => ({ ...v, juego_id: null, esSaga: true })));
}

/**
 * Horas de un usuario en una saga: las totales de cada uno de sus juegos (sincronizadas
 * + extra) más las horas extra propias de la saga. { porJuego: [{ id, horas }], juegos, extra, total }
 */
export function horasSaga(uid, sagaId) {
  return memoizar(`horasSaga:${uid}:${sagaId}`, () => {
    const porJuego = datos.juegosDeSaga(sagaId).map((id) => ({ id, horas: horasDe(uid, id) ?? 0 }));
    const juegos = porJuego.reduce((t, x) => t + x.horas, 0);
    const extra = Number(datos.miValoracionSaga(uid, sagaId)?.horas_extra ?? 0);
    return { porJuego, juegos: Math.round(juegos * 10) / 10, extra, total: Math.round((juegos + extra) * 10) / 10 };
  });
}

/** Métricas del grupo en una saga (como statsJuego). */
export function statsSaga(sagaId) {
  return memoizar(`statsSaga:${sagaId}`, () => {
    const vals = datos.valoracionesDeSaga(sagaId).filter(usuarioValido);
    const media = mediaGrupo(vals);
    return {
      valoraciones: vals,
      media: media.media,
      letra: media.letra,
      votos: media.votos,
      recomendacion: recomendacionGrupo(vals),
      reparto: repartoLetras(vals),
      jugadores: vals.filter((v) => v.estado !== 'pendiente').length,
    };
  });
}

/**
 * Biblioteca: los juegos de una saga sin valoración propia del usuario se juntan en
 * una tarjeta de la saga (en el sitio del primero). Los que tienen valoración propia
 * siguen sueltos. → items y { esSaga, saga, juego, hijos, horas, valoracion, clave }
 */
export function agruparSagas(uid, items, idDe) {
  if (!datos.haySagas() || !datos.sagas().length) return items;
  const salida = [];
  const bloques = new Map();
  for (const x of items) {
    const id = idDe(x);
    const sg = id != null && !datos.miValoracion(uid, id) ? datos.sagaDeJuego(id) : null;
    if (!sg) { salida.push(x); continue; }
    if (!bloques.has(sg.id)) {
      const b = {
        esSaga: true, saga: sg, juego: datos.comoJuego(sg), hijos: [], clave: `saga:${sg.id}`,
        horas: horasSaga(uid, sg.id).total, valoracion: datos.miValoracionSaga(uid, sg.id),
      };
      bloques.set(sg.id, b);
      salida.push(b);
    }
    bloques.get(sg.id).hijos.push(x);
  }
  return salida;
}

/**
 * Sagas que se podrían crear: 3 o más juegos de una misma colección de IGDB cuyos
 * nombres solo cambian en un número o un año (FIFA, NBA 2K...), que aún no están en
 * ninguna saga. Nunca las que rechazó. [{ id, nombre, juegos: [igdbId] }]
 */
export function sugerenciasSaga(uid) {
  return memoizar(`sugSaga:${uid}`, () => {
    if (!datos.haySagas()) return [];
    const prefs = datos.sagasDe(uid);
    const porSaga = new Map();
    for (const id of idsDe(uid)) {
      if (datos.sagaDeJuego(id)) continue;
      const j = datos.juegoConocido(id);
      for (const c of j?.relaciones?.colecciones ?? []) {
        if (prefs.has(Number(c.id))) continue;
        if (!porSaga.has(c.id)) porSaga.set(c.id, { id: c.id, nombre: c.nombre, porBase: new Map() });
        const base = sinNumeros(j.nombre);
        const m = porSaga.get(c.id).porBase;
        if (!m.has(base)) m.set(base, []);
        m.get(base).push(id);
      }
    }
    const res = [];
    for (const x of porSaga.values()) {
      const [base, juegos] = [...x.porBase.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
      if (base && juegos.length >= 3) res.push({ id: x.id, nombre: x.nombre || base, juegos });
    }
    return res;
  });
}

/**
 * Para "Añadir a una saga…" desde un juego: la saga existente que ya tiene juegos de su
 * misma colección de IGDB o, si no hay, crear una con el nombre de la colección.
 * → { saga } | { crear: { nombre, coleccionId } } | null
 */
export function sagaSugerida(igdbId) {
  const j = datos.juegoConocido(igdbId);
  const cols = j?.relaciones?.colecciones ?? [];
  for (const c of cols) {
    const existente = datos.sagas().find((sg) => Number(sg.coleccion_id) === Number(c.id))
      ?? datos.sagas().find((sg) => datos.juegosDeSaga(sg.id).some((g) => (datos.juegoConocido(g)?.relaciones?.colecciones ?? []).some((x) => Number(x.id) === Number(c.id))));
    if (existente) return { saga: existente };
  }
  return cols[0] ? { crear: { nombre: cols[0].nombre, coleccionId: Number(cols[0].id) } } : null;
}
