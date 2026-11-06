// Instalar la app: service worker mínimo + botón "Instalar app".
// En Android/Chrome se usa beforeinstallprompt; en iPhone se enseñan los pasos.

let aviso = null;          // evento beforeinstallprompt guardado para usarlo luego
const oyentes = new Set();

/** ¿La app ya se está usando instalada? */
export function estaInstalada() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/** iPhone / iPad (incluido el iPad que dice ser un Mac). */
export function esIOS() {
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/** 'instalada' | 'nativo' (hay aviso del navegador) | 'ios' | 'manual' */
export function modoInstalacion() {
  if (estaInstalada()) return 'instalada';
  if (aviso) return 'nativo';
  if (esIOS()) return 'ios';
  return 'manual';
}

export function alCambiar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
const avisar = () => oyentes.forEach((fn) => { try { fn(modoInstalacion()); } catch (e) { console.error(e); } });

/** Lanza el diálogo de instalación del navegador. Devuelve true si se aceptó. */
export async function instalar() {
  if (!aviso) return false;
  const e = aviso;
  aviso = null;
  e.prompt();
  const { outcome } = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
  avisar();
  return outcome === 'accepted';
}

/** Se llama una vez al arrancar. */
export function iniciarInstalacion() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // que no salga solo: lo enseñamos desde el botón
    aviso = e;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    aviso = null;
    avisar();
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', avisar);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch((e) => {
      console.warn('[sw] No se ha podido registrar:', e.message);
    });
  }
}
