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
};

// game_type sustituye al antiguo "category". Ids de /game_types:
// 0 juego principal, 4 expansión independiente, 8 remake, 9 remaster,
// 10 juego ampliado, 11 port. Se excluyen DLC (1), expansiones (2), packs (3, 13),
// mods (5), episodios (6), temporadas (7), forks (12) y actualizaciones (14).
// version_parent = null quita las ediciones (GOTY, Deluxe...).
const TIPOS_VALIDOS = "(0,4,8,9,10,11)";
const CAMPOS_LISTA = "name,first_release_date,cover.image_id,platforms.abbreviation,platforms.name";

async function buscar(texto: string) {
  const q = texto.trim().slice(0, 100);
  if (q.length < 2) return { resultados: [] };
  const s = escaparTexto(q);

  let juegos = await igdb<JuegoIGDB[]>(
    "games",
    `search "${s}"; fields ${CAMPOS_LISTA}; where version_parent = null & game_type = ${TIPOS_VALIDOS}; limit 20;`,
  );
  // Si el filtro deja la búsqueda vacía (fichas incompletas en IGDB), probar sin él.
  if (!juegos.length) {
    juegos = await igdb<JuegoIGDB[]>(
      "games",
      `search "${s}"; fields ${CAMPOS_LISTA}; where version_parent = null; limit 20;`,
    );
  }

  return {
    resultados: juegos.map((j) => ({
      igdb_id: j.id,
      nombre: j.name,
      anio: anio(j.first_release_date),
      cover_id: j.cover?.image_id ?? null,
      plataformas: normalizarPlataformas(j.platforms),
    })),
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
      case "juego": {
        const id = Number(cuerpo.igdb_id);
        if (!Number.isInteger(id) || id <= 0) throw new ErrorPublico("igdb_id no válido");
        return json(await juego(id));
      }
      default:
        throw new ErrorPublico('Acción desconocida (usa "buscar" o "juego")');
    }
  } catch (e) {
    if (e instanceof ErrorPublico) return json({ error: e.message }, e.estado);
    console.error(e);
    return json({ error: "Error interno" }, 500);
  }
});
