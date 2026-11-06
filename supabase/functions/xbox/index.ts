// =============================================================================
// CVJ · Edge Function "xbox": biblioteca de Xbox con OpenXBL (xbl.io).
// Todo en un archivo para pegarlo en el editor de funciones del panel de Supabase.
// Desplegar con "Verify JWT" / "Enforce JWT verification" DESACTIVADO.
//
// Inicio de sesión (flujo de "apps" de OpenXBL, comprobado en su librería oficial
// OpenXBL-PHP y en su demo XboxAppDemo):
//   1) la app manda al usuario a https://xbl.io/app/auth/{CLAVE_PUBLICA_DE_LA_APP};
//   2) inicia sesión con Microsoft y OpenXBL vuelve a la URL de vuelta de la app con ?code=...;
//   3) aquí se canjea: POST https://xbl.io/app/claim { code, app_key: CLAVE_PUBLICA } →
//      { appKey (la clave de ESE usuario), xuid, gamertag, email, avatar };
//   4) con esa clave se llama a la API: https://xbl.io/api/v2/... con las cabeceras
//      X-Authorization: {appKey} y X-Contract: 100.
//
// Secreto necesario: OPENXBL_PUBLIC_KEY (la clave pública de la app de xbl.io).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.
//
// Límite gratuito de OpenXBL: ~150 peticiones por hora. Una sincronización hace UNA
// petición (el historial de títulos con sus logros) y como mucho una cada 10 minutos
// por usuario. Las horas de juego necesitarían una petición por juego: no se piden.
//
// Peticiones (POST, JSON). Respuesta siempre JSON: { ok: true, ... } o { ok: false, codigo, error }.
//   { "accion": "login" }   → { url } de inicio de sesión (la clave pública no va en la app)
//   { "accion": "conectar", "usuario_id": "...", "code": "..." }
//   { "accion": "sincronizar", "usuario_id": "..." }
//   { "accion": "desconectar", "usuario_id": "..." }
//   { "accion": "estado", "usuario_id": "..." }   (sin la clave: para probar)
//
// El emparejamiento con IGDB, las colecciones, las apps ocultas, "Revisa tu biblioteca"...
// son comunes a todas las plataformas: los hace la función "psn" (acción "reprocesar").
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CLAVE_PUBLICA = (Deno.env.get("OPENXBL_PUBLIC_KEY") ?? "").trim();
const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const API = "https://xbl.io/api/v2";
const ESPERA_MS = 10 * 60 * 1000; // entre sincronizaciones de un mismo usuario

function json(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

class ErrorXbox extends Error {
  constructor(public codigo: string, mensaje: string, public estado = 200, public extra: Record<string, unknown> = {}) {
    super(mensaje);
  }
}

// -----------------------------------------------------------------------------
// OpenXBL
// -----------------------------------------------------------------------------
/** Canjea el código de la vuelta por la clave del usuario. */
async function canjear(code: string) {
  if (!CLAVE_PUBLICA) throw new ErrorXbox("falta_clave", "Falta el secreto OPENXBL_PUBLIC_KEY en Supabase.", 500);
  if (!/^[A-Za-z0-9_\-.]{4,200}$/.test(code)) throw new ErrorXbox("codigo_no_valido", "El código de vuelta de Xbox no es válido. Vuelve a conectar.");
  const r = await fetch("https://xbl.io/app/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ code, app_key: CLAVE_PUBLICA }),
  });
  const d = await r.json().catch(() => null);
  const clave = d?.appKey ?? d?.app_key ?? null;
  if (!r.ok || !clave || !d?.xuid) {
    console.error("claim:", r.status, JSON.stringify(d).slice(0, 300));
    throw new ErrorXbox("codigo_no_valido", "Xbox no ha aceptado el inicio de sesión (el código caduca enseguida). Vuelve a pulsar «Conectar Xbox».");
  }
  return { clave: String(clave), xuid: String(d.xuid), gamertag: String(d.gamertag ?? d.xuid) };
}

/** GET a la API de OpenXBL con la clave del usuario. */
async function api(clave: string, ruta: string, usuarioId?: string) {
  const r = await fetch(`${API}/${ruta}`, {
    headers: { "X-Authorization": clave, "X-Contract": "100", Accept: "application/json", "Accept-Language": "es-ES,es" },
  });
  if (r.status === 401 || r.status === 403) {
    if (usuarioId) await sb.from("usuarios").update({ xbox_reconectar: true }).eq("id", usuarioId);
    throw new ErrorXbox("reconectar", "Tu conexión con Xbox ha caducado. Vuelve a conectarla desde Ajustes → Plataformas.");
  }
  if (r.status === 429) throw new ErrorXbox("limite", "OpenXBL ha llegado a su límite de peticiones por hora. Prueba más tarde.");
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) {
    console.error(`OpenXBL ${ruta}:`, r.status, JSON.stringify(d).slice(0, 300));
    throw new ErrorXbox("xbox_error", "Xbox no ha respondido bien. Prueba más tarde.");
  }
  return d;
}

// <filas> (sin dependencias: se prueba en local con node)
/** Plataforma de un título según sus dispositivos. */
export function plataformaXbox(devices: string[] = []): string {
  const d = devices.map((x) => String(x).toLowerCase());
  if (d.some((x) => x.includes("series") || x === "scarlett")) return "Xbox Series";
  if (d.some((x) => x.includes("xboxone") || x === "durango")) return "Xbox One";
  if (d.some((x) => x.includes("360"))) return "Xbox 360";
  if (d.some((x) => x === "pc" || x.includes("win"))) return "PC";
  return "Xbox One";
}

/** Un título del historial de Xbox (titlehub) → fila de biblioteca. Null si no sirve. */
export function filaXbox(t: Record<string, any>, usuarioId: string, ahora: string) {
  if (!t?.titleId || !t?.name) return null;
  const logros = t.achievement ?? {};
  const progreso = Number(logros.progressPercentage);
  return {
    usuario_id: usuarioId,
    fuente: "xbox",
    psn_title_id: `XBOX-${t.titleId}`,
    nombre_psn: String(t.name),
    plataforma: plataformaXbox(t.devices ?? []),
    imagen_psn: t.displayImage ?? null,
    horas: null, // la API solo las da con una petición por juego: no se piden (nada de inventar)
    ultima_vez: t.titleHistory?.lastTimePlayed ?? null,
    progreso_trofeos: Number.isFinite(progreso) ? Math.max(0, Math.min(100, Math.round(progreso))) : null,
    trofeos: logros.totalAchievements != null || logros.currentGamerscore != null ? {
      logros: logros.currentAchievements ?? null,
      logros_totales: logros.totalAchievements ?? null,
      gamerscore: logros.currentGamerscore ?? null,
      gamerscore_total: logros.totalGamerscore ?? null,
    } : null,
    actualizado_en: ahora,
    // Apps (Netflix, Edge, Películas y TV...): el titlehub las marca con type distinto de "Game".
    es_app: t.type != null && String(t.type).toLowerCase() !== "game",
  };
}

/** ¿App de Xbox por el nombre? (por si la API no dice el tipo) */
export function esAppXbox(nombre: string): boolean {
  const n = String(nombre ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  if (/^(microsoft edge|edge|xbox|xbox app|xbox game pass|game pass|pc game pass|configuracion|settings|ajustes|peliculas y tv|movies & tv|movies and tv|microsoft store|tienda|xbox console companion|groove musica|groove music|xbox accessories|accesorios de xbox|xbox family settings|guia|media player|reproductor multimedia|explorador de archivos|file explorer)$/.test(n)) return true;
  if (/\bdisney\s*(\+|plus)/.test(n)) return true;
  return /\b(netflix|youtube|spotify|twitch|prime video|amazon prime video|hbo max|crunchyroll|apple tv|plex|dazn|movistar|rakuten tv|pluto tv|vlc|kodi|hulu|paramount\+?|skyshowtime|filmin|atresplayer|rtve play|mitele|discord)\b/.test(n);
}
// </filas>

// -----------------------------------------------------------------------------
// Acciones
// -----------------------------------------------------------------------------
async function usuario(id: string) {
  if (!id) throw new ErrorXbox("parametros", "Falta usuario_id.", 400);
  const { data, error } = await sb.from("usuarios").select("id, xbox_sincronizado_en").eq("id", id).maybeSingle();
  if (error) throw new ErrorXbox("bd", "No se ha podido leer el usuario: " + error.message, 500);
  if (!data) throw new ErrorXbox("parametros", "Ese usuario no existe.", 404);
  return data;
}

async function leerCuenta(usuarioId: string) {
  const { data, error } = await sb.from("xbox_cuentas").select("usuario_id, xuid, gamertag, app_key").eq("usuario_id", usuarioId).maybeSingle();
  if (error) throw new ErrorXbox("bd", "No se ha podido leer la conexión: " + error.message, 500);
  return data;
}

async function conectar(usuarioId: string, code: string) {
  await usuario(usuarioId);
  const c = await canjear(code);
  const ahora = new Date().toISOString();
  const { error } = await sb.from("xbox_cuentas").upsert({
    usuario_id: usuarioId, xuid: c.xuid, gamertag: c.gamertag, app_key: c.clave, actualizado_en: ahora,
  }, { onConflict: "usuario_id" });
  if (error) throw new ErrorXbox("bd", "No se ha podido guardar la conexión: " + error.message, 500);
  const { error: e2 } = await sb.from("usuarios").update({
    xbox_gamertag: c.gamertag, xbox_xuid: c.xuid, xbox_reconectar: false, xbox_sincronizado_en: null,
  }).eq("id", usuarioId);
  if (e2) throw new ErrorXbox("bd", "No se ha podido guardar el usuario: " + e2.message, 500);

  let sincronizacion: Record<string, unknown>;
  try {
    sincronizacion = await sincronizar(usuarioId);
  } catch (e) {
    sincronizacion = e instanceof ErrorXbox
      ? { ok: false, codigo: e.codigo, error: e.message }
      : { ok: false, codigo: "interno", error: (e as Error).message };
  }
  return { ok: true, gamertag: c.gamertag, sincronizacion };
}

async function sincronizar(usuarioId: string) {
  const u = await usuario(usuarioId);
  const c = await leerCuenta(usuarioId);
  if (!c) throw new ErrorXbox("sin_conectar", "Primero conecta tu cuenta de Xbox.");
  // Una sincronización cada 10 minutos como mucho (límite de OpenXBL).
  const ultima = u.xbox_sincronizado_en ? new Date(u.xbox_sincronizado_en).getTime() : 0;
  const falta = ultima + ESPERA_MS - Date.now();
  if (falta > 0) {
    throw new ErrorXbox("espera", `Acabas de sincronizar. Podrás volver a hacerlo en ${Math.ceil(falta / 60000)} min.`, 200, { segundos: Math.ceil(falta / 1000) });
  }

  // UNA petición: el historial de títulos con sus logros.
  const d = await api(c.app_key, "achievements", usuarioId);
  const titulos: any[] = d?.titles ?? d?.content?.titles ?? [];
  const ahora = new Date().toISOString();
  const filas = titulos.map((t) => filaXbox(t, usuarioId, ahora)).filter(Boolean) as ReturnType<typeof filaXbox>[];
  const apps = filas.filter((f) => f!.es_app || esAppXbox(f!.nombre_psn));

  // Lo que ya tenía (para que lo nuevo entre "por revisar" y lo de antes conserve su estado).
  const { data: previas } = await sb.from("biblioteca").select("psn_title_id").eq("usuario_id", usuarioId).eq("fuente", "xbox");
  const yaTenia = new Set((previas ?? []).map((x) => x.psn_title_id));
  const limpia = ({ es_app: _, ...f }: Record<string, any>) => f;
  const nuevas = filas.filter((f) => !yaTenia.has(f!.psn_title_id)).map((f) => {
    const app = apps.includes(f);
    return { ...limpia(f!), por_revisar: !app, oculto: app };
  });
  const viejas = filas.filter((f) => yaTenia.has(f!.psn_title_id)).map((f) => limpia(f!));
  for (const grupo of [nuevas, viejas]) {
    for (let i = 0; i < grupo.length; i += 200) {
      const { error } = await sb.from("biblioteca").upsert(grupo.slice(i, i + 200), { onConflict: "usuario_id,psn_title_id" });
      if (error) throw new ErrorXbox("bd", "No se ha podido guardar la biblioteca: " + error.message, 500);
    }
  }

  // Las apps se marcan como "no es un juego" (se ocultan solas, como en PSN).
  if (apps.length) {
    await sb.from("psn_igdb").upsert(apps.map((f) => ({
      psn_title_id: f!.psn_title_id, igdb_id: null, confirmado: false, nombre_psn: f!.nombre_psn,
      tipo: "no_juego", confianza: 100, algoritmo: 3, juegos: null, propuesta_id: null, actualizado_en: ahora,
    })), { onConflict: "psn_title_id", ignoreDuplicates: true });
  }
  await sb.from("usuarios").update({ xbox_sincronizado_en: ahora, xbox_reconectar: false, xbox_gamertag: c.gamertag }).eq("id", usuarioId);

  // Emparejar con IGDB: lo común a todas las plataformas lo hace la función psn.
  let pendientes = 0;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/psn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "reprocesar", usuario_id: usuarioId }),
    });
    const e = await r.json().catch(() => null);
    pendientes = Number(e?.pendientes ?? 0);
  } catch (e) {
    console.warn("Emparejar (psn reprocesar):", (e as Error).message);
  }

  return {
    ok: true,
    juegos: filas.length - apps.length,
    apps: apps.length,
    nuevos: nuevas.filter((f) => f.por_revisar).length,
    pendientes, // se están emparejando en segundo plano
    sincronizado_en: ahora,
  };
}

async function desconectar(usuarioId: string) {
  await usuario(usuarioId);
  const { error: e1 } = await sb.from("xbox_cuentas").delete().eq("usuario_id", usuarioId);
  const { error: e2 } = await sb.from("biblioteca").delete().eq("usuario_id", usuarioId).eq("fuente", "xbox");
  const { error: e3 } = await sb.from("usuarios").update({
    xbox_gamertag: null, xbox_xuid: null, xbox_sincronizado_en: null, xbox_reconectar: false,
  }).eq("id", usuarioId);
  const error = e1 ?? e2 ?? e3;
  if (error) throw new ErrorXbox("bd", "No se ha podido desconectar: " + error.message, 500);
  return { ok: true };
}

async function estado(usuarioId: string) {
  const u = await usuario(usuarioId);
  const c = await leerCuenta(usuarioId);
  return {
    ok: true,
    clave_publica_puesta: !!CLAVE_PUBLICA,
    conectado: !!c,
    gamertag: c?.gamertag ?? null,
    xuid: c?.xuid ?? null,
    sincronizado_en: u.xbox_sincronizado_en ?? null,
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
      throw new ErrorXbox("parametros", "El cuerpo debe ser JSON", 400);
    }
    const uid = String(c.usuario_id ?? "");
    switch (c.accion) {
      case "login":
        if (!CLAVE_PUBLICA) throw new ErrorXbox("falta_clave", "Falta el secreto OPENXBL_PUBLIC_KEY en Supabase.");
        return json({ ok: true, url: `https://xbl.io/app/auth/${encodeURIComponent(CLAVE_PUBLICA)}` });
      case "conectar": return json(await conectar(uid, String(c.code ?? "")));
      case "sincronizar": return json(await sincronizar(uid));
      case "desconectar": return json(await desconectar(uid));
      case "estado": return json(await estado(uid));
      default: throw new ErrorXbox("parametros", 'Acción desconocida (usa "conectar", "sincronizar", "desconectar" o "estado")', 400);
    }
  } catch (e) {
    if (e instanceof ErrorXbox) return json({ ok: false, codigo: e.codigo, error: e.message, ...e.extra }, e.estado);
    console.error(e);
    return json({ ok: false, codigo: "interno", error: "Error interno de la función xbox" }, 500);
  }
});
