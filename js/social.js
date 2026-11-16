// Reacciones y respuestas a reseñas (de juegos y de colecciones) y a entradas de columnas.
//  - tira(objetivo, id): debajo de la reseña, compacta: las reacciones recibidas con su
//    número (al tocarlas, quién y con qué), "Reaccionar" (una, se cambia o se quita) y
//    "Responder", con las últimas respuestas plegadas si hay muchas.
//  - Se cambia en su sitio (datos.suscribirSocial): reaccionar o responder no repinta la
//    ficha ni las tarjetas.
//  - eventos() / novedades(uid): lo que pasa en lo de cada uno (reacciones, respuestas y,
//    en las columnas, lecturas) para la actividad y el aviso de Inicio.
// Objetivos: 'valoracion' (reseña de juego), 'valoracion_coleccion' y 'entrada'.
import * as datos from './datos.js';
import { icono } from './icons.js';
import { usuarioActual } from './sesion.js';
import { esc, avatar, avatarPerfil, nombrePerfil, tiempoRelativo, aviso, portada } from './ui.js';
import { abrirHoja, cerrarHoja } from './hoja.js';
import { formatearNota, notaALetra } from './notas.js';

export const REACCIONES = [
  { id: 'buena', texto: 'Buena reseña', icono: 'r-buena' },
  { id: 'mala', texto: 'Mala reseña', icono: 'r-mala' },
  { id: 'acuerdo', texto: 'Muy de acuerdo', icono: 'r-acuerdo' },
  { id: 'discrepo', texto: 'Discrepo', icono: 'r-discrepo' },
  { id: 'wtf', texto: '¿Qué cojones me estás contando?', icono: 'r-wtf' },
];
const REACCION = Object.fromEntries(REACCIONES.map((r) => [r.id, r]));
export const reaccion = (id) => REACCION[id] ?? null;
export const iconoReaccion = (id, tam = 18, color = 'currentColor') => icono(REACCION[id]?.icono ?? 'reaccionar', { tam, color });
const MAX_TEXTO = 500;
const SIN_VER_DIAS = 14; // la primera vez: lo nuevo de las últimas dos semanas

// ---------------------------------------------------------------------------
// A qué va cada cosa
// ---------------------------------------------------------------------------
/** { autorId, nombre, ruta, juego (para la portada), sobre: 'tu reseña de X' } de un objetivo, o null. */
export function objetivo(tipo, id) {
  if (tipo === 'valoracion') {
    const v = (datos.estado.valoraciones ?? []).find((x) => x.id === id);
    const j = v ? datos.juegoConocido(datos.canonico(v.juego_id)) : null;
    return v && j ? { autorId: v.usuario_id, nombre: j.nombre, ruta: `#juego/${j.igdb_id}`, juego: j, resena: v.resena, nota: v.nota, clase: v.resena?.trim() ? 'reseña' : 'valoración' } : null;
  }
  if (tipo === 'valoracion_coleccion') {
    const v = (datos.estado.valColecciones ?? []).find((x) => x.id === id);
    const c = v ? datos.coleccion(v.coleccion_id) : null;
    return v && c ? { autorId: v.usuario_id, nombre: c.nombre, ruta: `#coleccion/${c.id}`, juego: datos.comoJuego(c), resena: v.resena, nota: v.nota, clase: v.resena?.trim() ? 'reseña' : 'valoración' } : null;
  }
  if (tipo === 'entrada') {
    const e = datos.entrada(id);
    return e ? { autorId: e.usuario_id, nombre: e.titulo || 'Sin título', ruta: `#entrada/${e.id}`, juego: null, columna: datos.columna(e.columna_id), clase: 'entrada' } : null;
  }
  return null;
}

/** "tu reseña de Hades", "la reseña de Marcos de Hades", "tu entrada «…»", "«…» de Marcos". */
export function sobreQue(o, yoId, html = true) {
  const n = html ? `<strong>${esc(o.nombre)}</strong>` : o.nombre;
  const autor = datos.usuario(o.autorId);
  const de = html ? nombrePerfil(autor, 'strong') : autor?.nombre ?? '';
  if (o.clase === 'entrada') return o.autorId === yoId ? `tu entrada «${n}»` : `«${n}», de ${de}`;
  return o.autorId === yoId ? `tu ${o.clase} de ${n}` : `la ${o.clase} de ${de} de ${n}`;
}

// ---------------------------------------------------------------------------
// La tira de debajo de una reseña o entrada
// ---------------------------------------------------------------------------
const clave = (tipo, id) => `${tipo}:${id}`;
let golpe = null; // la reacción "¿Qué cojones…?" recién dada: se anima una vez

/** Resumen compacto: icono y número de cada reacción recibida (el botón abre quién). */
function resumen(lista) {
  if (!lista.length) return '';
  const cuenta = new Map();
  for (const r of lista) cuenta.set(r.tipo, (cuenta.get(r.tipo) ?? 0) + 1);
  const orden = REACCIONES.filter((r) => cuenta.has(r.id));
  return `
    <button type="button" class="social-resumen" data-social-quien aria-label="Ver quién ha reaccionado (${lista.length})">
      ${orden.map((r) => `<span class="social-chip" data-r="${r.id}">${icono(r.icono, { tam: 16 })}<span>${cuenta.get(r.id)}</span></span>`).join('')}
    </button>`;
}

function filaRespuesta(c, yoId, autorId) {
  const u = datos.usuario(c.usuario_id);
  return `
    <div class="social-respuesta" data-comentario="${esc(c.id)}">
      ${avatarPerfil(u, 24)}
      <div class="social-respuesta-texto">
        <span class="social-respuesta-cab">${nombrePerfil(u, 'strong')}<span class="social-tiempo" data-fecha="${esc(c.creado_en)}">${tiempoRelativo(c.creado_en)}</span></span>
        <p>${esc(c.texto)}</p>
      </div>
      ${c.usuario_id === yoId ? `<button type="button" class="social-borrar" data-social-borrar="${esc(c.id)}" aria-label="Borrar mi respuesta">Borrar</button>` : ''}
    </div>`;
}

/**
 * La tira de una reseña o entrada.
 * @param {'valoracion'|'valoracion_coleccion'|'entrada'} tipo
 * @param {string} id
 * @param {{ visibles?: number }} op respuestas a la vista (las demás, plegadas)
 */
export function tira(tipo, id, op = {}) {
  if (!id || !Array.isArray(datos.estado.reacciones)) return '';
  const o = objetivo(tipo, id);
  if (!o) return '';
  const yo = usuarioActual();
  const visibles = op.visibles ?? 2;
  const lista = datos.reaccionesDe(tipo, id);
  const mia = yo ? lista.find((r) => r.usuario_id === yo.id) : null;
  const respuestas = datos.comentariosDe(tipo, id);
  const k = clave(tipo, id);
  const animar = golpe === k;
  const propia = yo?.id === o.autorId;
  const r = mia ? REACCION[mia.tipo] : null;
  const ocultas = Math.max(0, respuestas.length - visibles);
  return `
    <div class="social${animar ? ' golpe' : ''}" data-social="${esc(k)}" data-visibles="${visibles}">
      <div class="social-fila">
        ${resumen(lista)}
        <span class="social-hueco"></span>
        ${yo && !propia ? `
          <button type="button" class="social-boton${r ? ' activa' : ''}" data-social-reaccionar aria-haspopup="menu" aria-label="${r ? `Tu reacción: ${esc(r.texto)}. Cambiar` : 'Reaccionar'}">
            <span class="social-boton-icono">${icono(r?.icono ?? 'reaccionar', { tam: 18 })}</span><span class="social-boton-texto">${r ? esc(r.id === 'wtf' ? '¿Qué cojones?' : r.texto) : 'Reaccionar'}</span>
          </button>` : ''}
        ${yo ? `
          <button type="button" class="social-boton" data-social-responder>
            ${icono('comentario', { tam: 18 })}<span class="social-boton-texto">${respuestas.length ? `${respuestas.length} ${respuestas.length === 1 ? 'respuesta' : 'respuestas'}` : 'Responder'}</span>
          </button>` : ''}
      </div>
      ${respuestas.length ? `
        <div class="social-hilo">
          ${ocultas ? `<button type="button" class="social-mas" data-social-responder>Ver ${ocultas === 1 ? 'la otra respuesta' : `las ${respuestas.length} respuestas`}</button>` : ''}
          ${respuestas.slice(-visibles).map((c) => filaRespuesta(c, yo?.id, o.autorId)).join('')}
        </div>` : ''}
    </div>`;
}

/** Números de una entrada para su tarjeta: lecturas (sin el autor), reacciones y respuestas. */
export function cuentas(tipo, id) {
  const o = objetivo(tipo, id);
  const lecturas = tipo === 'entrada' ? datos.lecturasDe(id).filter((l) => l.usuario_id !== o?.autorId).length : 0;
  return { lecturas, reacciones: datos.reaccionesDe(tipo, id).length, respuestas: datos.comentariosDe(tipo, id).length };
}

/** "3 lecturas · 2 reacciones · 1 respuesta" con iconos (vacío si no hay nada). */
export function cuentasHtml(tipo, id) {
  const c = cuentas(tipo, id);
  const partes = [
    c.lecturas ? `${icono('leido', { tam: 14 })}${c.lecturas}<span class="oculto-accesible"> ${c.lecturas === 1 ? 'lectura' : 'lecturas'}</span>` : '',
    c.reacciones ? `${icono('reaccionar', { tam: 14 })}${c.reacciones}<span class="oculto-accesible"> ${c.reacciones === 1 ? 'reacción' : 'reacciones'}</span>` : '',
    c.respuestas ? `${icono('comentario', { tam: 14 })}${c.respuestas}<span class="oculto-accesible"> ${c.respuestas === 1 ? 'respuesta' : 'respuestas'}</span>` : '',
  ].filter(Boolean);
  return `<span class="social-cuentas" data-social-cuentas="${esc(clave(tipo, id))}">${partes.map((p) => `<span>${p}</span>`).join('')}</span>`;
}

// Cambios en su sitio: cada tira y cada contador se vuelve a pintar solo.
datos.suscribirSocial(() => {
  for (const el of document.querySelectorAll('[data-social]')) {
    const [tipo, id] = el.dataset.social.split(':');
    const nuevo = tira(tipo, id, { visibles: Number(el.dataset.visibles) || 2 });
    if (!nuevo) { el.remove(); continue; }
    const t = document.createElement('template');
    t.innerHTML = nuevo.trim();
    el.replaceWith(t.content.firstElementChild);
  }
  for (const el of document.querySelectorAll('[data-social-cuentas]')) {
    const [tipo, id] = el.dataset.socialCuentas.split(':');
    el.outerHTML = cuentasHtml(tipo, id);
  }
  repintarHilo?.();
});

// ---------------------------------------------------------------------------
// Reaccionar: menú con las cinco
// ---------------------------------------------------------------------------
let cerrarMenu = null;
function abrirMenu(boton, tipo, id) {
  cerrarMenu?.();
  const yo = usuarioActual();
  if (!yo) return;
  const mia = datos.reaccionesDe(tipo, id).find((r) => r.usuario_id === yo.id);
  const menu = document.createElement('div');
  menu.className = 'social-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    ${REACCIONES.map((r) => `
      <button type="button" role="menuitemradio" aria-checked="${mia?.tipo === r.id}" class="social-menu-op${mia?.tipo === r.id ? ' activa' : ''}${r.id === 'wtf' ? ' estrella' : ''}" data-r="${r.id}">
        <span class="social-menu-icono">${icono(r.icono, { tam: 22 })}</span><span>${esc(r.texto)}</span>
      </button>`).join('')}
    ${mia ? '<button type="button" role="menuitem" class="social-menu-op quitar" data-r="">Quitar mi reacción</button>' : ''}`;
  document.body.appendChild(menu);
  // Debajo del botón si cabe; si no, encima. Pegado a su borde derecho.
  const b = boton.getBoundingClientRect();
  const vv = window.visualViewport;
  const alto = menu.offsetHeight;
  const ancho = menu.offsetWidth;
  const finVisible = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 12;
  const top = b.bottom + 6 + alto <= finVisible ? b.bottom + 6 : Math.max(12, b.top - 6 - alto);
  const left = Math.min(Math.max(12, b.right - ancho), window.innerWidth - ancho - 12);
  Object.assign(menu.style, { top: `${top}px`, left: `${left}px` });
  requestAnimationFrame(() => menu.classList.add('visible'));
  const fuera = (e) => { if (!menu.contains(e.target) && !boton.contains(e.target)) cerrar(); };
  const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
  function cerrar() {
    cerrarMenu = null;
    document.removeEventListener('pointerdown', fuera, true);
    document.removeEventListener('keydown', tecla);
    window.removeEventListener('scroll', cerrar, true);
    window.removeEventListener('hashchange', cerrar);
    menu.remove();
  }
  setTimeout(() => {
    document.addEventListener('pointerdown', fuera, true);
    window.addEventListener('scroll', cerrar, true);
  }, 0);
  document.addEventListener('keydown', tecla);
  window.addEventListener('hashchange', cerrar);
  menu.addEventListener('click', (e) => {
    const op = e.target.closest('[data-r]');
    if (!op) return;
    const nueva = op.dataset.r || null;
    cerrar();
    if (nueva === (mia?.tipo ?? null)) return;
    if (nueva === 'wtf') {
      golpe = clave(tipo, id);
      setTimeout(() => { if (golpe === clave(tipo, id)) golpe = null; }, 900);
    }
    datos.reaccionar(yo.id, tipo, id, nueva, aviso);
  });
  cerrarMenu = cerrar;
  menu.querySelector('.activa, [data-r]')?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Quién ha reaccionado
// ---------------------------------------------------------------------------
function abrirQuien(tipo, id) {
  const o = objetivo(tipo, id);
  const lista = datos.reaccionesDe(tipo, id).slice().sort((a, b) => REACCIONES.findIndex((r) => r.id === a.tipo) - REACCIONES.findIndex((r) => r.id === b.tipo) || new Date(b.creado_en) - new Date(a.creado_en));
  if (!o || !lista.length) return;
  abrirHoja({
    titulo: `${lista.length} ${lista.length === 1 ? 'reacción' : 'reacciones'}`,
    antetitulo: o.clase === 'entrada' ? o.nombre : `${o.clase === 'reseña' ? 'Reseña' : 'Valoración'} de ${datos.usuario(o.autorId)?.nombre ?? ''} · ${o.nombre}`,
    html: `
      <div class="social-quien">
        ${lista.map((r) => {
          const u = datos.usuario(r.usuario_id);
          const x = REACCION[r.tipo];
          return `
            <div class="social-quien-fila">
              ${avatarPerfil(u, 36)}
              <span class="social-quien-texto">${nombrePerfil(u, 'strong')}<small>${esc(x?.texto ?? '')} · ${tiempoRelativo(r.creado_en)}</small></span>
              <span class="social-quien-icono" data-r="${esc(r.tipo)}">${icono(x?.icono ?? 'reaccionar', { tam: 22 })}</span>
            </div>`;
        }).join('')}
      </div>`,
  });
}

// ---------------------------------------------------------------------------
// El hilo de respuestas (hoja con el texto original, las respuestas y escribir)
// ---------------------------------------------------------------------------
let repintarHilo = null;
export function abrirHilo(tipo, id, { enfocar = true } = {}) {
  const o = objetivo(tipo, id);
  const yo = usuarioActual();
  if (!o || !yo) return;
  const autor = datos.usuario(o.autorId);
  let quitarTeclado = () => {};
  abrirHoja({
    titulo: 'Respuestas',
    antetitulo: o.clase === 'entrada' ? o.nombre : `${autor?.nombre ?? ''} · ${o.nombre}`,
    html: `
      ${o.resena?.trim() ? `<blockquote class="social-original">${avatar(autor, 22)}<p>${esc(o.resena)}</p></blockquote>` : o.nota != null ? `<blockquote class="social-original">${avatar(autor, 22)}<p>Le puso un <strong>${formatearNota(o.nota)}</strong> (${notaALetra(o.nota)}), sin reseña.</p></blockquote>` : ''}
      <div class="social-hilo-lista" data-ref="lista"></div>
      <form class="social-escribir" data-ref="form">
        <textarea rows="1" maxlength="${MAX_TEXTO}" placeholder="${o.autorId === yo.id ? 'Contesta a quien te ha respondido' : `Responde a ${esc(autor?.nombre ?? '')}`}" aria-label="Tu respuesta" enterkeyhint="send"></textarea>
        <button type="submit" class="boton-principal boton-pequeno" disabled>Enviar</button>
      </form>`,
    alMontar: (cuerpo) => {
      const lista = cuerpo.querySelector('[data-ref="lista"]');
      const form = cuerpo.querySelector('[data-ref="form"]');
      const caja = form.querySelector('textarea');
      const enviar = form.querySelector('button');
      const pintar = () => {
        const rs = datos.comentariosDe(tipo, id);
        lista.innerHTML = rs.length
          ? rs.map((c) => filaRespuesta(c, yo.id, o.autorId)).join('')
          : '<p class="social-vacio">Todavía nadie ha respondido.</p>';
      };
      pintar();
      repintarHilo = pintar;
      const crecer = () => { caja.style.height = 'auto'; caja.style.height = `${Math.min(140, caja.scrollHeight)}px`; enviar.disabled = !caja.value.trim(); };
      caja.addEventListener('input', crecer);
      caja.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const texto = caja.value.trim();
        if (!texto) return;
        caja.value = '';
        crecer();
        await datos.comentar(yo.id, tipo, id, texto, (m) => { aviso(m); caja.value = texto; crecer(); });
        lista.lastElementChild?.scrollIntoView({ block: 'nearest' });
      });
      // Con el teclado abierto, la hoja sube por encima de él (Android e iPhone).
      const hoja = cuerpo.closest('.hoja');
      const vv = window.visualViewport;
      if (vv && hoja) {
        const colocar = () => {
          const teclado = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
          hoja.style.bottom = teclado > 80 ? `${teclado}px` : '';
          hoja.style.maxHeight = teclado > 80 ? `${Math.round(vv.height * 0.94)}px` : '';
          if (teclado > 80 && document.activeElement === caja) caja.scrollIntoView({ block: 'nearest' });
        };
        vv.addEventListener('resize', colocar);
        vv.addEventListener('scroll', colocar);
        quitarTeclado = () => { vv.removeEventListener('resize', colocar); vv.removeEventListener('scroll', colocar); };
      }
      if (enfocar) setTimeout(() => caja.focus({ preventScroll: true }), 220);
    },
    alCerrar: () => { repintarHilo = null; quitarTeclado(); },
  });
}

// ---------------------------------------------------------------------------
// Toques (una sola escucha para toda la app)
// ---------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const borrar = e.target.closest('[data-social-borrar]');
  if (borrar) {
    e.preventDefault();
    const fila = borrar.closest('[data-comentario]');
    if (borrar.dataset.confirmar) { datos.borrarComentario(borrar.dataset.socialBorrar, aviso); return; }
    borrar.dataset.confirmar = '1';
    borrar.textContent = '¿Borrar?';
    borrar.classList.add('confirmar');
    setTimeout(() => { if (fila?.isConnected) { delete borrar.dataset.confirmar; borrar.textContent = 'Borrar'; borrar.classList.remove('confirmar'); } }, 3000);
    return;
  }
  const t = e.target.closest('[data-social]');
  if (!t) return;
  const [tipo, id] = t.dataset.social.split(':');
  if (e.target.closest('[data-social-reaccionar]')) { e.preventDefault(); abrirMenu(e.target.closest('[data-social-reaccionar]'), tipo, id); return; }
  if (e.target.closest('[data-social-quien]')) { e.preventDefault(); abrirQuien(tipo, id); return; }
  if (e.target.closest('[data-perfil]')) return; // nombre o avatar: su perfil
  if (e.target.closest('[data-social-responder]')) { e.preventDefault(); abrirHilo(tipo, id); return; }
  if (e.target.closest('.social-respuesta')) { e.preventDefault(); abrirHilo(tipo, id, { enfocar: false }); }
});

// ---------------------------------------------------------------------------
// Lo que pasa en lo de cada uno: para la actividad y el aviso de Inicio
// ---------------------------------------------------------------------------
/**
 * Reacciones y respuestas (y, con lecturas: true, lecturas de entradas), con su objetivo.
 * → [{ tipo: 'reaccion'|'respuesta'|'lectura', quien, fecha, objetivo, id, o, reaccion?, texto? }]
 */
export function eventos({ lecturas = false } = {}) {
  const lista = [];
  for (const r of datos.estado.reacciones ?? []) {
    const o = objetivo(r.objetivo, r.objetivo_id);
    if (o && datos.usuario(r.usuario_id)) lista.push({ tipo: 'reaccion', quien: r.usuario_id, fecha: r.creado_en, objetivo: r.objetivo, id: r.objetivo_id, o, reaccion: r.tipo });
  }
  for (const c of datos.estado.comentarios ?? []) {
    const o = objetivo(c.objetivo, c.objetivo_id);
    if (o && datos.usuario(c.usuario_id)) lista.push({ tipo: 'respuesta', quien: c.usuario_id, fecha: c.creado_en, objetivo: c.objetivo, id: c.objetivo_id, o, texto: c.texto, comentarioId: c.id });
  }
  if (lecturas) {
    for (const l of datos.estado.lecturas ?? []) {
      const o = objetivo('entrada', l.entrada_id);
      if (o && l.usuario_id !== o.autorId && datos.usuario(l.usuario_id)) lista.push({ tipo: 'lectura', quien: l.usuario_id, fecha: l.leida_en, objetivo: 'entrada', id: l.entrada_id, o });
    }
  }
  return lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

/** Lo nuevo en lo mío desde la última vez que lo vi (de los demás). */
export function novedades(uid) {
  if (!uid) return [];
  const visto = datos.socialVistoEn(uid);
  const desde = visto ? new Date(visto).getTime() : Date.now() - SIN_VER_DIAS * 86400000;
  return eventos({ lecturas: true }).filter((ev) => ev.o.autorId === uid && ev.quien !== uid && new Date(ev.fecha).getTime() > desde);
}

/** Frase de un evento: "Nico ha dicho «Discrepo» a tu reseña de Hades". */
export function frase(ev, yoId) {
  const quien = nombrePerfil(datos.usuario(ev.quien), 'strong');
  const sobre = sobreQue(ev.o, yoId);
  if (ev.tipo === 'reaccion') return `${quien} ha dicho «${esc(REACCION[ev.reaccion]?.texto ?? '')}» a ${sobre}`;
  if (ev.tipo === 'respuesta') {
    if (ev.quien === ev.o.autorId) return `${quien} ha contestado en su ${ev.o.clase === 'entrada' ? `entrada «<strong>${esc(ev.o.nombre)}</strong>»` : `${ev.o.clase} de <strong>${esc(ev.o.nombre)}</strong>`}`;
    return `${quien} ha respondido a ${sobre}`;
  }
  return `${quien} ha leído ${sobre}`;
}

/** Aviso discreto de Inicio: "Lo nuevo en lo tuyo: 3 reacciones, 1 respuesta y 2 lecturas". */
export function avisoNovedades(uid) {
  const n = novedades(uid);
  if (!n.length) return '';
  const cuenta = (t) => n.filter((x) => x.tipo === t).length;
  const partes = [
    [cuenta('reaccion'), 'reacción', 'reacciones'],
    [cuenta('respuesta'), 'respuesta', 'respuestas'],
    [cuenta('lectura'), 'lectura', 'lecturas'],
  ].filter(([c]) => c).map(([c, s, p]) => `${c} ${c === 1 ? s : p}`);
  const texto = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}` : partes[0];
  const caras = [...new Set(n.map((x) => x.quien))].slice(0, 3).map((u) => avatar(datos.usuario(u), 22)).join('');
  const destacada = n.find((x) => x.reaccion === 'wtf');
  return `
    <button type="button" class="social-novedades" data-social-novedades>
      <span class="social-novedades-icono${destacada ? ' estrella' : ''}">${icono(destacada ? 'r-wtf' : 'reaccionar', { tam: 22 })}</span>
      <span class="social-novedades-texto"><strong>Lo nuevo en lo tuyo</strong><small>${esc(texto)}</small></span>
      <span class="pila-avatares mini">${caras}</span>
    </button>`;
}

/** La lista de lo nuevo (y lo marca como visto). */
export function abrirNovedades(uid) {
  const n = novedades(uid);
  const ahora = new Date();
  abrirHoja({
    titulo: 'Lo nuevo en lo tuyo',
    antetitulo: 'Desde tu última visita',
    html: `
      <div class="social-eventos">
        ${n.map((ev) => `
          <a class="social-evento" href="${ev.o.ruta}">
            ${avatar(datos.usuario(ev.quien), 36)}
            <span class="social-evento-texto">
              <span>${frase(ev, uid)}</span>
              ${ev.texto ? `<small class="social-evento-cita">«${esc(ev.texto)}»</small>` : ''}
              <small>${tiempoRelativo(ev.fecha, ahora)}</small>
            </span>
            <span class="social-evento-icono" data-r="${esc(ev.reaccion ?? '')}">${icono(ev.tipo === 'reaccion' ? REACCION[ev.reaccion]?.icono : ev.tipo === 'respuesta' ? 'comentario' : 'leido', { tam: 22 })}</span>
          </a>`).join('')}
      </div>`,
    alMontar: (cuerpo, cerrar) => cuerpo.addEventListener('click', (e) => { if (e.target.closest('a') && !e.target.closest('[data-perfil]')) cerrar(true); }),
  });
  datos.marcarSocialVisto(uid);
  // Visto: el aviso se va (sin repintar Inicio).
  for (const el of document.querySelectorAll('[data-social-novedades]')) el.remove();
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-social-novedades]')) return;
  const yo = usuarioActual();
  if (yo) abrirNovedades(yo.id);
});

/** Fila de la actividad para una reacción o respuesta. */
export function filaActividad(ev, yoId, ahora = new Date()) {
  const u = datos.usuario(ev.quien);
  const derecha = ev.o.juego ? portada(ev.o.juego, { clase: 'portada-actividad' }) : '';
  return `
    <a class="actividad-fila actividad-social" href="${ev.o.ruta}">
      ${avatarPerfil(u, 36)}
      <div class="actividad-texto">
        <span class="actividad-frase">${frase(ev, yoId)}</span>
        ${ev.tipo === 'reaccion' ? `<span class="actividad-reaccion" data-r="${esc(ev.reaccion)}">${icono(REACCION[ev.reaccion]?.icono, { tam: 16 })}${esc(REACCION[ev.reaccion]?.texto ?? '')}</span>` : ''}
        ${ev.texto ? `<p class="actividad-resena">«${esc(ev.texto)}»</p>` : ''}
        <span class="actividad-tiempo" data-fecha="${esc(ev.fecha)}">${tiempoRelativo(ev.fecha, ahora)}</span>
      </div>
      ${derecha}
    </a>`;
}

// Por si se usa cerrarHoja desde fuera (p. ej. al navegar desde una fila).
export { cerrarHoja };
