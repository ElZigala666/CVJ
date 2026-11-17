// Llamadas a la Edge Function "admin" (gestionar el grupo y el cementerio). La función
// comprueba que quien llama es admin; aquí solo se manda quién soy.
import { SUPABASE_BASE, SUPABASE_KEY } from './config.js';
import { usuarioActual } from './sesion.js';

const URL_ADMIN = `${SUPABASE_BASE}/functions/v1/admin`;

/** → { ok: true, ... } o { ok: false, error } (nunca lanza). */
export async function llamarAdmin(accion, extra = {}) {
  try {
    const r = await fetch(URL_ADMIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ accion, admin_id: usuarioActual()?.id, ...extra }),
    });
    const d = await r.json().catch(() => null);
    if (!d) return { ok: false, error: r.status === 404 ? 'La gestión del grupo aún no está activada.' : `Respuesta ${r.status}` };
    return d;
  } catch {
    return { ok: false, error: 'Sin conexión. Prueba otra vez en un momento.' };
  }
}
