// Escala de notas de CVJ (lógica central).
// Todo se guarda como nota de 0 a 10 con un decimal; la letra se deriva.

export const TIERS = [
  { letra: 'S', min: 9.0, equivalente: 9.5, nombre: 'Obra maestra' },
  { letra: 'A', min: 8.0, equivalente: 8.5, nombre: 'Excelente' },
  { letra: 'B', min: 7.0, equivalente: 7.5, nombre: 'Muy bueno' },
  { letra: 'C', min: 6.0, equivalente: 6.5, nombre: 'Bueno' },
  { letra: 'D', min: 5.0, equivalente: 5.5, nombre: 'Pasable' },
  { letra: 'E', min: 3.5, equivalente: 4.2, nombre: 'Flojo' },
  { letra: 'F', min: 0.0, equivalente: 2.0, nombre: 'Malo' },
];

export const LETRAS = TIERS.map((t) => t.letra);

/** Redondea a un decimal (7.25 → 7.3) y limita a 0-10. Devuelve null si no es un número. */
export function redondear(n) {
  const v = typeof n === 'string' ? parseFloat(n.replace(',', '.')) : Number(n);
  if (n === null || n === undefined || n === '' || !Number.isFinite(v)) return null;
  const r = Math.round(Math.min(10, Math.max(0, v)) * 10) / 10;
  return r;
}

/** 8.4 → 'A'. Devuelve null si no hay nota. */
export function notaALetra(n) {
  const v = redondear(n);
  if (v === null) return null;
  for (const t of TIERS) if (v >= t.min) return t.letra;
  return 'F';
}

/** 'A' → 8.5. Devuelve null si la letra no existe. */
export function letraANota(l) {
  const t = TIERS.find((x) => x.letra === String(l || '').trim().toUpperCase());
  return t ? t.equivalente : null;
}

/** Datos del tier de una letra (nombre, rango...). */
export function tier(letra) {
  return TIERS.find((t) => t.letra === letra) || null;
}

/** Texto del rango de un tier: 'S' → '9.0–10'. */
export function rangoTier(letra) {
  const i = TIERS.findIndex((t) => t.letra === letra);
  if (i < 0) return '';
  const max = i === 0 ? '10' : (TIERS[i - 1].min - 0.1).toFixed(1);
  const min = i === TIERS.length - 1 ? '0' : TIERS[i].min.toFixed(1);
  return `${min}–${max}`;
}

/** 8 → '8.0' (siempre con un decimal). */
export function formatearNota(n) {
  const v = redondear(n);
  return v === null ? '' : v.toFixed(1);
}

/**
 * Media del grupo a partir de una lista de valoraciones.
 * Solo cuentan las que tienen nota.
 * @returns {{ media: number|null, letra: string|null, votos: number }}
 */
export function mediaGrupo(valoraciones) {
  const notas = (valoraciones || [])
    .map((v) => redondear(v?.nota))
    .filter((n) => n !== null);
  if (!notas.length) return { media: null, letra: null, votos: 0 };
  const media = redondear(notas.reduce((a, b) => a + b, 0) / notas.length);
  return { media, letra: notaALetra(media), votos: notas.length };
}

/**
 * Recomendación del grupo: cuántos recomiendan de los que han opinado.
 * @returns {{ si: number, no: number, total: number, porcentaje: number|null }}
 */
export function recomendacionGrupo(valoraciones) {
  let si = 0;
  let no = 0;
  for (const v of valoraciones || []) {
    if (v?.recomendado === true) si++;
    else if (v?.recomendado === false) no++;
  }
  const total = si + no;
  return { si, no, total, porcentaje: total ? Math.round((si / total) * 100) : null };
}

/** Texto corto "N del grupo" del diseño. */
export function textoDelGrupo(votos) {
  return `${votos} del grupo`;
}
