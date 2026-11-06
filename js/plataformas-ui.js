// Piezas comunes de las plataformas (PlayStation, Xbox; Steam más adelante):
// icono propio (mando genérico con la inicial, sin logos de marcas) y nombres.
import { icono } from './icons.js';

export const PLATAFORMAS_FUENTE = {
  psn: { nombre: 'PlayStation', inicial: 'P', etiqueta: 'PSN' },
  xbox: { nombre: 'Xbox', inicial: 'X', etiqueta: 'Xbox' },
  steam: { nombre: 'Steam', inicial: 'S', etiqueta: 'Steam' },
};

/** Icono de una fuente: mando relleno con su inicial en una chapita. */
export function iconoFuente(fuente, tam = 24) {
  const p = PLATAFORMAS_FUENTE[fuente] ?? PLATAFORMAS_FUENTE.psn;
  return `
    <span class="icono-fuente" style="--tam-fuente:${tam}px" aria-hidden="true">
      ${icono('jugando', { tam, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}
      <b>${p.inicial}</b>
    </span>`;
}

/** Plataforma de la biblioteca → la que se usa al valorar ("Xbox Series" → "Xbox"). */
export function plataformaParaValorar(p) {
  if (!p) return '';
  if (/^Xbox 360$/.test(p)) return 'Xbox 360';
  if (/^Xbox/.test(p)) return 'Xbox';
  return p;
}
