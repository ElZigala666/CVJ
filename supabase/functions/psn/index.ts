// =============================================================================
// CVJ · Edge Function "psn": sincronización NO OFICIAL con PlayStation Network.
// Todo en un archivo para pegarlo en el editor de funciones del panel de Supabase.
// Desplegar con "Verify JWT" / "Enforce JWT verification" DESACTIVADO.
//
// Secreto necesario: PSN_NPSSO (cookie "npsso" de una cuenta de PlayStation).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.
//
// Llama a los mismos endpoints que la librería psn-api 2.18.1
// (https://github.com/achievements-app/psn-api), pero con fetch directamente:
// así no dependemos de cómo se comporte el paquete en el runtime de Supabase.
//
// Peticiones (POST, JSON). Respuesta siempre JSON: { ok: true, ... } o
// { ok: false, codigo, error }. Los códigos esperables (privado, no_existe,
// npsso_caducado...) van con estado 200 para que la app los trate con calma.
//   { "accion": "estado" }
//   { "accion": "vincular", "usuario_id": "...", "online_id": "MiIDdePSN" }
//   { "accion": "desvincular", "usuario_id": "..." }
//   { "accion": "sincronizar", "usuario_id": "..." }
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

// -----------------------------------------------------------------------------
// Respuestas y errores
// -----------------------------------------------------------------------------
function json(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Error esperable: la app lo enseña tal cual y no lo trata como fallo. */
class ErrorPsn extends Error {
  constructor(public codigo: string, mensaje: string, public estado = 200) {
    super(mensaje);
  }
}

// -----------------------------------------------------------------------------
// Autenticación con Sony (NPSSO → código → tokens; luego refresh token)
// -----------------------------------------------------------------------------
const AUTH = "https://ca.account.sony.com/api/authz/v3/oauth";
const CLIENT_ID = "09515159-7237-4370-9b40-3806e67c0891";
const REDIRECT = "com.scee.psxandroid.scecompcall://redirect";
const SCOPE = "psn:mobile.v2.core psn:clientapp";
const BASIC = "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=";
const MARGEN_MS = 2 * 60 * 1000;

type FilaToken = { access_token: string; refresh_token: string; expira_en: string; refresh_expira_en: string };
let tokenMemoria: FilaToken | null = null;

const caduca = (iso?: string) => (iso ? new Date(iso).getTime() : 0);

async function leerToken(): Promise<FilaToken | null> {
  if (tokenMemoria) return tokenMemoria;
  const { data, error } = await sb.from("psn_token").select("access_token, refresh_token, expira_en, refresh_expira_en").eq("id", 1).maybeSingle();
  if (error) console.error("Leyendo psn_token:", error.message);
  tokenMemoria = data ?? null;
  return tokenMemoria;
}

async function guardarToken(t: { access_token: string; refresh_token: string; expires_in: number; refresh_token_expires_in: number }) {
  const ahora = Date.now();
  const fila: FilaToken = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expira_en: new Date(ahora + t.expires_in * 1000).toISOString(),
    refresh_expira_en: new Date(ahora + t.refresh_token_expires_in * 1000).toISOString(),
  };
  tokenMemoria = fila;
  const { error } = await sb.from("psn_token").upsert({ id: 1, ...fila, actualizado_en: new Date().toISOString() });
  if (error) console.error("Guardando psn_token:", error.message);
  return fila;
}

async function pedirTokens(cuerpo: Record<string, string>) {
  const r = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: BASIC },
    body: new URLSearchParams(cuerpo).toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) return null;
  return d as { access_token: string; refresh_token: string; expires_in: number; refresh_token_expires_in: number };
}

/** NPSSO → tokens nuevos. Lanza npsso_caducado si Sony no lo acepta. */
async function tokensDesdeNpsso() {
  const npsso = (Deno.env.get("PSN_NPSSO") ?? "").trim();
  if (!npsso) throw new ErrorPsn("falta_npsso", "Falta el secreto PSN_NPSSO en Supabase.");
  const url = `${AUTH}/authorize?` + new URLSearchParams({
    access_type: "offline", client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: "code", scope: SCOPE,
  });
  const r = await fetch(url, { headers: { Cookie: `npsso=${npsso}` }, redirect: "manual" });
  const destino = r.headers.get("location") ?? "";
  const codigo = destino.includes("?code=") ? new URLSearchParams(destino.split("redirect/")[1] ?? destino.split("?")[1]).get("code") : null;
  if (!codigo) {
    throw new ErrorPsn("npsso_caducado", "El NPSSO de PlayStation ha caducado o no es válido. Hay que poner uno nuevo en Supabase.");
  }
  const t = await pedirTokens({ code: codigo, redirect_uri: REDIRECT, grant_type: "authorization_code", token_format: "jwt" });
  if (!t) throw new ErrorPsn("npsso_caducado", "Sony no ha dado los tokens con este NPSSO. Hay que poner uno nuevo.");
  return guardarToken(t);
}

/** Token de acceso válido: el guardado, renovado con el refresh token o, si no, desde el NPSSO. */
async function tokenAcceso(forzar = false): Promise<string> {
  const ahora = Date.now();
  const t = await leerToken();
  if (!forzar && t && caduca(t.expira_en) - MARGEN_MS > ahora) return t.access_token;
  if (t && caduca(t.refresh_expira_en) - MARGEN_MS > ahora) {
    const nuevo = await pedirTokens({ refresh_token: t.refresh_token, grant_type: "refresh_token", token_format: "jwt", scope: SCOPE });
    if (nuevo) return (await guardarToken(nuevo)).access_token;
    console.warn("El refresh token no ha funcionado; se usa el NPSSO.");
  }
  return (await tokensDesdeNpsso()).access_token;
}

// -----------------------------------------------------------------------------
// Llamadas a la API de PlayStation
// -----------------------------------------------------------------------------
type RespuestaSony = { ok: boolean; status: number; datos: any };

async function sony(url: string, op: { method?: string; body?: unknown } = {}): Promise<RespuestaSony> {
  const pedir = async (tk: string) => {
    const r = await fetch(url, {
      method: op.method ?? "GET",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json", "Accept-Language": "es-ES" },
      body: op.body ? JSON.stringify(op.body) : undefined,
    });
    return { ok: r.ok, status: r.status, datos: await r.json().catch(() => null) };
  };
  let r = await pedir(await tokenAcceso());
  if (r.status === 401) r = await pedir(await tokenAcceso(true)); // token revocado: otro
  return r;
}

/** ¿El error de Sony es por privacidad del perfil? */
function esPrivado(r: RespuestaSony) {
  const txt = JSON.stringify(r.datos ?? "").toLowerCase();
  return r.status === 403 || txt.includes("not permitted") || txt.includes("access control") || txt.includes("2240526") || txt.includes("privacy");
}

function errorSony(r: RespuestaSony, que: string): never {
  if (esPrivado(r)) {
    throw new ErrorPsn("privado", "El perfil de PlayStation es privado: hay que dejar ver los juegos y los trofeos.");
  }
  console.error(`Sony (${que}):`, r.status, JSON.stringify(r.datos).slice(0, 500));
  throw new ErrorPsn("psn_error", "PlayStation no ha respondido bien. Prueba más tarde.");
}

const URL_PERFIL = "https://us-prof.np.community.playstation.net/userProfile/v1/users";
const URL_BUSQUEDA = "https://m.np.playstation.com/api/search/v1/universalSearch";
const URL_JUEGOS = "https://m.np.playstation.com/api/gamelist/v2/users";
const URL_TROFEOS = "https://m.np.playstation.com/api/trophy/v1/users";

/** ID online → { accountId, onlineId }. */
async function buscarCuenta(onlineId: string) {
  // 1) Perfil por nombre (getProfileFromUserName)
  const p = await sony(`${URL_PERFIL}/${encodeURIComponent(onlineId)}/profile2?fields=onlineId,accountId`);
  if (p.ok && p.datos?.profile?.accountId) {
    return { accountId: String(p.datos.profile.accountId), onlineId: String(p.datos.profile.onlineId ?? onlineId) };
  }
  // 2) Búsqueda universal (makeUniversalSearch, dominio SocialAllAccounts)
  const b = await sony(URL_BUSQUEDA, {
    method: "POST",
    body: { searchTerm: onlineId, domainRequests: [{ domain: "SocialAllAccounts" }] },
  });
  const resultados = b.datos?.domainResponses?.[0]?.results ?? [];
  const exacto = resultados.find((x: any) => String(x?.socialMetadata?.onlineId ?? "").toLowerCase() === onlineId.toLowerCase());
  if (exacto) return { accountId: String(exacto.socialMetadata.accountId), onlineId: String(exacto.socialMetadata.onlineId) };
  return null;
}

/** "PT228H56M33S" (o "P1DT2H...") → horas con decimales. */
function horasISO(d?: string): number | null {
  if (!d) return null;
  const m = d.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!m) return null;
  const [, dias, h, min, s] = m;
  const total = Number(dias ?? 0) * 24 + Number(h ?? 0) + Number(min ?? 0) / 60 + Number(s ?? 0) / 3600;
  return Math.round(total * 100) / 100;
}

/** Juegos jugados (getUserPlayedGames), como mucho 3 páginas de 200. */
async function juegosJugados(accountId: string) {
  const todos: any[] = [];
  for (let offset = 0, pagina = 0; pagina < 3; pagina++) {
    const r = await sony(`${URL_JUEGOS}/${accountId}/titles?categories=ps4_game,ps5_native_game&limit=200&offset=${offset}`);
    if (!r.ok || r.datos?.error) errorSony(r, "juegos");
    const titulos = r.datos?.titles ?? [];
    todos.push(...titulos);
    if (r.datos?.nextOffset == null || !titulos.length) break;
    offset = r.datos.nextOffset;
  }
  return todos;
}

/** Títulos con trofeos (getUserTitles). */
async function titulosTrofeos(accountId: string) {
  const r = await sony(`${URL_TROFEOS}/${accountId}/trophyTitles?limit=800`);
  if (!r.ok || r.datos?.error) errorSony(r, "trofeos");
  return (r.datos?.trophyTitles ?? []) as any[];
}

// -----------------------------------------------------------------------------
// Nombres: limpiar el de PSN para emparejarlo con IGDB
// -----------------------------------------------------------------------------
function normalizar(t: string): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const EDICIONES = /\b(standard|digital|deluxe|ultimate|gold|complete|definitive|premium|special|collector'?s|game of the year|goty|launch|day one|cross[- ]gen|estandar|estándar|digital deluxe|completa|definitiva|del juego del año)\s+(edition|edicion|edición|bundle)\b/gi;

/** "Ghost of Tsushima™ PS4 & PS5 Edición Estándar" → "ghost of tsushima" */
export function limpiarNombrePsn(nombre: string, sinRemaster = false): string {
  let n = String(nombre ?? "")
    .replace(/[™®©]/g, "")
    .replace(/\b(ps4|ps5)\s+(versi[oó]n|version)\b/gi, " ")
    .replace(/\bplay\s*station\s*(4|5)\b/gi, " ")
    .replace(/\(?\b(ps4|ps5)\b(\s*(&|and|y|\/)\s*\b(ps4|ps5)\b)?\)?/gi, " ")
    .replace(/\b(versi[oó]n|version)\s+(ps4|ps5)\b/gi, " ")
    .replace(EDICIONES, " ")
    .replace(/\b(edition|edici[oó]n)\s+(est[aá]ndar|standard|digital|deluxe|completa|definitiva)\b/gi, " ")
    .replace(/\s*[-–:]\s*(edition|edici[oó]n)\s*$/gi, " ");
  if (sinRemaster) n = n.replace(/\b(remastered|remasterizado|remaster)\b/gi, " ");
  return normalizar(n);
}

/** ¿Es claramente el mismo juego? (nombres ya normalizados) */
function claramenteIgual(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const sinArticulo = (s: string) => s.replace(/^(the|el|la|los|las)\s+/, "");
  if (sinArticulo(a) === sinArticulo(b)) return true;
  // Uno es el otro con un subtítulo corto ("god of war ragnarok" / "god of war ragnarok valhalla" no; muy distinto en longitud sí falla)
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  if (corto.length >= 6 && largo.startsWith(corto + " ") && corto.length / largo.length >= 0.8) {
    // ...salvo que lo que sobra sea un número de secuela ("spider man" ≠ "spider man 2").
    const resto = largo.slice(corto.length + 1);
    if (!/^(\d+|[ivx]+)\b/.test(resto)) return true;
  }
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  const comunes = [...ta].filter((x) => tb.has(x)).length;
  const jaccard = comunes / new Set([...ta, ...tb]).size;
  return jaccard >= 0.85 && Math.min(ta.size, tb.size) >= 2;
}

// -----------------------------------------------------------------------------
// Emparejar con IGDB usando la función igdb (misma búsqueda y puntuación)
// -----------------------------------------------------------------------------
const MAX_EMPAREJAR = 15; // por sincronización, para no hacerla eterna

async function llamarIgdb(cuerpo: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/igdb`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`igdb ${r.status}`);
  return await r.json();
}

/** Devuelve el igdb_id si el primer resultado es claramente el mismo juego (y lo guarda en juegos). */
async function emparejar(nombrePsn: string): Promise<number | null> {
  for (const sinRemaster of [false, true]) {
    const limpio = limpiarNombrePsn(nombrePsn, sinRemaster);
    if (limpio.length < 2) return null;
    const { resultados = [] } = await llamarIgdb({ accion: "buscar", texto: limpio });
    const primero = resultados[0];
    if (primero && claramenteIgual(limpio, normalizar(primero.nombre))) {
      await llamarIgdb({ accion: "juego", igdb_id: primero.igdb_id }); // guarda el juego en la tabla juegos
      return Number(primero.igdb_id);
    }
    if (!/remaster/i.test(nombrePsn)) break; // la segunda vuelta solo si había "remastered"
  }
  return null;
}

// -----------------------------------------------------------------------------
// Acciones
// -----------------------------------------------------------------------------
async function usuario(id: string) {
  if (!id) throw new ErrorPsn("parametros", "Falta usuario_id.", 400);
  const { data, error } = await sb.from("usuarios").select("id, nombre, psn_online_id, psn_account_id, psn_sincronizado_en").eq("id", id).maybeSingle();
  if (error) throw new ErrorPsn("bd", "No se ha podido leer el usuario: " + error.message, 500);
  if (!data) throw new ErrorPsn("parametros", "Ese usuario no existe.", 404);
  return data;
}

async function estado() {
  const t = await leerToken();
  const ahora = Date.now();
  const npssoPuesto = !!(Deno.env.get("PSN_NPSSO") ?? "").trim();
  let funciona = false;
  let codigo: string | null = null;
  let mensaje: string | null = null;
  try {
    // Una llamada barata y real: el resumen de trofeos de la propia cuenta del token.
    const r = await sony(`${URL_TROFEOS}/me/trophySummary`);
    funciona = r.ok;
    if (!r.ok) { codigo = "psn_error"; mensaje = `PlayStation respondió ${r.status}.`; }
  } catch (e) {
    if (e instanceof ErrorPsn) { codigo = e.codigo; mensaje = e.message; } else { codigo = "psn_error"; mensaje = (e as Error).message; }
  }
  const tt = tokenMemoria ?? t;
  return {
    ok: true,
    funciona,
    codigo,
    mensaje,
    npsso_puesto: npssoPuesto,
    necesita_npsso: codigo === "npsso_caducado" || codigo === "falta_npsso",
    token_caduca_en: tt?.expira_en ?? null,
    refresh_caduca_en: tt?.refresh_expira_en ?? null,
    refresh_dias_restantes: tt ? Math.max(0, Math.floor((caduca(tt.refresh_expira_en) - ahora) / 86400000)) : null,
  };
}

async function vincular(usuarioId: string, onlineId: string) {
  await usuario(usuarioId);
  const id = String(onlineId ?? "").trim();
  if (!/^[A-Za-z0-9_-]{3,16}$/.test(id)) {
    throw new ErrorPsn("id_no_valido", "Ese ID online no parece válido: tiene entre 3 y 16 letras, números, - o _.");
  }
  const cuenta = await buscarCuenta(id);
  if (!cuenta) throw new ErrorPsn("no_existe", `No existe ningún usuario de PlayStation con el ID «${id}».`);
  const { error } = await sb.from("usuarios").update({
    psn_online_id: cuenta.onlineId,
    psn_account_id: cuenta.accountId,
    psn_sincronizado_en: null,
  }).eq("id", usuarioId);
  if (error) throw new ErrorPsn("bd", "No se ha podido guardar: " + error.message, 500);
  return { ok: true, online_id: cuenta.onlineId };
}

async function desvincular(usuarioId: string) {
  await usuario(usuarioId);
  await sb.from("biblioteca").delete().eq("usuario_id", usuarioId);
  const { error } = await sb.from("usuarios").update({ psn_online_id: null, psn_account_id: null, psn_sincronizado_en: null }).eq("id", usuarioId);
  if (error) throw new ErrorPsn("bd", "No se ha podido desvincular: " + error.message, 500);
  return { ok: true };
}

async function sincronizar(usuarioId: string) {
  const u = await usuario(usuarioId);
  if (!u.psn_account_id) throw new ErrorPsn("sin_vincular", "Este usuario no ha vinculado su cuenta de PlayStation.");

  const [jugados, trofeos] = await Promise.all([juegosJugados(u.psn_account_id), titulosTrofeos(u.psn_account_id)]);

  // Trofeos por nombre normalizado (no hay un id común entre las dos listas).
  const trofeosPorNombre = new Map<string, any>();
  for (const t of trofeos) {
    const plat = String(t.trophyTitlePlatform ?? "");
    if (!/PS4|PS5/.test(plat)) continue;
    trofeosPorNombre.set(limpiarNombrePsn(t.trophyTitleName), t);
  }

  const ahora = new Date().toISOString();
  const filas = new Map<string, Record<string, unknown>>();
  const usados = new Set<any>();
  for (const j of jugados) {
    if (!j.titleId) continue;
    const nombre = j.localizedName || j.name || j.concept?.name || j.titleId;
    const t = trofeosPorNombre.get(limpiarNombrePsn(nombre));
    if (t) usados.add(t);
    filas.set(j.titleId, {
      usuario_id: usuarioId,
      psn_title_id: j.titleId,
      nombre_psn: nombre,
      plataforma: String(j.category ?? "").startsWith("ps5") ? "PS5" : "PS4",
      imagen_psn: j.localizedImageUrl || j.imageUrl || null,
      horas: horasISO(j.playDuration),
      ultima_vez: j.lastPlayedDateTime ?? null,
      progreso_trofeos: t ? Number(t.progress ?? 0) : null,
      trofeos: t ? t.earnedTrophies ?? null : null,
      actualizado_en: ahora,
    });
  }
  // Juegos con trofeos que no salen en la lista de jugados (PS4/PS5): sin horas.
  for (const t of trofeos) {
    if (usados.has(t) || !/PS4|PS5/.test(String(t.trophyTitlePlatform ?? ""))) continue;
    filas.set(t.npCommunicationId, {
      usuario_id: usuarioId,
      psn_title_id: t.npCommunicationId,
      nombre_psn: t.trophyTitleName,
      plataforma: String(t.trophyTitlePlatform).includes("PS5") ? "PS5" : "PS4",
      imagen_psn: t.trophyTitleIcon ?? null,
      horas: null,
      ultima_vez: t.lastUpdatedDateTime ?? null,
      progreso_trofeos: Number(t.progress ?? 0),
      trofeos: t.earnedTrophies ?? null,
      actualizado_en: ahora,
    });
  }

  // Emparejamientos ya conocidos (compartidos entre usuarios).
  const ids = [...filas.keys()];
  const conocidos = new Map<string, { igdb_id: number | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from("psn_igdb").select("psn_title_id, igdb_id").in("psn_title_id", ids.slice(i, i + 200));
    for (const x of data ?? []) conocidos.set(x.psn_title_id, x);
  }

  // Emparejar automáticamente los nuevos (los más jugados primero, como mucho MAX_EMPAREJAR).
  const nuevos = [...filas.values()]
    .filter((f) => !conocidos.has(String(f.psn_title_id)))
    .sort((a, b) => Number(b.horas ?? 0) - Number(a.horas ?? 0))
    .slice(0, MAX_EMPAREJAR);
  let emparejados = 0;
  for (const f of nuevos) {
    let igdbId: number | null = null;
    try {
      igdbId = await emparejar(String(f.nombre_psn));
    } catch (e) {
      console.warn("Emparejar", f.nombre_psn, (e as Error).message);
      continue; // se reintentará en la próxima sincronización
    }
    // igdb_id nulo = intentado sin éxito (no se repite cada vez; se puede elegir a mano).
    const { error } = await sb.from("psn_igdb").upsert(
      { psn_title_id: f.psn_title_id, igdb_id: igdbId, confirmado: false, nombre_psn: f.nombre_psn },
      { onConflict: "psn_title_id", ignoreDuplicates: true },
    );
    if (!error) conocidos.set(String(f.psn_title_id), { igdb_id: igdbId });
    if (igdbId) emparejados++;
  }

  for (const f of filas.values()) f.juego_id = conocidos.get(String(f.psn_title_id))?.igdb_id ?? null;
  const lista = [...filas.values()];
  for (let i = 0; i < lista.length; i += 200) {
    const { error } = await sb.from("biblioteca").upsert(lista.slice(i, i + 200), { onConflict: "usuario_id,psn_title_id" });
    if (error) throw new ErrorPsn("bd", "No se ha podido guardar la biblioteca: " + error.message, 500);
  }
  await sb.from("usuarios").update({ psn_sincronizado_en: ahora }).eq("id", usuarioId);

  const horas = lista.reduce((s, f) => s + Number(f.horas ?? 0), 0);
  return {
    ok: true,
    juegos: lista.length,
    horas: Math.round(horas),
    emparejados_ahora: emparejados,
    sin_emparejar: lista.filter((f) => !f.juego_id).length,
    sincronizado_en: ahora,
  };
}

// -----------------------------------------------------------------------------
// Servidor
// -----------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, codigo: "metodo", error: "Usa POST" }, 405);
  try {
    let c: Record<string, unknown>;
    try {
      c = await req.json();
    } catch {
      throw new ErrorPsn("parametros", "El cuerpo debe ser JSON", 400);
    }
    switch (c.accion) {
      case "estado": return json(await estado());
      case "vincular": return json(await vincular(String(c.usuario_id ?? ""), String(c.online_id ?? "")));
      case "desvincular": return json(await desvincular(String(c.usuario_id ?? "")));
      case "sincronizar": return json(await sincronizar(String(c.usuario_id ?? "")));
      default: throw new ErrorPsn("parametros", 'Acción desconocida (usa "estado", "vincular", "desvincular" o "sincronizar")', 400);
    }
  } catch (e) {
    if (e instanceof ErrorPsn) return json({ ok: false, codigo: e.codigo, error: e.message }, e.estado);
    console.error(e);
    return json({ ok: false, codigo: "interno", error: "Error interno de la función psn" }, 500);
  }
});
