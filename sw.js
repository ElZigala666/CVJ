// Service worker MÍNIMO de CVJ: solo para que la app se pueda instalar.
// Es "network-only": NO guarda nada en caché, todo va siempre a la red.
// La caché de verdad (portadas, arranque sin conexión) llega en la fase 4.

self.addEventListener('install', () => {
  self.skipWaiting(); // la versión nueva entra sin esperar a cerrar pestañas
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Las navegaciones pasan por aquí tal cual hacia la red (los navegadores piden
// un manejador de fetch para ofrecer "Instalar"). El resto ni se toca.
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
  }
});
