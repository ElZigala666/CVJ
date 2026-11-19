// Columnas de opinión: piezas comunes.
//  - markdown(texto, ctx): Markdown ligero → HTML seguro (todo se escapa; solo se crean
//    las etiquetas que se reconocen). Párrafos, **negrita**, *cursiva*, ## intertítulos,
//    > citas, listas (- y 1.), ![imagen](https://…) y [enlace](https://…), y los bloques de
//    las columnas (spoiler, juego, cita destacada, veredicto, encuesta, menciones, índice).
//  - logoColumna(c, tam): el logo subido o uno tipográfico con las iniciales.
//  - palabras / minutosLectura.
//  - imagenRedimensionada(file, max): para subir imágenes ligeras.
import { esc, portada, chipLetra, avatar } from './ui.js';
import { icono } from './icons.js';
import { formatearNota, notaALetra, letraANota } from './notas.js';
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

/**
 * Nombre que se enseña de una columna: si su autor está en el cementerio, "Legado de
 * {nombre}" (se sigue leyendo, pero ya no publica). Al reanimarlo vuelve a ser la suya.
 */
export function nombreColumna(c) {
  if (!c) return '';
  const autor = datos.usuario(c.usuario_id);
  return autor?.activo === false ? `Legado de ${autor.nombre}` : c.nombre;
}
export const esLegado = (c) => datos.usuario(c?.usuario_id)?.activo === false;

export const palabras = (texto) => (String(texto ?? '').match(/[\p{L}\p{N}]+/gu) ?? []).length;
/** Minutos de lectura (unas 220 palabras por minuto; al menos 1). */
export const minutosLectura = (n) => Math.max(1, Math.round((Number(n) || 0) / 220));
export const textoLectura = (n) => `${minutosLectura(n)} min de lectura`;

// ---------------------------------------------------------------------------
// Markdown ligero
// ---------------------------------------------------------------------------
const URL_SEGURA = /^https:\/\/[^\s"'<>()]+$/i;

/** "@Nombre" de alguien del grupo → enlace a su perfil (t ya viene escapado). */
function menciones(t) {
  if (!t.includes('@')) return t;
  const us = (datos.estado.usuarios ?? []).filter((u) => u.nombre).sort((a, b) => b.nombre.length - a.nombre.length);
  if (!us.length) return t;
  const porNombre = new Map(us.map((u) => [esc(u.nombre).toLowerCase(), u]));
  const nombres = us.map((u) => esc(u.nombre).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_&])@(${nombres})(?![\\p{L}\\p{N}_])`, 'giu');
  return t.replace(re, (m, antes, nombre) => {
    const u = porNombre.get(nombre.toLowerCase());
    return u ? `${antes}<a class="col-mencion" href="#perfil/${esc(u.id)}">@${esc(u.nombre)}</a>` : m;
  });
}

function enLinea(t) {
  // t ya viene escapado. Menciones, imágenes, enlaces, negrita y cursiva.
  return menciones(t)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => (URL_SEGURA.test(url) ? `<img src="${url}" alt="${alt}" loading="lazy" decoding="async">` : m))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => (URL_SEGURA.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>` : m))
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?=[^_\w]|$)/g, '$1<em>$2</em>');
}

/**
 * Líneas en blanco seguidas que se respetan (más, se quedan en este número). Una línea
 * en blanco separa párrafos; cada una de más deja un hueco de una línea, como se ve al
 * escribir.
 */
export const MAX_LINEAS_EN_BLANCO = 4;

/** Texto pegado o guardado, limpio: saltos \n, sin espacios raros ni caracteres invisibles. */
export function limpiarTexto(texto, { unaLinea = false } = {}) {
  let t = String(texto ?? '')
    .replace(/\r\n?|[\u2028\u2029\u0085]/g, '\n')
    .replace(/[\u00a0\u2007\u202f\u3000]/g, ' ')
    .replace(/\t/g, '    ')
    // invisibles (ancho cero, marcas de dirección, BOM) y de control, menos el salto de línea
    .replace(/[\u200b\u200c\u200e\u200f\u2060\ufeff\u202a-\u202e\u2066-\u2069]|[\u0000-\u0009\u000b-\u001f\u007f]/g, '');
  if (unaLinea) return t.replace(/\s*\n\s*/g, ' ');
  return t.replace(/[ ]+$/gm, '').replace(new RegExp(`\\n{${MAX_LINEAS_EN_BLANCO + 2},}`, 'g'), '\n'.repeat(MAX_LINEAS_EN_BLANCO + 1));
}

/**
 * Markdown ligero → HTML seguro. Lo que se escribe es lo que se ve: saltos y líneas en blanco
 * incluidos. El mismo HTML en la lectura y en la vista previa del editor.
 * Además del Markdown de siempre, los bloques de las columnas (cada uno en sus líneas):
 *   :::spoiler … :::          tapado hasta que se toca ("Spoiler · toca para ver")
 *   [[juego:1942]]            tarjeta del juego (nota del autor y del grupo; abre la ficha)
 *   >> frase                  cita destacada (grande, de revista)
 *   :::veredicto … :::        nota: 8.5 (o una letra) · + lo bueno · - lo malo · = frase final
 *   :::encuesta … :::         la pregunta y "- opción" (2 a 4); se vota en la lectura
 *   @Nombre                   mención a alguien del grupo (le llega un aviso al publicar)
 * Con 3 intertítulos o más, un índice al principio.
 * @param {string} texto
 * @param {{ autorId?: string, entradaId?: string, yoId?: string, previa?: boolean,
 *   spoilers?: Set<number>, cambiarVoto?: boolean, dentro?: boolean }} ctx
 */
export function markdown(texto, ctx = {}) {
  const crudas = String(texto ?? '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  const titulos = [];
  const cuenta = ctx.cuenta ?? { spoiler: 0, encuesta: 0 };
  let parrafo = [];
  let lista = null; // { tipo: 'ul'|'ol', inicio, items: [] }
  let cita = [];
  let destacada = [];
  let enBlanco = 0; // líneas en blanco seguidas antes de la línea actual
  const cerrarParrafo = () => { if (parrafo.length) { html.push(`<p>${enLinea(parrafo.join('<br>'))}</p>`); parrafo = []; } };
  const cerrarLista = () => {
    if (!lista) return;
    const inicio = lista.tipo === 'ol' && lista.inicio !== 1 ? ` start="${lista.inicio}"` : '';
    html.push(`<${lista.tipo}${inicio}>${lista.items.map((i) => `<li>${enLinea(i)}</li>`).join('')}</${lista.tipo}>`);
    lista = null;
  };
  // Una cita de varias líneas seguidas es un párrafo con saltos; "> " sola separa párrafos.
  const cerrarCita = () => {
    if (!cita.length) return;
    const parrafos = cita.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    html.push(`<blockquote>${parrafos.map((p) => `<p>${enLinea(p.split('\n').join('<br>'))}</p>`).join('')}</blockquote>`);
    cita = [];
  };
  const cerrarDestacada = () => {
    if (!destacada.length) return;
    html.push(`<blockquote class="col-destacada"><p>${enLinea(destacada.join('<br>'))}</p></blockquote>`);
    destacada = [];
  };
  const cerrarTodo = () => { cerrarParrafo(); cerrarLista(); cerrarCita(); cerrarDestacada(); };
  for (let i = 0; i < crudas.length; i++) {
    const t = esc(crudas[i]).trimEnd();
    let m;
    if (!t.trim()) { cerrarTodo(); enBlanco += 1; continue; }
    // Huecos de más entre bloques (no al principio del texto).
    if (enBlanco > 1 && html.length) {
      html.push('<div class="linea-vacia" aria-hidden="true"></div>'.repeat(Math.min(enBlanco, MAX_LINEAS_EN_BLANCO) - 1));
    }
    enBlanco = 0;
    // Bloques :::tipo … ::: (sin anidar).
    if (!ctx.dentro && (m = t.trim().match(/^:::(spoiler|veredicto|encuesta)$/i))) {
      cerrarTodo();
      const dentro = [];
      let j = i + 1;
      for (; j < crudas.length && !/^\s*:::\s*$/.test(crudas[j]); j++) dentro.push(crudas[j]);
      i = j; // la línea de cierre (o el final)
      const tipo = m[1].toLowerCase();
      if (tipo === 'spoiler') html.push(bloqueSpoiler(dentro, ctx, cuenta.spoiler++));
      else if (tipo === 'veredicto') html.push(bloqueVeredicto(dentro));
      else html.push(bloqueEncuesta(dentro, ctx, cuenta.encuesta++));
      continue;
    }
    if ((m = t.trim().match(/^\[\[juego:(\d{1,9})\]\]$/))) { cerrarTodo(); html.push(tarjetaJuego(Number(m[1]), ctx)); continue; }
    if ((m = t.match(/^(#{1,3})\s+(.+)$/))) {
      cerrarTodo();
      const nivel = m[1].length <= 2 ? 2 : 3; // # y ## → intertítulo grande; ### → pequeño
      const idT = `t-${titulos.length + 1}`;
      titulos.push({ id: idT, nivel, html: enLinea(m[2]) });
      html.push(`<h${nivel}${ctx.dentro ? '' : ` id="${idT}"`}>${enLinea(m[2])}</h${nivel}>`);
      continue;
    }
    if ((m = t.match(/^&gt;&gt;\s?(.*)$/))) { cerrarParrafo(); cerrarLista(); cerrarCita(); destacada.push(m[1]); continue; }
    if ((m = t.match(/^&gt;\s?(.*)$/))) { cerrarParrafo(); cerrarLista(); cerrarDestacada(); cita.push(m[1]); continue; }
    if ((m = t.match(/^\s*[-*•]\s+(.+)$/))) {
      cerrarParrafo(); cerrarCita(); cerrarDestacada();
      if (lista?.tipo !== 'ul') { cerrarLista(); lista = { tipo: 'ul', items: [] }; }
      lista.items.push(m[1]);
      continue;
    }
    // "1. ", "2) "... (hasta tres cifras: "2024. Fue un año..." es un párrafo). Empieza por su número.
    if ((m = t.match(/^\s*(\d{1,3})[.)]\s+(.+)$/))) {
      cerrarParrafo(); cerrarCita(); cerrarDestacada();
      if (lista?.tipo !== 'ol') { cerrarLista(); lista = { tipo: 'ol', inicio: Number(m[1]), items: [] }; }
      lista.items.push(m[2]);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(t.trim())) { cerrarTodo(); html.push('<hr>'); continue; }
    // Imagen sola en su línea: figura.
    if ((m = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)) && URL_SEGURA.test(m[2])) {
      cerrarTodo();
      html.push(`<figure><img src="${m[2]}" alt="${m[1]}" loading="lazy" decoding="async">${m[1] ? `<figcaption>${m[1]}</figcaption>` : ''}</figure>`);
      continue;
    }
    cerrarLista(); cerrarCita(); cerrarDestacada();
    parrafo.push(t);
  }
  cerrarTodo();
  // Índice: en entradas con 3 intertítulos o más.
  const indice = !ctx.dentro && titulos.length >= 3 ? `
    <nav class="col-indice" aria-label="Índice">
      <span class="col-indice-titulo">Índice</span>
      <ol>${titulos.map((x) => `<li class="n${x.nivel}"><button type="button" data-ir="${x.id}">${x.html}</button></li>`).join('')}</ol>
    </nav>` : '';
  return indice + html.join('\n');
}

/** Intertítulos (para el índice y para saber si hay). */
export const intertitulos = (texto) => String(texto ?? '').split('\n').filter((l) => /^#{1,3}\s+\S/.test(l)).length;

// ---- Bloques ---------------------------------------------------------------------
function bloqueSpoiler(lineas, ctx, n) {
  const visto = ctx.spoilers?.has(n);
  return `
    <div class="col-spoiler${visto ? ' visto' : ''}" data-spoiler="${n}">
      <button type="button" class="col-spoiler-tapa" data-spoiler-ver="${n}" aria-label="Spoiler: toca para verlo">
        <span>${icono('candado', { tam: 16, color: 'currentColor' })}Spoiler · toca para ver</span>
      </button>
      <div class="col-spoiler-dentro">${markdown(lineas.join('\n'), { ...ctx, dentro: true })}</div>
    </div>`;
}

function tarjetaJuego(id, ctx) {
  const j = datos.juegoConocido(id);
  if (!j) return `<a class="col-juego" href="#juego/${id}"><span class="col-juego-texto"><strong>Ver el juego</strong></span></a>`;
  const autor = ctx.autorId ? datos.usuario(ctx.autorId) : null;
  const suya = autor ? datos.miValoracion(autor.id, id) : null;
  const g = datos.statsJuego(id);
  const nota = (n) => `<b>${esc(formatearNota(n))}</b>${chipLetra(notaALetra(n), 'sm')}`;
  return `
    <a class="col-juego" href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}">
      ${portada(j, { clase: 'portada-lista' })}
      <span class="col-juego-texto">
        <strong>${esc(j.nombre)}</strong>
        <small>${esc([j.anio, j.desarrolladora].filter(Boolean).join(' · '))}</small>
        <span class="col-juego-notas">
          ${suya?.nota != null ? `<span>${esc(autor.nombre)} ${nota(suya.nota)}</span>` : ''}
          ${g.media != null ? `<span>Grupo ${nota(g.media)}<small>(${g.votos})</small></span>` : '<span class="apagado">Sin notas del grupo</span>'}
        </span>
      </span>
    </a>`;
}

function bloqueVeredicto(lineas) {
  let valor = null;
  const bueno = [];
  const malo = [];
  const frase = [];
  for (const l of lineas.map((x) => x.trim()).filter(Boolean)) {
    let m;
    if ((m = l.match(/^nota\s*:\s*(.+)$/i))) {
      const x = m[1].trim();
      valor = /^[sabcdef]$/i.test(x) ? letraANota(x) : Number(x.replace(',', '.'));
      if (!Number.isFinite(valor)) valor = null;
      else valor = Math.min(10, Math.max(0, valor));
    } else if ((m = l.match(/^\+\s*(.+)$/))) bueno.push(m[1]);
    else if ((m = l.match(/^-\s*(.+)$/))) malo.push(m[1]);
    else frase.push(l.replace(/^=\s*/, ''));
  }
  const listaHtml = (titulo, items, clase, ic) => (items.length ? `
    <div class="col-ver-lista ${clase}">
      <span class="col-ver-sub">${titulo}</span>
      <ul>${items.map((x) => `<li>${icono(ic, { tam: 14, color: 'currentColor' })}<span>${enLinea(esc(x))}</span></li>`).join('')}</ul>
    </div>` : '');
  return `
    <aside class="col-veredicto">
      <div class="col-ver-cab">
        <span class="col-ver-etq">Veredicto</span>
        ${valor != null ? `<span class="col-ver-nota">${chipLetra(notaALetra(valor), 'md')}<b>${esc(formatearNota(valor))}</b></span>` : ''}
      </div>
      ${bueno.length || malo.length ? `<div class="col-ver-listas">${listaHtml('Lo bueno', bueno, 'bueno', 'mas')}${listaHtml('Lo malo', malo, 'malo', 'cerrar')}</div>` : ''}
      ${frase.length ? `<p class="col-ver-frase">${enLinea(esc(frase.join(' ')))}</p>` : ''}
    </aside>`;
}

/** Pregunta y opciones de un bloque de encuesta. */
export function leerEncuesta(lineas) {
  const pregunta = [];
  const opciones = [];
  for (const l of lineas.map((x) => x.trim()).filter(Boolean)) {
    const m = l.match(/^[-*•]\s+(.+)$/);
    if (m) { if (opciones.length < 4) opciones.push(m[1]); } else pregunta.push(l);
  }
  return { pregunta: pregunta.join(' '), opciones };
}

function bloqueEncuesta(lineas, ctx, n) {
  const { pregunta, opciones } = leerEncuesta(lineas);
  if (opciones.length < 2) return `<p class="col-encuesta-mal">(Encuesta: hacen falta al menos 2 opciones, cada una en su línea empezando por "- ")</p>`;
  const cab = `<span class="col-enc-etq">${icono('urna', { tam: 16, color: 'currentColor' })}Encuesta</span><p class="col-enc-pregunta">${enLinea(esc(pregunta || '¿Qué opinas?'))}</p>`;
  // Solo la primera encuesta de una entrada se vota (los votos van por entrada).
  if (n > 0) return `<div class="col-encuesta">${cab}<p class="col-enc-nota">Solo se vota la primera encuesta de cada entrada.</p></div>`;
  if (ctx.previa || !ctx.entradaId) {
    return `<div class="col-encuesta">${cab}<div class="col-enc-opciones">${opciones.map((o) => `<button type="button" class="col-enc-opcion" disabled>${enLinea(esc(o))}</button>`).join('')}</div><p class="col-enc-nota">Se vota al publicar.</p></div>`;
  }
  const votos = datos.votosEncuesta(ctx.entradaId).filter((v) => datos.usuario(v.usuario_id) && v.opcion < opciones.length);
  const mio = votos.find((v) => v.usuario_id === ctx.yoId);
  const soyAutor = ctx.yoId && ctx.yoId === ctx.autorId;
  if ((!mio || ctx.cambiarVoto) && !soyAutor) {
    return `
      <div class="col-encuesta">${cab}
        <div class="col-enc-opciones">${opciones.map((o, k) => `<button type="button" class="col-enc-opcion${mio?.opcion === k ? ' elegida' : ''}" data-votar-encuesta="${k}">${enLinea(esc(o))}</button>`).join('')}</div>
        <p class="col-enc-nota">${votos.length ? `${votos.length} ${votos.length === 1 ? 'voto' : 'votos'}. ` : ''}Los resultados, después de votar.</p>
      </div>`;
  }
  const total = votos.length;
  return `
    <div class="col-encuesta con-resultados">${cab}
      <div class="col-enc-resultados">
        ${opciones.map((o, k) => {
          const de = votos.filter((v) => v.opcion === k);
          const pct = total ? Math.round((de.length / total) * 100) : 0;
          return `
            <div class="col-enc-res${mio?.opcion === k ? ' mia' : ''}">
              <div class="col-enc-barra" style="--pct:${pct}%"><span>${enLinea(esc(o))}</span><b>${pct}%</b></div>
              ${de.length ? `<span class="pila-avatares mini">${de.slice(0, 8).map((v) => avatar(datos.usuario(v.usuario_id), 22)).join('')}</span>` : ''}
            </div>`;
        }).join('')}
      </div>
      <p class="col-enc-nota">${total} ${total === 1 ? 'voto' : 'votos'}${mio ? ' · <button type="button" class="enlace-discreto" data-votar-cambiar>Cambiar mi voto</button>' : ''}${soyAutor ? ' · Tu encuesta' : ''}</p>
    </div>`;
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
              <small>${esc(nombreColumna(c))} ${esLegado(c) ? 'habla' : 'ha escrito'} sobre este juego</small>
              <strong>${esc(e.titulo || 'Sin título')}</strong>
              <small>${esc(textoLectura(e.palabras))}</small>
            </span>
          </a>`;
      }).join('')}
      ${mia ? `<a class="boton-secundario neutro con-icono col-escribir" href="#escribir/nueva/${ruta}">${logoColumna(mia, 22)}<span>Escribir en mi columna</span></a>` : ''}
    </section>`;
}

/** Una entrada en una lista: logo y columna, título, autor y tiempo; "Sin leer" si no la he leído. */
export function filaEntrada(e, yoId) {
  const c = datos.columna(e.columna_id);
  const autor = datos.usuario(e.usuario_id);
  const sinLeer = e.usuario_id !== yoId && !datos.leida(yoId, e.id);
  // A medias (posición guardada por js/pantallas/lectura.js): "Vas por el 40 %".
  let vas = null;
  try { vas = JSON.parse(localStorage.getItem('cvj.lectura.pos') || '{}')?.[e.id]?.f ?? null; } catch { /* nada */ }
  return `
    <a class="col-ultima${sinLeer ? ' sin-leer' : ''}" href="#entrada/${esc(e.id)}" style="${c?.color ? `--col:${esc(c.color)}` : ''}">
      ${logoColumna(c, 44)}
      <span class="col-ultima-texto">
        <small class="col-ultima-col">${esc(nombreColumna(c))}</small>
        <strong>${esc(e.titulo || 'Sin título')}</strong>
        <small>${esc(autor?.nombre ?? '')} · ${esc(textoLectura(e.palabras))}${vas != null && e.usuario_id !== yoId ? ` · <span class="col-sin-leer">Vas por el ${Math.round(vas * 100)} %</span>` : sinLeer ? ' · <span class="col-sin-leer">Sin leer</span>' : ''}</small>
      </span>
      ${sinLeer ? '<span class="col-punto" aria-hidden="true"></span>' : ''}
    </a>`;
}
