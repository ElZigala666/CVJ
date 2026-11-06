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
      const emp = datos.emparejamiento(f.psn_title_id);
      const coleccion = emp?.tipo === 'coleccion' && emp.juegos?.length ? emp : null;
      const cn = claveNombrePsn(f.nombre_psn);
      const igdbId = coleccion ? null : datos.igdbDeBiblioteca(f) ?? nombreAJuego.get(cn) ?? null;
      const clave = coleccion ? `col:${coleccion.igdb_id ?? f.psn_title_id}` : igdbId != null ? `igdb:${igdbId}` : `nombre:${cn || f.psn_title_id}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          clave, igdbId, juego: igdbId != null ? datos.juegoConocido(igdbId) : null, filas: [], horasPsn: 0, ultimaVez: null, progreso: null,
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
        // Oculto si lo ocultó el usuario o si no es un juego (y él no dijo lo contrario).
        oculto: g.filas.every((f) => f.oculto || (g.emp?.tipo === 'no_juego' && f.oculto_usuario == null)),
        porRevisar: g.filas.some((f) => f.por_revisar),
        revision: revisionDe(g),
      };
    }).sort((a, b) => b.horas - a.horas || (b.ultimaVez ?? '').localeCompare(a.ultimaVez ?? ''));

    const juegos = todos.filter((x) => !x.oculto);
    const identificados = juegos.filter((x) => x.coleccion || (x.igdbId != null && x.juego));
    const porPlataforma = { PS4: 0, PS5: 0 };
    for (const x of juegos) for (const f of x.filas) {
      if (f.plataforma && porPlataforma[f.plataforma] !== undefined) porPlataforma[f.plataforma] += Number(f.horas ?? 0);
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

/**
 * Sagas que se podrían agrupar: 3 o más juegos de una misma colección de IGDB
 * cuyos nombres solo cambian en un número o un año (FIFA, NBA 2K...). Nunca las
 * que ya agrupó o rechazó. [{ id, nombre, juegos: [igdbId] }]
 */
export function sugerenciasSaga(uid) {
  return memoizar(`sugSaga:${uid}`, () => {
    const prefs = datos.sagasDe(uid);
    const porSaga = new Map();
    for (const id of idsDe(uid)) {
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

/** Sagas que tiene agrupadas un usuario: Map(coleccion_id → nombre). */
export function sagasAgrupadas(uid) {
  return new Map([...datos.sagasDe(uid)].filter(([, x]) => x.agrupada).map(([id, x]) => [id, x.nombre]));
}

/**
 * Junta en una sola entrada los juegos de las sagas que el usuario tiene agrupadas.
 * @param {any[]} items  lo que se va a pintar (valoraciones o entradas de la biblioteca)
 * @param {(x) => number|null} idDe  juego de cada item
 * @returns lista con { saga: { id, nombre }, hijos: [...] } en el sitio del primero
 */
export function agruparSagas(uid, items, idDe) {
  const agrupadas = sagasAgrupadas(uid);
  if (!agrupadas.size) return items;
  const salida = [];
  const bloques = new Map();
  for (const x of items) {
    const id = idDe(x);
    const saga = id != null ? (datos.juegoConocido(id)?.relaciones?.colecciones ?? []).find((c) => agrupadas.has(Number(c.id))) : null;
    if (!saga) { salida.push(x); continue; }
    if (!bloques.has(saga.id)) {
      const b = { saga: { id: Number(saga.id), nombre: agrupadas.get(Number(saga.id)) || saga.nombre }, hijos: [] };
      bloques.set(saga.id, b);
      salida.push(b);
    }
    bloques.get(saga.id).hijos.push(x);
  }
  // Una "saga" con un solo juego se ve como el juego.
  return salida.map((x) => (x.saga && x.hijos.length === 1 ? x.hijos[0] : x));
}
