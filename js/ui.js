// Piezas de interfaz reutilizables (devuelven HTML como texto).
import { icono } from './icons.js';
import { notaALetra, formatearNota } from './notas.js';

/** Escapa texto para meterlo en HTML. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------------------------------------------------------------------------
// Portadas de IGDB
// ---------------------------------------------------------------------------
const BASE_IMG = 'https://images.igdb.com/igdb/image/upload';

/** URL de portada: tam = 'cover_small' (listas) o 'cover_big' (ficha). */
export function urlPortada(coverId, tam = 'cover_small') {
  return coverId ? `${BASE_IMG}/t_${tam}/${coverId}.jpg` : null;
}

/** Color del bloque que se ve mientras no hay portada (oscuro y estable por juego). */
export function colorBloque(id) {
  const n = Number(id) || 0;
  const tono = (n * 47) % 360;
  return `hsl(${tono} 38% 24%)`;
}

/**
 * Portada con su bloque de color detrás. La imagen aparece con un fundido.
 * @param {{igdb_id:number, cover_id?:string|null, nombre?:string}} juego
 * @param {'lista'|'grande'} variante
 */
export function portada(juego, variante = 'lista') {
  const grande = variante === 'grande';
  const tam = grande ? 'cover_big' : 'cover_small';
  const url = urlPortada(juego.cover_id, tam);
  // En listas: cover_small (90×128) y su versión 2x para pantallas retina (180×256).
  const srcset = url && !grande ? ` srcset="${url} 1x, ${urlPortada(juego.cover_id, 'cover_small_2x')} 2x"` : '';
  const img = url
    ? `<img src="${url}"${srcset} alt="" loading="${grande ? 'eager' : 'lazy'}" decoding="async" onload="this.classList.add('ok')" onerror="this.remove()">`
    : '';
  return `<div class="portada portada-${variante}" style="--bloque:${colorBloque(juego.igdb_id)}">${img}</div>`;
}

// ---------------------------------------------------------------------------
// Notas y letras
// ---------------------------------------------------------------------------
/** Chip de letra de tier. tam: 'sm' (listas), 'md' (métricas), 'lg' (tabla). */
export function chipLetra(letra, tam = 'sm') {
  if (!letra) return '';
  return `<span class="letra letra-${tam}" data-tier="${letra}">${letra}</span>`;
}

/** "7.6 [B]" */
export function notaConLetra(nota, tam = 'sm') {
  const l = notaALetra(nota);
  return `<span class="nota-num nota-${tam}">${formatearNota(nota)}</span>${chipLetra(l, tam)}`;
}

// ---------------------------------------------------------------------------
// Avatares
// ---------------------------------------------------------------------------
export function avatar(usuario, tam = 40, enlace = null) {
  const estilo = `--av:${esc(usuario?.color || 'var(--acento)')};--tam:${tam}px`;
  const ini = esc(usuario?.inicial || usuario?.nombre?.[0] || '?');
  if (enlace) {
    return `<a class="avatar" href="${enlace}" style="${estilo}" aria-label="Tu perfil">${ini}</a>`;
  }
  return `<span class="avatar" style="${estilo}" aria-hidden="true">${ini}</span>`;
}

// ---------------------------------------------------------------------------
// Cabecera, estados vacíos y skeletons
// ---------------------------------------------------------------------------
export function cabecera(usuario) {
  return `
    <header class="cabecera">
      <a class="marca" href="#inicio" aria-label="CVJ, ir a Inicio">
        ${icono('logo', { tam: 30, color: 'var(--acento)' })}
        <span class="marca-texto">CVJ</span>
      </a>
      ${avatar(usuario, 40, '#perfil')}
    </header>`;
}

export function estadoVacio({ icono: nombreIcono, titulo, texto, extra = '' }) {
  return `
    <div class="vacio">
      <span class="vacio-icono">${icono(nombreIcono, { tam: 30, color: 'var(--acento)' })}</span>
      <h2 class="vacio-titulo">${esc(titulo)}</h2>
      <p class="vacio-texto">${esc(texto)}</p>
      ${extra}
    </div>`;
}

/** Skeleton de una fila de juego (misma forma que la fila real). */
export function skeletonFila(anchoTitulo = 65, anchoMeta = 40) {
  return `
    <div class="fila-juego fila-skeleton" aria-hidden="true">
      <div class="sk sk-portada"></div>
      <div class="fila-info">
        <div class="sk sk-linea" style="width:${anchoTitulo}%;height:13px"></div>
        <div class="sk sk-linea" style="width:${anchoMeta}%;height:11px;border-radius:5px"></div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Aviso discreto (abajo, encima de la barra)
// ---------------------------------------------------------------------------
let temporizadorAviso = null;
export function aviso(mensaje, ms = 3200) {
  const el = document.getElementById('aviso');
  if (!el) return;
  el.textContent = mensaje;
  el.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove('visible'), ms);
}

// ---------------------------------------------------------------------------
// Acento del usuario (se aplica en <html>)
// ---------------------------------------------------------------------------
export function aplicarAcento(hex) {
  const raiz = document.documentElement;
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) raiz.style.setProperty('--acento-base', hex);
  else raiz.style.removeProperty('--acento-base');
}
