// Métricas de perfiles, tier list, estadísticas, rankings y comparar.
// Todo se calcula en el cliente y se memoiza por versión de datos: cambiar de
// pestaña o de usuario no recalcula nada si los datos no han cambiado.
import * as datos from './datos.js';
import { mediaGrupo, recomendacionGrupo, repartoLetras, desviacionTipica, notaALetra, redondear, LETRAS } from './notas.js';

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
    for (const v of vals) historial[v.estado]?.push(v);
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
    const conNota = valoracionesDe(uid).filter(tieneNota).sort(porNota);
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
    if (orden === 'polemicos') {
      return l.filter((x) => x.votos >= 2)
        .sort((a, b) => b.desviacion - a.desviacion || b.votos - a.votos || nombre(a, b));
    }
    return l.filter((x) => x.votos >= 2).sort((a, b) => b.media - a.media || b.votos - a.votos || nombre(a, b));
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
