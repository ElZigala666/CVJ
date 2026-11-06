// Tema: Automático (sigue al sistema) / Claro / Oscuro.
// Se guarda en localStorage. El script inline del <head> de index.html aplica lo
// mismo antes del primer pintado; esto lo mantiene al día mientras la app está abierta.

const CLAVE = 'cvj.tema';
const COLOR_BARRA = { claro: '#FFFFFF', oscuro: '#0F0E13' };
const sistemaOscuro = window.matchMedia?.('(prefers-color-scheme: dark)');

export const TEMAS = [
  { id: 'auto', nombre: 'Automático' },
  { id: 'claro', nombre: 'Claro' },
  { id: 'oscuro', nombre: 'Oscuro' },
];

export function preferenciaTema() {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'claro' || v === 'oscuro' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** ¿Se está viendo en oscuro ahora mismo? */
export const esOscuro = () => document.documentElement.getAttribute('data-tema') === 'oscuro';

export function aplicarTema(pref = preferenciaTema()) {
  const oscuro = pref === 'oscuro' || (pref === 'auto' && !!sistemaOscuro?.matches);
  const raiz = document.documentElement;
  if (oscuro) raiz.setAttribute('data-tema', 'oscuro');
  else raiz.removeAttribute('data-tema');
  // Barra de estado del móvil / barra del navegador.
  document.getElementById('color-tema')?.setAttribute('content', oscuro ? COLOR_BARRA.oscuro : COLOR_BARRA.claro);
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', oscuro ? 'black' : 'default');
}

export function guardarTema(pref) {
  try { localStorage.setItem(CLAVE, pref); } catch { /* modo privado */ }
  aplicarTema(pref);
}

export function iniciarTema() {
  aplicarTema();
  sistemaOscuro?.addEventListener?.('change', () => {
    if (preferenciaTema() === 'auto') aplicarTema('auto');
  });
}
