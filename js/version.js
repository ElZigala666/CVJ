// Versión publicada de la app. El workflow de GitHub Actions sustituye el texto
// por el hash del commit (el mismo que usa sw.js para su caché).
export const VERSION = '__VERSION__';
export const VERSION_CORTA = VERSION.startsWith('__') ? 'local' : VERSION;
