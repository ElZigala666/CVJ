// =============================================================================
// CVJ · Edge Function "psn": sincronización NO OFICIAL con PlayStation Network.
// Todo en un archivo para pegarlo en el editor de funciones del panel de Supabase.
// Desplegar con "Verify JWT" / "Enforce JWT verification" DESACTIVADO.
//
// Cada usuario conecta SU PROPIA cuenta: pega su NPSSO, se canjea al momento por
// un access token y un refresh token (que se guardan en psn_cuentas, solo service
// role) y el NPSSO se descarta. Después se leen SUS juegos y trofeos con "me",
// así que no depende de la privacidad de su perfil.
// No hace falta ningún secreto propio: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
// los inyecta Supabase.
//
// Llama a los mismos endpoints que la librería psn-api 2.18.1
// (https://github.com/achievements-app/psn-api), pero con fetch directamente.
//
// Peticiones (POST, JSON). Respuesta siempre JSON: { ok: true, ... } o
// { ok: false, codigo, error }. Los códigos esperables (codigo_no_valido,
// reconectar, sin_conectar...) van con estado 200 para que la app los trate con calma.
//   { "accion": "conectar", "usuario_id": "...", "npsso": "..." }
//   { "accion": "sincronizar", "usuario_id": "..." }
//   { "accion": "desconectar", "usuario_id": "..." }
//   { "accion": "estado", "usuario_id": "..." }   (sin tokens: para probar)
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

type Tokens = { access_token: string; refresh_token?: string; expires_in: number; refresh_token_expires_in?: number };
type Cuenta = {
  usuario_id: string;
  account_id: string;
  online_id: string;
  access_token: string;
  refresh_token: string;
  expira_en: string;
  refresh_expira_en: string;
};

const caduca = (iso?: string) => (iso ? new Date(iso).getTime() : 0);

async function pedirTokens(cuerpo: Record<string, string>): Promise<Tokens | null> {
  const r = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: BASIC },
    body: new URLSearchParams(cuerpo).toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) return null;
  return d as Tokens;
}

/** Aplica unos tokens nuevos a la cuenta (si Sony no manda refresh token nuevo, se queda el de antes). */
function aplicarTokens(c: Cuenta, t: Tokens) {
  const ahora = Date.now();
  c.access_token = t.access_token;
  c.expira_en = new Date(ahora + Number(t.expires_in ?? 3600) * 1000).toISOString();
  if (t.refresh_token) c.refresh_token = t.refresh_token;
  if (t.refresh_token_expires_in) c.refresh_expira_en = new Date(ahora + t.refresh_token_expires_in * 1000).toISOString();
}

const CODIGO_NO_VALIDO = "Ese código no vale: puede que haya caducado o que no sea el de tu sesión. Vuelve a abrir los pasos 1 y 2 y copia el código otra vez.";

/** Saca el NPSSO de lo que pegue la persona: el JSON entero o el valor suelto. */
function extraerNpsso(texto: string): string {
  const t = String(texto ?? "").trim();
  const m = t.match(/"?npsso"?\s*[:=]\s*"?([A-Za-z0-9_-]+)/i);
  return (m ? m[1] : t).replace(/[\s"'{}]/g, "");
}

/** NPSSO → tokens. El NPSSO no se guarda en ningún sitio: se usa aquí y se olvida. */
async function canjearNpsso(npsso: string): Promise<Tokens> {
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(npsso)) throw new ErrorPsn("codigo_no_valido", CODIGO_NO_VALIDO);
  const url = `${AUTH}/authorize?` + new URLSearchParams({
    access_type: "offline", client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: "code", scope: SCOPE,
  });
  const r = await fetch(url, { headers: { Cookie: `npsso=${npsso}` }, redirect: "manual" });
  const destino = r.headers.get("location") ?? "";
  const codigo = destino.includes("?code=") ? new URLSearchParams(destino.split("?")[1]).get("code") : null;
  if (!codigo) throw new ErrorPsn("codigo_no_valido", CODIGO_NO_VALIDO);
  const t = await pedirTokens({ code: codigo, redirect_uri: REDIRECT, grant_type: "authorization_code", token_format: "jwt" });
  if (!t?.refresh_token) throw new ErrorPsn("codigo_no_valido", CODIGO_NO_VALIDO);
  return t;
}

async function marcarReconectar(usuarioId: string) {
  const { error } = await sb.from("usuarios").update({ psn_reconectar: true }).eq("id", usuarioId);
  if (error) console.error("Marcando psn_reconectar:", error.message);
}

const errorReconectar = () =>
  new ErrorPsn("reconectar", "Tu conexión con PlayStation ha caducado. Vuelve a conectarla desde Ajustes → PlayStation.");

// -----------------------------------------------------------------------------
// Llamadas a la API de PlayStation con los tokens de UN usuario
// -----------------------------------------------------------------------------
type RespuestaSony = { ok: boolean; status: number; datos: any };

class SesionPsn {
  /** guardar = false mientras se conecta (la fila aún no existe). */
  constructor(public c: Cuenta, public guardar = true) {}

  async token(forzar = false): Promise<string> {
    const ahora = Date.now();
    if (!forzar && caduca(this.c.expira_en) - MARGEN_MS > ahora) return this.c.access_token;
    if (caduca(this.c.refresh_expira_en) - MARGEN_MS > ahora) {
      const nuevo = await pedirTokens({ refresh_token: this.c.refresh_token, grant_type: "refresh_token", token_format: "jwt", scope: SCOPE });
      if (nuevo) {
        aplicarTokens(this.c, nuevo);
        if (this.guardar) {
          const { error } = await sb.from("psn_cuentas").update({
            access_token: this.c.access_token,
            refresh_token: this.c.refresh_token,
            expira_en: this.c.expira_en,
            refresh_expira_en: this.c.refresh_expira_en,
            actualizado_en: new Date().toISOString(),
          }).eq("usuario_id", this.c.usuario_id);
          if (error) console.error("Guardando tokens:", error.message);
        }
        return this.c.access_token;
      }
    }
    // El refresh token ha caducado o Sony lo ha revocado: hay que volver a conectar.
    if (this.guardar) await marcarReconectar(this.c.usuario_id);
    throw errorReconectar();
  }

  async get(url: string): Promise<RespuestaSony> {
    const pedir = async (tk: string) => {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}`, "Accept-Language": "es-ES" } });
      return { ok: r.ok, status: r.status, datos: await r.json().catch(() => null) };
    };
    let r = await pedir(await this.token());
    if (r.status === 401) {
      r = await pedir(await this.token(true)); // token revocado: renovarlo una vez
      if (r.status === 401) {
        if (this.guardar) await marcarReconectar(this.c.usuario_id);
        throw errorReconectar();
      }
    }
    return r;
  }
}

function errorSony(r: RespuestaSony, que: string): never {
  console.error(`Sony (${que}):`, r.status, JSON.stringify(r.datos).slice(0, 500));
  throw new ErrorPsn("psn_error", "PlayStation no ha respondido bien. Prueba más tarde.");
}

const URL_PERFIL = "https://us-prof.np.community.playstation.net/userProfile/v1/users";
const URL_PERFILES = "https://m.np.playstation.com/api/userProfile/v1/internal/users";
const URL_JUEGOS = "https://m.np.playstation.com/api/gamelist/v2/users";
const URL_TROFEOS = "https://m.np.playstation.com/api/trophy/v1/users";

/** accountId del propio token (por si Sony no lo da por otra vía). */
function cuentaDelJwt(token: string): string | null {
  try {
    const parte = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const d = JSON.parse(atob(parte + "=".repeat((4 - (parte.length % 4)) % 4)));
    for (const k of ["account_id", "accountId", "sub"]) if (/^\d{5,}$/.test(String(d?.[k] ?? ""))) return String(d[k]);
  } catch { /* no es un JWT legible */ }
  return null;
}

/** accountId y onlineId de la PROPIA cuenta de la sesión. */
async function identidad(s: SesionPsn) {
  let accountId: string | null = null;
  let onlineId: string | null = null;
  // 1) Resumen de trofeos propio: trae el accountId.
  const t = await s.get(`${URL_TROFEOS}/me/trophySummary`);
  if (t.ok && t.datos?.accountId) accountId = String(t.datos.accountId);
  // 2) Perfil propio: trae el onlineId (y el accountId).
  const p = await s.get(`${URL_PERFIL}/me/profile2?fields=onlineId,accountId`);
  if (p.ok && p.datos?.profile) {
    onlineId = p.datos.profile.onlineId ? String(p.datos.profile.onlineId) : null;
    accountId ??= p.datos.profile.accountId ? String(p.datos.profile.accountId) : null;
  }
  accountId ??= cuentaDelJwt(s.c.access_token);
  if (!accountId) errorSony(p.ok ? t : p, "identidad");
  // 3) Si falta el onlineId, el perfil por accountId (getProfileFromAccountId).
  if (!onlineId) {
    const q = await s.get(`${URL_PERFILES}/${accountId}/profiles`);
    if (q.ok && q.datos?.onlineId) onlineId = String(q.datos.onlineId);
  }
  return { accountId: accountId!, onlineId: onlineId ?? accountId! };
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

/** MIS juegos jugados (getUserPlayedGames con "me"), como mucho 3 páginas de 200. */
async function juegosJugados(s: SesionPsn) {
  const todos: any[] = [];
  for (let offset = 0, pagina = 0; pagina < 3; pagina++) {
    const r = await s.get(`${URL_JUEGOS}/me/titles?categories=ps4_game,ps5_native_game&limit=200&offset=${offset}`);
    if (!r.ok || r.datos?.error) errorSony(r, "juegos");
    const titulos = r.datos?.titles ?? [];
    todos.push(...titulos);
    if (r.datos?.nextOffset == null || !titulos.length) break;
    offset = r.datos.nextOffset;
  }
  return todos;
}

/** MIS títulos con trofeos (getUserTitles con "me"). */
async function titulosTrofeos(s: SesionPsn) {
  const r = await s.get(`${URL_TROFEOS}/me/trophyTitles?limit=800`);
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
const MAX_EMPAREJAR = 15;          // por sincronización, para no hacerla eterna
const MAX_EMPAREJAR_PRIMERA = 40;  // al conectar: que se vea casi toda la biblioteca desde el principio
const EMPAREJAR_A_LA_VEZ = 4;      // búsquedas en IGDB en paralelo
const EMPAREJAR_HASTA_MS = 80_000; // y sin pasar de ~80 s (Supabase corta a los 150 s)

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

async function leerCuenta(usuarioId: string): Promise<Cuenta | null> {
  const { data, error } = await sb.from("psn_cuentas")
    .select("usuario_id, account_id, online_id, access_token, refresh_token, expira_en, refresh_expira_en")
    .eq("usuario_id", usuarioId).maybeSingle();
  if (error) throw new ErrorPsn("bd", "No se ha podido leer la conexión: " + error.message, 500);
  return data as Cuenta | null;
}

async function conectar(usuarioId: string, textoNpsso: string) {
  const u = await usuario(usuarioId);
  const npsso = extraerNpsso(textoNpsso);
  const tokens = await canjearNpsso(npsso); // el NPSSO acaba aquí: no se guarda

  const c: Cuenta = {
    usuario_id: usuarioId, account_id: "", online_id: "",
    access_token: "", refresh_token: "", expira_en: "", refresh_expira_en: "",
  };
  aplicarTokens(c, tokens);
  if (!c.refresh_expira_en) c.refresh_expira_en = new Date(Date.now() + 60 * 86400000).toISOString();
  const id = await identidad(new SesionPsn(c, false));
  c.account_id = id.accountId;
  c.online_id = id.onlineId;

  // Otra cuenta de PlayStation distinta de la de antes: su biblioteca vieja fuera.
  if (u.psn_account_id && u.psn_account_id !== c.account_id) {
    await sb.from("biblioteca").delete().eq("usuario_id", usuarioId);
  }
  const ahora = new Date().toISOString();
  const { error } = await sb.from("psn_cuentas").upsert({ ...c, actualizado_en: ahora }, { onConflict: "usuario_id" });
  if (error) throw new ErrorPsn("bd", "No se ha podido guardar la conexión: " + error.message, 500);
  const { error: e2 } = await sb.from("usuarios").update({
    psn_online_id: c.online_id,
    psn_account_id: c.account_id,
    psn_reconectar: false,
  }).eq("id", usuarioId);
  if (e2) throw new ErrorPsn("bd", "No se ha podido guardar el usuario: " + e2.message, 500);

  // Primera sincronización. Si falla, la conexión ya está hecha: se puede reintentar.
  let sincronizacion: Record<string, unknown>;
  try {
    sincronizacion = await sincronizar(usuarioId, MAX_EMPAREJAR_PRIMERA);
  } catch (e) {
    sincronizacion = e instanceof ErrorPsn
      ? { ok: false, codigo: e.codigo, error: e.message }
      : { ok: false, codigo: "interno", error: (e as Error).message };
    if (!(e instanceof ErrorPsn)) console.error(e);
  }
  return { ok: true, online_id: c.online_id, sincronizacion };
}

async function desconectar(usuarioId: string) {
  await usuario(usuarioId);
  const { error: e1 } = await sb.from("psn_cuentas").delete().eq("usuario_id", usuarioId);
  const { error: e2 } = await sb.from("biblioteca").delete().eq("usuario_id", usuarioId);
  const { error: e3 } = await sb.from("usuarios").update({
    psn_online_id: null, psn_account_id: null, psn_sincronizado_en: null, psn_reconectar: false,
  }).eq("id", usuarioId);
  const error = e1 ?? e2 ?? e3;
  if (error) throw new ErrorPsn("bd", "No se ha podido desconectar: " + error.message, 500);
  return { ok: true };
}

/** Estado de la conexión de un usuario (sin tokens). */
async function estado(usuarioId: string) {
  await usuario(usuarioId);
  const c = await leerCuenta(usuarioId);
  if (!c) return { ok: true, conectado: false };
  const ahora = Date.now();
  return {
    ok: true,
    conectado: true,
    online_id: c.online_id,
    account_id: c.account_id,
    token_caduca_en: c.expira_en,
    refresh_caduca_en: c.refresh_expira_en,
    refresh_dias_restantes: Math.max(0, Math.floor((caduca(c.refresh_expira_en) - ahora) / 86400000)),
  };
}

async function sincronizar(usuarioId: string, maxEmparejar = MAX_EMPAREJAR) {
  const inicio = Date.now();
  await usuario(usuarioId);
  const c = await leerCuenta(usuarioId);
  if (!c) throw new ErrorPsn("sin_conectar", "Primero conecta tu cuenta de PlayStation.");
  const s = new SesionPsn(c);

  // De uno en uno: así, si hay que renovar el token, se renueva una sola vez.
  const jugados = await juegosJugados(s);
  const trofeos = await titulosTrofeos(s);

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

  // Emparejar automáticamente los nuevos (los más jugados primero, como mucho maxEmparejar),
  // de EMPAREJAR_A_LA_VEZ en EMPAREJAR_A_LA_VEZ y parando si se acerca el límite de tiempo.
  const nuevos = [...filas.values()]
    .filter((f) => !conocidos.has(String(f.psn_title_id)))
    .sort((a, b) => Number(b.horas ?? 0) - Number(a.horas ?? 0))
    .slice(0, maxEmparejar);
  let emparejados = 0;
  const emparejarUno = async (f: Record<string, unknown>) => {
    let igdbId: number | null = null;
    try {
      igdbId = await emparejar(String(f.nombre_psn));
    } catch (e) {
      console.warn("Emparejar", f.nombre_psn, (e as Error).message);
      return; // se reintentará en la próxima sincronización
    }
    // igdb_id nulo = intentado sin éxito (no se repite cada vez; se puede elegir a mano).
    const { error } = await sb.from("psn_igdb").upsert(
      { psn_title_id: f.psn_title_id, igdb_id: igdbId, confirmado: false, nombre_psn: f.nombre_psn },
      { onConflict: "psn_title_id", ignoreDuplicates: true },
    );
    if (!error) conocidos.set(String(f.psn_title_id), { igdb_id: igdbId });
    if (igdbId) emparejados++;
  };
  for (let i = 0; i < nuevos.length; i += EMPAREJAR_A_LA_VEZ) {
    if (Date.now() - inicio > EMPAREJAR_HASTA_MS) break; // el resto, en la próxima sincronización
    await Promise.all(nuevos.slice(i, i + EMPAREJAR_A_LA_VEZ).map(emparejarUno));
  }

  for (const f of filas.values()) f.juego_id = conocidos.get(String(f.psn_title_id))?.igdb_id ?? null;
  const lista = [...filas.values()];
  for (let i = 0; i < lista.length; i += 200) {
    const { error } = await sb.from("biblioteca").upsert(lista.slice(i, i + 200), { onConflict: "usuario_id,psn_title_id" });
    if (error) throw new ErrorPsn("bd", "No se ha podido guardar la biblioteca: " + error.message, 500);
  }
  await sb.from("usuarios").update({ psn_sincronizado_en: ahora, psn_reconectar: false }).eq("id", usuarioId);

  const horas = lista.reduce((t, f) => t + Number(f.horas ?? 0), 0);
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
    const uid = String(c.usuario_id ?? "");
    switch (c.accion) {
      case "conectar": return json(await conectar(uid, String(c.npsso ?? "")));
      case "sincronizar": return json(await sincronizar(uid));
      case "desconectar": return json(await desconectar(uid));
      case "estado": return json(await estado(uid));
      default: throw new ErrorPsn("parametros", 'Acción desconocida (usa "conectar", "sincronizar", "desconectar" o "estado")', 400);
    }
  } catch (e) {
    if (e instanceof ErrorPsn) return json({ ok: false, codigo: e.codigo, error: e.message }, e.estado);
    console.error(e);
    return json({ ok: false, codigo: "interno", error: "Error interno de la función psn" }, 500);
  }
});
