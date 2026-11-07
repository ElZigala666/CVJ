// =============================================================================
// CVJ · Edge Function "xbox": biblioteca de Xbox con OpenXBL (xbl.io).
// Todo en un archivo para pegarlo en el editor de funciones del panel de Supabase.
// Desplegar con "Verify JWT" / "Enforce JWT verification" DESACTIVADO.
//
// Usa UNA clave de API personal de OpenXBL (la de Marcos) para leer el historial de
// cada usuario por su gamertag; nadie tiene que iniciar sesión.
// Secreto necesario: OPENXBL_API_KEY. SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los
// inyecta Supabase.
//
// Endpoints (comprobados en la especificación actual, https://api.xbl.io/docs/json):
//   GET https://api.xbl.io/v2/search/{gamertag}   → content.people[] (xuid, gamertag)
//   GET https://api.xbl.io/v2/friends/search?gt=… → content.profileUsers[] (respaldo)
//   GET https://api.xbl.io/v2/titles/{xuid}       → content.titles[] (historial con logros)
// Cabecera: X-Authorization: {clave}. (X-Contract: 100 solo era para el antiguo
// flujo de "app keys"; con una clave personal la documentación no lo pide.)
//
// Límite gratuito: ~150 peticiones por hora PARA TODO EL GRUPO (es una sola clave).
// Vincular = 1 petición (+1 de sincronización); sincronizar = 1 petición, y como
// mucho una cada 10 minutos por usuario. Nada de peticiones por juego (sin horas).
//
// Peticiones (POST, JSON). Respuesta siempre JSON: { ok: true, ... } o { ok: false, codigo, error }.
//   { "accion": "vincular", "usuario_id": "...", "gamertag": "..." }
//   { "accion": "sincronizar", "usuario_id": "..." }
//   { "accion": "desvincular", "usuario_id": "..." }
//   { "accion": "estado" }   (¿está la clave puesta y funciona? para probar)
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
const CLAVE = (Deno.env.get("OPENXBL_API_KEY") ?? "").trim();
const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const API = "https://api.xbl.io/v2";
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

/** Apunta si la clave de OpenXBL funciona (lo ve el admin en Inicio). Sin la migración 008, nada. */
async function anotarClave(ok: boolean, mensaje: string | null = null) {
  const { error } = await sb.from("estado_servicios").upsert(
    { id: "openxbl", ok, mensaje, actualizado_en: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (error && !/estado_servicios/.test(error.message)) console.warn("estado_servicios:", error.message);
}

// -----------------------------------------------------------------------------
// OpenXBL
// -----------------------------------------------------------------------------
/** GET con la clave de API. "privado" solo cuando se pide el historial de otro (sePuedeOcultar). */
async function api(ruta: string, sePuedeOcultar = false) {
  if (!CLAVE) throw new ErrorXbox("falta_clave", "Falta el secreto OPENXBL_API_KEY en Supabase.");
  const r = await fetch(`${API}/${ruta}`, {
    headers: { "X-Authorization": CLAVE, Accept: "application/json", "Accept-Language": "es-ES,es" },
  });
  const d = await r.json().catch(() => null);
  if (r.status === 401) {
    await anotarClave(false, "OpenXBL no acepta la clave de API (401).");
    throw new ErrorXbox("clave_api", "La conexión del grupo con Xbox no funciona ahora mismo. El admin tiene que revisarla.");
  }
  if (r.status === 403) {
    if (sePuedeOcultar) throw new ErrorXbox("privado", "Tu historial de juegos de Xbox no es visible. Cambia la privacidad y vuelve a sincronizar.");
    await anotarClave(false, "OpenXBL responde 403 con la clave de API.");
    throw new ErrorXbox("clave_api", "La conexión del grupo con Xbox no funciona ahora mismo. El admin tiene que revisarla.");
  }
  if (r.status === 429) throw new ErrorXbox("limite", "Xbox ha llegado a su límite de peticiones por hora para el grupo. Prueba más tarde.");
  if (!r.ok || !d) {
    console.error(`OpenXBL ${ruta}:`, r.status, JSON.stringify(d).slice(0, 300));
    throw new ErrorXbox("xbox_error", "Xbox no ha respondido bien. Prueba más tarde.");
  }
  await anotarClave(true);
  return d?.content ?? d; // las respuestas vienen como { content, code }
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

// <buscar> (sin dependencias: se prueba en local con node)
/** De la respuesta de /search/{gamertag} (o /friends/search), el jugador con ESE gamertag exacto. */
export function elegirJugador(content: any, gamertag: string): { xuid: string; gamertag: string } | null {
  const objetivo = String(gamertag).trim().toLowerCase().replace(/\s+/g, " ");
  const igual = (g: unknown) => String(g ?? "").trim().toLowerCase().replace(/\s+/g, " ") === objetivo;
  for (const p of content?.people ?? []) {
    if (p?.xuid && igual(p.gamertag)) return { xuid: String(p.xuid), gamertag: String(p.gamertag) };
  }
  for (const p of content?.profileUsers ?? []) {
    const gt = (p?.settings ?? []).find((s: any) => s?.id === "Gamertag")?.value;
    if (p?.id && igual(gt ?? gamertag)) return { xuid: String(p.id), gamertag: String(gt ?? gamertag) };
  }
  return null;
}
// </buscar>

// -----------------------------------------------------------------------------
// Acciones
// -----------------------------------------------------------------------------
async function usuario(id: string) {
  if (!id) throw new ErrorXbox("parametros", "Falta usuario_id.", 400);
  const { data, error } = await sb.from("usuarios").select("id, xbox_xuid, xbox_gamertag, xbox_sincronizado_en").eq("id", id).maybeSingle();
  if (error) throw new ErrorXbox("bd", "No se ha podido leer el usuario: " + error.message, 500);
  if (!data) throw new ErrorXbox("parametros", "Ese usuario no existe.", 404);
  return data;
}

async function vincular(usuarioId: string, texto: string) {
  const u = await usuario(usuarioId);
  const gamertag = String(texto ?? "").trim();
  if (!/^[A-Za-z0-9 #]{1,20}$/.test(gamertag)) {
    throw new ErrorXbox("gamertag_no_valido", "Ese gamertag no parece válido: letras, números y espacios (hasta 15), y si tiene sufijo, con # (p. ej. Nombre#1234).");
  }
  let jugador = elegirJugador(await api(`search/${encodeURIComponent(gamertag)}`), gamertag);
  if (!jugador) jugador = elegirJugador(await api(`friends/search?gt=${encodeURIComponent(gamertag)}`), gamertag);
  if (!jugador) throw new ErrorXbox("no_existe", `No hay ningún jugador de Xbox con el gamertag «${gamertag}». Revisa que esté bien escrito.`);

  // Otro gamertag distinto del de antes: su biblioteca de Xbox vieja fuera.
  if (u.xbox_xuid && u.xbox_xuid !== jugador.xuid) await sb.from("biblioteca").delete().eq("usuario_id", usuarioId).eq("fuente", "xbox");
  const { error } = await sb.from("usuarios").update({
    xbox_xuid: jugador.xuid, xbox_gamertag: jugador.gamertag, xbox_sincronizado_en: null, xbox_reconectar: false,
  }).eq("id", usuarioId);
  if (error) throw new ErrorXbox("bd", "No se ha podido guardar: " + error.message, 500);

  let sincronizacion: Record<string, unknown>;
  try {
    sincronizacion = await sincronizar(usuarioId);
  } catch (e) {
    sincronizacion = e instanceof ErrorXbox
      ? { ok: false, codigo: e.codigo, error: e.message }
      : { ok: false, codigo: "interno", error: (e as Error).message };
  }
  return { ok: true, gamertag: jugador.gamertag, xuid: jugador.xuid, sincronizacion };
}

async function sincronizar(usuarioId: string) {
  const u = await usuario(usuarioId);
  if (!u.xbox_xuid) throw new ErrorXbox("sin_vincular", "Primero vincula tu gamertag de Xbox.");
  // Una sincronización cada 10 minutos como mucho (el límite es de todo el grupo).
  const ultima = u.xbox_sincronizado_en ? new Date(u.xbox_sincronizado_en).getTime() : 0;
  const falta = ultima + ESPERA_MS - Date.now();
  if (falta > 0) {
    throw new ErrorXbox("espera", `Acabas de sincronizar. Podrás volver a hacerlo en ${Math.ceil(falta / 60000)} min.`, 200, { segundos: Math.ceil(falta / 1000) });
  }

  // UNA petición: el historial de títulos (con logros) de ese jugador.
  const d = await api(`titles/${encodeURIComponent(u.xbox_xuid)}`, true);
  const titulos: any[] = d?.titles ?? [];
  if (!titulos.length) {
    throw new ErrorXbox("privado", "No se ve ningún juego en tu historial de Xbox: seguramente es privado. Cambia la privacidad y vuelve a sincronizar.");
  }
  const ahora = new Date().toISOString();
  const filas = titulos.map((t) => filaXbox(t, usuarioId, ahora)).filter(Boolean) as NonNullable<ReturnType<typeof filaXbox>>[];
  const apps = filas.filter((f) => f.es_app || esAppXbox(f.nombre_psn));

  // Lo que ya tenía conserva su revisión y su "oculto"; lo nuevo entra "por revisar".
  const { data: previas } = await sb.from("biblioteca").select("psn_title_id").eq("usuario_id", usuarioId).eq("fuente", "xbox");
  const yaTenia = new Set((previas ?? []).map((x) => x.psn_title_id));
  const limpia = ({ es_app: _, ...f }: Record<string, any>) => f;
  const nuevas = filas.filter((f) => !yaTenia.has(f.psn_title_id)).map((f) => {
    const app = apps.includes(f);
    return { ...limpia(f), por_revisar: !app, oculto: app };
  });
  const viejas = filas.filter((f) => yaTenia.has(f.psn_title_id)).map((f) => limpia(f));
  for (const grupo of [nuevas, viejas]) {
    for (let i = 0; i < grupo.length; i += 200) {
      const { error } = await sb.from("biblioteca").upsert(grupo.slice(i, i + 200), { onConflict: "usuario_id,psn_title_id" });
      if (error) throw new ErrorXbox("bd", "No se ha podido guardar la biblioteca: " + error.message, 500);
    }
  }
  if (apps.length) {
    await sb.from("psn_igdb").upsert(apps.map((f) => ({
      psn_title_id: f.psn_title_id, igdb_id: null, confirmado: false, nombre_psn: f.nombre_psn,
      tipo: "no_juego", confianza: 100, algoritmo: 3, juegos: null, propuesta_id: null, actualizado_en: ahora,
    })), { onConflict: "psn_title_id", ignoreDuplicates: true });
  }
  await sb.from("usuarios").update({ xbox_sincronizado_en: ahora }).eq("id", usuarioId);

  // Emparejar con IGDB: lo común a todas las plataformas lo hace la función psn.
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
    juegos: filas.length - apps.length,
    apps: apps.length,
    nuevos: nuevas.filter((f) => f.por_revisar).length,
    pendientes,
    sincronizado_en: ahora,
  };
}

async function desvincular(usuarioId: string) {
  await usuario(usuarioId);
  const { error: e1 } = await sb.from("biblioteca").delete().eq("usuario_id", usuarioId).eq("fuente", "xbox");
  const { error: e2 } = await sb.from("usuarios").update({
    xbox_gamertag: null, xbox_xuid: null, xbox_sincronizado_en: null, xbox_reconectar: false,
  }).eq("id", usuarioId);
  const error = e1 ?? e2;
  if (error) throw new ErrorXbox("bd", "No se ha podido desvincular: " + error.message, 500);
  return { ok: true };
}

/** ¿Está la clave y funciona? (una petición barata: la cuenta dueña de la clave) */
async function estado() {
  if (!CLAVE) return { ok: true, clave_puesta: false, funciona: false };
  try {
    const d = await api("account");
    const gt = (d?.profileUsers?.[0]?.settings ?? []).find((s: any) => s?.id === "Gamertag")?.value ?? null;
    return { ok: true, clave_puesta: true, funciona: true, cuenta: gt };
  } catch (e) {
    return { ok: true, clave_puesta: true, funciona: false, codigo: (e as ErrorXbox).codigo ?? "interno", error: (e as Error).message };
  }
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
      case "vincular": return json(await vincular(uid, String(c.gamertag ?? "")));
      case "sincronizar": return json(await sincronizar(uid));
      case "desvincular": return json(await desvincular(uid));
      case "estado": return json(await estado());
      default: throw new ErrorXbox("parametros", 'Acción desconocida (usa "vincular", "sincronizar", "desvincular" o "estado")', 400);
    }
  } catch (e) {
    if (e instanceof ErrorXbox) return json({ ok: false, codigo: e.codigo, error: e.message, ...e.extra }, e.estado);
    console.error(e);
    return json({ ok: false, codigo: "interno", error: "Error interno de la función xbox" }, 500);
  }
});
