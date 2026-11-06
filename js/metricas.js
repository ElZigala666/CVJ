// Métricas de perfiles, tier list, estadísticas, rankings y comparar.
// Todo se calcula en el cliente y se memoiza por versión de datos: cambiar de
// pestaña o de usuario no recalcula nada si los datos no han cambiado.
import * as datos from './datos.js';
import { mediaGrupo, recomendacionGrupo, repartoLetras, desviacionTipica, notaALetra, redondear, LETRAS } from './notas.js';
import { claveNombrePsn } from './psn-nombres.js';

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
    for (const v of datos.estado.valoraciones) {
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
    const conNota = valoracionesDe(uid).filter((v) => tieneNota(v) && !online(v)).sort(porNota);
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
  { id: 'polemicos', nombre: 'Más polémicos' },
  { id: 'online', nombre: 'Online' },
];

function juegosDelGrupo() {
  return memoizar('juegosDelGrupo', () => {
    const m = new Map();
    for (const v of datos.estado.valoraciones) {
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
        };
      })
      .filter((x) => x.juego);
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
 * Cada entrada: { clave, igdbId, juego, filas, nombre, imagen, horas, horasPsn,
 *                 horasManual, plataformas, plataformaPrincipal, ultimaVez,
 *                 progreso, valoracion, oculto }
 * Las horas puestas a mano en la valoración mandan sobre las de PSN.
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
      const cn = claveNombrePsn(f.nombre_psn);
      const igdbId = datos.igdbDeBiblioteca(f) ?? nombreAJuego.get(cn) ?? null;
      const clave = igdbId != null ? `igdb:${igdbId}` : `nombre:${cn || f.psn_title_id}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, { clave, igdbId, juego: igdbId != null ? datos.juegoConocido(igdbId) : null, filas: [], horasPsn: 0, ultimaVez: null, progreso: null });
      }
      const g = grupos.get(clave);
      g.filas.push(f);
      g.horasPsn += Number(f.horas ?? 0);
      if (f.ultima_vez && (!g.ultimaVez || f.ultima_vez > g.ultimaVez)) g.ultimaVez = f.ultima_vez;
      if (f.progreso_trofeos != null) g.progreso = Math.max(g.progreso ?? 0, Number(f.progreso_trofeos));
    }
    const todos = [...grupos.values()].map((g) => {
      // La fila con más horas da el nombre, la imagen y la plataforma "principal".
      const principal = [...g.filas].sort((a, b) => Number(b.horas ?? 0) - Number(a.horas ?? 0))[0];
      const valoracion = g.igdbId != null ? datos.miValoracion(uid, g.igdbId) : null;
      const horasPsn = Math.round(g.horasPsn * 10) / 10;
      const horasManual = valoracion?.horas != null ? Number(valoracion.horas) : null;
      return {
        ...g,
        horasPsn,
        horasManual,
        horas: horasManual ?? horasPsn,
        nombre: g.juego?.nombre ?? principal.nombre_psn,
        imagen: principal.imagen_psn,
        psnTitleId: principal.psn_title_id,
        titulos: g.filas.map((f) => f.psn_title_id),
        plataformas: [...new Set(g.filas.map((f) => f.plataforma).filter(Boolean))].sort().reverse(),
        plataformaPrincipal: principal.plataforma,
        valoracion,
        online: g.igdbId != null && datos.esOnline(g.igdbId),
        oculto: g.filas.every((f) => f.oculto),
      };
    }).sort((a, b) => b.horas - a.horas || (b.ultimaVez ?? '').localeCompare(a.ultimaVez ?? ''));

    const juegos = todos.filter((x) => !x.oculto);
    const identificados = juegos.filter((x) => x.igdbId != null && x.juego);
    const porPlataforma = { PS4: 0, PS5: 0 };
    for (const x of juegos) for (const f of x.filas) {
      if (f.plataforma && porPlataforma[f.plataforma] !== undefined) porPlataforma[f.plataforma] += Number(f.horas ?? 0);
    }
    const horas = juegos.reduce((t, x) => t + x.horas, 0);
    return {
      juegos,
      identificados,
      sinIdentificar: juegos.filter((x) => !(x.igdbId != null && x.juego)),
      ocultos: todos.filter((x) => x.oculto),
      total: juegos.length,
      horas: Math.round(horas),
      porPlataforma: { PS4: Math.round(porPlataforma.PS4), PS5: Math.round(porPlataforma.PS5) },
      top: juegos.filter((x) => x.horas > 0).slice(0, 5),
      sinValorar: identificados.filter((x) => !x.valoracion),
      ultimaVez: juegos.reduce((m, x) => (x.ultimaVez && (!m || x.ultimaVez > m) ? x.ultimaVez : m), null),
    };
  });
}

/**
 * Tiempo de juego de un usuario: su biblioteca de PSN (sin ocultos) más las horas
 * puestas a mano en juegos que no están en ella. { total, top, juegos: Map(igdbId → horas) }
 */
export function tiempo(uid) {
  return memoizar(`tiempo:${uid}`, () => {
    const bib = biblioteca(uid);
    const lista = bib.juegos.map((x) => ({ nombre: x.nombre, horas: x.horas, igdbId: x.igdbId }));
    const enBib = new Set(bib.juegos.filter((x) => x.igdbId != null).map((x) => x.igdbId));
    for (const v of valoracionesDe(uid)) {
      if (v.horas == null || enBib.has(Number(v.juego_id))) continue;
      lista.push({ nombre: datos.juegoConocido(v.juego_id)?.nombre ?? '', horas: Number(v.horas), igdbId: Number(v.juego_id) });
    }
    lista.sort((a, b) => b.horas - a.horas);
    return {
      total: Math.round(lista.reduce((t, x) => t + x.horas, 0)),
      top: lista.filter((x) => x.horas > 0).slice(0, 5),
      juegos: new Map(lista.filter((x) => x.igdbId != null).map((x) => [x.igdbId, x.horas])),
    };
  });
}

/** Horas de un usuario en un juego: las puestas a mano o, si no hay, las de PSN. */
export function horasDe(uid, igdbId) {
  const manual = datos.miValoracion(uid, igdbId)?.horas;
  if (manual != null) return Number(manual);
  return bibliotecaDeJuego(igdbId).get(uid)?.horas ?? null;
}

/** Horas y trofeos de cada usuario en un juego: Map(usuario_id → { horas, progreso, plataformas }). */
export function bibliotecaDeJuego(igdbId) {
  return memoizar(`bibJuego:${igdbId}`, () => {
    const m = new Map();
    for (const f of datos.bibliotecaDeJuego(igdbId)) {
      if (!datos.usuario(f.usuario_id) || f.oculto) continue;
      const x = m.get(f.usuario_id) ?? { horas: 0, progreso: null, plataformas: [], filas: [] };
      x.horas += Number(f.horas ?? 0);
      if (f.progreso_trofeos != null) x.progreso = Math.max(x.progreso ?? 0, Number(f.progreso_trofeos));
      if (f.plataforma && !x.plataformas.includes(f.plataforma)) x.plataformas.push(f.plataforma);
      x.filas.push(f);
      m.set(f.usuario_id, x);
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
