// Service worker de CVJ: carga instantánea sin quedarse nunca en versiones viejas.
//
// VERSION la sustituye el workflow de GitHub Actions por el hash del commit al
// publicar (ver .github/workflows/pages.yml). Cada versión tiene su propia caché
// del "app shell"; al activarse una versión nueva se borran las anteriores.
//
// Estrategias:
//   index.html (navegación)   red primero, con 2 s de margen; si no, la copia guardada
//   CSS, JS, iconos, manifest  stale-while-revalidate (al instante + se actualiza detrás)
//   Google Fonts               caché primero
//   supabase-js (jsdelivr)     caché primero (la URL lleva la versión fijada)
//   Portadas de IGDB           caché primero, máximo 400 (las más antiguas se borran)
//   Supabase (API y función)   NUNCA pasan por aquí: los datos los gestiona datos.js
//
// Actualizaciones: la versión nueva se queda esperando hasta que el usuario toca
// "Actualizar" (la página le manda {tipo: 'activar'}). Nada de recargas solas.

const VERSION = '__VERSION__';
const CACHE_APP = `cvj-app-${VERSION}`;
const CACHE_PORTADAS = 'cvj-portadas';
const CACHE_FUENTES = 'cvj-fuentes';
const CACHE_CDN = 'cvj-cdn';
const PERMANENTES = [CACHE_PORTADAS, CACHE_FUENTES, CACHE_CDN];
const MAX_PORTADAS = 400;
const ESPERA_HTML_MS = 2000;

// Archivos del app shell. El workflow sustituye esta línea por la lista real de
// archivos publicados; en local se usa esta.
const ARCHIVOS = ['./', 'index.html', 'manifest.webmanifest', 'css/tokens.css', 'css/app.css', 'js/app.js', 'js/version.js', 'js/icons.js', 'js/sesion.js', 'js/datos.js', 'js/ui.js', 'js/instalar.js', 'js/tema.js', 'js/acento.js', 'js/navegacion.js', 'js/portadas.js', 'js/notas.js', 'js/config.js', 'js/supabase.js', 'js/codigo.js', 'js/igdb.js', 'js/metricas.js', 'js/hoja.js', 'js/hoja-valorar.js', 'js/ajustes.js', 'js/refrescar.js', 'js/pantallas/entrada.js', 'js/pantallas/inicio.js', 'js/pantallas/buscar.js', 'js/pantallas/juego.js', 'js/pantallas/perfil.js', 'js/pantallas/estadisticas.js', 'js/pantallas/rankings.js', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png', 'img/apple-touch-icon.png']; // @archivos

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    // cache: 'reload' salta la caché HTTP del navegador: se guardan los archivos de ESTA versión.
    await Promise.all(ARCHIVOS.map(async (url) => {
      try {
        const r = await fetch(new Request(url, { cache: 'reload' }));
        if (r.ok) await cache.put(url, r);
      } catch { /* sin red: se guardará al usarlo */ }
    }));
    // Primera instalación (no hay ninguna versión controlando): entra directamente.
    // Si ya hay una, la nueva espera a que el usuario pulse "Actualizar".
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres
      .filter((n) => n.startsWith('cvj-') && n !== CACHE_APP && !PERMANENTES.includes(n))
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.tipo === 'activar') self.skipWaiting();
  if (event.data?.tipo === 'version') event.source?.postMessage({ tipo: 'version', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Datos de Supabase: siempre a la red, sin tocarlos.
  if (url.hostname.endsWith('supabase.co')) return;

  if (url.hostname === 'images.igdb.com') {
    event.respondWith(portada(req));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cachePrimero(req, CACHE_FUENTES));
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cachePrimero(req, CACHE_CDN));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(navegacion(req));
    return;
  }
  // Las herramientas (generar hash, probar buscador) van siempre a la red.
  if (url.pathname.includes('/herramientas/')) return;
  event.respondWith(staleWhileRevalidate(req));
});

// -----------------------------------------------------------------------------
// Estrategias
// -----------------------------------------------------------------------------
async function navegacion(req) {
  const cache = await caches.open(CACHE_APP);
  const red = fetch(req, { cache: 'no-store' }).then((r) => {
    if (r.ok) cache.put('./', r.clone());
    return r;
  });
  const tiempo = new Promise((res) => setTimeout(() => res(null), ESPERA_HTML_MS));
  try {
    const r = await Promise.race([red, tiempo]);
    if (r) return r;
  } catch { /* sin red */ }
  const guardada = (await cache.match('./')) || (await cache.match('index.html'));
  if (guardada) return guardada;
  return red; // ni red rápida ni copia: esperar a la red
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_APP);
  const guardada = await cache.match(req, { ignoreSearch: true });
  const red = fetch(req).then((r) => {
    if (r.ok) cache.put(req, r.clone());
    return r;
  }).catch(() => null);
  if (guardada) {
    // Actualizar por detrás sin bloquear la respuesta.
    red.catch(() => {});
    return guardada;
  }
  return (await red) || new Response('', { status: 504 });
}

async function cachePrimero(req, nombre) {
  const cache = await caches.open(nombre);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') cache.put(req, r.clone());
  return r;
}

let recortando = false;
async function portada(req) {
  const cache = await caches.open(CACHE_PORTADAS);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  const r = await fetch(req);
  // Solo respuestas CORS correctas (las opacas ocupan muchísimo en la cuota).
  if (r.ok && r.type !== 'opaque') {
    await cache.put(req, r.clone());
    recortar(cache);
  }
  return r;
}

/** Deja la caché de portadas en MAX_PORTADAS borrando las más antiguas. */
async function recortar(cache) {
  if (recortando) return;
  recortando = true;
  try {
    const claves = await cache.keys(); // en orden de inserción: las primeras son las más antiguas
    const sobran = claves.length - MAX_PORTADAS;
    for (let i = 0; i < sobran; i++) await cache.delete(claves[i]);
  } finally {
    recortando = false;
  }
}
