// Configuración pública de CVJ (se puede ver en el navegador, no hay secretos aquí).
export const SUPABASE_URL = "https://pthjktvmiaijhzvsbrnv.supabase.co/rest/v1/";
export const SUPABASE_KEY = "sb_publishable_enXl1Qi5LW2Prppvt3kKHg_jVL00-Gb";

// supabase-js necesita la URL base del proyecto (sin /rest/v1/).
export const SUPABASE_BASE = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

// Edge Function que hace de proxy de IGDB.
export const URL_FUNCION_IGDB = `${SUPABASE_BASE}/functions/v1/igdb`;

// Versión fijada de supabase-js (ESM por CDN).
export const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/+esm';
