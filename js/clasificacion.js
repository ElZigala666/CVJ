// Clasificación de los juegos (géneros, temas, modos, perspectiva, estudios, décadas) y las
// estadísticas que salen de ella: ADN de jugador, géneros favoritos, anillos, revelaciones y
// lo del grupo. Los datos vienen de IGDB ya traducidos (función igdb); aquí se agrupan los
// demasiado finos para que los gráficos se lean.
//
// Reglas de siempre:
//  - Colecciones: cuentan como UN juego (sus etiquetas, las de todos sus juegos juntas).
//  - Versiones fusionadas: cuentan en el principal (datos.valoracionesEfectivas ya lo hace).
//  - Horas: las totales de cada uno (metricas.horasDe / horasColeccion / tiempo).
//  - Notas: solo las que cuentan en la tier list (metricas.cuentaEnRanking).
// Todo se memoiza por versión de datos.
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { redondear } from './notas.js';

let versionMemo = -1;
const memo = new Map();
function memoizar(clave, fn) {
  const v = datos.versionDatos();
  if (v !== versionMemo) { memo.clear(); versionMemo = v; }
  if (!memo.has(clave)) memo.set(clave, fn());
  return memo.get(clave);
}

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------
export const DIMENSIONES = {
  generos: { nombre: 'Géneros', singular: 'género' },
  temas: { nombre: 'Temas', singular: 'tema' },
  modos: { nombre: 'Modos de juego', singular: 'modo' },
  perspectivas: { nombre: 'Perspectiva', singular: 'perspectiva' },
};

// Lo demasiado fino se junta; null = fuera (demasiado genérico para decir algo).
const AGRUPAR = {
  generos: {
    'Estrategia en tiempo real': 'Estrategia', 'Estrategia por turnos': 'Estrategia', 'Táctico': 'Estrategia', 'MOBA': 'Estrategia',
    'Pinball': 'Arcade', 'Point and click': 'Narrativo', 'Novela visual': 'Narrativo',
    'Preguntas': 'Party y tablero', 'Cartas y tablero': 'Party y tablero', 'Música': 'Ritmo',
  },
  temas: {
    'Acción': null, // casi todo lo es: no dice nada
    'Suspense': 'Misterio', 'Gestión': 'Otros', 'No ficción': 'Otros', 'Educativo': 'Otros', '4X': 'Otros', 'Erótico': 'Otros',
  },
  modos: { 'Pantalla dividida': 'Multijugador', 'MMO': 'Multijugador', 'Battle royale': 'Multijugador' },
  perspectivas: { 'Cenital o isométrica': 'Cenital', 'Texto': 'Otras', 'Auditiva': 'Otras' },
};

/** Todos los géneros (ya agrupados), para "el género que nadie toca". */
export const GENEROS_TODOS = ['Aventura', 'RPG', 'Shooter', 'Plataformas', 'Puzle', 'Estrategia', 'Simulación', 'Deportes',
  'Carreras', 'Lucha', 'Hack and slash', 'Arcade', 'Indie', 'Narrativo', 'Ritmo', 'Party y tablero'];

const etiquetasJuego = (j, dim) => {
  const mapa = AGRUPAR[dim];
  const salida = [];
  for (const t of j?.[dim] ?? []) {
    const g = t in mapa ? mapa[t] : t;
    if (g && !salida.includes(g)) salida.push(g);
  }
  return salida;
};
const union = (listas) => [...new Set(listas.flat())];
const decada = (anio) => (anio ? Math.floor(anio / 10) * 10 : null);
export const nombreDecada = (d) => `los ${String(d).slice(d >= 2000 ? 0 : 2)}`; // "los 2010", "los 90"
const media = (l) => (l.length ? redondear(l.reduce((a, b) => a + b, 0) / l.length) : null);
const notaQueCuenta = (v) => (v && v.nota != null && metricas.cuentaEnRanking(v) ? Number(v.nota) : null);

/** Etiquetas, año y estudios de un juego o colección (ids = sus juegos, ya principales). */
function describir(ids, v) {
  const js = ids.map((id) => datos.juegoConocido(id)).filter(Boolean);
  const tags = Object.fromEntries(Object.keys(DIMENSIONES).map((d) => [d, union(js.map((j) => etiquetasJuego(j, d)))]));
  // Año: el del juego que ha jugado (colección: el de su nota heredada o el más reciente).
  const propio = v?.desdeJuego ? datos.juegoConocido(v.desdeJuego.juegoId)?.anio : null;
  const anio = propio ?? (Math.max(0, ...js.map((j) => j.anio ?? 0)) || null);
  const estudios = union(js.map((j) => (j.desarrolladoras?.length ? j.desarrolladoras : j.desarrolladora ? [j.desarrolladora] : [])));
  const franquicias = union(js.map((j) => (j.franquicia ? [j.franquicia] : [])));
  return { tags, anio, decada: decada(anio), estudios, franquicias };
}

// ---------------------------------------------------------------------------
// Lo de cada uno: un item por juego o colección (regla única), con lo que ha valorado
// (también pendientes) y lo que solo tiene horas (biblioteca, horas a mano o estimadas).
// ---------------------------------------------------------------------------
export function itemsUsuario(uid) {
  return memoizar(`items:${uid}`, () => {
    const m = new Map();
    for (const v of metricas.itemsDe(uid)) {
      const col = v.esColeccion ? datos.coleccion(v.coleccion_id) : null;
      if (v.esColeccion && !col) continue;
      const juego = col ? datos.comoJuego(col) : datos.juegoConocido(v.juego_id);
      if (!juego) continue;
      const ids = col ? datos.juegosDeColeccion(col.id).map((x) => datos.canonico(x)) : [Number(v.juego_id)];
      const clave = col ? `c:${col.id}` : `j:${Number(v.juego_id)}`;
      const horas = col ? metricas.horasColeccion(uid, col.id).total : (metricas.horasDe(uid, v.juego_id) ?? 0);
      m.set(clave, { clave, juego, ids, v, coleccionId: col?.id ?? null, jugado: v.estado !== 'pendiente', nota: notaQueCuenta(v), horas, ...describir(ids, v) });
    }
    for (const [id0, h] of metricas.tiempo(uid).juegos) {
      if (!(h > 0)) continue;
      const id = datos.canonico(id0);
      const col = datos.coleccionDeJuego(id);
      const clave = col ? `c:${col.id}` : `j:${id}`;
      if (m.has(clave)) continue;
      const juego = col ? datos.comoJuego(col) : datos.juegoConocido(id);
      if (!juego) continue;
      const ids = col ? datos.juegosDeColeccion(col.id).map((x) => datos.canonico(x)) : [id];
      const horas = col ? metricas.horasColeccion(uid, col.id).total : h;
      m.set(clave, { clave, juego, ids, v: null, coleccionId: col?.id ?? null, jugado: false, nota: null, horas, soloHoras: true, ...describir(ids, null) });
    }
    return [...m.values()];
  });
}

/** Lo jugado (valorado, sin pendientes) que tiene alguna etiqueta de esa dimensión. */
const jugadosCon = (items, dim) => items.filter((x) => x.jugado && x.tags[dim].length);
/** Cuántos juegos jugados de alguien tienen datos de esa dimensión (para no pintar gráficos con 2 juegos). */
export const cuantosCon = (uid, dim) => jugadosCon(itemsUsuario(uid), dim).length;

/**
 * Una dimensión de alguien: por etiqueta, sus juegos (jugados), cuántos, horas (de todo lo
 * que tiene con horas) y nota media (≥ 2 notas). Ordenado por juegos.
 * → [{ tag, items, n, horas, conHoras, notas, media, peso }]  (peso: reparto del anillo)
 */
export function dimension(uid, dim) {
  return memoizar(`dim:${uid}:${dim}`, () => resumirDimension(itemsUsuario(uid), dim));
}

function resumirDimension(items, dim) {
  const m = new Map();
  const de = (tag) => {
    if (!m.has(tag)) m.set(tag, { tag, items: [], n: 0, horas: 0, conHoras: [], notas: [], conNota: [], peso: 0 });
    return m.get(tag);
  };
  for (const x of items) {
    const tags = x.tags[dim];
    if (!tags.length) continue;
    for (const t of tags) {
      const e = de(t);
      if (x.jugado) { e.items.push(x); e.n++; e.peso += 1 / tags.length; }
      if (x.horas > 0) { e.horas += x.horas; e.conHoras.push(x); }
      if (x.nota != null) { e.notas.push(x.nota); e.conNota.push(x); }
    }
  }
  return [...m.values()]
    .map((e) => ({ ...e, horas: Math.round(e.horas), media: e.notas.length >= 2 ? media(e.notas) : null }))
    .sort((a, b) => b.n - a.n || b.horas - a.horas || a.tag.localeCompare(b.tag, 'es'));
}

/** Reparto (0-1) de lo jugado por género: para el radar. */
function reparto(items) {
  const jug = jugadosCon(items, 'generos');
  const r = new Map();
  for (const x of jug) for (const t of x.tags.generos) r.set(t, (r.get(t) ?? 0) + 1);
  return { total: jug.length, de: (t) => (jug.length ? (r.get(t) ?? 0) / jug.length : 0), n: (t) => r.get(t) ?? 0 };
}

export const MIN_RADAR = 5;
const conDatos = () => metricas.usuarios().filter((u) => reparto(itemsUsuario(u.id)).total >= MIN_RADAR);

/** Ejes del radar: los 8 géneros más jugados del grupo (sin Indie: no es un estilo). Iguales para todos. */
export function ejesRadar() {
  return memoizar('ejes', () => {
    const c = new Map();
    for (const u of metricas.usuarios()) {
      for (const x of jugadosCon(itemsUsuario(u.id), 'generos')) for (const t of x.tags.generos) if (t !== 'Indie') c.set(t, (c.get(t) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  });
}

/**
 * Series del radar: la de cada persona con datos y la media del grupo (media de los repartos
 * de cada uno). valores: raíz cuadrada del reparto (0-1), para que se lean las diferencias.
 * { ejes, series: Map(id → { id, nombre, valores, reparto, total }), max }
 */
export function radar() {
  return memoizar('radar', () => {
    const ejes = ejesRadar();
    const series = new Map();
    const personas = conDatos();
    for (const u of personas) {
      const r = reparto(itemsUsuario(u.id));
      // Raíz cuadrada: Aventura sale en casi todo y, sin ella, aplasta los demás ejes.
      series.set(u.id, { id: u.id, nombre: u.nombre, valores: ejes.map((t) => Math.sqrt(r.de(t))), reparto: ejes.map((t) => r.de(t)), total: r.total });
    }
    if (personas.length) {
      const repartoGrupo = ejes.map((_, i) => personas.reduce((a, u) => a + series.get(u.id).reparto[i], 0) / personas.length);
      series.set('grupo', { id: 'grupo', nombre: 'Media del grupo', total: personas.length, reparto: repartoGrupo, valores: repartoGrupo.map((x) => Math.sqrt(x)) });
    }
    const max = Math.max(0.05, ...[...series.values()].flatMap((s) => s.valores));
    return { ejes, series, max };
  });
}

// ---------------------------------------------------------------------------
// Revelaciones de alguien (solo las que tienen datos de sobra)
// ---------------------------------------------------------------------------
/** Las notas de los DEMÁS en un item (juego o colección), que cuentan en la tier list. */
function notasDeOtros(x, uid) {
  const todas = x.coleccionId ? metricas.valoracionesColeccionEfectivas(x.coleccionId) : datos.valoracionesDeJuego(x.ids[0]);
  return todas.filter((o) => o.usuario_id !== uid && datos.usuario(o.usuario_id) && notaQueCuenta(o) != null).map(notaQueCuenta);
}

export function revelaciones(uid, tu = true) {
  // tu: en segunda persona (mi perfil) o en tercera (el de otro).
  const t = (a, b) => (tu ? a : b);
  return memoizar(`rev:${uid}:${tu}`, () => {
    const items = itemsUsuario(uid);
    const jugados = items.filter((x) => x.jugado);
    const conNota = items.filter((x) => x.nota != null);
    const miMedia = media(conNota.map((x) => x.nota));
    const gen = dimension(uid, 'generos');
    const salida = [];

    // Tu placer culpable: muchas horas (o muchos juegos) y nota baja.
    const horasTotal = items.reduce((a, x) => a + (x.horas || 0), 0);
    if (miMedia != null && conNota.length >= 8) {
      const porHoras = horasTotal >= 30;
      const cand = gen.filter((g) => g.media != null && g.notas.length >= 2 && g.media <= miMedia - 0.6
        && (porHoras ? g.horas >= horasTotal * 0.1 : g.n >= jugados.length * 0.15))
        .sort((a, b) => (porHoras ? b.horas * (miMedia - b.media) - a.horas * (miMedia - a.media) : b.n * (miMedia - b.media) - a.n * (miMedia - a.media)));
      const g = cand[0];
      if (g) {
        salida.push({
          id: 'placer', titulo: t('Tu placer culpable', 'Su placer culpable'), etiqueta: g.tag, dim: 'generos',
          frase: `${porHoras ? `${g.horas} h` : `${g.n} juegos`} de ${g.tag} y solo ${t('les das', 'les da')} un ${fmt(g.media)} de media.`,
          dato: `${fmt(g.media)}`, sub: `${t('tu', 'su')} media: ${fmt(miMedia)}`,
        });
      }
    }

    // Más duro / más blando que el grupo con un género (≥ 3 juegos comparables).
    const difs = new Map();
    for (const x of conNota) {
      const otros = notasDeOtros(x, uid);
      if (!otros.length) continue;
      const d = x.nota - otros.reduce((a, b) => a + b, 0) / otros.length;
      for (const t of x.tags.generos) { if (!difs.has(t)) difs.set(t, []); difs.get(t).push(d); }
    }
    const porGenero = [...difs.entries()].filter(([, l]) => l.length >= 3).map(([tag, l]) => ({ tag, d: l.reduce((a, b) => a + b, 0) / l.length, n: l.length }));
    const duro = [...porGenero].sort((a, b) => a.d - b.d)[0];
    const blando = [...porGenero].sort((a, b) => b.d - a.d)[0];
    if (duro && duro.d <= -0.5) {
      salida.push({ id: 'duro', titulo: 'Más duro que el grupo con…', etiqueta: duro.tag, dim: 'generos',
        frase: `${duro.tag}: ${t('les pones', 'les pone')} ${fmt(-duro.d)} puntos menos que los demás.`, dato: `−${fmt(-duro.d)}`, sub: `en ${duro.n} juegos` });
    }
    if (blando && blando.d >= 0.5 && blando.tag !== duro?.tag) {
      salida.push({ id: 'blando', titulo: 'Más blando con…', etiqueta: blando.tag, dim: 'generos',
        frase: `${blando.tag}: ${t('les pones', 'les pone')} ${fmt(blando.d)} puntos más que los demás.`, dato: `+${fmt(blando.d)}`, sub: `en ${blando.n} juegos` });
    }

    // Tu década: la de los juegos que mejor puntúa (≥ 3 notas, y al menos dos décadas).
    const decadas = new Map();
    for (const x of conNota) if (x.decada) { if (!decadas.has(x.decada)) decadas.set(x.decada, []); decadas.get(x.decada).push(x.nota); }
    const dec = [...decadas.entries()].filter(([, l]) => l.length >= 3).map(([d, l]) => ({ d, media: media(l), n: l.length }))
      .sort((a, b) => b.media - a.media || b.n - a.n);
    if (dec.length >= 2) {
      salida.push({ id: 'decada', titulo: t('Tu década', 'Su década'), etiqueta: String(dec[0].d), dim: 'decadas',
        frase: `Lo que mejor ${t('puntúas', 'puntúa')} es de ${nombreDecada(dec[0].d)}: un ${fmt(dec[0].media)} de media en ${dec[0].n} juegos.`,
        dato: nombreDecada(dec[0].d).replace('los ', ''), sub: `${fmt(dec[0].media)} de media` });
    }

    // Tu estudio: la desarrolladora con más juegos (≥ 3); a igualdad, la de mejor nota.
    const est = dimensionLibre(jugados, (x) => x.estudios).filter((e) => e.n >= 3)
      .sort((a, b) => b.n - a.n || (b.media ?? 0) - (a.media ?? 0))[0];
    if (est) {
      salida.push({ id: 'estudio', titulo: t('Tu estudio', 'Su estudio'), etiqueta: est.tag, dim: 'estudios',
        frase: `${est.n} juegos de ${est.tag}${est.media != null ? `, con un ${fmt(est.media)} de media` : ''}.`, dato: est.tag, sub: `${est.n} juegos`, largo: true });
    }

    // Tu franquicia: la que más ha jugado (≥ 3).
    const fr = dimensionLibre(jugados, (x) => x.franquicias).filter((e) => e.n >= 3).sort((a, b) => b.n - a.n || (b.media ?? 0) - (a.media ?? 0))[0];
    if (fr) {
      salida.push({ id: 'franquicia', titulo: t('Tu saga de cabecera', 'Su saga de cabecera'), etiqueta: fr.tag, dim: 'franquicias',
        frase: `${fr.n} juegos de ${fr.tag}${fr.media != null ? ` y un ${fmt(fr.media)} de media` : ''}.`, dato: fr.tag, sub: `${fr.n} juegos`, largo: true });
    }

    // Tu especialidad: el género en el que más destaca respecto a los demás (≥ 3 juegos).
    const mio = reparto(items);
    const otros = conDatos().filter((u) => u.id !== uid).map((u) => reparto(itemsUsuario(u.id)));
    if (mio.total >= MIN_RADAR && otros.length) {
      const cand = gen.filter((g) => g.n >= 3 && g.tag !== 'Indie').map((g) => {
        const suya = mio.de(g.tag);
        const deOtros = otros.reduce((a, o) => a + o.de(g.tag), 0) / otros.length;
        return { tag: g.tag, n: g.n, suya, deOtros, ratio: deOtros > 0 ? suya / deOtros : Infinity };
      }).filter((c) => c.ratio >= 1.4).sort((a, b) => b.ratio - a.ratio || b.n - a.n);
      const c = cand[0];
      if (c) {
        salida.push({ id: 'especialidad', titulo: t('Tu especialidad', 'Su especialidad'), etiqueta: c.tag, dim: 'generos',
          frase: c.ratio === Infinity ? `Nadie más del grupo juega a ${c.tag}: ${t('llevas', 'lleva')} ${c.n} juegos.`
            : `${t('Juegas', 'Juega')} ${fmtVeces(c.ratio)} ${c.tag} que la media del grupo.`,
          dato: c.ratio === Infinity ? 'Solo tú' : `×${fmt(c.ratio)}`, sub: c.tag });
      }
    }
    return salida;
  });
}

/** Como una dimensión, pero con etiquetas libres (estudios, franquicias). */
function dimensionLibre(items, etiquetasDe) {
  const m = new Map();
  for (const x of items) {
    for (const t of etiquetasDe(x)) {
      if (!m.has(t)) m.set(t, { tag: t, items: [], n: 0, notas: [] });
      const e = m.get(t);
      e.items.push(x); e.n++;
      if (x.nota != null) e.notas.push(x.nota);
    }
  }
  return [...m.values()].map((e) => ({ ...e, media: e.notas.length >= 2 ? media(e.notas) : null }));
}

// Con punto, como las notas en toda la app (7.5).
const fmt = (n) => String(Math.round(n * 10) / 10);
/** "el doble de", "el triple de" o "1,6 veces más". */
const fmtVeces = (r) => (r >= 1.85 && r < 2.2 ? 'el doble de' : r >= 2.8 && r < 3.2 ? 'el triple de' : `${fmt(r)} veces más`);

// ---------------------------------------------------------------------------
// Grupo
// ---------------------------------------------------------------------------
/** Lo de todos, junto: [{ ...item, uid }] (un item por persona y juego o colección). */
function itemsGrupo() {
  return memoizar('itemsGrupo', () => metricas.usuarios().flatMap((u) => itemsUsuario(u.id).map((x) => ({ ...x, uid: u.id }))));
}

/** Una dimensión del grupo: n = veces jugado (persona y juego), horas de todos, media de todas las notas (≥ 3). */
export function dimensionGrupo(dim) {
  return memoizar(`dimG:${dim}`, () => resumirDimension(itemsGrupo(), dim).map((e) => ({ ...e, media: e.notas.length >= 3 ? media(e.notas) : null })));
}

export function estadisticasGrupo() {
  return memoizar('grupo', () => {
    const todos = itemsGrupo();
    const jugados = todos.filter((x) => x.jugado);
    const distintos = new Set(jugados.map((x) => x.clave)).size;
    const notas = todos.filter((x) => x.nota != null).map((x) => x.nota);
    const horas = Math.round(metricas.usuarios().reduce((a, u) => a + metricas.tiempo(u.id).total, 0));
    const gen = dimensionGrupo('generos');

    // El especialista de cada género (de los más jugados): a quien más le tira, es decir, el
    // que más parte de lo suyo dedica a ese género (con 3 juegos o más); a igualdad, más juegos.
    // (Por número de juegos ganaría siempre quien más juega.)
    const personas = conDatos().filter((u) => u.activo !== false);
    const especialistas = gen.filter((g) => g.n >= 3 && g.tag !== 'Indie').slice(0, 8).map((g) => {
      const orden = personas.map((u) => {
        const r = reparto(itemsUsuario(u.id));
        const mios = g.items.filter((x) => x.uid === u.id);
        return { uid: u.id, n: r.n(g.tag), parte: r.de(g.tag), media: media(mios.filter((x) => x.nota != null).map((x) => x.nota)) };
      }).filter((p) => p.n >= 3).sort((a, b) => b.parte - a.parte || b.n - a.n);
      return orden[0] ? { tag: g.tag, ...orden[0] } : null;
    }).filter(Boolean);

    // El género que nadie toca (juegos distintos jugados por alguien).
    const veces = new Map(gen.map((g) => [g.tag, new Set(g.items.map((x) => x.clave)).size]));
    const olvidado = GENEROS_TODOS.map((t) => ({ tag: t, n: veces.get(t) ?? 0 })).sort((a, b) => a.n - b.n)[0];

    // El juego que más une: el que más gente ha valorado bien (B o más); a igualdad, mejor media.
    const porItem = new Map();
    for (const x of todos) {
      if (x.nota == null) continue;
      if (!porItem.has(x.clave)) porItem.set(x.clave, { juego: x.juego, clave: x.clave, buenas: [], notas: [] });
      const e = porItem.get(x.clave);
      e.notas.push(x.nota);
      if (x.nota >= 7) e.buenas.push(x.uid);
    }
    const une = [...porItem.values()].filter((e) => e.buenas.length >= 2)
      .map((e) => ({ ...e, media: media(e.notas) }))
      .sort((a, b) => b.buenas.length - a.buenas.length || b.media - a.media)[0] ?? null;

    // La década del grupo: la más jugada (y su nota media).
    const dec = new Map();
    // (n = juegos distintos; la media, de todas las notas)
    for (const x of jugados) if (x.decada) { if (!dec.has(x.decada)) dec.set(x.decada, { d: x.decada, claves: new Set(), notas: [] }); const e = dec.get(x.decada); e.claves.add(x.clave); if (x.nota != null) e.notas.push(x.nota); }
    const decadas = [...dec.values()].map((e) => ({ d: e.d, n: e.claves.size, notas: e.notas, media: media(e.notas) })).sort((a, b) => a.d - b.d);
    const decada = [...decadas].sort((a, b) => b.n - a.n)[0] ?? null;

    return { jugados: jugados.length, distintos, notas: notas.length, media: media(notas), horas, especialistas, olvidado, une, decada, decadas, personas: conDatos().length };
  });
}

// ---------------------------------------------------------------------------
// Los juegos que forman un trozo de un gráfico (al tocarlo)
// ---------------------------------------------------------------------------
/**
 * uid = persona o 'grupo'; dim = generos|temas|modos|perspectivas|estudios|franquicias|decadas.
 * → [{ juego, clave, nota, horas, n (grupo: cuántos), media (grupo) }]
 */
export function juegosDe(uid, dim, tag) {
  const tiene = (x) => (dim === 'estudios' ? x.estudios.includes(tag) : dim === 'franquicias' ? x.franquicias.includes(tag)
    : dim === 'decadas' ? String(x.decada) === String(tag) : (x.tags[dim] ?? []).includes(tag));
  if (uid === 'grupo') {
    const m = new Map();
    for (const x of itemsGrupo()) {
      if (!x.jugado || !tiene(x)) continue;
      if (!m.has(x.clave)) m.set(x.clave, { juego: x.juego, clave: x.clave, n: 0, notas: [], horas: 0 });
      const e = m.get(x.clave); e.n++; e.horas += x.horas || 0; if (x.nota != null) e.notas.push(x.nota);
    }
    return [...m.values()].map((e) => ({ ...e, media: media(e.notas), horas: Math.round(e.horas) }))
      .sort((a, b) => b.n - a.n || (b.media ?? -1) - (a.media ?? -1));
  }
  return itemsUsuario(uid).filter((x) => (x.jugado || x.horas > 0) && tiene(x))
    .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || b.horas - a.horas);
}
