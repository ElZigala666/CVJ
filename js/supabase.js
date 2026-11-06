// Cliente de Supabase cargado bajo demanda: la primera pantalla se pinta desde
// localStorage sin esperar a descargar supabase-js.
import { SUPABASE_BASE, SUPABASE_KEY, SUPABASE_JS } from './config.js';

let promesa = null;

export function cliente() {
  if (!promesa) {
    promesa = import(SUPABASE_JS)
      .then(({ createClient }) =>
        createClient(SUPABASE_BASE, SUPABASE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      )
      .catch((e) => {
        promesa = null; // permitir reintentar si falló la descarga
        throw e;
      });
  }
  return promesa;
}
