// Color de acento: paleta, color libre y ajuste automático para que siempre se lea bien.
// Todo deriva de --acento-base (tokens.css), así que aquí se comprueban los usos reales:
//   - claro:  texto blanco sobre el acento (botones, letra S) y sobre el tier A (75 % acento)
//   - oscuro: el acento se aclara (62 % acento + 38 % blanco) y lleva texto casi negro encima,
//             y se usa como color de texto/iconos sobre el fondo oscuro.

export const ACENTO_DEFECTO = '#6D28D9';

// 10 colores claramente distintos, ajustados para leerse bien en claro (texto blanco
// encima) y en oscuro (tokens.css los aclara y les pone texto oscuro encima).
// El amarillo y la lima van en su tono profundo: un amarillo chillón no admite texto.
export const PALETA = [
  { hex: '#6D28D9', nombre: 'Morado' },
  { hex: '#1D4ED8', nombre: 'Azul' },
  { hex: '#0E7490', nombre: 'Cian' },
  { hex: '#15803D', nombre: 'Verde' },
  { hex: '#4D7C0F', nombre: 'Lima' },
  { hex: '#A16207', nombre: 'Amarillo' },
  { hex: '#C2410C', nombre: 'Naranja' },
  { hex: '#B91C1C', nombre: 'Rojo' },
  { hex: '#BE185D', nombre: 'Rosa' },
  { hex: '#3F3F46', nombre: 'Grafito' },
];

/** ¿Es uno de la paleta? (los demás son "color libre" y se usan tal cual) */
export const esDePaleta = (hex) => PALETA.some((p) => p.hex.toUpperCase() === String(hex || '').toUpperCase());

const BLANCO = [255, 255, 255];
const FONDO_OSCURO = [15, 14, 19]; // #0F0E13

export function hexARgb(hex) {
  const h = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export const rgbAHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Igual que color-mix(in srgb, a (1-t), b t). */
export const mezclar = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function luminancia(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function rgbAHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslARgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255];
}

const NEGRO = [15, 14, 19];
/** Texto que se lee mejor encima de un color: casi negro o blanco. */
export function textoSobre(rgb) {
  return contraste(NEGRO, rgb) > contraste(BLANCO, rgb) ? '#0F0E13' : '#FFFFFF';
}

/** Color libre: ¿se verá mal como texto sobre el fondo claro o el oscuro? (solo para avisar) */
export function seLeeMal(hex) {
  const rgb = hexARgb(hex);
  return !!rgb && (contraste(rgb, BLANCO) < 3 || contraste(rgb, FONDO_OSCURO) < 3);
}

/** ¿Este acento se lee bien en todos sus usos? */
export function esLegible(rgb) {
  const oscuro = mezclar(rgb, BLANCO, 0.38);
  return contraste(BLANCO, rgb) >= 4.5            // texto blanco sobre el acento (claro)
    && contraste(BLANCO, mezclar(rgb, BLANCO, 0.25)) >= 3 // letra blanca sobre el tier A
    && contraste(oscuro, FONDO_OSCURO) >= 4.5;      // acento en oscuro: sobre el fondo y con texto oscuro encima
}

/**
 * Devuelve un acento legible lo más parecido posible al elegido: si es demasiado
 * claro u oscuro, se mueve su luminosidad (y, si no basta, se baja la saturación).
 */
export function acentoSeguro(hex) {
  const rgb = hexARgb(hex);
  if (!rgb) return ACENTO_DEFECTO;
  if (esLegible(rgb)) return rgbAHex(rgb);
  const [h, s0, l0] = rgbAHsl(rgb);
  for (let s = s0; s >= 0; s -= 0.1) {
    for (let d = 0; d <= 1; d += 0.01) {
      for (const l of [l0 - d, l0 + d]) {
        if (l < 0 || l > 1) continue;
        const c = hslARgb([h, s, l]);
        if (esLegible(c)) return rgbAHex(c);
      }
    }
  }
  return ACENTO_DEFECTO;
}
