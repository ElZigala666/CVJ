// Llamadas a la Edge Function "igdb" (proxy de IGDB en Supabase).
import { URL_FUNCION_IGDB, SUPABASE_KEY } from './config.js';

async function llamar(cuerpo, signal) {
  const r = await fetch(URL_FUNCION_IGDB, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body: JSON.stringify(cuerpo),
    signal,
  });
  let datos = null;
  try { datos = await r.json(); } catch { /* respuesta sin JSON */ }
  if (!r.ok) throw new Error(datos?.error || `Error ${r.status}`);
  return datos;
}

/** Busca juegos. Devuelve [{ igdb_id, nombre, anio, cover_id, plataformas }]. */
export async function buscarJuegos(texto, signal) {
  const d = await llamar({ accion: 'buscar', texto }, signal);
  return d?.resultados ?? [];
}

let onlineRevisado = false;
/**
 * Una vez por sesión: si hay juegos guardados sin saber si son online (antes de la
 * migración 005), la función los revisa con los datos de IGDB. En segundo plano.
 * @param {object[]} juegos  la tabla juegos en memoria
 * @param {() => void} alTerminar  p. ej. refrescar los datos
 */
export function revisarOnline(juegos, alTerminar) {
  if (onlineRevisado || !juegos.length || !('es_online' in juegos[0])) return;
  if (!juegos.some((j) => j.es_online === null)) return;
  onlineRevisado = true;
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 3000)))(() => {
    llamar({ accion: 'revisar_online' })
      .then((r) => { if (r?.revisados) alTerminar?.(); })
      .catch((e) => console.info('[igdb] Revisar online:', e.message));
  });
}

/** Ficha completa (y la guarda en la tabla juegos desde el servidor). */
export async function fichaJuego(igdbId, signal) {
  const d = await llamar({ accion: 'juego', igdb_id: Number(igdbId) }, signal);
  return d?.juego ?? null;
}
