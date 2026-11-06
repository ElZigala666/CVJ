// Color dominante de una portada (para el fondo de la cabecera de la ficha).
// Se cuantizan los píxeles en cubetas y gana la cubeta con más peso; los casi
// blancos, casi negros y grises cuentan mucho menos si hay algún color con
// saturación decente que también tenga peso.

const LADO = 64;          // la portada se reduce a 64 px de ancho
const BITS = 3;           // 3 bits por canal → 512 cubetas
const PESO_APAGADO = 0.2; // lo que cuenta un píxel gris/blanco/negro frente a uno con color

function rgbAHsl(r, g, b) {
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
  return [h * 60, s, l];
}

const apagado = ([, s, l]) => l < 0.12 || l > 0.9 || s < 0.18;

const hex = (r, g, b) => '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();

/**
 * Color dominante de una lista de píxeles RGBA (Uint8ClampedArray de getImageData).
 * Devuelve "#RRGGBB" o null si no hay píxeles.
 */
export function colorDominanteDePixeles(px) {
  const cubetas = new Map(); // clave → { n, r, g, b }
  const desp = 8 - BITS;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue; // transparente
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const clave = ((r >> desp) << (BITS * 2)) | ((g >> desp) << BITS) | (b >> desp);
    let c = cubetas.get(clave);
    if (!c) { c = { n: 0, r: 0, g: 0, b: 0 }; cubetas.set(clave, c); }
    c.n++; c.r += r; c.g += g; c.b += b;
  }
  if (!cubetas.size) return null;
  let total = 0;
  const lista = [...cubetas.values()].map((c) => {
    total += c.n;
    const r = c.r / c.n, g = c.g / c.n, b = c.b / c.n;
    const hsl = rgbAHsl(r, g, b);
    return { n: c.n, r, g, b, hsl, apagado: apagado(hsl) };
  });
  // ¿Hay color "de verdad" con algo de peso? (al menos un 4 % de la portada)
  const pesoColor = lista.filter((c) => !c.apagado).reduce((t, c) => t + c.n, 0);
  const hayColor = pesoColor / total >= 0.04;

  // Los colores se agrupan por familias de tono (18 familias de 20°): un rosa
  // con varios tonos suma como un solo rosa y no pierde contra un marrón liso.
  // Un poco de ventaja a lo más saturado.
  const familias = new Map();
  for (const c of lista) {
    if (c.apagado) continue;
    const f = Math.floor(c.hsl[0] / 20) % 18;
    let x = familias.get(f);
    if (!x) { x = { peso: 0, n: 0, r: 0, g: 0, b: 0 }; familias.set(f, x); }
    x.peso += c.n * (1 + c.hsl[1] * 0.5);
    x.n += c.n; x.r += c.r * c.n; x.g += c.g * c.n; x.b += c.b * c.n;
  }
  let mejorFamilia = null;
  for (const x of familias.values()) if (!mejorFamilia || x.peso > mejorFamilia.peso) mejorFamilia = x;

  // Gris, blanco o negro: cada cubeta por separado y pesando mucho menos si hay color.
  let mejorApagado = null;
  for (const c of lista) {
    if (!c.apagado) continue;
    const peso = c.n * (hayColor ? PESO_APAGADO : 1);
    if (!mejorApagado || peso > mejorApagado.peso) mejorApagado = { peso, c };
  }

  if (mejorFamilia && (!mejorApagado || mejorFamilia.peso >= mejorApagado.peso)) {
    return hex(mejorFamilia.r / mejorFamilia.n, mejorFamilia.g / mejorFamilia.n, mejorFamilia.b / mejorFamilia.n);
  }
  const c = mejorApagado.c;
  return hex(c.r, c.g, c.b);
}

/** "#RRGGBB" → [h (0-360), s (0-100), l (0-100)] */
export function hexAHsl(h) {
  const n = parseInt(String(h).slice(1), 16);
  const [hh, s, l] = rgbAHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  return [Math.round(hh), Math.round(s * 100), Math.round(l * 100)];
}

/** Calcula el color dominante de una portada (URL de IGDB, que permite CORS). */
export function colorDominante(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const alto = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * LADO));
        const lienzo = document.createElement('canvas');
        lienzo.width = LADO;
        lienzo.height = alto;
        const ctx = lienzo.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, LADO, alto);
        resolve(colorDominanteDePixeles(ctx.getImageData(0, 0, LADO, alto).data));
      } catch {
        resolve(null); // canvas "manchado" (sin CORS): nos quedamos con el color por defecto
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
