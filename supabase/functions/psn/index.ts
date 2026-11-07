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
  cuenta_id: string;   // cuentas_plataforma.id (un usuario puede tener varias cuentas de PSN)
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

async function marcarReconectar(c: Cuenta) {
  const { error } = await sb.from("cuentas_plataforma").update({ reconectar: true }).eq("id", c.cuenta_id);
  if (error) console.error("Marcando reconectar:", error.message);
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
          }).eq("cuenta_id", this.c.cuenta_id);
          if (error) console.error("Guardando tokens:", error.message);
        }
        return this.c.access_token;
      }
    }
    // El refresh token ha caducado o Sony lo ha revocado: hay que volver a conectar.
    if (this.guardar) await marcarReconectar(this.c);
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
        if (this.guardar) await marcarReconectar(this.c);
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

// -----------------------------------------------------------------------------
// Emparejar títulos de PlayStation con juegos de IGDB (algoritmo 3)
//   0) lo que no es un juego (apps, demos, betas...) se marca y se oculta solo;
//   1) con los juegos que ya están en la tabla juegos (sobre todo los que ese
//      usuario ha valorado), con nombres limpios iguales;
//   2) con la acción "emparejar" de la función igdb (tienda, nombre, nombres
//      alternativos y bundles), en segundo plano y de 4 en 4.
// Cada emparejamiento lleva su confianza (0-100): con 75 o más se acepta; por
// debajo queda "por revisar" con la mejor propuesta. Lo confirmado o corregido a
// mano (confirmado = true) no se toca nunca.
// -----------------------------------------------------------------------------
const EMPAREJAR_A_LA_VEZ = 2; // IGDB admite 4 peticiones/s y cada título hace varias
const EMPAREJAR_HASTA_MS = 120_000; // en segundo plano (Supabase corta a los 150 s)
const ALGORITMO = 6;                // lo no confirmado con una versión anterior se recalcula
const UMBRAL_ACEPTAR = 75;

type Emparejamiento = { igdb_id: number | null; confirmado?: boolean; algoritmo?: number; tipo?: string };
type Resultado = { igdb_id: number | null; propuesta_id?: number | null; confianza: number; tipo: string; juegos?: number[] | null };
type Fila = Record<string, unknown>;

/** ¿Hay que (re)calcular el emparejamiento de este título? */
const hayQueEmparejar = (e?: Emparejamiento) => !e || (!e.confirmado && Number(e.algoritmo ?? 1) < ALGORITMO);

async function llamarIgdb(cuerpo: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/igdb`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`igdb ${r.status}`);
  return await r.json();
}

/**
 * Guarda un emparejamiento automático (sin pisar uno confirmado a mano) y lo
 * aplica a la biblioteca de todos: juego_id, "por revisar" si no llega a la
 * confianza y oculto si no es un juego (salvo que el usuario haya decidido otra cosa).
 */
async function guardarEmparejamiento(titleId: string, r: Resultado, nombre: string) {
  const { data: actual } = await sb.from("psn_igdb").select("confirmado").eq("psn_title_id", titleId).maybeSingle();
  if (actual?.confirmado) return;
  const fila: Fila = {
    psn_title_id: titleId, igdb_id: r.igdb_id, confirmado: false, nombre_psn: nombre,
    algoritmo: ALGORITMO, tipo: r.tipo, juegos: r.juegos ?? null, confianza: r.confianza,
    propuesta_id: r.propuesta_id ?? null, actualizado_en: new Date().toISOString(),
  };
  let { error } = await sb.from("psn_igdb").upsert(fila, { onConflict: "psn_title_id" });
  if (error && /tipo|juegos|confianza|propuesta_id/.test(error.message)) { // sin la migración 006
    for (const k of ["tipo", "juegos", "confianza", "propuesta_id"]) delete fila[k];
    if (r.tipo !== "juego" && r.tipo !== "coleccion") return;
    ({ error } = await sb.from("psn_igdb").upsert(fila, { onConflict: "psn_title_id" }));
  }
  if (error) { console.warn("psn_igdb:", error.message); return; }
  await sb.from("biblioteca").update({ juego_id: r.tipo === "coleccion" ? null : r.igdb_id }).eq("psn_title_id", titleId);
  if (r.tipo === "no_juego") {
    await sb.from("biblioteca").update({ oculto: true, por_revisar: false }).eq("psn_title_id", titleId).is("oculto_usuario", null);
  } else if (!r.igdb_id) {
    // Dudoso: a "Revisa tu biblioteca" (salvo para quien ya lo ocultó a mano).
    await sb.from("biblioteca").update({ por_revisar: true }).eq("psn_title_id", titleId).or("oculto_usuario.is.null,oculto_usuario.eq.false");
  }
}

// <local> (sin dependencias: se prueba en local con node)
const sinArticulo = (x: string) => x.replace(/^(the|el|la|los|las)\s+/, "");

/**
 * ¿No es un juego? Apps (Netflix, YouTube, Spotify, Disney+, Twitch, reproductores,
 * PlayStation Plus...), demos, betas, pruebas y "showcases" de VR. Mira la categoría
 * de PSN y el nombre.
 */
export function esNoJuego(nombre: string, categoria = ""): boolean {
  if (/video_?service|web_?app|media_?app|web_based|media/i.test(categoria)) return true;
  const n = String(nombre ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/\bdisney\s*(\+|plus)/.test(n)) return true;
  return /\b(netflix|youtube|spotify|twitch|prime video|amazon video|hbo max|crunchyroll|apple tv|plex|dazn|movistar|rakuten tv|pluto tv|media player|reproductor multimedia|reproductor de medios|playstation plus|ps plus|playstation store|playstation vr worlds|ps vr worlds|vr showcase|showcase|demo|demostracion|beta|open beta|closed beta|playtest|trial|version de prueba|prueba gratuita|free trial|benchmark|test server|tech test|prologue demo|teaser)\b/.test(n);
}

/**
 * Paso 1, puro: título de PSN → { id, confianza } con los juegos que ya están en la
 * tabla y nombre limpio igual. Si varios juegos se llaman igual (un remake...),
 * gana el que ha valorado ese usuario; si no, el único que ha valorado alguien del
 * grupo; si no, queda como propuesta por revisar.
 */
/** Familia de plataformas de IGDB (como las guarda la tabla juegos) para una plataforma de la biblioteca. */
export function familiaPlataforma(plataforma: unknown): RegExp {
  const p = String(plataforma ?? "");
  if (/^PS[45]$/.test(p)) return /^PS[45]$/;
  if (p === "Xbox 360") return /^Xbox( 360)?$/;
  if (/^Xbox/.test(p)) return /^Xbox$/;
  if (p === "PC") return /^PC$/;
  return /^(PS[45]|Xbox|Xbox 360|PC)$/;
}

export function elegirLocales(
  pendientes: { psn_title_id: unknown; nombre_psn: unknown; plataforma?: unknown }[],
  juegos: { igdb_id: number | string; nombre: string; plataformas?: string[] | null }[],
  mios: Set<number>,
  delGrupo: Set<number>,
) {
  const porNombre = new Map<string, Set<number>>();
  const plataformasDe = new Map<number, string[]>();
  for (const j of juegos) {
    plataformasDe.set(Number(j.igdb_id), (j.plataformas ?? []).map(String));
    for (const k of [limpiarNombrePsn(j.nombre), sinArticulo(limpiarNombrePsn(j.nombre))]) {
      if (!porNombre.has(k)) porNombre.set(k, new Set());
      porNombre.get(k)!.add(Number(j.igdb_id));
    }
  }
  const encontrados = new Map<string, { id: number; confianza: number }>();
  for (const f of pendientes) {
    const nombre = String(f.nombre_psn);
    for (const v of [limpiarNombrePsn(nombre), sinArticulo(limpiarNombrePsn(nombre))]) {
      const ids = [...(porNombre.get(v) ?? [])];
      if (!ids.length) continue;
      const deMi = ids.filter((id) => mios.has(id));
      const deGrupo = ids.filter((id) => delGrupo.has(id));
      let r: { id: number; confianza: number };
      if (ids.length === 1) {
        const id = ids[0];
        const fam = familiaPlataforma(f.plataforma);
        const enSuPlataforma = (plataformasDe.get(id) ?? []).some((x) => fam.test(x));
        r = { id, confianza: mios.has(id) ? 95 : delGrupo.has(id) ? 85 : enSuPlataforma ? 75 : 60 };
      } else if (deMi.length === 1) r = { id: deMi[0], confianza: 90 };
      else if (deGrupo.length === 1) r = { id: deGrupo[0], confianza: 80 };
      else r = { id: ids[0], confianza: 55 }; // varios con el mismo nombre: que lo revise
      encontrados.set(String(f.psn_title_id), r);
      break;
    }
  }
  return encontrados;
}
// </local>

/** Paso 1: juegos que ya están en la tabla juegos. Devuelve título → { id, confianza }. */
async function emparejarLocal(usuarioId: string, pendientes: Fila[]) {
  if (!pendientes.length) return new Map<string, { id: number; confianza: number }>();
  const [{ data: juegos }, { data: vals }] = await Promise.all([
    sb.from("juegos").select("igdb_id, nombre, plataformas"),
    sb.from("valoraciones").select("juego_id, usuario_id"),
  ]);
  const mios = new Set((vals ?? []).filter((v) => v.usuario_id === usuarioId).map((v) => Number(v.juego_id)));
  const delGrupo = new Set((vals ?? []).map((v) => Number(v.juego_id)));
  return elegirLocales(pendientes as { psn_title_id: unknown; nombre_psn: unknown }[], juegos ?? [], mios, delGrupo);
}

/** Paso 2 (en segundo plano): IGDB para todo lo que falte, de 4 en 4 y con tope de tiempo. */
async function emparejarConIgdb(pendientes: Fila[], valoradosDe: number[] | ((f: Fila) => number[])) {
  const valoradosPara = typeof valoradosDe === "function" ? valoradosDe : () => valoradosDe;
  const inicio = Date.now();
  let hechos = 0;
  for (let i = 0; i < pendientes.length; i += EMPAREJAR_A_LA_VEZ) {
    if (Date.now() - inicio > EMPAREJAR_HASTA_MS) break; // el resto, en la próxima sincronización
    await Promise.all(pendientes.slice(i, i + EMPAREJAR_A_LA_VEZ).map(async (f) => {
      let r: Resultado | null = null;
      try {
        r = await llamarIgdb({
          accion: "emparejar", nombre: f.nombre_psn, title_id: f.psn_title_id, plataforma: f.plataforma,
          primera_vez: f.primera_vez ?? null, valorados: valoradosPara(f),
        });
      } catch (e) {
        console.warn("Emparejar", f.nombre_psn, (e as Error).message);
        return; // se reintentará en la próxima sincronización
      }
      await guardarEmparejamiento(String(f.psn_title_id), {
        igdb_id: r?.igdb_id ? Number(r.igdb_id) : null,
        propuesta_id: r?.propuesta_id ? Number(r.propuesta_id) : null,
        confianza: Number(r?.confianza ?? 0),
        tipo: r?.tipo === "coleccion" ? "coleccion" : "juego",
        juegos: r?.juegos ?? null,
      }, String(f.nombre_psn));
      hechos++;
    }));
  }
  console.log(`Emparejados con IGDB: ${hechos} de ${pendientes.length} en ${Math.round((Date.now() - inicio) / 1000)} s`);
}

/** Lanza una tarea en segundo plano (la respuesta no la espera). */
function enSegundoPlano(p: Promise<unknown>) {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  const segura = p.catch((e) => console.error("Segundo plano:", e));
  if (rt?.waitUntil) rt.waitUntil(segura);
  return segura;
}

/** Emparejamientos conocidos de una lista de títulos. */
async function leerConocidos(ids: string[]) {
  const conocidos = new Map<string, Emparejamiento>();
  for (let i = 0; i < ids.length; i += 200) {
    let r = await sb.from("psn_igdb").select("psn_title_id, igdb_id, confirmado, algoritmo, tipo").in("psn_title_id", ids.slice(i, i + 200));
    if (r.error) r = await sb.from("psn_igdb").select("psn_title_id, igdb_id, confirmado").in("psn_title_id", ids.slice(i, i + 200));
    for (const x of r.data ?? []) conocidos.set(x.psn_title_id, x);
  }
  return conocidos;
}

/**
 * Recalcula los emparejamientos de unas filas de biblioteca (sincronizar y reprocesar):
 * no-juegos y paso local al momento; IGDB en segundo plano. Devuelve cuántos quedan.
 */
async function emparejarFilas(usuarioId: string, filas: Fila[], conocidos: Map<string, Emparejamiento>, lanzar = true) {
  const pendientes = filas
    .filter((f) => hayQueEmparejar(conocidos.get(String(f.psn_title_id))))
    .sort((a, b) => Number(b.horas ?? 0) - Number(a.horas ?? 0));
  // 0) Lo que no es un juego.
  const noJuegos = pendientes.filter((f) => esNoJuego(String(f.nombre_psn), String(f.categoria ?? "")));
  for (const f of noJuegos) {
    await guardarEmparejamiento(String(f.psn_title_id), { igdb_id: null, confianza: 100, tipo: "no_juego" }, String(f.nombre_psn));
    conocidos.set(String(f.psn_title_id), { igdb_id: null, algoritmo: ALGORITMO, tipo: "no_juego" });
  }
  const juegos = pendientes.filter((f) => !noJuegos.includes(f));
  // 1) Con los juegos ya guardados.
  const locales = await emparejarLocal(usuarioId, juegos);
  for (const [titulo, r] of locales) {
    const ok = r.confianza >= UMBRAL_ACEPTAR;
    // Los locales dudosos aún pueden mejorar con IGDB: se quedan para el paso 2.
    if (!ok) { locales.delete(titulo); continue; }
    await guardarEmparejamiento(titulo, { igdb_id: r.id, confianza: r.confianza, tipo: "juego" }, String(filas.find((f) => f.psn_title_id === titulo)?.nombre_psn ?? titulo));
    conocidos.set(titulo, { igdb_id: r.id, algoritmo: ALGORITMO, tipo: "juego" });
  }
  // 2) IGDB, en segundo plano.
  const paraIgdb = juegos.filter((f) => !locales.has(String(f.psn_title_id)));
  if (paraIgdb.length && lanzar) {
    const { data: vals } = await sb.from("valoraciones").select("juego_id").eq("usuario_id", usuarioId);
    enSegundoPlano(emparejarConIgdb(paraIgdb, (vals ?? []).map((v) => Number(v.juego_id))));
  }
  return { locales: locales.size, noJuegos: noJuegos.length, pendientes: paraIgdb.length, paraIgdb };
}

// -----------------------------------------------------------------------------
// Acciones
// -----------------------------------------------------------------------------
async function usuario(id: string) {
  if (!id) throw new ErrorPsn("parametros", "Falta usuario_id.", 400);
  const { data, error } = await sb.from("usuarios").select("id, nombre").eq("id", id).maybeSingle();
  if (error) throw new ErrorPsn("bd", "No se ha podido leer el usuario: " + error.message, 500);
  if (!data) throw new ErrorPsn("parametros", "Ese usuario no existe.", 404);
  return data;
}

/** Las cuentas de PSN (con sus tokens) de un usuario; o solo una si se pasa cuentaId. */
async function leerCuentas(usuarioId: string, cuentaId?: string): Promise<Cuenta[]> {
  let q = sb.from("psn_cuentas")
    .select("cuenta_id, usuario_id, account_id, online_id, access_token, refresh_token, expira_en, refresh_expira_en")
    .eq("usuario_id", usuarioId);
  if (cuentaId) q = q.eq("cuenta_id", cuentaId);
  const { data, error } = await q;
  if (error) throw new ErrorPsn("bd", "No se ha podido leer la conexión: " + error.message, 500);
  return (data ?? []) as Cuenta[];
}

/** Conecta (o vuelve a conectar) una cuenta de PSN. Se pueden tener varias. */
async function conectar(usuarioId: string, textoNpsso: string, etiqueta?: string) {
  await usuario(usuarioId);
  const npsso = extraerNpsso(textoNpsso);
  const tokens = await canjearNpsso(npsso); // el NPSSO acaba aquí: no se guarda

  const c: Cuenta = {
    cuenta_id: "", usuario_id: usuarioId, account_id: "", online_id: "",
    access_token: "", refresh_token: "", expira_en: "", refresh_expira_en: "",
  };
  aplicarTokens(c, tokens);
  if (!c.refresh_expira_en) c.refresh_expira_en = new Date(Date.now() + 60 * 86400000).toISOString();
  const id = await identidad(new SesionPsn(c, false));
  c.account_id = id.accountId;
  c.online_id = id.onlineId;

  // La cuenta (si ya estaba, se reconecta; si es otra, se añade).
  const fila: Record<string, unknown> = { usuario_id: usuarioId, fuente: "psn", externo_id: c.account_id, nombre: c.online_id, reconectar: false };
  if (etiqueta?.trim()) fila.etiqueta = etiqueta.trim().slice(0, 40);
  const { data: cuenta, error: e0 } = await sb.from("cuentas_plataforma")
    .upsert(fila, { onConflict: "usuario_id,fuente,externo_id" }).select("id").single();
  if (e0 || !cuenta) throw new ErrorPsn("bd", "No se ha podido guardar la cuenta: " + (e0?.message ?? ""), 500);
  c.cuenta_id = cuenta.id;
  const ahora = new Date().toISOString();
  const { error } = await sb.from("psn_cuentas").upsert({ ...c, actualizado_en: ahora }, { onConflict: "cuenta_id" });
  if (error) throw new ErrorPsn("bd", "No se ha podido guardar la conexión: " + error.message, 500);

  // Primera sincronización. Si falla, la conexión ya está hecha: se puede reintentar.
  let sincronizacion: Record<string, unknown>;
  try {
    sincronizacion = await sincronizarCuenta(usuarioId, c);
  } catch (e) {
    sincronizacion = e instanceof ErrorPsn
      ? { ok: false, codigo: e.codigo, error: e.message }
      : { ok: false, codigo: "interno", error: (e as Error).message };
    if (!(e instanceof ErrorPsn)) console.error(e);
  }
  return { ok: true, online_id: c.online_id, cuenta_id: c.cuenta_id, sincronizacion };
}

/** Desconecta una cuenta (o todas las de PSN): se borran sus tokens y su biblioteca. */
async function desconectar(usuarioId: string, cuentaId?: string) {
  await usuario(usuarioId);
  let q = sb.from("cuentas_plataforma").delete().eq("usuario_id", usuarioId).eq("fuente", "psn");
  if (cuentaId) q = q.eq("id", cuentaId);
  const { error } = await q; // en cascada: psn_cuentas y biblioteca de esa cuenta
  if (error) throw new ErrorPsn("bd", "No se ha podido desconectar: " + error.message, 500);
  return { ok: true };
}

/** Estado de las cuentas de PSN de un usuario (sin tokens). */
async function estado(usuarioId: string) {
  await usuario(usuarioId);
  const cs = await leerCuentas(usuarioId);
  const ahora = Date.now();
  return {
    ok: true,
    conectado: cs.length > 0,
    cuentas: cs.map((c) => ({
      cuenta_id: c.cuenta_id,
      online_id: c.online_id,
      token_caduca_en: c.expira_en,
      refresh_dias_restantes: Math.max(0, Math.floor((caduca(c.refresh_expira_en) - ahora) / 86400000)),
    })),
  };
}

/**
 * Recalcula con las reglas nuevas la biblioteca ya sincronizada de un usuario
 * (sin llamar a Sony). Lo confirmado a mano no se toca. Lo pide la app una vez.
 */
async function reprocesar(usuarioId: string) {
  await usuario(usuarioId);
  const filas = await filasParaEmparejar(usuarioId);
  if (!filas.length) return { ok: true, pendientes: 0, locales: 0, noJuegos: 0 };
  const conocidos = await leerConocidos(filas.map((f) => String(f.psn_title_id)));
  const { paraIgdb: _, ...emp } = await emparejarFilas(usuarioId, filas, conocidos);
  return { ok: true, ...emp };
}

/** Filas de biblioteca de un usuario (o de todos) que se pueden emparejar: lo que él no ha ocultado. */
async function filasParaEmparejar(usuarioId?: string) {
  const cols = "usuario_id, psn_title_id, nombre_psn, plataforma, horas, primera_vez, oculto_usuario";
  let q = sb.from("biblioteca").select(cols);
  if (usuarioId) q = q.eq("usuario_id", usuarioId);
  let r = await q;
  if (r.error) {
    let q2 = sb.from("biblioteca").select("usuario_id, psn_title_id, nombre_psn, plataforma, horas");
    if (usuarioId) q2 = q2.eq("usuario_id", usuarioId);
    r = await q2;
  }
  return ((r.data ?? []) as Fila[]).filter((f) => f.oculto_usuario !== true);
}

/**
 * Para la tarea de cada hora: lo pendiente de TODOS los usuarios, en una sola tanda
 * en segundo plano (con su tope de tiempo; lo que no dé tiempo, en la siguiente).
 */
async function reprocesarTodos() {
  const filas = await filasParaEmparejar();
  const porUsuario = new Map<string, Fila[]>();
  for (const f of filas) {
    const u = String(f.usuario_id);
    if (!porUsuario.has(u)) porUsuario.set(u, []);
    porUsuario.get(u)!.push(f);
  }
  const conocidos = await leerConocidos([...new Set(filas.map((f) => String(f.psn_title_id)))]);
  const { data: vals } = await sb.from("valoraciones").select("juego_id, usuario_id");
  const valoradosDe = (f: Fila) => (vals ?? []).filter((v) => v.usuario_id === f.usuario_id).map((v) => Number(v.juego_id));
  const todos: Fila[] = [];
  const vistos = new Set<string>();
  for (const [u, sus] of porUsuario) {
    const r = await emparejarFilas(u, sus, conocidos, false);
    for (const f of r.paraIgdb) {
      if (vistos.has(String(f.psn_title_id))) continue; // el mismo título de dos usuarios: una vez
      vistos.add(String(f.psn_title_id));
      todos.push(f);
    }
  }
  if (todos.length) enSegundoPlano(emparejarConIgdb(todos, valoradosDe));
  return { ok: true, usuarios: porUsuario.size, pendientes: todos.length };
}

/** Sincroniza todas las cuentas de PSN de un usuario (o solo una) y suma el resultado. */
async function sincronizar(usuarioId: string, cuentaId?: string) {
  await usuario(usuarioId);
  const cs = await leerCuentas(usuarioId, cuentaId);
  if (!cs.length) throw new ErrorPsn("sin_conectar", "Primero conecta tu cuenta de PlayStation.");
  const res: Record<string, any>[] = [];
  let primerError: unknown = null;
  for (const c of cs) {
    try {
      res.push({ ...(await sincronizarCuenta(usuarioId, c)), online_id: c.online_id });
    } catch (e) {
      primerError ??= e;
      res.push({ ok: false, online_id: c.online_id, codigo: (e as ErrorPsn).codigo ?? "interno", error: (e as Error).message });
    }
  }
  if (!res.some((r) => r.ok)) throw primerError;
  const suma = (k: string) => res.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  return {
    ok: true,
    juegos: suma("juegos"), horas: suma("horas"), emparejados_ahora: suma("emparejados_ahora"),
    pendientes: suma("pendientes"), nuevos: suma("nuevos"), sin_emparejar: suma("sin_emparejar"),
    sincronizado_en: new Date().toISOString(),
    cuentas: res,
  };
}

/** Tarea de cada hora: vuelve a sincronizar las cuentas de PSN que lleven más de 12 h sin hacerlo. */
async function tareaHoraria() {
  const limite = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { data } = await sb.from("cuentas_plataforma").select("id, usuario_id, sincronizado_en").eq("fuente", "psn")
    .or(`sincronizado_en.is.null,sincronizado_en.lt.${limite}`).eq("reconectar", false);
  let hechas = 0;
  for (const cp of data ?? []) {
    const [c] = await leerCuentas(cp.usuario_id, cp.id);
    if (!c) continue;
    try { await sincronizarCuenta(cp.usuario_id, c); hechas++; } catch (e) { console.warn("Tarea horaria PSN:", (e as Error).message); }
  }
  return { ok: true, cuentas: (data ?? []).length, sincronizadas: hechas };
}

async function sincronizarCuenta(usuarioId: string, c: Cuenta) {
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
      cuenta_id: c.cuenta_id,
      fuente: "psn",
      psn_title_id: j.titleId,
      nombre_psn: nombre,
      plataforma: String(j.category ?? "").startsWith("ps5") ? "PS5" : "PS4",
      imagen_psn: j.localizedImageUrl || j.imageUrl || null,
      horas: horasISO(j.playDuration),
      ultima_vez: j.lastPlayedDateTime ?? null,
      primera_vez: j.firstPlayedDateTime ?? null,
      categoria: String(j.category ?? ""),
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
      cuenta_id: c.cuenta_id,
      fuente: "psn",
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

  // Emparejamientos ya conocidos (compartidos entre usuarios) y lo que ya tenía este usuario.
  const ids = [...filas.keys()];
  const conocidos = await leerConocidos(ids);
  const { data: previas } = await sb.from("biblioteca").select("psn_title_id").eq("cuenta_id", c.cuenta_id);
  const yaTenia = new Set((previas ?? []).map((x) => x.psn_title_id));

  // Guardar la biblioteca: lo nuevo entra "por revisar" (y oculto si no es un juego);
  // lo que ya estaba conserva su revisión y su "oculto".
  const conJuego = (f: Fila) => {
    const e = conocidos.get(String(f.psn_title_id));
    return { ...f, juego_id: e?.tipo === "coleccion" ? null : e?.igdb_id ?? null };
  };
  const sinCategoria = ({ categoria: _, ...f }: Fila) => f;
  const lista = [...filas.values()];
  const nuevas = lista.filter((f) => !yaTenia.has(String(f.psn_title_id))).map((f) => {
    const noJuego = esNoJuego(String(f.nombre_psn), String(f.categoria ?? ""));
    return { ...sinCategoria(conJuego(f)), por_revisar: !noJuego, oculto: noJuego };
  });
  // Una sincronización NUNCA borra horas que ya había: si esta respuesta no las trae,
  // la fila se actualiza sin tocar las horas guardadas.
  const sinHorasVacias = (f: Fila) => {
    if (f.horas == null) { const { horas: _, ...resto } = f; return resto; }
    return f;
  };
  const viejas = lista.filter((f) => yaTenia.has(String(f.psn_title_id))).map((f) => sinHorasVacias(sinCategoria(conJuego(f))));
  // (Por separado las que traen horas y las que no: en un upsert de varias filas, la
  // columna que falta en alguna se rellenaría con null.)
  const viejasConHoras = viejas.filter((f) => "horas" in f);
  const viejasSinHoras = viejas.filter((f) => !("horas" in f));
  for (const [grupo, extra] of [[nuevas, true], [viejasConHoras, false], [viejasSinHoras, false]] as const) {
    for (let i = 0; i < grupo.length; i += 200) {
      let { error } = await sb.from("biblioteca").upsert(grupo.slice(i, i + 200), { onConflict: "cuenta_id,psn_title_id" });
      if (error && /por_revisar|primera_vez/.test(error.message)) { // sin la migración 006
        ({ error } = await sb.from("biblioteca").upsert(grupo.slice(i, i + 200).map(({ por_revisar: _a, primera_vez: _b, ...r }) => r), { onConflict: "cuenta_id,psn_title_id" }));
      }
      if (error) throw new ErrorPsn("bd", "No se ha podido guardar la biblioteca: " + error.message, 500);
    }
    void extra;
  }
  await sb.from("cuentas_plataforma").update({ sincronizado_en: ahora, reconectar: false }).eq("id", c.cuenta_id);

  // Emparejar lo que falte (no-juegos y locales ahora; IGDB en segundo plano).
  const emp = await emparejarFilas(usuarioId, lista, conocidos);

  const horas = lista.reduce((t, f) => t + Number(f.horas ?? 0), 0);
  return {
    ok: true,
    juegos: lista.length,
    horas: Math.round(horas),
    emparejados_ahora: emp.locales,
    pendientes: emp.pendientes, // se están emparejando en segundo plano
    nuevos: nuevas.filter((f) => f.por_revisar).length,
    sin_emparejar: lista.filter((f) => !conocidos.get(String(f.psn_title_id))?.igdb_id).length - emp.pendientes,
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

    // Un usuario_id que no es un UUID es una petición mal hecha (404), no un error del servidor.
    if (uid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(uid))) {
      return json({ ok: false, codigo: "parametros", error: "Ese usuario no existe." }, 404);
    }
    switch (c.accion) {
      case "conectar": return json(await conectar(uid, String(c.npsso ?? ""), c.etiqueta ? String(c.etiqueta) : undefined));
      case "sincronizar": return json(await sincronizar(uid, c.cuenta_id ? String(c.cuenta_id) : undefined));
      case "desconectar": return json(await desconectar(uid, c.cuenta_id ? String(c.cuenta_id) : undefined));
      case "tarea_horaria": return json(await tareaHoraria());
      case "estado": return json(await estado(uid));
      case "reprocesar": return json(await reprocesar(uid));
      case "reprocesar_todos": return json(await reprocesarTodos());
      default: throw new ErrorPsn("parametros", 'Acción desconocida (usa "conectar", "sincronizar", "desconectar" o "estado")', 400);
    }
  } catch (e) {
    if (e instanceof ErrorPsn) return json({ ok: false, codigo: e.codigo, error: e.message }, e.estado);
    console.error(e);
    return json({ ok: false, codigo: "interno", error: "Error interno de la función psn" }, 500);
  }
});
