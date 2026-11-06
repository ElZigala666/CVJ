// Normalizado y hash del código personal.
// Lo usan el login (sesion.js) y herramientas/generar-hash.html: así los dos
// calculan exactamente el mismo hash.

/** ' k7q 2ab ' → 'K7Q2AB' (mayúsculas y sin espacios de ningún tipo). */
export function normalizarCodigo(codigo) {
  return String(codigo || '').replace(/\s+/g, '').toUpperCase();
}

/** SHA-256 en hexadecimal (minúsculas) del código ya normalizado. */
export async function hashCodigo(codigo) {
  const datos = new TextEncoder().encode(normalizarCodigo(codigo));
  const buf = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Código aleatorio de 6 caracteres sin letras que se confundan (sin O/0, I/1/L). */
export function codigoAleatorio(largo = 6) {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint32Array(largo));
  return Array.from(r, (n) => alfabeto[n % alfabeto.length]).join('');
}

export const LARGO_CODIGO = 6;
