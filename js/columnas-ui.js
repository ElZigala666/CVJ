// Columnas de opinión: piezas comunes.
//  - markdown(texto): Markdown ligero → HTML seguro (todo se escapa; solo se crean
//    las etiquetas que se reconocen). Párrafos, **negrita**, *cursiva*, ## intertítulos,
//    > citas, listas (- y 1.), ![imagen](https://…) y [enlace](https://…).
//  - logoColumna(c, tam): el logo subido o uno tipográfico con las iniciales.
//  - palabras / minutosLectura.
//  - imagenRedimensionada(file, max): para subir imágenes ligeras.
import { esc } from './ui.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';

/** Iniciales "de periódico" del nombre: "El Diario de Mateo" → "DM". */
export function iniciales(nombre) {
  const vacias = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'y', 'e', 'a', 'en', 'un', 'una', 'the', 'of']);
  const palabras = String(nombre ?? '').split(/\s+/).filter(Boolean);
  const llenas = palabras.filter((p) => !vacias.has(p.toLowerCase()));
  return (llenas.length ? llenas : palabras).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '·';
}

/** Logo de una columna (cuadrado). Sin imagen: monograma tipográfico con su color. */
export function logoColumna(c, tam = 48) {
  if (!c) return '';
  const color = c.color || 'var(--acento)';
  if (c.logo_url) {
    return `<span class="col-logo" style="--tam:${tam}px"><img src="${esc(c.logo_url)}" alt="" loading="lazy" decoding="async"></span>`;
  }
  return `<span class="col-logo col-logo-letras" style="--tam:${tam}px;--col:${esc(color)}" aria-hidden="true"><span>${esc(iniciales(c.nombre))}</span></span>`;
}

export const palabras = (texto) => (String(texto ?? '').match(/[\p{L}\p{N}]+/gu) ?? []).length;
/** Minutos de lectura (unas 220 palabras por minuto; al menos 1). */
export const minutosLectura = (n) => Math.max(1, Math.round((Number(n) || 0) / 220));
export const textoLectura = (n) => `${minutosLectura(n)} min de lectura`;

// ---------------------------------------------------------------------------
// Markdown ligero
// ---------------------------------------------------------------------------
const URL_SEGURA = /^https:\/\/[^\s"'<>()]+$/i;

function enLinea(t) {
  // t ya viene escapado. Imágenes, enlaces, negrita y cursiva.
  return t
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => (URL_SEGURA.test(url) ? `<img src="${url}" alt="${alt}" loading="lazy" decoding="async">` : m))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => (URL_SEGURA.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>` : m))
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?=[^_\w]|$)/g, '$1<em>$2</em>');
}

/** Markdown ligero → HTML seguro. */
export function markdown(texto) {
  const lineas = esc(String(texto ?? '')).replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let parrafo = [];
  let lista = null; // { tipo: 'ul'|'ol', items: [] }
  let cita = [];
  const cerrarParrafo = () => { if (parrafo.length) { html.push(`<p>${enLinea(parrafo.join('<br>'))}</p>`); parrafo = []; } };
  const cerrarLista = () => { if (lista) { html.push(`<${lista.tipo}>${lista.items.map((i) => `<li>${enLinea(i)}</li>`).join('')}</${lista.tipo}>`); lista = null; } };
  const cerrarCita = () => { if (cita.length) { html.push(`<blockquote>${cita.map((c) => `<p>${enLinea(c)}</p>`).join('')}</blockquote>`); cita = []; } };
  const cerrarTodo = () => { cerrarParrafo(); cerrarLista(); cerrarCita(); };
  for (const l of lineas) {
    const t = l.trimEnd();
    let m;
    if (!t.trim()) { cerrarTodo(); continue; }
    if ((m = t.match(/^(#{1,3})\s+(.+)$/))) {
      cerrarTodo();
      const nivel = m[1].length <= 2 ? 2 : 3; // # y ## → intertítulo grande; ### → pequeño
      html.push(`<h${nivel}>${enLinea(m[2])}</h${nivel}>`);
      continue;
    }
    if ((m = t.match(/^&gt;\s?(.*)$/))) { cerrarParrafo(); cerrarLista(); cita.push(m[1]); continue; }
    if ((m = t.match(/^\s*[-*•]\s+(.+)$/))) {
      cerrarParrafo(); cerrarCita();
      if (lista?.tipo !== 'ul') { cerrarLista(); lista = { tipo: 'ul', items: [] }; }
      lista.items.push(m[1]);
      continue;
    }
    if ((m = t.match(/^\s*\d+[.)]\s+(.+)$/))) {
      cerrarParrafo(); cerrarCita();
      if (lista?.tipo !== 'ol') { cerrarLista(); lista = { tipo: 'ol', items: [] }; }
      lista.items.push(m[1]);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(t.trim())) { cerrarTodo(); html.push('<hr>'); continue; }
    // Imagen sola en su línea: figura.
    if ((m = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)) && URL_SEGURA.test(m[2])) {
      cerrarTodo();
      html.push(`<figure><img src="${m[2]}" alt="${m[1]}" loading="lazy" decoding="async">${m[1] ? `<figcaption>${m[1]}</figcaption>` : ''}</figure>`);
      continue;
    }
    cerrarLista(); cerrarCita();
    parrafo.push(t);
  }
  cerrarTodo();
  return html.join('\n');
}

/** Imagen redimensionada (lado mayor ≤ max) como WebP (o JPEG si no hay WebP). */
export async function imagenRedimensionada(archivo, max = 1600) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
    const f = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.naturalWidth * f);
    lienzo.height = Math.round(img.naturalHeight * f);
    const ctx = lienzo.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const aBlob = (tipo, q) => new Promise((r) => lienzo.toBlob(r, tipo, q));
    let blob = await aBlob('image/webp', 0.84);
    if (!blob || blob.type !== 'image/webp') blob = await aBlob('image/jpeg', 0.86);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Recorte cuadrado centrado (para los logos). */
export async function logoCuadrado(archivo, lado = 512) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
    const m = Math.min(img.naturalWidth, img.naturalHeight);
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = lado;
    const ctx = lienzo.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, lado, lado);
    const aBlob = (tipo, q) => new Promise((r) => lienzo.toBlob(r, tipo, q));
    let blob = await aBlob('image/webp', 0.9);
    if (!blob || blob.type !== 'image/webp') blob = await aBlob('image/png');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Lo que sale en la ficha de un juego (o de una saga o colección): NO el texto, solo
 * una tarjeta compacta por entrada y, si soy columnista, "Escribir en mi columna".
 * @param {{ juego?: number, coleccion?: string, saga?: string }} tema
 */
export function bloqueColumnas(tema) {
  if (!Array.isArray(datos.estado.columnas)) return '';
  const lista = datos.entradasSobre(tema);
  const yo = usuarioActual();
  const mia = yo ? datos.columnaDe(yo.id) : null;
  const ruta = tema.juego != null ? `juego/${tema.juego}` : tema.coleccion ? `coleccion/${tema.coleccion}` : `saga/${tema.saga}`;
  if (!lista.length && !mia) return '';
  return `
    <section class="ficha-columnas">
      ${lista.map((e) => {
        const c = datos.columna(e.columna_id);
        return `
          <a class="col-tarjeta" href="#entrada/${esc(e.id)}" style="${c?.color ? `--col:${esc(c.color)}` : ''}">
            ${logoColumna(c, 44)}
            <span class="col-tarjeta-texto">
              <small>${esc(c?.nombre ?? '')} ha escrito sobre este juego</small>
              <strong>${esc(e.titulo || 'Sin título')}</strong>
              <small>${esc(textoLectura(e.palabras))}</small>
            </span>
          </a>`;
      }).join('')}
      ${mia ? `<a class="boton-secundario neutro con-icono col-escribir" href="#escribir/nueva/${ruta}">${logoColumna(mia, 22)}<span>Escribir en mi columna</span></a>` : ''}
    </section>`;
}
