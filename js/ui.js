// Piezas de interfaz reutilizables (devuelven HTML como texto).
import { icono } from './icons.js';
import { notaALetra, formatearNota } from './notas.js';
import { aplicarAcento as acentoApariencia } from './apariencia.js';
import * as datos from './datos.js';

export { portada, urlPortada, colorBloque, colorFondo, precargar, mejorCargada } from './portadas.js';

/** Escapa texto para meterlo en HTML. */
/**
 * Textos que SÍ se pueden seleccionar y copiar (en el resto de la app no): reseñas,
 * entradas de las columnas y respuestas. Ahí la pulsación larga selecciona el texto: no
 * entra en la selección múltiple, no abre menús ni cuenta como deslizar.
 */
export const SELECCIONABLE = '.texto-seleccionable, .grupo-resena, .perfil-resena-texto, .lectura-articulo, .social-respuesta p, .social-original p';
/** ¿Hay texto seleccionado ahora mismo? (un toque al soltar no debe navegar) */
export const haySeleccion = () => !!window.getSelection?.()?.toString().trim();

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
/** ¿Lo completó y lo está volviendo a jugar ahora? (estado "Rejugando") */
export const estaRejugando = (v) => v?.estado === 'completado' && v.rejugando === true;
/** ¿Lo ha rejugado alguna vez? Una marca sí/no (sin contar vueltas). */
export const esRejugado = (v) => v?.rejugado === true || estaRejugando(v);
/** El estado tal como se lee: "Rejugando", "Completado", "Jugando"... */
export function textoEstado(v) {
  if (v?.estado !== 'completado') return nombreEstado(v?.estado);
  return estaRejugando(v) ? 'Rejugando' : 'Completado';
}
/**
 * La marca de "Rejugado": un detalle sutil (un icono pequeño junto al estado) que dice
 * "Rejugado" al pasar el ratón o al tocarlo. Nada si no lo ha rejugado.
 */
export function marcaRejugado(v, { tam = 13 } = {}) {
  if (!esRejugado(v)) return '';
  return `<span class="marca-rejugado" tabindex="0" role="img" aria-label="Rejugado" title="Rejugado" data-tip="Rejugado">${icono('recargar', { tam, color: 'currentColor' })}</span>`;
}

// ---------------------------------------------------------------------------
// Avatares
// ---------------------------------------------------------------------------
/** El usuario con sus datos más recientes (la sesión guarda una copia antigua). */
function fresco(usuario) {
  const d = usuario?.id ? datos.usuario(usuario.id) : null;
  return d ? { ...usuario, ...d } : usuario;
}

/** Inicial y, si tiene, su foto encima (si la foto no carga, se queda la inicial). */
function caraAvatar(u) {
  const ini = esc(u?.inicial || u?.nombre?.[0] || '?');
  if (!u?.foto_url) return ini;
  return `${ini}<img class="avatar-foto" src="${esc(u.foto_url)}" alt="" loading="lazy" decoding="async" crossorigin="anonymous" onerror="this.remove()">`;
}

export function avatar(usuario, tam = 40, enlace = null) {
  const u = fresco(usuario);
  const estilo = `--av:${esc(u?.color || 'var(--acento)')};--tam:${tam}px`;
  if (enlace) {
    return `<a class="avatar" href="${enlace}" style="${estilo}" aria-label="Tu perfil">${caraAvatar(u)}</a>`;
  }
  return `<span class="avatar" style="${estilo}" aria-hidden="true">${caraAvatar(u)}</span>`;
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
  const u = fresco(usuario);
  const estilo = `--av:${esc(u?.color || 'var(--acento)')};--tam:${tam}px`;
  return `<span class="avatar enlace-perfil" style="${estilo}" ${attrsPerfil(u)}>${caraAvatar(u)}</span>`;
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
export function cabecera(usuario, junto = '') {
  return `
    <header class="cabecera">
      <a class="marca" href="#inicio" aria-label="CVJ, ir a Inicio">
        ${icono('logo', { tam: 30, color: 'var(--acento)' })}
        <span class="marca-texto">CVJ</span>
      </a>
      <span class="cabecera-derecha">${junto}<button type="button" class="cabecera-yo" data-menu-yo aria-label="Mi perfil y Ajustes" aria-haspopup="menu">${avatar(usuario, 40)}</button></span>
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
  el.classList.remove('con-accion');
  el.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove('visible'), ms);
}

/** Aviso con un botón "Deshacer" unos segundos (cambios en lote de la selección múltiple). */
export function avisoDeshacer(mensaje, deshacer, ms = 6000) {
  const el = document.getElementById('aviso');
  if (!el) return;
  el.innerHTML = `<span>${esc(mensaje)}</span><button type="button" class="aviso-deshacer">Deshacer</button>`;
  el.classList.add('visible', 'con-accion');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove('visible', 'con-accion'), ms);
  el.querySelector('button').addEventListener('click', async () => {
    clearTimeout(temporizadorAviso);
    el.classList.remove('visible', 'con-accion');
    if (await deshacer()) aviso('Deshecho');
  }, { once: true });
}

// ---------------------------------------------------------------------------
// Copiar al portapapeles (helper común de todos los botones de copiar)
// ---------------------------------------------------------------------------
/** Método antiguo: textarea temporal (con selección permitida, el CSS global la quita) + execCommand. */
function copiarConSeleccion(texto) {
  const previo = document.activeElement;
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  // 16 px para que iOS no haga zoom al enfocarlo; fuera de la vista pero "visible" (si no, no copia).
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;'
    + 'font-size:16px;-webkit-user-select:text;user-select:text;pointer-events:none;';
  // Dentro de la hoja abierta (si la hay): fuera de un diálogo modal algunos navegadores no enfocan.
  (previo?.closest?.('.hoja') ?? document.body).appendChild(ta);
  let ok = false;
  try {
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, texto.length); // iOS
    ok = document.execCommand('copy');
  } catch { ok = false; }
  ta.remove();
  window.getSelection?.()?.removeAllRanges();
  previo?.focus?.({ preventScroll: true });
  return ok;
}

/**
 * Copia texto. Hay que llamarla DIRECTAMENTE en el clic (sin await antes), o el navegador
 * deja de considerarlo un gesto del usuario. Primero la API moderna; si no está o la
 * rechaza, el textarea temporal. Devuelve una promesa con true / false.
 */
export function copiarTexto(texto) {
  const api = window.isSecureContext && navigator.clipboard?.writeText;
  if (!api) return Promise.resolve(copiarConSeleccion(texto));
  return navigator.clipboard.writeText(texto).then(() => true, () => copiarConSeleccion(texto));
}

/**
 * Convierte un botón en "Copiar": al pulsarlo copia, enseña "Copiado" con un check un par
 * de segundos y, si no se puede, un aviso claro y llama a alFallar (p. ej. seleccionar el
 * texto para copiarlo a mano). texto puede ser una función (se evalúa al pulsar).
 */
export function botonCopiar(boton, texto, { etiqueta = 'Copiar', hecho = 'Copiado', alFallar } = {}) {
  if (!boton) return;
  const pintar = (copiado) => {
    boton.classList.toggle('copiado', copiado);
    boton.innerHTML = `${icono(copiado ? 'hecho' : 'copiar', { tam: 18, color: 'currentColor' })}<span>${esc(copiado ? hecho : etiqueta)}</span>`;
  };
  boton.classList.add('boton-copiar');
  boton.disabled = false;
  pintar(false);
  let vuelta = 0;
  boton.addEventListener('click', () => {
    const valor = typeof texto === 'function' ? texto() : texto;
    copiarTexto(String(valor ?? '')).then((ok) => {
      clearTimeout(vuelta);
      if (ok) {
        pintar(true);
        vuelta = setTimeout(() => pintar(false), 2000);
      } else {
        pintar(false);
        aviso('No se ha podido copiar. Mantén pulsado el texto para copiarlo a mano.', 4500);
        alFallar?.();
      }
    });
  });
}

/** Deja seleccionado todo el texto de un elemento (para copiarlo a mano). */
export function seleccionarTexto(el) {
  if (!el) return;
  try {
    const rango = document.createRange();
    rango.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(rango);
  } catch { /* sin selección */ }
}

// ---------------------------------------------------------------------------
// Acento del usuario (se aplica en <html>)
// ---------------------------------------------------------------------------
/**
 * Aplica el acento. Los de la paleta usan sus ajustes de tokens.css; un color libre
 * se usa EXACTAMENTE como es, en claro y en oscuro, y solo el texto que va encima
 * (botones, letras de tier S y A) pasa a negro o blanco según lo que se lea mejor.
 */
/** Color de acento de la app: lo resuelve js/apariencia.js junto con el fondo. */
export function aplicarAcento(hex) {
  acentoApariencia(hex);
}

// ---------------------------------------------------------------------------
// Repintar sin parpadeo: en vez de rehacer todo con innerHTML, se compara el HTML nuevo con
// lo que se ve. Si es igual, no se toca nada; si no, solo cambian los nodos afectados
// (emparejados por clave: href, data-k, id o src), así que las imágenes que siguen no se
// vuelven a crear (ni repiten el fundido ni se recargan) y los elementos nuevos entran con
// un fundido corto (.cambio-suave).
// ---------------------------------------------------------------------------
const plantilla = document.createElement('template');
const claveDe = (n) => (n.nodeType !== 1 ? null
  : n.getAttribute('data-k') ?? n.id ?? null) || (n.tagName === 'A' ? n.getAttribute('href') : null) || (n.tagName === 'IMG' ? n.getAttribute('src') : null);

function igualarAtributos(a, b) {
  if (a.tagName === 'IMG' && a.getAttribute('src') === b.getAttribute('src')) return; // ya cargada: tal cual
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  // Lo que escribe la persona (o el estado de un <details>) no se pisa.
  if ((a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && document.activeElement !== a && 'value' in b && a.value !== b.value) a.value = b.value;
  if (a.tagName === 'INPUT' && (a.type === 'checkbox' || a.type === 'radio')) a.checked = b.hasAttribute('checked');
}

function igualarNodo(a, b) {
  if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  igualarAtributos(a, b);
  // data-propio: su contenido lo pinta otro código (por su cuenta, con pintarHtml); no se toca.
  if (!a.hasAttribute('data-propio')) igualarHijos(a, b);
}

function compatibles(a, b) {
  return a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.tagName === b.tagName && claveDe(a) === claveDe(b)));
}

function igualarHijos(a, b) {
  const nuevos = [...b.childNodes];
  const viejos = [...a.childNodes];
  // Por clave (puede repetirse: dos filas del mismo juego), en orden.
  const porClave = new Map();
  for (const v of viejos) { const k = claveDe(v); if (k != null) { if (!porClave.has(k)) porClave.set(k, []); porClave.get(k).push(v); } }
  let i = 0;
  for (const n of nuevos) {
    const k = claveDe(n);
    let v = null;
    if (k != null) {
      v = porClave.get(k)?.shift() ?? null;
      if (v && !compatibles(v, n)) v = null;
    } else {
      // Sin clave: el que esté en su sitio, si es del mismo tipo.
      const aqui = a.childNodes[i];
      v = aqui && claveDe(aqui) == null && compatibles(aqui, n) ? aqui : null;
    }
    if (v) {
      if (a.childNodes[i] !== v) a.insertBefore(v, a.childNodes[i] ?? null);
      igualarNodo(v, n);
    } else {
      const nuevo = document.importNode(n, true);
      if (nuevo.nodeType === 1 && viejos.length) nuevo.classList.add('cambio-suave');
      a.insertBefore(nuevo, a.childNodes[i] ?? null);
    }
    i++;
  }
  while (a.childNodes.length > i) a.lastChild.remove();
}

/** Pone este HTML en el elemento tocando solo lo que cambia. → true si ha cambiado algo. */
export function pintarHtml(el, html) {
  // Si otro código ha cambiado el contenido con innerHTML, lo guardado ya no vale.
  const tocado = el.__primero !== el.firstChild || el.__cuantos !== el.childNodes.length;
  if (el.__html === html && !tocado) return false;
  const primera = el.__html == null || !el.firstChild;
  el.__html = html;
  if (primera) el.innerHTML = html;
  else {
    plantilla.innerHTML = html;
    igualarHijos(el, plantilla.content);
    plantilla.innerHTML = '';
  }
  el.__primero = el.firstChild;
  el.__cuantos = el.childNodes.length;
  return true;
}

/** Un elemento suelto (una tira, un contador) igualado a este HTML: solo cambia lo distinto. */
export function igualarElemento(el, html) {
  plantilla.innerHTML = html.trim();
  const nuevo = plantilla.content.firstElementChild;
  if (!nuevo) { plantilla.innerHTML = ''; el.remove(); return; }
  if (nuevo.tagName === el.tagName) igualarNodo(el, nuevo);
  else el.replaceWith(document.importNode(nuevo, true));
  plantilla.innerHTML = '';
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
