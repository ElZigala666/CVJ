// Piezas de interfaz reutilizables (devuelven HTML como texto).
import { icono } from './icons.js';
import { notaALetra, formatearNota } from './notas.js';
import { acentoSeguro } from './acento.js';

export { portada, urlPortada, colorBloque, colorFondo, precargar, mejorCargada } from './portadas.js';

/** Escapa texto para meterlo en HTML. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------------------------------------------------------------------------
// Notas, letras y recomendación
// ---------------------------------------------------------------------------
/** Chip de letra de tier. tam: 'sm' | 'md' | 'lg' | 'xl'. */
export function chipLetra(letra, tam = 'sm') {
  if (!letra) return '';
  return `<span class="letra letra-${tam}" data-tier="${letra}">${letra}</span>`;
}

/** "7.6 [B]" */
export function notaConLetra(nota, tam = 'sm') {
  const l = notaALetra(nota);
  return `<span class="nota-num nota-${tam}">${formatearNota(nota)}</span>${chipLetra(l, tam)}`;
}

/** Icono de recomendado / no recomendado (nada si no ha opinado). */
export function iconoRecomendacion(recomendado, tam = 16) {
  if (recomendado === true) return icono('recomendado', { tam, color: 'var(--acento)', grosor: 2.6, etiqueta: 'Recomendado' });
  if (recomendado === false) return icono('no-recomendado', { tam, color: 'var(--texto-2)', grosor: 2.6, etiqueta: 'No recomendado' });
  return '';
}

// ---------------------------------------------------------------------------
// Estados de una valoración
// ---------------------------------------------------------------------------
export const ESTADOS = [
  { id: 'jugando', nombre: 'Jugando', icono: 'jugando' },
  { id: 'completado', nombre: 'Completado', icono: 'completado' },
  { id: 'abandonado', nombre: 'Abandonado', icono: 'abandonado' },
  { id: 'pendiente', nombre: 'Pendiente', icono: 'pendiente' },
];
export const nombreEstado = (id) => ESTADOS.find((e) => e.id === id)?.nombre ?? id;

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

/**
 * Atributos para que un elemento abra el perfil de un usuario al tocarlo
 * (lo gestiona navegacion.js; funciona aunque esté dentro de otro enlace).
 */
export function attrsPerfil(usuario) {
  if (!usuario?.id) return '';
  return `data-perfil="${esc(usuario.id)}" role="link" tabindex="0" aria-label="Perfil de ${esc(usuario.nombre)}"`;
}

/** Avatar que abre el perfil de su usuario. */
export function avatarPerfil(usuario, tam = 40) {
  const estilo = `--av:${esc(usuario?.color || 'var(--acento)')};--tam:${tam}px`;
  const ini = esc(usuario?.inicial || usuario?.nombre?.[0] || '?');
  return `<span class="avatar enlace-perfil" style="${estilo}" ${attrsPerfil(usuario)}>${ini}</span>`;
}

/** Nombre que abre el perfil de su usuario. */
export function nombrePerfil(usuario, etiqueta = 'span', clase = '') {
  return `<${etiqueta} class="enlace-perfil ${clase}" ${attrsPerfil(usuario)}>${esc(usuario?.nombre ?? '')}</${etiqueta}>`;
}

/**
 * Avatar con insignia de recomendado (acento) o no recomendado (atenuado).
 * @param {string} fondo color de lo que hay detrás (para el contorno de la insignia)
 * @param {boolean} enlace si al tocarlo se abre el perfil
 */
export function avatarInsignia(usuario, recomienda, tam = 32, fondo = 'var(--fondo)', enlace = true) {
  const tamIns = Math.round(tam * 0.47);
  const ins = recomienda
    ? icono('recomendado', { tam: tamIns, color: 'var(--acento)', trazo: fondo, contorno: fondo, grosor: 3.4 })
    : icono('no-recomendado', { tam: tamIns, color: 'var(--texto-2)', trazo: fondo, contorno: fondo, grosor: 3.4 });
  const attrs = enlace ? attrsPerfil(usuario) : '';
  return `<span class="avatar-ins${recomienda ? '' : ' atenuado'}${enlace ? ' enlace-perfil' : ''}" style="--tam:${tam}px" ${attrs}>${avatar(usuario, tam)}${ins}</span>`;
}

/** Cabecera de pantalla secundaria: botón atrás + título (+ subtítulo). */
export function cabeceraAtras(titulo, subtitulo = '') {
  return `
    <header class="cabecera-atras">
      <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">
        ${icono('atras', { tam: 20, color: 'var(--texto)' })}
      </button>
      <div class="cabecera-atras-texto">
        <h1 class="cabecera-atras-titulo">${esc(titulo)}</h1>
        ${subtitulo ? `<span class="cabecera-atras-sub">${esc(subtitulo)}</span>` : ''}
      </div>
    </header>`;
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

export function estadoVacio({ icono: nombreIcono, titulo, texto, extra = '', clase = '' }) {
  return `
    <div class="vacio ${clase}">
      <span class="vacio-icono">${icono(nombreIcono, { tam: 30, color: 'var(--acento)' })}</span>
      <h2 class="vacio-titulo">${esc(titulo)}</h2>
      ${texto ? `<p class="vacio-texto">${esc(texto)}</p>` : ''}
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
// Tiempo relativo: "Ahora", "Hace 5 min", "Hace 2 h", "Ayer", "Hace 3 días", "12 oct"
// ---------------------------------------------------------------------------
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
export function tiempoRelativo(fecha, ahora = new Date()) {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  const seg = Math.max(0, (ahora - d) / 1000);
  if (seg < 60) return 'Ahora';
  if (seg < 3600) return `Hace ${Math.floor(seg / 60)} min`;
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (d >= inicioHoy) return `Hace ${Math.floor(seg / 3600)} h`;
  const dias = Math.round((inicioHoy - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (dias <= 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  const mismoAnio = d.getFullYear() === ahora.getFullYear();
  return `${d.getDate()} ${MESES[d.getMonth()]}${mismoAnio ? '' : ` ${d.getFullYear()}`}`;
}

// ---------------------------------------------------------------------------
// Aviso discreto (abajo, encima de la barra)
// ---------------------------------------------------------------------------
let temporizadorAviso = null;
export function aviso(mensaje, ms = 2600) {
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
  // Siempre la versión legible (por si en la base hay un color que no se lee bien).
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) raiz.style.setProperty('--acento-base', acentoSeguro(hex));
  else raiz.style.removeProperty('--acento-base');
}

/** Guarda y restaura el scroll horizontal de los carruseles al repintar. */
export function conservarScroll(raiz, pintar) {
  const pos = {};
  for (const el of raiz.querySelectorAll('[data-scroll]')) pos[el.dataset.scroll] = el.scrollLeft;
  pintar();
  for (const el of raiz.querySelectorAll('[data-scroll]')) {
    if (pos[el.dataset.scroll]) el.scrollLeft = pos[el.dataset.scroll];
  }
}
