// =============================================================================
// CVJ · Edge Function "admin": gestionar el grupo desde la app (solo admin).
// Desplegar con "Verify JWT" DESACTIVADO (la llama la app con la clave pública).
//
// Comprueba que quien llama (admin_id) es admin en la tabla usuarios. Entre amigos
// no hace falta más: la app no tiene Supabase Auth. El código personal NUNCA llega
// aquí: la app lo genera, lo enseña una vez y solo manda su hash (SHA-256 del
// código normalizado, el mismo que comprueba el login).
//
// Peticiones (POST, JSON) → { ok: true, ... } o { ok: false, codigo, error }:
//   { "accion": "crear", "admin_id", "nombre", "color", "codigo_hash", "propuesta_id"? }
//       con propuesta_id: la persona entra por esa propuesta (queda aceptada y enlazada)
//   { "accion": "nuevo_codigo", "admin_id", "usuario_id", "codigo_hash" }
//   { "accion": "editar", "admin_id", "usuario_id", "nombre"?, "color"? }
//   { "accion": "activo", "admin_id", "usuario_id", "activo": true|false }   (versiones de antes)
// El cementerio (todo en admin_vida(), migración 036, en una sola transacción):
//   { "accion": "expulsar", "admin_id", "usuario_id", "causa"? }
//   { "accion": "exorcizar", "admin_id", "usuario_id", "causa"? }   expulsión permanente
//   { "accion": "levantar", "admin_id", "usuario_id" }              levantar el exorcismo
//   { "accion": "readmitir", "admin_id", "usuario_id" }             volver a la vida, sin esperar
//   { "accion": "vetar" | "permitir", "admin_id", "reanimacion_id" } un intento de reanimación
// Propuestas de nuevos miembros (admin_propuesta(), migración 037):
//   { "accion": "aparcar" | "reabrir", "admin_id", "propuesta_id" }
//   { "accion": "rechazar", "admin_id", "propuesta_id", "motivo"? }   "no pasó el casting"
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const CAMPOS = "id, nombre, inicial, color, acento, creado_en, foto_url, es_admin, activo";

function json(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, "Content-Type": "application/json" } });
}
class ErrorAdmin extends Error {
  constructor(public codigo: string, mensaje: string, public estado = 400) { super(mensaje); }
}

/** Nombre tal cual lo escriba, sin espacios de más (hasta 30 caracteres). */
function limpiarNombre(n: unknown): string {
  const s = String(n ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
  if (!s) throw new ErrorAdmin("nombre", "Escribe un nombre.");
  return s;
}
const inicialDe = (nombre: string) => (nombre.match(/\p{L}|\p{N}/u)?.[0] ?? "?").toUpperCase();

async function comprobarAdmin(id: unknown) {
  if (!UUID.test(String(id ?? ""))) throw new ErrorAdmin("no_admin", "Solo el admin puede hacer esto.", 403);
  const { data, error } = await sb.from("usuarios").select("es_admin, activo").eq("id", id).maybeSingle();
  if (error) throw new ErrorAdmin("bd", error.message, 500);
  if (!data?.es_admin || data.activo === false) throw new ErrorAdmin("no_admin", "Solo el admin puede hacer esto.", 403);
}

/** El hash no puede ser el de otra persona (dos personas con el mismo código). */
async function hashLibre(hash: string, menos?: string) {
  if (!HASH.test(hash)) throw new ErrorAdmin("parametros", "Falta el código.");
  let q = sb.from("usuarios").select("id").eq("codigo_hash", hash);
  if (menos) q = q.neq("id", menos);
  const { data } = await q;
  if (data?.length) throw new ErrorAdmin("repetido", "Ese código ya lo tiene otra persona. Genera otro.");
}

async function crear(c: Record<string, unknown>) {
  const nombre = limpiarNombre(c.nombre);
  const color = COLOR.test(String(c.color ?? "")) ? String(c.color) : "#6D28D9";
  const hash = String(c.codigo_hash ?? "").toLowerCase();
  // Si viene de una propuesta, tiene que seguir sin decidir (antes de crear a nadie).
  const propuesta = c.propuesta_id ? String(c.propuesta_id) : null;
  if (propuesta) {
    if (!UUID.test(propuesta)) throw new ErrorAdmin("parametros", "Esa propuesta no existe.", 404);
    const { data: p } = await sb.from("propuestas").select("estado").eq("id", propuesta).maybeSingle();
    if (!p) throw new ErrorAdmin("parametros", "Esa propuesta no existe.", 404);
    if (p.estado !== "abierta" && p.estado !== "aparcada") throw new ErrorAdmin("decidida", "Esa propuesta ya está decidida.");
  }
  await hashLibre(hash);
  const { data, error } = await sb.from("usuarios")
    .insert({ nombre, inicial: inicialDe(nombre), color, codigo_hash: hash, activo: true })
    .select(CAMPOS).single();
  if (error) throw new ErrorAdmin("bd", "No se ha podido crear: " + error.message, 500);
  if (propuesta) {
    const { data: r, error: e2 } = await sb.rpc("admin_propuesta", {
      p_admin: c.admin_id, p_accion: "aceptar", p_propuesta: propuesta, p_motivo: null, p_usuario: data.id,
    });
    // La persona ya está creada: si no se puede enlazar, se dice, pero el código vale.
    if (e2 || !r?.ok) return { ok: true, usuario: data, aviso: "Creado, pero no se ha podido enlazar con la propuesta." };
  }
  return { ok: true, usuario: data };
}

async function nuevoCodigo(c: Record<string, unknown>) {
  const id = String(c.usuario_id ?? "");
  if (!UUID.test(id)) throw new ErrorAdmin("parametros", "Ese usuario no existe.", 404);
  const hash = String(c.codigo_hash ?? "").toLowerCase();
  await hashLibre(hash, id);
  const { data, error } = await sb.from("usuarios").update({ codigo_hash: hash }).eq("id", id).select("id").maybeSingle();
  if (error) throw new ErrorAdmin("bd", error.message, 500);
  if (!data) throw new ErrorAdmin("parametros", "Ese usuario no existe.", 404);
  return { ok: true };
}

async function editar(c: Record<string, unknown>) {
  const id = String(c.usuario_id ?? "");
  if (!UUID.test(id)) throw new ErrorAdmin("parametros", "Ese usuario no existe.", 404);
  const cambios: Record<string, unknown> = {};
  if (c.nombre !== undefined) { cambios.nombre = limpiarNombre(c.nombre); cambios.inicial = inicialDe(cambios.nombre as string); }
  if (c.color !== undefined) {
    if (!COLOR.test(String(c.color))) throw new ErrorAdmin("parametros", "Color no válido.");
    cambios.color = c.color;
  }
  if (!Object.keys(cambios).length) return { ok: true };
  const { data, error } = await sb.from("usuarios").update(cambios).eq("id", id).select(CAMPOS).maybeSingle();
  if (error) throw new ErrorAdmin("bd", error.message, 500);
  if (!data) throw new ErrorAdmin("parametros", "Ese usuario no existe.", 404);
  return { ok: true, usuario: data };
}

/** Expulsar, exorcizar, levantar, readmitir, vetar o permitir ya (admin_vida, migración 036). */
async function vida(accion: string, c: Record<string, unknown>) {
  const esIntento = accion === "vetar" || accion === "permitir";
  const usuario = esIntento ? null : String(c.usuario_id ?? "");
  const reanimacion = esIntento ? String(c.reanimacion_id ?? "") : null;
  if (usuario !== null && !UUID.test(usuario)) throw new ErrorAdmin("parametros", "Ese usuario no existe.", 404);
  if (reanimacion !== null && !UUID.test(reanimacion)) throw new ErrorAdmin("parametros", "Ese intento no existe.", 404);
  const causa = typeof c.causa === "string" ? c.causa.slice(0, 140) : null;
  const { data, error } = await sb.rpc("admin_vida", {
    p_admin: c.admin_id, p_accion: accion, p_usuario: usuario, p_causa: causa, p_reanimacion: reanimacion,
  });
  if (error) throw new ErrorAdmin("bd", error.message, 500);
  if (!data?.ok) throw new ErrorAdmin(data?.codigo ?? "parametros", data?.error ?? "No se ha podido hacer.");
  return { ok: true };
}

/** Aparcar, reabrir o rechazar una propuesta (admin_propuesta, migración 037). */
async function propuesta(accion: string, c: Record<string, unknown>) {
  const id = String(c.propuesta_id ?? "");
  if (!UUID.test(id)) throw new ErrorAdmin("parametros", "Esa propuesta no existe.", 404);
  const motivo = typeof c.motivo === "string" ? c.motivo.slice(0, 140) : null;
  const { data, error } = await sb.rpc("admin_propuesta", { p_admin: c.admin_id, p_accion: accion, p_propuesta: id, p_motivo: motivo, p_usuario: null });
  if (error) throw new ErrorAdmin("bd", error.message, 500);
  if (!data?.ok) throw new ErrorAdmin(data?.codigo ?? "parametros", data?.error ?? "No se ha podido hacer.");
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, codigo: "parametros", error: "Usa POST" }, 405);
  let c: Record<string, unknown> = {};
  try { c = await req.json(); } catch { return json({ ok: false, codigo: "parametros", error: "El cuerpo debe ser JSON" }, 400); }
  try {
    await comprobarAdmin(c.admin_id);
    switch (c.accion) {
      case "crear": return json(await crear(c));
      case "nuevo_codigo": return json(await nuevoCodigo(c));
      case "editar": return json(await editar(c));
      // Versiones de antes de la app: desactivar = expulsar sin causa; reactivar = readmitir.
      case "activo": return json(await vida(c.activo === false ? "expulsar" : "readmitir", c));
      case "expulsar": case "exorcizar": case "levantar": case "readmitir": case "vetar": case "permitir":
        return json(await vida(String(c.accion), c));
      case "aparcar": case "reabrir": case "rechazar":
        return json(await propuesta(String(c.accion), c));
      default: return json({ ok: false, codigo: "parametros", error: "Acción desconocida" }, 400);
    }
  } catch (e) {
    if (e instanceof ErrorAdmin) {
      if (e.estado >= 500) console.error(`admin ${c.accion}: ${e.message}`);
      return json({ ok: false, codigo: e.codigo, error: e.message }, e.estado);
    }
    console.error(e);
    return json({ ok: false, codigo: "interno", error: "Error interno de la función admin" }, 500);
  }
});
