// Fondo de la app, por usuario. Una galería de fondos cuidados (claros y oscuros) o una
// imagen propia, que se desenfoca y se vela para que el contenido siempre se lea.
//
// Cómo se aplica (css/app.css, "Fondos"): <html data-fondo="id" data-tema="oscuro|…"> y unas
// variables (--f-base, --f-imagen, --f-velo, --f-desenfoque). El fondo se pinta en una capa
// fija detrás de todo; las tarjetas pasan a ser semitransparentes, teñidas con el color base.
// Lo elegido se guarda en la cuenta (usuarios.apariencia) y una copia ya resuelta en
// localStorage, que el <head> de index.html aplica antes de pintar nada (sin parpadeo).
import { aplicarTema } from './tema.js';

const CLAVE = 'cvj.apariencia';
const RUIDO = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E\")";

/**
 * La galería. base = color liso que acompaña (barras, hojas, borde de la pantalla);
 * imagen = lo que se ve de fondo. "acento" sale del color de la app de cada uno.
 */
export const FONDOS = [
  // Oscuros
  { id: 'medianoche', nombre: 'Medianoche', modo: 'oscuro', base: '#0B1020',
    imagen: 'radial-gradient(120% 80% at 15% 0%, #1B2A5C 0%, transparent 60%), radial-gradient(90% 70% at 100% 100%, #0F2F4A 0%, transparent 65%), linear-gradient(180deg, #0B1020, #070A14)' },
  { id: 'aurora', nombre: 'Aurora', modo: 'oscuro', base: '#0A1418',
    imagen: 'radial-gradient(90% 60% at 0% 0%, #0F4C4A 0%, transparent 62%), radial-gradient(80% 70% at 100% 20%, #3B2470 0%, transparent 60%), radial-gradient(90% 60% at 40% 110%, #123A5A 0%, transparent 60%), linear-gradient(180deg, #0A1418, #080D12)' },
  { id: 'nebulosa', nombre: 'Nebulosa', modo: 'oscuro', base: '#130B1E',
    imagen: 'radial-gradient(80% 60% at 85% 0%, #5B1F6E 0%, transparent 60%), radial-gradient(90% 70% at 0% 60%, #2A1A66 0%, transparent 62%), linear-gradient(180deg, #130B1E, #0B0712)' },
  { id: 'brasas', nombre: 'Brasas', modo: 'oscuro', base: '#170C0C',
    imagen: 'radial-gradient(100% 70% at 10% 105%, #6B2A12 0%, transparent 60%), radial-gradient(80% 60% at 100% 0%, #4A1326 0%, transparent 62%), linear-gradient(180deg, #170C0C, #0E0808)' },
  { id: 'bosque', nombre: 'Bosque', modo: 'oscuro', base: '#0B140F',
    imagen: 'radial-gradient(100% 70% at 0% 0%, #17452C 0%, transparent 62%), radial-gradient(80% 60% at 100% 100%, #1E3A22 0%, transparent 60%), linear-gradient(180deg, #0B140F, #070D0A)' },
  { id: 'grafito', nombre: 'Grafito', modo: 'oscuro', base: '#121214',
    imagen: 'radial-gradient(120% 80% at 50% 0%, #26262C 0%, transparent 65%), linear-gradient(180deg, #121214, #0C0C0E)', velo: RUIDO },
  { id: 'acento-oscuro', nombre: 'Tu color', modo: 'oscuro', base: 'color-mix(in srgb, var(--acento-base) 10%, #0B0A10)',
    imagen: 'radial-gradient(110% 70% at 10% 0%, color-mix(in srgb, var(--acento-base) 46%, transparent) 0%, transparent 62%), radial-gradient(90% 60% at 100% 100%, color-mix(in srgb, var(--acento-base) 26%, transparent) 0%, transparent 60%), linear-gradient(180deg, color-mix(in srgb, var(--acento-base) 10%, #0B0A10), #08070C)' },
  // Claros
  { id: 'papel', nombre: 'Papel', modo: 'claro', base: '#F6F1E7',
    imagen: 'radial-gradient(120% 80% at 0% 0%, #FFFBF2 0%, transparent 60%), linear-gradient(180deg, #F6F1E7, #EFE7D8)', velo: RUIDO },
  { id: 'niebla', nombre: 'Niebla', modo: 'claro', base: '#EEF2F7',
    imagen: 'radial-gradient(100% 70% at 0% 0%, #FFFFFF 0%, transparent 60%), radial-gradient(90% 70% at 100% 100%, #D5DFEE 0%, transparent 62%), linear-gradient(180deg, #EEF2F7, #E4EAF2)' },
  { id: 'melocoton', nombre: 'Melocotón', modo: 'claro', base: '#FBEFE9',
    imagen: 'radial-gradient(100% 70% at 100% 0%, #FFD9C7 0%, transparent 60%), radial-gradient(90% 70% at 0% 100%, #F8D3DD 0%, transparent 62%), linear-gradient(180deg, #FFF6F1, #FBEFE9)' },
  { id: 'menta', nombre: 'Menta', modo: 'claro', base: '#EAF6F0',
    imagen: 'radial-gradient(100% 70% at 0% 0%, #CFEFE0 0%, transparent 60%), radial-gradient(90% 70% at 100% 100%, #D6EEF2 0%, transparent 62%), linear-gradient(180deg, #F3FBF7, #EAF6F0)' },
  { id: 'acento-claro', nombre: 'Tu color', modo: 'claro', base: 'color-mix(in srgb, var(--acento-base) 6%, #FFFFFF)',
    imagen: 'radial-gradient(110% 70% at 10% 0%, color-mix(in srgb, var(--acento-base) 24%, transparent) 0%, transparent 62%), radial-gradient(90% 60% at 100% 100%, color-mix(in srgb, var(--acento-base) 14%, transparent) 0%, transparent 60%), linear-gradient(180deg, #FFFFFF, color-mix(in srgb, var(--acento-base) 6%, #FFFFFF))' },
];

const esHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const limitar = (n, a, b) => Math.min(b, Math.max(a, n));

/**
 * De lo guardado en la cuenta a lo que hay que poner en <html>. null = sin fondo.
 * @param {object|null} a  usuarios.apariencia
 * @returns {{id, modo, base, imagen, velo, desenfoque}|null}
 */
export function resolver(a) {
  if (!a || typeof a !== 'object' || !a.fondo) return null;
  if (a.fondo === 'propia') {
    if (typeof a.imagen !== 'string' || !/^(https:|blob:|data:image\/)/.test(a.imagen)) return null;
    const modo = a.modo === 'claro' ? 'claro' : 'oscuro';
    const i = limitar(Number(a.intensidad ?? 60), 0, 100) / 100;
    const base = esHex(a.base) ? a.base : (modo === 'claro' ? '#F2F2F4' : '#0E0E12');
    // Más intensidad = más desenfoque y más velo: siempre se lee, pero se puede dejar ver más o menos.
    const velo = modo === 'claro' ? `rgba(255, 255, 255, ${(0.42 + 0.44 * i).toFixed(2)})` : `rgba(8, 8, 12, ${(0.38 + 0.46 * i).toFixed(2)})`;
    return { id: 'propia', modo, base, imagen: `url("${a.imagen.replace(/["\\)]/g, '')}")`, velo, desenfoque: `${Math.round(6 + 22 * i)}px` };
  }
  const f = FONDOS.find((x) => x.id === a.fondo);
  return f ? { id: f.id, modo: f.modo, base: f.base, imagen: f.imagen, velo: f.velo ?? 'transparent', desenfoque: '0px' } : null;
}

/** Pone (o quita) el fondo en la página. No guarda nada. */
export function pintarFondo(r) {
  const raiz = document.documentElement;
  if (!r) {
    raiz.removeAttribute('data-fondo');
    for (const v of ['--f-base', '--f-imagen', '--f-velo', '--f-desenfoque']) raiz.style.removeProperty(v);
    aplicarTema(); // vuelve a mandar el tema (automático, claro u oscuro)
    return;
  }
  raiz.setAttribute('data-fondo', r.id);
  raiz.style.setProperty('--f-base', r.base);
  raiz.style.setProperty('--f-imagen', r.imagen);
  raiz.style.setProperty('--f-velo', r.velo);
  raiz.style.setProperty('--f-desenfoque', r.desenfoque);
  if (r.modo === 'oscuro') raiz.setAttribute('data-tema', 'oscuro'); else raiz.removeAttribute('data-tema');
  // Barra de estado del móvil: el color liso del fondo (los que salen del acento, el del tema).
  const meta = document.getElementById('color-tema');
  if (meta) meta.setAttribute('content', esHex(r.base) ? r.base : (r.modo === 'oscuro' ? '#0B0A10' : '#FFFFFF'));
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', r.modo === 'oscuro' ? 'black' : 'default');
}

let actual = null; // JSON de lo aplicado y guardado en este dispositivo
/** Aplica lo guardado en la cuenta y lo recuerda en este dispositivo (para el arranque). */
export function aplicarApariencia(a) {
  const r = resolver(a);
  const texto = r ? JSON.stringify(r) : '';
  if (texto === actual) return;
  actual = texto;
  try { if (r) localStorage.setItem(CLAVE, texto); else localStorage.removeItem(CLAVE); } catch { /* modo privado */ }
  pintarFondo(r);
}

/** Al arrancar: lo que dejó puesto el <head> (para no repetirlo si la cuenta dice lo mismo). */
export function iniciarApariencia() {
  try { actual = localStorage.getItem(CLAVE) || ''; } catch { actual = ''; }
  // Si hay fondo, él decide si la app va en claro o en oscuro (también cuando cambia el del sistema).
  if (actual) { try { pintarFondo(JSON.parse(actual)); } catch { actual = ''; } }
}

export const hayFondo = () => !!actual;
/** Al cerrar sesión: fuera el fondo de este dispositivo. */
export function olvidarApariencia() { aplicarApariencia(null); }

/**
 * Prepara una imagen propia: la reduce (lado mayor 1440 px), saca su color medio y decide
 * si pide texto claro u oscuro. → { blob, base, modo, media: [r, g, b] }
 */
export async function prepararImagen(archivo) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('No se ha podido leer la imagen'));
    i.src = URL.createObjectURL(archivo);
  });
  const escala = Math.min(1, 1440 / Math.max(img.naturalWidth, img.naturalHeight));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
  lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  URL.revokeObjectURL(img.src);
  // Color medio (en una miniatura de 16 px).
  const mini = document.createElement('canvas');
  mini.width = mini.height = 16;
  mini.getContext('2d').drawImage(lienzo, 0, 0, 16, 16);
  const px = mini.getContext('2d').getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
  const n = px.length / 4;
  [r, g, b] = [r / n, g / n, b / n];
  const luz = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const modo = luz > 0.62 ? 'claro' : 'oscuro';
  const blob = await new Promise((res) => lienzo.toBlob(res, 'image/webp', 0.82))
    .then((x) => (x && x.type === 'image/webp' ? x : new Promise((res) => lienzo.toBlob(res, 'image/jpeg', 0.85))));
  return { blob, modo, media: [Math.round(r), Math.round(g), Math.round(b)], base: baseDe([r, g, b], modo) };
}

/** Color liso que acompaña a una imagen: su color medio, llevado casi a negro o casi a blanco. */
export function baseDe([r, g, b], modo) {
  const hacia = modo === 'claro' ? 255 : 10;
  const t = modo === 'claro' ? 0.86 : 0.84;
  return `#${[r, g, b].map((c) => Math.round(c + (hacia - c) * t).toString(16).padStart(2, '0')).join('')}`;
}
