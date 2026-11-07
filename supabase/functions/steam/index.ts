// =============================================================================
// CVJ · Edge Function "steam": biblioteca de Steam.
// Desplegar con "Verify JWT" DESACTIVADO (la llama la app con la clave pública).
//
// Conexión con el inicio de sesión OFICIAL de Steam (OpenID 2.0):
//   la app manda a https://steamcommunity.com/openid/login y Steam vuelve a
//   steam.html con los parámetros openid.*. Esta función los VALIDA con Steam
//   (openid.mode = check_authentication) antes de aceptar el steamid64; nunca se fía
//   del parámetro de la URL sin validarlo. Además comprueba que vuelve a nuestra web.
//
// Secreto necesario: STEAM_API_KEY. SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los
// inyecta Supabase.
//
// API de Steam (una sola petición de biblioteca por cuenta y sincronización):
//   GET ISteamUser/GetPlayerSummaries/v2/?steamids=…           → nombre del perfil
//   GET IPlayerService/GetOwnedGames/v1/?steamid=…&include_appinfo=1&include_played_free_games=1
//       → games[]: appid, name, playtime_forever (min), rtime_last_played (unix)
//   Perfil privado → la respuesta viene sin game_count ni games.
//
// Emparejamiento: por appid con los external_games de IGDB (fuente Steam), en la
// función igdb (acción "steam_appids"); se acepta solo. Lo que no tenga appid en
// IGDB pasa por el emparejamiento común por nombre (función psn, "reprocesar").
//
// Peticiones (POST, JSON) → { ok: true, ... } o { ok: false, codigo, error }:
//   { "accion": "conectar", "usuario_id", "openid": { "openid.ns": …, … }, "etiqueta"? }
//   { "accion": "sincronizar", "usuario_id", "cuenta_id"? }
//   { "accion": "desconectar", "usuario_id", "cuenta_id"? }
//   { "accion": "tarea_horaria" }   (pg_cron: cuentas con más de 6 h sin sincronizar)
//   { "accion": "estado" }          (¿está la clave puesta y funciona?)
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CLAVE = (Deno.env.get("STEAM_API_KEY") ?? "").trim();
const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const API = "https://api.steampowered.com";
const OPENID = "https://steamcommunity.com/openid/login";
const ALGORITMO = 6; // el de la función psn: lo emparejado por appid no se recalcula
const CADA_TAREA_MS = 6 * 3600 * 1000;
// Webs desde las que se puede volver del inicio de sesión de Steam.
const ORIGENES = ["https://elzigala666.github.io/CVJ/", "http://localhost:", "http://127.0.0.1:"];

function json(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, "Content-Type": "application/json" } });
}

class ErrorSteam extends Error {
  constructor(public codigo: string, mensaje: string, public estado = 200) {
    super(mensaje);
  }
}

// <puro> (sin dependencias: se prueba en local con node)
/** steamid64 de un openid.claimed_id de Steam (o null si no es de Steam). */
export function steamidDe(claimed: unknown): string | null {
  const m = String(claimed ?? "").match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  return m ? m[1] : null;
}

/** ¿Vuelve a una de nuestras webs? */
export function vueltaValida(returnTo: unknown, origenes = ORIGENES): boolean {
  const r = String(returnTo ?? "");
  return origenes.some((o) => r.startsWith(o));
}

/** Cuerpo para check_authentication: los mismos openid.* con mode cambiado. */
export function cuerpoComprobacion(params: Record<string, unknown>): URLSearchParams {
  const b = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (k.startsWith("openid.") && v != null) b.set(k, String(v));
  }
  b.set("openid.mode", "check_authentication");
  return b;
}

/** "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n" → true */
export function esValida(texto: string): boolean {
  return /(^|\n)is_valid\s*:\s*true\s*(\n|$)/.test(String(texto ?? ""));
}

/** Lo que no es un juego en Steam (herramientas, servidores, redistribuibles, demos...). */
export function esNoJuegoSteam(nombre: string): boolean {
  const n = String(nombre ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /(steamworks common redistributables|\bredistributables?\b|dedicated server|\bserver\b$|\bsdk\b|\bproton\b|steam linux runtime|steamvr|\bsoundtrack\b|\bost\b|\bdemo\b|\bplaytest\b|\bbenchmark\b|\bmod tools\b|\bmodding tool|\beditor\b$|\btool(s|kit)?\b$|\bpublic test\b|\btest server\b|\bpts\b|wallpaper engine|\bsource filmmaker\b|\bbeta\b$)/.test(n);
}

/** Juegos de GetOwnedGames → filas de biblioteca (sin horas null: 0 si nunca lo jugó). */
export function filasSteam(games: any[], usuarioId: string, cuentaId: string, ahora: string) {
  return (games ?? []).filter((g) => g?.appid != null && g?.name).map((g) => {
    const min = Number(g.playtime_forever ?? 0);
    const ult = Number(g.rtime_last_played ?? 0);
    return {
      usuario_id: usuarioId,
      cuenta_id: cuentaId,
      fuente: "steam",
      psn_title_id: `STEAM-${g.appid}`,
      nombre_psn: String(g.name),
      plataforma: "PC",
      imagen_psn: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
      horas: Number.isFinite(min) ? Math.round((min / 60) * 10) / 10 : 0,
      ultima_vez: ult > 0 ? new Date(ult * 1000).toISOString() : null,
      actualizado_en: ahora,
      no_juego: esNoJuegoSteam(String(g.name)),
    };
  });
}

/** ¿Perfil privado? (la respuesta de GetOwnedGames llega sin game_count) */
export const esPrivado = (respuesta: any) => !respuesta?.response || respuesta.response.game_count == null;
// </puro>

async function api(ruta: string, params: Record<string, string>) {
  if (!CLAVE) throw new ErrorSteam("sin_clave", "Falta la clave de la API de Steam (STEAM_API_KEY).", 500);
  const q = new URLSearchParams({ key: CLAVE, format: "json", ...params });
  let r: Response;
  try {
    r = await fetch(`${API}/${ruta}?${q}`);
  } catch {
    throw new ErrorSteam("red", "Steam no responde. Prueba en un rato.", 502);
  }
  if (r.status === 401 || r.status === 403) throw new ErrorSteam("clave_api", "Steam no acepta la clave de la API.", 500);
  if (r.status === 429) throw new ErrorSteam("limite", "Steam pide esperar un poco. Prueba en unos minutos.");
  if (!r.ok) throw new ErrorSteam("steam_error", `Steam ha respondido ${r.status}.`, 502);
  return await r.json().catch(() => ({}));
}

async function usuario(id: string) {
  if (!id) throw new ErrorSteam("parametros", "Falta usuario_id.", 400);
  const { data, error } = await sb.from("usuarios").select("id").eq("id", id).maybeSingle();
  if (error) throw new ErrorSteam("bd", "No se ha podido leer el usuario: " + error.message, 500);
  if (!data) throw new ErrorSteam("parametros", "Ese usuario no existe.", 404);
}

type CuentaSteam = { id: string; usuario_id: string; externo_id: string; nombre: string | null; sincronizado_en: string | null };

async function cuentasDe(usuarioId: string, cuentaId?: string): Promise<CuentaSteam[]> {
  let q = sb.from("cuentas_plataforma").select("id, usuario_id, externo_id, nombre, sincronizado_en")
    .eq("usuario_id", usuarioId).eq("fuente", "steam").order("creado_en");
  if (cuentaId) q = q.eq("id", cuentaId);
  const { data, error } = await q;
  if (error) throw new ErrorSteam("bd", "No se han podido leer las cuentas: " + error.message, 500);
  return (data ?? []) as CuentaSteam[];
}

/** Conecta una cuenta tras volver del inicio de sesión de Steam (validado con Steam). */
async function conectar(usuarioId: string, openid: Record<string, unknown>, etiqueta?: string) {
  await usuario(usuarioId);
  if (!openid || openid["openid.mode"] !== "id_res") {
    throw new ErrorSteam("cancelado", "No se ha completado el inicio de sesión en Steam.");
  }
  if (String(openid["openid.op_endpoint"] ?? "") !== OPENID || !vueltaValida(openid["openid.return_to"])) {
    throw new ErrorSteam("no_valido", "La respuesta no viene del inicio de sesión de Steam.");
  }
  const steamid = steamidDe(openid["openid.claimed_id"]);
  if (!steamid || steamidDe(openid["openid.identity"]) !== steamid) {
    throw new ErrorSteam("no_valido", "La respuesta de Steam no trae una cuenta válida.");
  }
  // Validar con Steam (check_authentication). Sin esto, cualquiera podría inventarse un steamid.
  let texto = "";
  try {
    const r = await fetch(OPENID, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: cuerpoComprobacion(openid),
    });
    texto = await r.text();
  } catch {
    throw new ErrorSteam("red", "No se ha podido comprobar el inicio de sesión con Steam. Prueba otra vez.", 502);
  }
  if (!esValida(texto)) throw new ErrorSteam("no_valido", "Steam no ha confirmado el inicio de sesión. Vuelve a intentarlo.");

  // Nombre del perfil.
  const perfil = await api("ISteamUser/GetPlayerSummaries/v2/", { steamids: steamid });
  const nombre = String(perfil?.response?.players?.[0]?.personaname ?? steamid);

  const fila: Record<string, unknown> = { usuario_id: usuarioId, fuente: "steam", externo_id: steamid, nombre, reconectar: false };
  if (etiqueta?.trim()) fila.etiqueta = etiqueta.trim().slice(0, 40);
  const { data: cuenta, error } = await sb.from("cuentas_plataforma")
    .upsert(fila, { onConflict: "usuario_id,fuente,externo_id" }).select("id, usuario_id, externo_id, nombre, sincronizado_en").single();
  if (error || !cuenta) throw new ErrorSteam("bd", "No se ha podido guardar la cuenta: " + (error?.message ?? ""), 500);

  let sincronizacion: Record<string, unknown>;
  try {
    sincronizacion = await sincronizarCuenta(usuarioId, cuenta as CuentaSteam);
  } catch (e) {
    sincronizacion = e instanceof ErrorSteam ? { ok: false, codigo: e.codigo, error: e.message } : { ok: false, codigo: "interno", error: (e as Error).message };
    if (!(e instanceof ErrorSteam)) console.error(e);
  }
  return { ok: true, nombre, cuenta_id: cuenta.id, sincronizacion };
}

async function sincronizar(usuarioId: string, cuentaId?: string) {
  await usuario(usuarioId);
  const cs = await cuentasDe(usuarioId, cuentaId);
  if (!cs.length) throw new ErrorSteam("sin_conectar", "Primero conecta tu cuenta de Steam.");
  const res: Record<string, any>[] = [];
  let primerError: unknown = null;
  for (const c of cs) {
    try {
      res.push({ ...(await sincronizarCuenta(usuarioId, c)), nombre: c.nombre });
    } catch (e) {
      primerError ??= e;
      res.push({ ok: false, nombre: c.nombre, codigo: (e as ErrorSteam).codigo ?? "interno", error: (e as Error).message });
    }
  }
  if (!res.some((r) => r.ok)) throw primerError;
  const suma = (k: string) => res.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  return {
    ok: true, juegos: suma("juegos"), horas: Math.round(suma("horas")), por_appid: suma("por_appid"), nuevos: suma("nuevos"),
    pendientes: suma("pendientes"), ocultos: suma("ocultos"), sincronizado_en: new Date().toISOString(), cuentas: res,
  };
}

async function sincronizarCuenta(usuarioId: string, c: CuentaSteam) {
  // UNA petición: la biblioteca con nombres, horas y última partida.
  const d = await api("IPlayerService/GetOwnedGames/v1/", {
    steamid: c.externo_id, include_appinfo: "1", include_played_free_games: "1",
  });
  if (esPrivado(d)) {
    throw new ErrorSteam("privado", "Tu biblioteca de Steam es privada. Hazla pública y vuelve a sincronizar.");
  }
  const ahora = new Date().toISOString();
  const filas = filasSteam(d.response.games ?? [], usuarioId, c.id, ahora);

  // Lo que ya tenía esta cuenta conserva su revisión y su "oculto"; lo nuevo entra "por revisar".
  const { data: previas } = await sb.from("biblioteca").select("psn_title_id").eq("cuenta_id", c.id);
  const yaTenia = new Set((previas ?? []).map((x) => x.psn_title_id));
  const limpia = ({ no_juego: _, ...f }: Record<string, any>) => f;
  const nuevas = filas.filter((f) => !yaTenia.has(f.psn_title_id)).map((f) => ({ ...limpia(f), por_revisar: !f.no_juego, oculto: f.no_juego }));
  const viejas = filas.filter((f) => yaTenia.has(f.psn_title_id)).map(limpia);
  for (const grupo of [nuevas, viejas]) {
    for (let i = 0; i < grupo.length; i += 200) {
      // Steam siempre trae horas (0 si no lo has jugado): nunca se escribe null.
      const { error } = await sb.from("biblioteca").upsert(grupo.slice(i, i + 200), { onConflict: "cuenta_id,psn_title_id" });
      if (error) throw new ErrorSteam("bd", "No se ha podido guardar la biblioteca: " + error.message, 500);
    }
  }
  const noJuegos = filas.filter((f) => f.no_juego);
  if (noJuegos.length) {
    await sb.from("psn_igdb").upsert(noJuegos.map((f) => ({
      psn_title_id: f.psn_title_id, igdb_id: null, confirmado: false, nombre_psn: f.nombre_psn,
      tipo: "no_juego", confianza: 100, algoritmo: ALGORITMO, juegos: null, propuesta_id: null, actualizado_en: ahora,
    })), { onConflict: "psn_title_id", ignoreDuplicates: true });
  }

  // Emparejar por appid (IGDB external_games, fuente Steam): se acepta solo.
  let porAppid = 0;
  const juegos = filas.filter((f) => !f.no_juego);
  if (juegos.length) {
    const ids = juegos.map((f) => f.psn_title_id);
    const conocidos = new Map<string, { confirmado: boolean; algoritmo: number | null }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from("psn_igdb").select("psn_title_id, confirmado, algoritmo").in("psn_title_id", ids.slice(i, i + 200));
      for (const x of data ?? []) conocidos.set(x.psn_title_id, x);
    }
    // Solo lo que nadie ha confirmado a mano ni se emparejó ya con esta versión.
    const faltan = juegos.filter((f) => { const k = conocidos.get(f.psn_title_id); return !k || (!k.confirmado && (k.algoritmo ?? 0) < ALGORITMO); });
    if (faltan.length) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/igdb`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "steam_appids", appids: faltan.map((f) => f.psn_title_id.slice(6)) }),
        });
        const mapa: Record<string, number> = (await r.json().catch(() => null))?.juegos ?? {};
        const filasEmp = faltan.filter((f) => mapa[f.psn_title_id.slice(6)]).map((f) => ({
          psn_title_id: f.psn_title_id, igdb_id: mapa[f.psn_title_id.slice(6)], confirmado: false, nombre_psn: f.nombre_psn,
          tipo: "juego", confianza: 100, algoritmo: ALGORITMO, juegos: null, propuesta_id: null, actualizado_en: ahora,
        }));
        for (let i = 0; i < filasEmp.length; i += 200) {
          const { error } = await sb.from("psn_igdb").upsert(filasEmp.slice(i, i + 200), { onConflict: "psn_title_id" });
          if (error) console.warn("psn_igdb (appid):", error.message);
        }
        for (const f of filasEmp) {
          await sb.from("biblioteca").update({ juego_id: f.igdb_id }).eq("psn_title_id", f.psn_title_id);
        }
        porAppid = filasEmp.length;
      } catch (e) {
        console.warn("Emparejar por appid:", (e as Error).message);
      }
    }
  }
  await sb.from("cuentas_plataforma").update({ sincronizado_en: ahora, reconectar: false }).eq("id", c.id);
  c.sincronizado_en = ahora;

  // El resto (sin appid en IGDB): emparejamiento común por nombre, apps, "Revisa tu biblioteca"...
  let pendientes = 0;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/psn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "reprocesar", usuario_id: usuarioId }),
    });
    pendientes = Number((await r.json().catch(() => null))?.pendientes ?? 0);
  } catch (e) {
    console.warn("Emparejar (psn reprocesar):", (e as Error).message);
  }
  return {
    ok: true,
    juegos: juegos.length,
    horas: juegos.reduce((t, f) => t + f.horas, 0),
    ocultos: noJuegos.length,
    por_appid: porAppid,
    nuevos: nuevas.filter((f) => f.por_revisar).length,
    pendientes,
    sincronizado_en: ahora,
  };
}

/** Tarea de cada hora: las cuentas de Steam que lleven más de 6 h sin sincronizar. */
async function tareaHoraria() {
  const limite = new Date(Date.now() - CADA_TAREA_MS).toISOString();
  const { data } = await sb.from("cuentas_plataforma").select("id, usuario_id, externo_id, nombre, sincronizado_en").eq("fuente", "steam")
    .or(`sincronizado_en.is.null,sincronizado_en.lt.${limite}`);
  let hechas = 0;
  for (const c of (data ?? []) as CuentaSteam[]) {
    try { await sincronizarCuenta(c.usuario_id, c); hechas++; } catch (e) { console.warn("Tarea horaria Steam:", (e as Error).message); }
  }
  return { ok: true, cuentas: (data ?? []).length, sincronizadas: hechas };
}

async function desconectar(usuarioId: string, cuentaId?: string) {
  await usuario(usuarioId);
  let q = sb.from("cuentas_plataforma").delete().eq("usuario_id", usuarioId).eq("fuente", "steam");
  if (cuentaId) q = q.eq("id", cuentaId);
  const { error } = await q; // en cascada: la biblioteca de esa cuenta
  if (error) throw new ErrorSteam("bd", "No se ha podido desconectar: " + error.message, 500);
  return { ok: true };
}

async function estado() {
  if (!CLAVE) return { ok: false, codigo: "sin_clave", error: "Falta STEAM_API_KEY." };
  // Un perfil público cualquiera para comprobar que la clave funciona.
  await api("ISteamUser/GetPlayerSummaries/v2/", { steamids: "76561197960435530" });
  return { ok: true, clave: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, codigo: "parametros", error: "Usa POST" }, 405);
  let c: Record<string, any> = {};
  try {
    c = await req.json();
  } catch {
    return json({ ok: false, codigo: "parametros", error: "El cuerpo debe ser JSON" }, 400);
  }
  const uid = String(c.usuario_id ?? "");

  // Un usuario_id que no es un UUID es una petición mal hecha (404), no un error del servidor.
  if (uid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(uid))) {
    return json({ ok: false, codigo: "parametros", error: "Ese usuario no existe." }, 404);
  }
  try {
    switch (c.accion) {
      case "conectar": return json(await conectar(uid, c.openid ?? {}, c.etiqueta ? String(c.etiqueta) : undefined));
      case "sincronizar": return json(await sincronizar(uid, c.cuenta_id ? String(c.cuenta_id) : undefined));
      case "desconectar": return json(await desconectar(uid, c.cuenta_id ? String(c.cuenta_id) : undefined));
      case "tarea_horaria": return json(await tareaHoraria());
      case "estado": return json(await estado());
      default: return json({ ok: false, codigo: "parametros", error: "Acción desconocida" }, 400);
    }
  } catch (e) {
    if (e instanceof ErrorSteam) {
      if (e.estado >= 500) console.error(`steam ${c.accion}: ${e.codigo} · ${e.message}`);
      return json({ ok: false, codigo: e.codigo, error: e.message }, e.estado);
    }
    console.error(e);
    return json({ ok: false, codigo: "interno", error: "Error interno de la función steam" }, 500);
  }
});
