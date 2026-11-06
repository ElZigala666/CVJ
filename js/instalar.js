// Instalar la app: registro del service worker, aviso de versión nueva y botón
// "Instalar app" (Android/Chrome: beforeinstallprompt; iPhone: pasos a mano).

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

  registrarServiceWorker();
}

// ---------------------------------------------------------------------------
// Service worker y aviso de versión nueva
// ---------------------------------------------------------------------------
const REVISAR_CADA_MS = 30 * 60 * 1000;

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  // Al activarse la versión nueva (tras pulsar "Actualizar"), recargar una vez.
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!navigator.serviceWorker.controller || recargando || !esperandoRecarga) return;
    recargando = true;
    location.reload();
  });

  navigator.serviceWorker
    // updateViaCache 'none': sw.js nunca sale de la caché HTTP (así se detectan las versiones nuevas).
    .register('sw.js', { scope: './', updateViaCache: 'none' })
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) mostrarAvisoVersion(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        nuevo?.addEventListener('statechange', () => {
          // "installed" con una versión ya controlando la página = versión nueva esperando.
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) mostrarAvisoVersion(nuevo);
        });
      });
      const revisar = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar(); });
      setInterval(revisar, REVISAR_CADA_MS);
    })
    .catch((e) => console.warn('[sw] No se ha podido registrar:', e.message));
}

let esperandoRecarga = false;

/** Aviso discreto abajo: "Nueva versión disponible · Actualizar". */
function mostrarAvisoVersion(trabajador) {
  if (document.getElementById('aviso-version')) return;
  const el = document.createElement('div');
  el.id = 'aviso-version';
  el.setAttribute('role', 'status');
  el.innerHTML = '<span>Nueva versión disponible</span><button type="button">Actualizar</button>';
  el.querySelector('button').addEventListener('click', () => {
    esperandoRecarga = true;
    el.querySelector('button').disabled = true;
    el.querySelector('button').textContent = 'Actualizando…';
    trabajador.postMessage({ tipo: 'activar' });
    // Por si el navegador no emite controllerchange (raro): recargar igualmente.
    setTimeout(() => location.reload(), 4000);
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
}
