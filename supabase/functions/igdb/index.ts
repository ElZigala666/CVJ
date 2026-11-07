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
//   { "accion": "emparejar", "nombre": "Ghost of Tsushima™", "title_id": "CUSA13323", "plataforma": "PS4",
//     "primera_vez": "2021-03-01T...", "valorados": [1, 2] }
//       (lo usa la función psn: juego o colección de IGDB de un título de PlayStation, con su
//        confianza 0-100; por debajo de 75 no se acepta y se devuelve como propuesta)
//   { "accion": "revisar_juegos" }   (rellena es_online y relaciones en los juegos que no las tienen)
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

// IGDB admite 4 peticiones por segundo. Se espacian (en esta instancia) y, si aun así
// responde 429, se espera y se reintenta (hasta 4 veces) en vez de fallar.
const ESPACIO_MS = 280;
let siguienteHueco = 0;
async function turno() {
  const ahora = Date.now();
  const espera = Math.max(0, siguienteHueco - ahora);
  siguienteHueco = Math.max(ahora, siguienteHueco) + ESPACIO_MS;
  if (espera) await new Promise((r) => setTimeout(r, espera));
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

  await turno();
  let r = await pedir(token);
  if (r.status === 401 || r.status === 403) {
    token = await obtenerToken(true); // token revocado o caducado: pedir otro
    await turno();
    r = await pedir(token);
  }
  for (let intento = 1; r.status === 429 && intento <= 4; intento++) {
    await new Promise((res) => setTimeout(res, 600 * intento));
    await turno();
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
  game_modes?: { name?: string }[];
  themes?: { name?: string }[];
  keywords?: { name?: string }[];
  alternative_names?: { name?: string }[];
  version_parent?: number | null;
  parent_game?: number | null;
  remakes?: number[];
  remasters?: number[];
  ports?: number[];
  expanded_games?: number[];
  bundles?: number[];
  collections?: { id: number; name?: string }[];
  franchises?: { id: number; name?: string }[];
  franchise?: { id: number; name?: string } | null;
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

/** Id del tipo "bundle" (colecciones): Buscar las excluye, el emparejamiento de PSN no. */
async function idBundle(): Promise<number> {
  const t = await tiposValidos();
  return t.todos.find((x) => String(x.type).trim().toLowerCase() === "bundle")?.id ?? 3;
}

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
const CAMPOS_RELACIONES =
  "game_type,version_parent,parent_game,remakes,remasters,ports,expanded_games,bundles,collections.name,franchises.name,franchise.name";
const CAMPOS_FICHA =
  `name,slug,first_release_date,summary,cover.image_id,platforms.abbreviation,platforms.name,genres.name,involved_companies.developer,involved_companies.company.name,game_modes.name,themes.name,keywords.name,${CAMPOS_RELACIONES}`;
const CAMPOS_EMPAREJAR = `${CAMPOS_LISTA},alternative_names.name,game_localizations.name,version_parent,parent_game`;

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

/**
 * ¿Juego online / sin final? (Fortnite, Rocket League, Warzone...)
 *  - modo MMO o Battle Royale;
 *  - multijugador sin modo de un jugador;
 *  - multijugador y etiquetado como free-to-play / juego como servicio / esports.
 */
export function detectarOnline(j: { game_modes?: { name?: string }[]; themes?: { name?: string }[]; keywords?: { name?: string }[] }): boolean {
  const modos = (j.game_modes ?? []).map((m) => normalizar(m.name ?? ""));
  const etiquetas = [...(j.themes ?? []), ...(j.keywords ?? [])].map((k) => normalizar(k.name ?? ""));
  const unJugador = modos.some((m) => m.includes("single player"));
  const masivo = modos.some((m) => m.includes("massively multiplayer") || m.includes("mmo") || m.includes("battle royale"));
  const multi = modos.some((m) => m.includes("multiplayer") || m.includes("co operative") || m.includes("split screen"));
  const servicio = etiquetas.some((k) =>
    /^(free to play|games as a service|game as a service|live service|live service game|esports|e sports|battle royale)$/.test(k)
  );
  if (masivo) return true;
  if (multi && !unJugador) return true;
  return multi && servicio;
}

// ----- Emparejar títulos de PlayStation --------------------------------------
const EDICIONES = /\b(standard|digital|deluxe|ultimate|gold|complete|definitive|premium|special|collector s|game of the year|goty|launch|day one|cross gen|estandar|digital deluxe|completa|definitiva|del juego del ano)\s+(edition|edicion|bundle)\b/g;

/** "Ghost of Tsushima™ PS4 & PS5 Edición Estándar" → "ghost of tsushima" */
export function limpiarNombrePsn(nombre: string, sinRemaster = false): string {
  let n = String(nombre ?? "")
    .replace(/[™®©]/g, "")
    .replace(/['’`´]/g, "") // "Tom Clancy's" → "tom clancys"
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ps4|ps5)\s+version\b/g, " ")
    .replace(/\bversion\s+(ps4|ps5)\b/g, " ")
    .replace(/\bplay\s*station\s*(4|5)\b/g, " ")
    .replace(/\b(ps4|ps5)(\s+(and|y)?\s*(ps4|ps5))?\b/g, " ")
    .replace(EDICIONES, " ")
    .replace(/\b(edition|edicion)\s+(estandar|standard|digital|deluxe|completa|definitiva)\b/g, " ")
    .replace(/\s+(edition|edicion)\s*$/g, " ")
    .replace(/\bremasterizad[oa]\b/g, "remastered");
  if (sinRemaster) n = n.replace(/\b(remastered|remasterizado|remaster)\b/g, " ");
  return n.replace(/\s+/g, " ").trim();
}

/** ¿Es claramente el mismo juego? (nombres ya limpios). Nunca empareja secuelas numeradas. */
export function claramenteIgual(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const sinArticulo = (x: string) => x.replace(/^(the|el|la|los|las)\s+/, "");
  if (sinArticulo(a) === sinArticulo(b)) return true;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  if (corto.length >= 6 && largo.startsWith(corto + " ") && corto.length / largo.length >= 0.8) {
    const resto = largo.slice(corto.length + 1);
    if (!/^(\d+|[ivx]+)\b/.test(resto)) return true;
  }
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  const comunes = [...ta].filter((x) => tb.has(x)).length;
  const numeros = (t: Set<string>) => [...t].filter((x) => /^(\d+|[ivx]+)$/.test(x)).sort().join(",");
  if (numeros(ta) !== numeros(tb)) return false; // "spider man 2" ≠ "spider man"
  return comunes / new Set([...ta, ...tb]).size >= 0.85 && Math.min(ta.size, tb.size) >= 2;
}

type CandidatoEmparejar = Candidato & {
  id: number;
  alternative_names?: { name?: string }[];
  game_localizations?: { name?: string }[];
  platforms?: { abbreviation?: string; name?: string }[];
  version_parent?: number | null;
  parent_game?: number | null;
};

const TIPO_BUNDLE_RESPALDO = 3;
const UMBRAL_ACEPTAR = 75;
const SINONIMOS: [RegExp, string][] = [
  [/\btrilogia\b/g, "trilogy"], [/\bcoleccion\b/g, "collection"], [/\bantologia\b/g, "anthology"],
  [/\blegado\b/g, "legacy"], [/\bladrones\b/g, "thieves"], [/\bedicion\b/g, "edition"],
];
const VACIAS = /^(the|of|de|del|la|el|los|las|and|y|a)$/;
const sinArt = (x: string) => x.replace(/^(the|el|la|los|las)\s+/, "");

// ----- Simplificar títulos (emparejar y buscador) ------------------------------
// Palabras de edición, en español e inglés, y de plataforma, que sobran para buscar.
const PALABRAS_EDICION = new Set(("edicion edition ediciones deluxe gold ultimate complete completa goty definitive definitiva " +
  "standard estandar digital bundle pack premium special especial collectors coleccionista anniversary aniversario " +
  "enhanced mejorada directors cut corte director royal legendary legendaria ultra super deluxe launch day one " +
  "season pass cross gen version").split(" "));
const PLATAFORMA_EN_TITULO = /\b(ps4|ps5|playstation \d|xbox series x s|xbox series x|xbox series|xbox one|xbox 360|xbox|for windows 10|for windows|windows 10|windows|pc|para xbox series x s|para xbox one|para xbox)\b/g;
const PARECE_EDICION = /\b(edicion|edition|deluxe|gold|ultimate|complete|completa|goty|definitive|definitiva|standard|estandar|digital|bundle|premium|special|especial|anniversary|aniversario|enhanced|directors cut|royal|legendary|ps4|ps5|xbox|windows|pc|remastered|remasterizad[oa]|vacio)\b/;

/** Sin lo que va detrás de ":", " - " o "–" si parece una edición ("Hollow Knight: Edición Corazón Vacío" → "Hollow Knight"). */
export function sinSufijoEdicion(nombre: string): string {
  const crudo = String(nombre ?? "").replace(/[™®©]/g, "");
  const m = crudo.match(/^(.*?)\s*(?::|\s[-–—]\s|\s[-–—]|[-–—]\s)\s*(.+)$/);
  if (!m) return limpiarNombrePsn(crudo);
  const resto = limpiarNombrePsn(m[2]);
  return PARECE_EDICION.test(resto) || !resto ? limpiarNombrePsn(m[1]) : limpiarNombrePsn(crudo);
}

/** Sin palabras de edición ni de plataforma en ningún sitio (con cuidado: "remastered" se queda). */
export function sinPalabrasEdicion(limpio: string): string {
  const sinPlat = limpio.replace(PLATAFORMA_EN_TITULO, " ").replace(/\s+/g, " ").trim();
  const quedan = sinPlat.split(" ").filter((w) => !PALABRAS_EDICION.has(w));
  return quedan.join(" ").trim();
}

const VACIA = /^(the|of|de|del|la|el|los|las|and|y|a|en|to|for|para)$/;
/**
 * Textos que se van probando, de más a menos exacto:
 *  1) el nombre limpio; 2) sin el sufijo de edición; 3) sin palabras de edición ni
 *  plataforma; 4) quitando palabras del final una a una (quedan al menos 2
 *  significativas, o 1 si es larga). Sin repetidos.
 */
export function variantesBusqueda(nombre: string): string[] {
  const limpio = limpiarNombrePsn(nombre);
  const salida = [limpio, sinSufijoEdicion(nombre), sinPalabrasEdicion(sinSufijoEdicion(nombre)), sinPalabrasEdicion(limpio)];
  const base = salida[2] || salida[0];
  const palabras = base.split(" ").filter(Boolean);
  // Quitando palabras del principio ("tom clancys rainbow six siege" → "rainbow six siege"),
  // antes que los recortes del final: suelen ser marcas o sagas que IGDB no pone.
  for (let n = 1; n <= 2 && palabras.length - n >= 2; n++) salida.push(palabras.slice(n).join(" "));
  for (let n = palabras.length - 1; n >= 1; n--) {
    const trozo = palabras.slice(0, n);
    const significativas = trozo.filter((w) => !VACIA.test(w) && w.length >= 3);
    if (significativas.length >= 2 || (significativas.length === 1 && significativas[0].length >= 5 && n === 1)) salida.push(trozo.join(" "));
    if (salida.length >= 12) break;
  }
  // Colecciones en español con la palabra al final, como suelen llamarse en inglés
  // ("trilogia mafia" → "mafia trilogy").
  const t = base.match(/^(trilogia|coleccion|antologia|trilogy|collection|anthology)\s+(.+)$/);
  if (t) salida.splice(1, 0, `${t[2]} ${({ trilogia: "trilogy", coleccion: "collection", antologia: "anthology" } as Record<string, string>)[t[1]] ?? t[1]}`);
  return [...new Set(salida.map((x) => x.trim()).filter((x) => x.length >= 2))];
}

/** Bolsa de palabras (sin orden ni artículos, con sinónimos): "trilogia mafia" = "mafia trilogy". */
export function bolsa(limpio: string): string {
  let x = limpio;
  for (const [r, t] of SINONIMOS) x = x.replace(r, t);
  return x.split(" ").filter((w) => w && !VACIAS.test(w)).sort().join(" ");
}

export const pareceColeccion = (limpio: string) =>
  /\b(trilogy|trilogia|collection|coleccion|bundle|pack|anthology|antologia|compilation|double pack|2 in 1|3 in 1)\b/.test(limpio);

/** Año que se deduce del nombre: "f1 2021" → 2021, "nba 2k24" → 2024, "fifa 22" → 2022. */
export function anioDelNombre(limpio: string): number | null {
  const a = limpio.match(/\b(19[89]\d|20[0-4]\d)\b/);
  if (a) return Number(a[1]);
  const k = limpio.match(/\b2k(\d\d)\b/);
  if (k) return 2000 + Number(k[1]);
  const d = limpio.match(/^(fifa|madden nfl|nhl|ea sports fc|fc|pes|pro evolution soccer|nba live|mlb the show|f1|wrc|efootball pes|ufc|pga tour|nba)\s(\d\d)$/);
  return d ? 2000 + Number(d[2]) : null;
}

/**
 * Parecido de nombre (0-60). Solo cuentan nombres iguales tras limpiarlos (o con
 * otro orden de palabras, o un nombre alternativo de IGDB). Que coincidan algunas
 * palabras da 30 como mucho: nunca basta para aceptar.
 */
export function puntuarNombre(limpio: string, c: { name: string; alternative_names?: { name?: string }[]; game_localizations?: { name?: string }[] }): number {
  const nc = limpiarNombrePsn(c.name);
  if (nc === limpio) return 60;
  if (sinArt(nc) === sinArt(limpio)) return 58;
  const alts = [...(c.alternative_names ?? []), ...((c as { game_localizations?: { name?: string }[] }).game_localizations ?? [])]
    .map((x) => limpiarNombrePsn(x.name ?? "")).filter(Boolean);
  if (alts.some((x) => x === limpio || sinArt(x) === sinArt(limpio))) return 55;
  const bl = bolsa(limpio);
  if (bl.includes(" ") && bolsa(nc) === bl) return 50;
  if (bl.includes(" ") && alts.some((x) => bolsa(x) === bl)) return 48;
  if (limpiarNombrePsn(c.name, true) === limpiarNombrePsn(limpio, true)) return 45; // solo cambia "remastered"
  if (claramenteIgual(limpio, nc) || alts.some((x) => claramenteIgual(limpio, x))) return 30;
  return 0;
}

export type EntradaPsn = { nombre: string; plataforma?: string; primeraVez?: string | null; valorados?: number[] };

const tipoDe = (c: { game_type?: number | { id: number } | null }) =>
  typeof c.game_type === "object" && c.game_type !== null ? c.game_type.id : c.game_type;

/**
 * Confianza (0-100) de que un candidato de IGDB sea ese título de PSN:
 * nombre (hasta 60) + disponible en PS4/PS5 (+20 / +10 / −25 si no está en PlayStation)
 * + año (−40 si salió después de jugarlo por primera vez; ±10/−20 si el nombre lleva año)
 * + colecciones (+10 si el título lo parece, −15 si no) + +15 si ya lo tiene valorado.
 */
/** Textos con los que se compara el nombre: el limpio, sin sufijo y sin palabras de edición. */
function textosNombre(nombre: string) {
  return [...new Set([limpiarNombrePsn(nombre), sinSufijoEdicion(nombre), sinPalabrasEdicion(sinSufijoEdicion(nombre))].filter((x) => x.length >= 2))];
}
/**
 * Parecido de nombre usando todas las simplificaciones. Si nada coincide, que el
 * candidato EMPIECE por una versión recortada del título (con 2+ palabras
 * significativas y sin perder sus números) da 35: parcial, nunca basta por sí solo.
 */
function mejorNombre(nombre: string, c: CandidatoEmparejar) {
  const directo = Math.max(0, ...textosNombre(nombre).map((t) => puntuarNombre(t, c)));
  if (directo) return directo;
  const nc = limpiarNombrePsn(c.name);
  const variantes = variantesBusqueda(nombre).slice(1);
  // Igual a una versión del título sin palabras del principio ("rainbow six siege"): casi exacto.
  if (variantes.some((v) => v.split(" ").length >= 2 && (nc === v || sinArt(nc) === sinArt(v)))) return 50;
  const numeros = (x: string) => (x.match(/\b(\d+|[ivx]+)\b/g) ?? []).join(",");
  for (const v of variantes) {
    if (v.split(" ").filter((w) => w.length >= 3).length < 2) continue;
    if (nc.startsWith(v + " ") && numeros(nc.slice(0, v.length)) === numeros(v)) return 35;
  }
  return 0;
}

/** ¿Está en una plataforma compatible con la fuente? (consola de esa familia, retrocompatibles o PC) */
export function plataformaCompatible(plataforma: string | undefined, c: { platforms?: { abbreviation?: string; name?: string }[] }): boolean | null {
  const plats = (c.platforms ?? []).map((x) => `${x.abbreviation ?? ""}|${x.name ?? ""}`.toUpperCase().replace(/\s+/g, ""));
  if (!plats.length) return null;
  const pl = String(plataforma ?? "");
  if (/^PS/.test(pl)) return plats.some((x) => /PS4|PS5|PLAYSTATION[45]/.test(x));
  if (/^Xbox|^PC$/.test(pl)) return plats.some((x) => /XBOX|XONE|XSX|SERIESX|X360|^PC\||WIN/.test(x));
  return null;
}

export function confianza(e: EntradaPsn, c: CandidatoEmparejar, idBundleTipo = TIPO_BUNDLE_RESPALDO): number {
  const limpio = limpiarNombrePsn(e.nombre);
  const nombre = mejorNombre(e.nombre, c);
  if (!nombre) return 0;
  let p = nombre;
  const plats = (c.platforms ?? []).map((x) => `${x.abbreviation ?? ""}|${x.name ?? ""}`.toUpperCase().replace(/\s+/g, ""));
  if (plats.length) {
    const tiene = (re: RegExp) => plats.some((x) => re.test(x));
    const ps5 = tiene(/PS5|PLAYSTATION5/);
    const ps4 = tiene(/PS4|PLAYSTATION4/);
    const series = tiene(/SERIESX|XSX|XBOXSERIES/);
    const one = tiene(/XONE|XBOXONE/);
    const x360 = tiene(/X360|XBOX360/);
    const pc = tiene(/^PC\||WIN|PC\(MICROSOFTWINDOWS\)|MICROSOFTWINDOWS/);
    const pl = String(e.plataforma ?? "");
    let misma = false, otra = false, familia = false;
    if (pl === "PS5" || pl === "PS4") {
      misma = pl === "PS5" ? ps5 || ps4 : ps4; otra = pl === "PS5" ? false : ps5; // la PS5 juega a lo de PS4
      familia = tiene(/PS\d|PSVITA|PSP|PLAYSTATION/);
    } else if (pl === "Xbox Series" || pl === "Xbox One") {
      // Retrocompatibles: la Series juega a lo de One y 360; la One, a lo de 360. PC Game Pass, "otra".
      misma = pl === "Xbox Series" ? series || one || x360 : one || x360; otra = pl === "Xbox Series" ? pc : series || pc;
      familia = tiene(/XBOX|XONE|XSX|X360/);
    } else if (pl === "Xbox 360") {
      misma = x360; otra = one || series; familia = tiene(/XBOX|XONE|XSX|X360/);
    } else if (pl === "PC") {
      misma = pc; otra = one || series; familia = pc;
    }
    if (misma) p += 20;
    else if (otra) p += 10;
    else if (!familia) p -= 25;
  }
  const anio = c.first_release_date ? new Date(c.first_release_date * 1000).getUTCFullYear() : null;
  if (anio && e.primeraVez) {
    const jugado = new Date(e.primeraVez).getUTCFullYear();
    if (Number.isFinite(jugado) && anio > jugado) p -= 40; // no pudo jugarlo antes de que saliera
  }
  const delNombre = anioDelNombre(limpio);
  if (delNombre && anio) p += Math.abs(anio - delNombre) <= 1 ? 10 : -20;
  if (tipoDe(c) === idBundleTipo) p += pareceColeccion(limpio) ? 10 : -15;
  if (e.valorados?.includes(c.id)) p += 15;
  // Coincidencia parcial de palabras: como mucho "por revisar".
  if (nombre <= 30) p = Math.min(p, UMBRAL_ACEPTAR - 15);
  return Math.max(0, Math.min(100, p));
}

/**
 * Elige entre candidatos: { id } si la confianza llega a 75; si no, { propuesta }
 * con la mejor (para revisarla a mano). Dos candidatos con nombre igual y
 * puntuación parecida restan 20 (es ambiguo).
 */
export function elegirCandidato(e: EntradaPsn, candidatos: CandidatoEmparejar[], idBundleTipo = TIPO_BUNDLE_RESPALDO) {
  // Una edición o versión de otro candidato de la lista es el mismo juego: fuera (queda el original).
  const ids = new Set(candidatos.map((c) => c.id));
  const lista = candidatos
    .filter((c) => !(c.version_parent && ids.has(Number(c.version_parent))))
    .map((c) => ({ c, p: confianza(e, c, idBundleTipo), n: mejorNombre(e.nombre, c) }))
    .sort((a, b) => b.p - a.p);
  if (!lista.length) return { id: null as number | null, propuesta: null as number | null, confianza: 0, candidato: null as CandidatoEmparejar | null };
  const conNombre = lista.filter((x) => x.p > 0);
  // Sin ningún parecido de nombre: el primero que comparta alguna palabra importante queda
  // como propuesta (confianza baja). Si ninguno comparte nada, sin propuesta: mejor elegir a mano.
  if (!conNombre.length) {
    const importantes = new Set(variantesBusqueda(e.nombre)[0].split(" ").filter((w) => w.length >= 4 && !/^(edition|edicion|game|juego|the)$/.test(w)));
    const comparte = lista.find((x) => limpiarNombrePsn(x.c.name).split(" ").some((w) => importantes.has(w)));
    return comparte
      ? { id: null, propuesta: comparte.c.id, confianza: 10, candidato: comparte.c }
      : { id: null as number | null, propuesta: null as number | null, confianza: 0, candidato: null as CandidatoEmparejar | null };
  }
  const [primero, segundo] = conNombre;
  let conf = primero.p;
  if (segundo && segundo.n >= 45 && segundo.p >= primero.p - 10) conf -= 20;
  // Un único resultado razonable (con el nombre parecido y en una plataforma compatible): se acepta.
  // (Que solo coincida el principio del nombre no cuenta: "rainbow six" no es "Rainbow Six Extraction".)
  const razonables = conNombre.filter((x) => x.n >= 45 && plataformaCompatible(e.plataforma, x.c) !== false);
  // (Nunca si algo lo contradice: p. ej. que se jugara antes de salir.)
  const sinPegas = primero.p >= 55;
  if (sinPegas && razonables.length === 1 && razonables[0] === primero) conf = Math.max(conf, UMBRAL_ACEPTAR);
  // El nombre del candidato es justo el título sin la edición, y está en su plataforma: se acepta.
  if (sinPegas && primero.n >= 55 && plataformaCompatible(e.plataforma, primero.c) === true && !(segundo && segundo.n >= 55 && segundo.p >= primero.p - 10)) {
    conf = Math.max(conf, UMBRAL_ACEPTAR);
  }
  conf = Math.max(0, Math.min(100, conf));
  return conf >= UMBRAL_ACEPTAR
    ? { id: primero.c.id, propuesta: null, confianza: conf, candidato: primero.c }
    : { id: null, propuesta: primero.c.id, confianza: conf, candidato: primero.c };
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

/** ¿Algún resultado comparte al menos la mitad de las palabras del texto? (si no, son flojos) */
function resultadosFlojos(lista: JuegoIGDB[], q: string) {
  const palabras = normalizar(q).split(" ").filter((w) => w.length >= 3);
  if (!lista.length) return true;
  if (!palabras.length) return false;
  return !lista.slice(0, 5).some((j) => {
    const n = normalizar(j.name);
    return palabras.filter((w) => n.includes(w)).length / palabras.length >= 0.5;
  });
}

async function buscar(texto: string) {
  const q = texto.trim().slice(0, 100);
  if (q.length < 2) return { resultados: [] };
  let { busqueda, parcial } = await obtenerCandidatos(q);
  let qFinal = q;
  // Palabras de más ("hollow knight edicion corazon vacio"): se prueba simplificando.
  if (resultadosFlojos(ordenar(busqueda, parcial, q, 20), q)) {
    for (const v of variantesBusqueda(q).slice(1)) {
      const r = await obtenerCandidatos(v);
      if (!resultadosFlojos(ordenar(r.busqueda, r.parcial, v, 20), v)) {
        busqueda = [...r.busqueda, ...busqueda];
        parcial = [...r.parcial, ...parcial];
        qFinal = v;
        break;
      }
    }
  }

  return {
    resultados: ordenar(busqueda, parcial, qFinal, 20).map((j) => ({
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

/** Lo que alguien eligió a mano en la ficha (manda sobre la detección automática). */
async function onlineManual(ids: number[]) {
  const m = new Map<number, boolean>();
  const { data, error } = await sb.from("juegos").select("igdb_id, es_online_manual").in("igdb_id", ids);
  if (error) return null; // sin la migración 005
  for (const x of data ?? []) if (x.es_online_manual !== null) m.set(Number(x.igdb_id), x.es_online_manual);
  return m;
}

/** Guarda filas en juegos; sin la migración 005 (columna es_online), las guarda sin ella. */
async function guardarJuegos(filas: Record<string, unknown>[]) {
  let { error } = await sb.from("juegos").upsert(filas, { onConflict: "igdb_id" });
  if (error && /relaciones/.test(error.message)) {
    ({ error } = await sb.from("juegos").upsert(filas.map(({ relaciones: _, ...r }) => r), { onConflict: "igdb_id" }));
  }
  if (error && /es_online/.test(error.message)) {
    ({ error } = await sb.from("juegos").upsert(filas.map(({ es_online: _, relaciones: __, ...r }) => r), { onConflict: "igdb_id" }));
  }
  if (error) console.error("Upsert juegos:", error.message);
}

async function juego(igdbId: number) {
  const [j] = await igdb<JuegoIGDB[]>("games", `fields ${CAMPOS_FICHA}; where id = ${igdbId}; limit 1;`);
  if (!j) throw new ErrorPublico("Ese juego no existe en IGDB", 404);
  const manual = await onlineManual([j.id]);

  const fila: Record<string, unknown> = {
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
  if (manual) fila.es_online = manual.get(j.id) ?? detectarOnline(j);
  fila.relaciones = relacionesDe(j);

  await guardarJuegos([fila]);
  await asegurarPadres([fila]);
  return { juego: fila };
}

/**
 * Versiones (remaster, port, edición...): su juego original tiene que estar guardado
 * para que la base las fusione sola (trigger en juegos → fusionar_versiones).
 */
function padreDe(r: Record<string, any> | null | undefined): number | null {
  if (!r) return null;
  const tipo = r.tipo == null ? 0 : Number(r.tipo);
  if ([9, 10, 11].includes(tipo)) return Number(r.version_parent ?? r.parent_game) || null;
  if (tipo === 0) return Number(r.version_parent) || null;
  return null;
}
async function asegurarPadres(filas: Record<string, unknown>[], nivel = 0) {
  if (nivel > 1) return;
  const padres = [...new Set(filas.map((f) => padreDe(f.relaciones as Record<string, any>)).filter((x): x is number => !!x))];
  if (!padres.length) return;
  const { data } = await sb.from("juegos").select("igdb_id").in("igdb_id", padres);
  const hay = new Set((data ?? []).map((x) => Number(x.igdb_id)));
  const faltan = padres.filter((x) => !hay.has(x));
  if (faltan.length) await guardarVarios(faltan, nivel + 1);
}

/**
 * Steam: appid → juego de IGDB con external_games (fuente Steam = 1). Una consulta por
 * cada 500 appids. Guarda esos juegos en la tabla (y sus originales, para las
 * fusiones de versiones). → { juegos: { appid: igdbId } }
 */
async function porAppidSteam(appids: string[]) {
  const lista = [...new Set(appids.map((x) => String(x).replace(/\D/g, "")).filter(Boolean))];
  const juegos: Record<string, number> = {};
  for (let i = 0; i < lista.length; i += 500) {
    const trozo = lista.slice(i, i + 500).map((x) => `"${x}"`).join(",");
    let ext: { game?: number; uid?: string }[] = [];
    try {
      // Campo actual: external_game_source (Steam = 1); el antiguo era category.
      ext = await igdb("external_games", `fields game,uid; where external_game_source = 1 & uid = (${trozo}); limit 500;`);
    } catch {
      ext = await igdb("external_games", `fields game,uid; where category = 1 & uid = (${trozo}); limit 500;`);
    }
    // Si un appid diera varios juegos, se queda sin emparejar (lo hará el nombre).
    const porUid = new Map<string, Set<number>>();
    for (const x of ext) {
      if (!x.uid || !x.game) continue;
      if (!porUid.has(x.uid)) porUid.set(x.uid, new Set());
      porUid.get(x.uid)!.add(Number(x.game));
    }
    for (const [uid, set] of porUid) if (set.size === 1) juegos[uid] = [...set][0];
  }
  const ids = [...new Set(Object.values(juegos))];
  for (let i = 0; i < ids.length; i += 100) await guardarVarios(ids.slice(i, i + 100));
  return { juegos };
}

/** Busca los originales que falten de todas las versiones guardadas y fusiona. */
async function fusionarVersiones() {
  const { data } = await sb.from("juegos").select("igdb_id, relaciones").not("relaciones", "is", null);
  await asegurarPadres((data ?? []) as Record<string, unknown>[]);
  const { data: r, error } = await sb.rpc("fusionar_versiones");
  if (error) throw new Error(error.message);
  return r;
}

/** Lo que IGDB sabe de un juego: ediciones, versiones, remasters, colecciones, sagas... */
function relacionesDe(j: JuegoIGDB) {
  const ids = (l?: number[]) => (l ?? []).map(Number).filter(Boolean);
  return {
    tipo: idTipo(j) ?? null,
    version_parent: j.version_parent ?? null,
    parent_game: j.parent_game ?? null,
    remakes: ids(j.remakes),
    remasters: ids(j.remasters),
    ports: ids(j.ports),
    expanded_games: ids(j.expanded_games),
    bundles: ids(j.bundles),
    colecciones: (j.collections ?? []).map((c) => ({ id: c.id, nombre: c.name ?? "" })),
    franquicias: [...(j.franchises ?? []), ...(j.franchise ? [j.franchise] : [])].map((f) => ({ id: f.id, nombre: f.name ?? "" })),
  };
}

/** Guarda varios juegos completos (con es_online y relaciones) de una vez. */
async function guardarVarios(ids: number[], nivel = 0) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return;
  const lista = await igdb<JuegoIGDB[]>("games", `fields ${CAMPOS_FICHA}; where id = (${unicos.join(",")}); limit 100;`);
  const manual = await onlineManual(unicos);
  await guardarJuegos(lista.map((j) => {
    const fila: Record<string, unknown> = {
      igdb_id: j.id, nombre: j.name, slug: j.slug ?? null, cover_id: j.cover?.image_id ?? null,
      anio: anio(j.first_release_date), plataformas: normalizarPlataformas(j.platforms),
      desarrolladora: j.involved_companies?.find((c) => c.developer)?.company?.name ?? null,
      generos: (j.genres ?? []).map((g) => GENEROS[g.name] ?? g.name), resumen: j.summary ?? null,
      actualizado_en: new Date().toISOString(), relaciones: relacionesDe(j),
    };
    if (manual) fila.es_online = manual.get(j.id) ?? detectarOnline(j);
    return fila;
  }));
  await asegurarPadres(lista.map((j) => ({ relaciones: relacionesDe(j) })), nivel);
}

/**
 * Rellena es_online y relaciones en los juegos guardados que aún no los tienen
 * (de 100 en 100). Lo pide la app una vez por sesión si hace falta.
 */
async function revisarJuegos() {
  let r = await sb.from("juegos").select("igdb_id, es_online, es_online_manual, relaciones").or("es_online.is.null,relaciones.is.null").limit(100);
  const conRelaciones = !r.error;
  if (r.error) r = await sb.from("juegos").select("igdb_id, es_online, es_online_manual").is("es_online", null).limit(100);
  if (r.error) return { revisados: 0, error: "Falta la migración 005" };
  const data = r.data ?? [];
  if (!data.length) return { revisados: 0, online: 0 };
  const ids = data.map((x) => Number(x.igdb_id));
  const lista = await igdb<JuegoIGDB[]>("games", `fields game_modes.name,themes.name,keywords.name,${CAMPOS_RELACIONES}; where id = (${ids.join(",")}); limit 500;`);
  const porId = new Map(lista.map((j) => [j.id, j]));
  let online = 0;
  await Promise.all(data.map(async (x) => {
    const j = porId.get(Number(x.igdb_id));
    const cambios: Record<string, unknown> = {};
    if (x.es_online === null) {
      cambios.es_online = x.es_online_manual ?? (j ? detectarOnline(j) : false);
      if (cambios.es_online) online++;
    }
    if (conRelaciones && !x.relaciones) cambios.relaciones = j ? relacionesDe(j) : {};
    if (Object.keys(cambios).length) await sb.from("juegos").update(cambios).eq("igdb_id", x.igdb_id);
  }));
  await asegurarPadres(lista.map((j) => ({ relaciones: relacionesDe(j) })));
  return { revisados: data.length, online, quedan: data.length === 100 };
}

/**
 * Juego (o colección) de IGDB de un título de PlayStation, con su confianza:
 *  1) external_games con su id de la tienda (CUSA…/PPSA…), si da un único juego;
 *  2) búsqueda por nombre limpio, nombres alternativos y bundles; si no hay
 *     resultados, se prueba quitando palabras del principio ("Tom Clancy's ...").
 * Ediciones (version_parent) → el juego original. Remaster, port o versión ampliada →
 * el original si es el que ese usuario ya tiene valorado. Bundle → sus juegos.
 * Devuelve { igdb_id (si confianza ≥ 75), propuesta_id, confianza, tipo, juegos }.
 */
async function emparejarPsn(e: EntradaPsn & { titleId?: string }) {
  const limpio = limpiarNombrePsn(e.nombre);
  if (limpio.length < 2) return { igdb_id: null, propuesta_id: null, confianza: 0, tipo: "juego", motivo: "sin_nombre" };
  const { ids } = await tiposValidos();
  const bundle = await idBundle();
  let elegido: ReturnType<typeof elegirCandidato> | null = null;
  let motivo = "nombre";

  // 1) Por id de la PlayStation Store
  const codigo = String(e.titleId ?? "").match(/^(CUSA|PPSA)\d{5}/)?.[0];
  if (codigo) {
    try {
      const ext = await igdb<{ game?: number }[]>("external_games", `fields game,uid; where uid ~ *"${codigo}"*; limit 20;`);
      const juegos = [...new Set(ext.map((x) => Number(x.game)).filter(Boolean))];
      if (juegos.length === 1) {
        const [c] = await igdb<CandidatoEmparejar[]>("games", `fields ${CAMPOS_EMPAREJAR}; where id = ${juegos[0]}; limit 1;`);
        if (c && puntuarNombre(limpio, c) >= 45) {
          const conf = Math.min(100, confianza(e, c, bundle) + 15);
          elegido = conf >= UMBRAL_ACEPTAR ? { id: c.id, propuesta: null, confianza: conf, candidato: c } : null;
          motivo = "tienda";
        }
      }
    } catch (err) {
      console.warn("external_games:", (err as Error).message);
    }
  }

  // 2) Por nombre (con bundles)
  if (!elegido) {
    const where = `version_parent = null & game_type = (${[...ids, bundle].join(",")})`;
    const consultar = async (q: string) => {
      const [busqueda, parcial] = await Promise.all([
        igdb<CandidatoEmparejar[]>("games", `search "${escaparTexto(q)}"; fields ${CAMPOS_EMPAREJAR}; where ${where}; limit 30;`),
        igdb<CandidatoEmparejar[]>("games", `fields ${CAMPOS_EMPAREJAR}; where ${filtroNombre(q)} & ${where}; sort total_rating_count desc; limit 30;`),
      ]);
      return ordenar(busqueda, parcial, q, 15);
    };
    // Búsqueda escalonada: de más exacta a más simplificada, hasta que haya algo bueno.
    let mejor: ReturnType<typeof elegirCandidato> | null = null;
    const vistos = new Map<number, CandidatoEmparejar>();
    for (const variante of variantesBusqueda(e.nombre)) {
      const candidatos = await consultar(variante);
      for (const c of candidatos) if (!vistos.has(c.id)) vistos.set(c.id, c);
      const r = elegirCandidato(e, [...vistos.values()], bundle);
      if (!mejor || r.confianza > mejor.confianza || (!mejor.candidato && r.candidato)) mejor = r;
      if (r.id) break; // aceptado: no hace falta seguir
      if (vistos.size >= 40 && r.confianza >= 65) break; // ya hay uno sólido y muchos vistos
    }
    elegido = mejor;
  }
  if (!elegido?.candidato) return { igdb_id: null, propuesta_id: null, confianza: 0, tipo: "juego", motivo: "sin_resultados" };

  // Ediciones → el original; remaster/port/ampliada → el original si ya lo tiene valorado.
  let id = elegido.candidato.id;
  const c = elegido.candidato;
  if (c.version_parent) id = Number(c.version_parent);
  else if (c.parent_game && e.valorados?.includes(Number(c.parent_game))) id = Number(c.parent_game);

  // Colección: sus juegos.
  let tipo = "juego";
  let juegos: number[] | null = null;
  if (tipoDe(c) === bundle) {
    const dentro = await igdb<{ id: number }[]>("games", `fields id; where bundles = (${c.id}) & version_parent = null; limit 50;`);
    juegos = dentro.map((x) => x.id);
    if (juegos.length) tipo = "coleccion";
  }
  await guardarVarios([id, ...(juegos ?? [])]);
  return {
    igdb_id: elegido.id ? id : null,
    propuesta_id: elegido.id ? null : id,
    confianza: elegido.confianza,
    tipo,
    juegos,
    motivo,
  };
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
      case "emparejar":
        return json(await emparejarPsn({
          nombre: String(cuerpo.nombre ?? ""),
          titleId: String(cuerpo.title_id ?? ""),
          plataforma: String(cuerpo.plataforma ?? ""),
          primeraVez: cuerpo.primera_vez ? String(cuerpo.primera_vez) : null,
          valorados: Array.isArray(cuerpo.valorados) ? cuerpo.valorados.map(Number) : [],
        }));
      case "revisar_juegos":
      case "revisar_online":
        return json(await revisarJuegos());
      case "steam_appids":
        return json(await porAppidSteam(Array.isArray(cuerpo.appids) ? cuerpo.appids.map(String) : []));
      case "fusionar_versiones":
        return json(await fusionarVersiones());
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
