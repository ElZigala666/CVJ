// =============================================================================
// CVJ · Edge Function "igdb": proxy de la API de IGDB (Twitch).
// Todo en un archivo para poder pegarlo en el editor de funciones del panel de
// Supabase. Secretos necesarios: TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.
// Desplegar con "Verify JWT" / "Enforce JWT verification" DESACTIVADO.
//
// Peticiones (POST, JSON):
//   { "accion": "buscar", "texto": "ghost" }
//   { "accion": "juego",  "igdb_id": 1942 }
//   { "accion": "tipos" }   (depuración: tipos de juego de IGDB y los que se usan)
//   { "accion": "depurar", "texto": "cyberpunk" }   (depuración: qué devuelve cada consulta)
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET") ?? "";

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// -----------------------------------------------------------------------------
// Utilidades de respuesta
// -----------------------------------------------------------------------------
function json(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

class ErrorPublico extends Error {
  constructor(mensaje: string, public estado = 400) {
    super(mensaje);
  }
}

// -----------------------------------------------------------------------------
// Token de Twitch (client_credentials), guardado en la tabla igdb_token
// -----------------------------------------------------------------------------
let tokenMemoria: { token: string; expira: number } | null = null;
const MARGEN_MS = 5 * 60 * 1000; // renovar 5 min antes de que caduque

async function obtenerToken(forzarNuevo = false): Promise<string> {
  const ahora = Date.now();
  if (!forzarNuevo && tokenMemoria && tokenMemoria.expira - MARGEN_MS > ahora) {
    return tokenMemoria.token;
  }

  if (!forzarNuevo) {
    const { data, error } = await sb
      .from("igdb_token")
      .select("access_token, expira_en")
      .eq("id", 1)
      .maybeSingle();
    if (error) console.error("Leyendo igdb_token:", error.message);
    if (data) {
      const expira = new Date(data.expira_en).getTime();
      if (expira - MARGEN_MS > ahora) {
        tokenMemoria = { token: data.access_token, expira };
        return data.access_token;
      }
    }
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new ErrorPublico("Faltan los secretos TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET", 500);
  }

  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("client_secret", CLIENT_SECRET);
  url.searchParams.set("grant_type", "client_credentials");
  const r = await fetch(url, { method: "POST" });
  if (!r.ok) {
    console.error("Twitch token:", r.status, await r.text());
    throw new ErrorPublico("Twitch no ha dado el token (revisa los secretos)", 502);
  }
  const t = await r.json() as { access_token: string; expires_in: number };
  const expira = ahora + t.expires_in * 1000;
  tokenMemoria = { token: t.access_token, expira };

  const { error } = await sb.from("igdb_token").upsert({
    id: 1,
    access_token: t.access_token,
    expira_en: new Date(expira).toISOString(),
  });
  if (error) console.error("Guardando igdb_token:", error.message);

  return t.access_token;
}

async function igdb<T = unknown>(endpoint: string, consulta: string): Promise<T> {
  let token = await obtenerToken();
  const pedir = (tk: string) =>
    fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": CLIENT_ID,
        "Authorization": `Bearer ${tk}`,
        "Accept": "application/json",
        "Content-Type": "text/plain",
      },
      body: consulta,
    });

  let r = await pedir(token);
  if (r.status === 401 || r.status === 403) {
    token = await obtenerToken(true); // token revocado o caducado: pedir otro
    r = await pedir(token);
  }
  if (!r.ok) {
    const txt = await r.text();
    console.error(`IGDB ${endpoint}:`, r.status, txt);
    throw new ErrorPublico(r.status === 429 ? "IGDB está saturado, prueba en un momento" : "IGDB ha fallado", 502);
  }
  return await r.json() as T;
}

// -----------------------------------------------------------------------------
// Normalizado de datos
// -----------------------------------------------------------------------------
// Abreviaturas de IGDB → nombres cortos de la app.
const PLATAFORMAS: Record<string, string> = {
  "PS5": "PS5", "PS4": "PS4", "PS3": "PS3", "PS2": "PS2", "PS1": "PS1", "PSX": "PS1",
  "PSV": "PS Vita", "Vita": "PS Vita", "PSP": "PSP",
  "PC": "PC", "Win": "PC", "Mac": "Mac", "Linux": "Linux",
  "Series X|S": "Xbox", "XSX": "Xbox", "XONE": "Xbox", "XBOX": "Xbox", "X360": "Xbox 360",
  "Switch": "Switch", "NSW": "Switch", "Switch 2": "Switch 2", "NSW2": "Switch 2",
  "WiiU": "Wii U", "Wii": "Wii", "3DS": "3DS", "NDS": "DS",
  "iOS": "iOS", "Android": "Android", "Stadia": "Stadia",
};
const ORDEN_PLATAFORMAS = ["PS5", "PS4", "PC", "Xbox", "Switch 2", "Switch"];

type PlataformaIGDB = { abbreviation?: string; name?: string };

function normalizarPlataformas(lista?: PlataformaIGDB[]): string[] {
  const salida = new Set<string>();
  for (const p of lista ?? []) {
    const abr = (p.abbreviation ?? "").trim();
    const nombre = PLATAFORMAS[abr] ?? (abr || (p.name ?? "").trim());
    if (nombre) salida.add(nombre);
  }
  return [...salida].sort((a, b) => {
    const ia = ORDEN_PLATAFORMAS.indexOf(a);
    const ib = ORDEN_PLATAFORMAS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

const GENEROS: Record<string, string> = {
  "Adventure": "Aventura", "Role-playing (RPG)": "RPG", "Shooter": "Shooter",
  "Platform": "Plataformas", "Puzzle": "Puzle", "Racing": "Carreras",
  "Strategy": "Estrategia", "Real Time Strategy (RTS)": "Estrategia en tiempo real",
  "Turn-based strategy (TBS)": "Estrategia por turnos", "Tactical": "Táctico",
  "Sport": "Deportes", "Fighting": "Lucha", "Simulator": "Simulación", "Indie": "Indie",
  "Arcade": "Arcade", "Hack and slash/Beat 'em up": "Hack and slash", "Music": "Música",
  "Point-and-click": "Point and click", "Card & Board Game": "Cartas y tablero",
  "MOBA": "MOBA", "Pinball": "Pinball", "Quiz/Trivia": "Preguntas", "Visual Novel": "Novela visual",
};

function anio(fecha?: number): number | null {
  return fecha ? new Date(fecha * 1000).getUTCFullYear() : null;
}

function escaparTexto(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// -----------------------------------------------------------------------------
// Acciones
// -----------------------------------------------------------------------------
type JuegoIGDB = {
  id: number;
  name: string;
  slug?: string;
  first_release_date?: number;
  cover?: { image_id?: string };
  platforms?: PlataformaIGDB[];
  genres?: { name: string }[];
  involved_companies?: { developer?: boolean; company?: { name?: string } }[];
  summary?: string;
  total_rating_count?: number;
  hypes?: number;
  rating?: number;
  game_type?: number | { id: number } | null;
};

// -----------------------------------------------------------------------------
// Tipos de juego (game_type sustituye al antiguo "category").
// Los ids se leen de /v4/game_types por su nombre y se guardan en memoria; si esa
// consulta falla, se usan los de respaldo (comprobados con la acción "tipos").
// Se aceptan: juego principal, remake, remaster, port, expansión independiente y
// juego ampliado (p. ej. Persona 5 Royal). Fuera: DLC, expansiones, bundles,
// packs, mods, episodios, temporadas, forks y actualizaciones.
// -----------------------------------------------------------------------------
const NOMBRES_TIPOS_VALIDOS = ["main game", "remake", "remaster", "port", "standalone expansion", "expanded game"];
const IDS_RESPALDO = [0, 4, 8, 9, 10, 11];
let tiposCache: { ids: number[]; todos: { id: number; type: string }[]; origen: string } | null = null;

async function tiposValidos() {
  if (tiposCache) return tiposCache;
  try {
    const todos = await igdb<{ id: number; type: string }[]>("game_types", "fields id,type; limit 50; sort id asc;");
    const ids = todos
      .filter((t) => NOMBRES_TIPOS_VALIDOS.includes(String(t.type).trim().toLowerCase()))
      .map((t) => t.id);
    if (ids.length >= 3) {
      tiposCache = { ids, todos, origen: "game_types" };
      return tiposCache;
    }
    console.error("game_types sin los nombres esperados:", JSON.stringify(todos));
  } catch (e) {
    console.error("No se han podido leer los game_types:", (e as Error).message);
  }
  // Sin cachear el respaldo: se reintenta en la próxima búsqueda.
  return { ids: IDS_RESPALDO, todos: [], origen: "respaldo" };
}

const CAMPOS_LISTA =
  "name,first_release_date,cover.image_id,platforms.abbreviation,platforms.name,total_rating_count,hypes,rating,game_type";

// <puntuacion> (bloque sin dependencias: se prueba en local con node)
/** minúsculas, sin tildes ni signos: "Ghost of Yōtei!" → "ghost of yotei" */
export function normalizar(t: string): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type Candidato = {
  name: string;
  first_release_date?: number;
  cover?: { image_id?: string };
  total_rating_count?: number;
  hypes?: number;
  posicionBusqueda?: number; // posición en el "search" de IGDB (0 = la mejor)
  game_type?: number | { id: number } | null;
};

const ANIO_SEG = 365 * 86400;
const TIPO_JUEGO_AMPLIADO = 10; // "Expanded Game": Director's Cut, Royal...

/**
 * Puntuación propia para ordenar resultados:
 *  - popularidad (log del número de valoraciones en IGDB) pesa mucho;
 *  - extra por novedad (últimos 3 años) y "hypes" de lo reciente o por salir;
 *  - las ediciones ampliadas (Director's Cut...) bajan un poco;
 *  - bonus si el nombre empieza por el texto, más si coincide exactamente;
 *  - un poco por la relevancia de IGDB y por contener todas las palabras;
 *  - ligera penalización sin portada o sin fecha.
 */
export function puntuar(j: Candidato, texto: string, ahoraSeg = Date.now() / 1000): number {
  const q = normalizar(texto);
  const n = normalizar(j.name);
  const palabras = q.split(" ").filter(Boolean);
  let p = 0;

  p += 3 * Math.log10(1 + (j.total_rating_count ?? 0));

  // Novedad: lo de los últimos 3 años sube (tiene menos valoraciones solo por ser nuevo)
  // y lo que aún no ha salido o salió hace menos de 2 años cuenta sus "hypes".
  const fecha = j.first_release_date;
  const edad = fecha ? (ahoraSeg - fecha) / ANIO_SEG : null;
  if (edad !== null && edad < 3) p += 2.5 * (1 - Math.max(0, edad) / 3);
  if ((edad === null || edad < 2) && j.hypes) p += 1.5 * Math.log10(1 + j.hypes);

  // Ediciones ampliadas (Director's Cut...) por debajo del juego original.
  const tipo = typeof j.game_type === "object" && j.game_type !== null ? j.game_type.id : j.game_type;
  if (tipo === TIPO_JUEGO_AMPLIADO) p -= 2;

  if (n === q) p += 6;
  else if (n.startsWith(q)) p += 3;
  else if (n.split(" ").some((w, i, ws) => ws.slice(i).join(" ").startsWith(q))) p += 1.5; // "the legend of zelda" con "zelda"

  // Todas las palabras presentes (la última puede estar a medias).
  const ws = n.split(" ");
  const todas = palabras.every((w, i) =>
    i === palabras.length - 1 ? ws.some((x) => x.startsWith(w)) : ws.includes(w) || ws.some((x) => x.startsWith(w))
  );
  if (todas) p += 1;

  if (j.posicionBusqueda !== undefined) p += 1.2 * (1 - j.posicionBusqueda / 50);

  if (!j.cover?.image_id) p -= 1.5;
  if (!fecha) p -= 1;

  return p;
}

/** Une las dos listas sin duplicados y las ordena por puntuación. */
export function ordenar<T extends Candidato & { id: number }>(busqueda: T[], parcial: T[], texto: string, max = 20): T[] {
  const porId = new Map<number, T>();
  busqueda.forEach((j, i) => porId.set(j.id, { ...j, posicionBusqueda: i }));
  for (const j of parcial) if (!porId.has(j.id)) porId.set(j.id, j);
  const ahora = Date.now() / 1000;
  return [...porId.values()]
    .map((j) => ({ j, p: puntuar(j, texto, ahora) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, max)
    .map((x) => x.j);
}
// </puntuacion>

/** Filtro de coincidencia parcial: el nombre contiene cada palabra (sin mayúsculas). */
function filtroNombre(texto: string): string {
  const palabras = texto.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  return palabras.map((w) => `name ~ *"${escaparTexto(w)}"*`).join(" & ");
}

const idTipo = (j: JuegoIGDB) =>
  typeof j.game_type === "object" && j.game_type !== null ? j.game_type.id : j.game_type;

/** Quita DLC, bundles, mods... mirando el game_type de cada juego (si lo trae). */
function soloJuegosPrincipales(lista: JuegoIGDB[], ids: number[]) {
  return lista.filter((j) => idTipo(j) == null || ids.includes(Number(idTipo(j))));
}

const cuerpoBusqueda = (q: string, where: string) =>
  `search "${escaparTexto(q)}"; fields ${CAMPOS_LISTA}; ${where ? `where ${where}; ` : ""}limit 50;`;
const cuerpoParcial = (q: string, where: string) =>
  `fields ${CAMPOS_LISTA}; where ${filtroNombre(q)}${where ? ` & ${where}` : ""}; sort total_rating_count desc; limit 50;`;

/**
 * Las dos consultas, en paralelo (tardan lo mismo que una):
 *  a) "search" de IGDB (relevancia; no encuentra palabras a medias)
 *  b) nombre que contiene cada palabra, por popularidad (encuentra "rocket le")
 * Nota: se probó /v4/multiquery para hacerlo en una sola petición, pero con esta
 * cuenta IGDB responde siempre "[]" (incluso sin filtros), así que no se usa.
 */
async function dosConsultas(q: string, where: string) {
  const [busqueda, parcial] = await Promise.all([
    igdb<JuegoIGDB[]>("games", cuerpoBusqueda(q, where)),
    igdb<JuegoIGDB[]>("games", cuerpoParcial(q, where)),
  ]);
  return { busqueda, parcial };
}

async function obtenerCandidatos(q: string) {
  const { ids } = await tiposValidos();
  const r = await dosConsultas(q, `version_parent = null & game_type = (${ids.join(",")})`);
  // Por si algún día IGDB deja de aceptar el filtro de tipo: se repite sin él
  // y se filtra aquí con el campo game_type.
  if (!r.busqueda.length && !r.parcial.length) {
    const s = await dosConsultas(q, "version_parent = null");
    return { busqueda: soloJuegosPrincipales(s.busqueda, ids), parcial: soloJuegosPrincipales(s.parcial, ids) };
  }
  return r;
}

async function buscar(texto: string) {
  const q = texto.trim().slice(0, 100);
  if (q.length < 2) return { resultados: [] };
  const { busqueda, parcial } = await obtenerCandidatos(q);

  return {
    resultados: ordenar(busqueda, parcial, q, 20).map((j) => ({
      igdb_id: j.id,
      nombre: j.name,
      anio: anio(j.first_release_date),
      cover_id: j.cover?.image_id ?? null,
      plataformas: normalizarPlataformas(j.platforms),
    })),
  };
}

/** Depuración: tipos de juego de IGDB y los que se están usando. */
async function tipos() {
  tiposCache = null;
  const t = await tiposValidos();
  return { usados: t.ids, origen: t.origen, todos: t.todos };
}

/** Depuración: qué devuelve cada consulta para un texto y la puntuación final. */
async function depurar(texto: string) {
  const q = texto.trim().slice(0, 100) || "cyberpunk";
  const { ids } = await tiposValidos();
  const conTipo = `version_parent = null & game_type = (${ids.join(",")})`;
  const nombres = (l: JuegoIGDB[]) =>
    l.slice(0, 8).map((j) => `${j.name} [tipo ${idTipo(j) ?? "?"}, ${j.total_rating_count ?? 0} val., ${anio(j.first_release_date) ?? "s/f"}]`);
  const r = await dosConsultas(q, conTipo);
  const ahora = Date.now() / 1000;
  return {
    texto: q,
    ids,
    search: nombres(r.busqueda),
    parcial: nombres(r.parcial),
    final: ordenar(r.busqueda, r.parcial, q, 10).map((j) => `${j.name} (${puntuar(j, q, ahora).toFixed(2)})`),
  };
}

async function juego(igdbId: number) {
  const [j] = await igdb<JuegoIGDB[]>(
    "games",
    `fields name,slug,first_release_date,summary,cover.image_id,platforms.abbreviation,platforms.name,genres.name,involved_companies.developer,involved_companies.company.name; where id = ${igdbId}; limit 1;`,
  );
  if (!j) throw new ErrorPublico("Ese juego no existe en IGDB", 404);

  const fila = {
    igdb_id: j.id,
    nombre: j.name,
    slug: j.slug ?? null,
    cover_id: j.cover?.image_id ?? null,
    anio: anio(j.first_release_date),
    plataformas: normalizarPlataformas(j.platforms),
    desarrolladora: j.involved_companies?.find((c) => c.developer)?.company?.name ?? null,
    generos: (j.genres ?? []).map((g) => GENEROS[g.name] ?? g.name),
    resumen: j.summary ?? null,
    actualizado_en: new Date().toISOString(),
  };

  const { error } = await sb.from("juegos").upsert(fila, { onConflict: "igdb_id" });
  if (error) console.error("Upsert juegos:", error.message);

  return { juego: fila };
}

// -----------------------------------------------------------------------------
// Servidor
// -----------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405);

  try {
    let cuerpo: Record<string, unknown>;
    try {
      cuerpo = await req.json();
    } catch {
      throw new ErrorPublico("El cuerpo debe ser JSON");
    }

    switch (cuerpo.accion) {
      case "buscar":
        return json(await buscar(String(cuerpo.texto ?? "")));
      case "tipos":
        return json(await tipos());
      case "depurar":
        return json(await depurar(String(cuerpo.texto ?? "")));
      case "juego": {
        const id = Number(cuerpo.igdb_id);
        if (!Number.isInteger(id) || id <= 0) throw new ErrorPublico("igdb_id no válido");
        return json(await juego(id));
      }
      default:
        throw new ErrorPublico('Acción desconocida (usa "buscar", "juego" o "tipos")');
    }
  } catch (e) {
    if (e instanceof ErrorPublico) return json({ error: e.message }, e.estado);
    console.error(e);
    return json({ error: "Error interno" }, 500);
  }
});
