// Lectura de una entrada de columna (#entrada/{id}). Editorial y cómoda para leer
// mucho rato: cabecera con el logo y el nombre de la columna, autor, fecha, tiempo
// de lectura, portada del tema y barra de progreso arriba. Al final: "Leído por",
// reacciones y respuestas. Cuenta como leída al llegar al final del texto (y llevar un
// poco leyendo) o tras un rato razonable con la entrada a la vista, no solo por abrirla.
// Para el lector: seguir donde lo dejó (posición por entrada), tamaño de letra (3, se
// recuerda), índice, spoilers y encuesta. Para el autor: sus números. Réplicas.
// cabeceraEntrada / clicContenido / tamLetra los usa también la vista previa del editor.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import { esc, portada, avatar, avatarPerfil, nombrePerfil } from '../ui.js';
import { abrirHoja } from '../hoja.js';
import * as social from '../social.js';
import { volver } from '../navegacion.js';
import { markdown, textoLectura, logoColumna, minutosLectura, nombreColumna, esLegado, filaEntrada } from '../columnas-ui.js';
import { aviso } from '../ui.js';

// ---- Tamaño de letra (se recuerda) y posición de lectura (por entrada) --------------
const TAMANOS = ['peq', 'normal', 'grande'];
export const tamLetra = () => { try { const t = localStorage.getItem('cvj.lectura.letra'); return TAMANOS.includes(t) ? t : 'normal'; } catch { return 'normal'; } };
const guardarTam = (t) => { try { localStorage.setItem('cvj.lectura.letra', t); } catch { /* nada */ } };
const CLAVE_POS = 'cvj.lectura.pos';
const leerPosiciones = () => { try { return JSON.parse(localStorage.getItem(CLAVE_POS) || '{}') || {}; } catch { return {}; } };
/** Por dónde va alguien en una entrada (0-1), o null. */
export const posicionLectura = (id) => { const p = leerPosiciones()[id]; return typeof p?.f === 'number' ? p.f : null; };
function guardarPosicion(id, f) {
  const todas = leerPosiciones();
  if (f == null || f >= 0.97 || f < 0.03) delete todas[id]; else todas[id] = { f: Math.round(f * 1000) / 1000, ts: Date.now() };
  // Solo las 60 más recientes.
  const lista = Object.entries(todas).sort((a, b) => b[1].ts - a[1].ts).slice(0, 60);
  try { localStorage.setItem(CLAVE_POS, JSON.stringify(Object.fromEntries(lista))); } catch { /* nada */ }
}

/**
 * Lo de arriba de una entrada (igual en la lectura y en la vista previa del editor): portada,
 * "Réplica a …", tema, título, subtítulo y firma.
 */
export function cabeceraEntrada(e) {
  const autor = datos.usuario(e.usuario_id);
  const tema = temaDe(e);
  const orig = e.replica_de ? datos.entrada(e.replica_de) : null;
  return `
    ${e.portada ? `<figure class="lectura-portada"><img src="${esc(e.portada)}" alt="" decoding="async"></figure>` : ''}
    ${orig ? `<a class="lectura-replica" href="#entrada/${esc(orig.id)}">${icono('comentario', { tam: 16, color: 'currentColor', trazo: 'var(--fondo)' })}<span>Réplica a <strong>«${esc(orig.titulo || 'Sin título')}»</strong>, de ${esc(datos.usuario(orig.usuario_id)?.nombre ?? '')}</span></a>` : ''}
    ${tema ? `<a class="lectura-tema" href="${tema.ruta}">${tema.juego ? portada(tema.juego, { clase: 'portada-lectura' }) : ''}<span>Sobre <strong>${esc(tema.nombre)}</strong></span></a>` : ''}
    <h1 class="lectura-titulo">${esc(e.titulo || 'Sin título')}</h1>
    ${e.subtitulo ? `<p class="lectura-subtitulo">${esc(e.subtitulo)}</p>` : ''}
    <div class="lectura-firma">
      ${avatar(autor, 36)}
      <div>
        <strong>${esc(autor?.nombre ?? '')}</strong>
        <span>${e.publicada_en || e.estado === 'publicada' ? `${esc(FECHA.format(new Date(e.publicada_en ?? e.actualizado_en)))} · ` : ''}${esc(textoLectura(e.palabras))}</span>
      </div>
    </div>`;
}

/**
 * Clics dentro del texto (lectura y vista previa): destapar un spoiler, ir a un intertítulo
 * del índice. Devuelve true si era suyo.
 */
export function clicContenido(ev, cont, { spoilers }) {
  const sp = ev.target.closest('[data-spoiler-ver]');
  if (sp && cont?.contains(sp)) {
    const n = Number(sp.dataset.spoilerVer);
    spoilers.add(n);
    sp.closest('.col-spoiler')?.classList.add('visto');
    return true;
  }
  const ir = ev.target.closest('[data-ir]');
  if (ir && cont?.contains(ir)) {
    cont.querySelector(`#${CSS.escape(ir.dataset.ir)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  return false;
}

const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const FECHA_HORA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const MAX_CARAS = 6;

/** "Leído por" con las caras de quien la ha leído (sin el autor). */
function leidoPor(e) {
  const ls = datos.lecturasDe(e.id).filter((l) => l.usuario_id !== e.usuario_id && datos.usuario(l.usuario_id))
    .sort((a, b) => new Date(a.leida_en) - new Date(b.leida_en));
  if (!ls.length) return `<div class="lectura-leidos" data-leidos="${esc(e.id)}"><span class="lectura-leidos-nadie">${icono('leido', { tam: 16 })}Todavía no la ha leído nadie</span></div>`;
  const resto = ls.length - MAX_CARAS;
  return `
    <div class="lectura-leidos" data-leidos="${esc(e.id)}">
      <button type="button" class="lectura-leidos-boton" data-accion="leidos">
        ${icono('leido', { tam: 16 })}<span>Leído por</span>
        <span class="pila-avatares mini">${ls.slice(0, MAX_CARAS).map((l) => avatar(datos.usuario(l.usuario_id), 24)).join('')}</span>
        ${resto > 0 ? `<span class="lectura-leidos-mas">+${resto}</span>` : ''}
      </button>
    </div>`;
}

function abrirLeidos(e, soyAutor) {
  const ls = datos.lecturasDe(e.id).filter((l) => l.usuario_id !== e.usuario_id && datos.usuario(l.usuario_id))
    .sort((a, b) => new Date(b.leida_en) - new Date(a.leida_en));
  abrirHoja({
    titulo: `Leído por ${ls.length} ${ls.length === 1 ? 'persona' : 'personas'}`,
    antetitulo: e.titulo || 'Sin título',
    html: `
      <div class="social-quien">
        ${ls.map((l) => {
          const u = datos.usuario(l.usuario_id);
          return `
            <div class="social-quien-fila">
              ${avatarPerfil(u, 36)}
              <span class="social-quien-texto">${nombrePerfil(u, 'strong')}${soyAutor ? `<small>La leyó el ${esc(FECHA_HORA.format(new Date(l.leida_en)))}</small>` : ''}</span>
            </div>`;
        }).join('')}
      </div>`,
  });
}

/** El tema de una entrada: { nombre, ruta, juego } (o null si es general). */
export function temaDe(e) {
  if (e.juego_id) { const j = datos.juegoConocido(e.juego_id); return j ? { nombre: j.nombre, ruta: `#juego/${j.igdb_id}`, juego: j } : null; }
  if (e.coleccion_id) { const c = datos.coleccion(e.coleccion_id); return c ? { nombre: c.nombre, ruta: `#coleccion/${c.id}`, juego: datos.comoJuego(c) } : null; }
  if (e.saga_id) {
    const g = datos.saga(e.saga_id);
    const j = g ? datos.juegoConocido(datos.juegosDeSaga(g.id).at(-1)) : null;
    return g ? { nombre: g.nombre, ruta: `#saga/${g.id}`, juego: j } : null;
  }
  return null;
}

export function render(el, { params }) {
  const id = params[0];
  const yo = usuarioActual();
  let cuerpo = null;
  let fallo = false;
  const spoilers = new Set();
  let cambiarVoto = false;
  let tam = tamLetra();
  let ofrecido = false; // "Seguir donde lo dejaste", una vez

  const pintar = () => {
    const e = datos.entrada(id);
    const col = e ? datos.columna(e.columna_id) : null;
    if (!e || !col || (e.estado !== 'publicada' && e.usuario_id !== yo?.id)) {
      el.innerHTML = `
        <section class="lectura">
          <header class="lectura-barra"><button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button></header>
          <div class="vacio"><h2 class="vacio-titulo">Esta entrada ya no está</h2><p class="vacio-texto">Puede que la hayan despublicado.</p></div>
        </section>`;
      return;
    }
    const autor = datos.usuario(e.usuario_id);
    const mia = e.usuario_id === yo?.id;
    const miCol = yo ? datos.columnaDe(yo.id) : null;
    const puedoReplicar = !mia && miCol && !esLegado(miCol) && e.estado === 'publicada';
    const replicas = datos.replicasDe(e.id);
    document.title = `CVJ · ${e.titulo || nombreColumna(col)}`;
    el.innerHTML = `
      <div class="lectura-progreso" aria-hidden="true"><span data-ref="progreso"></span></div>
      <section class="lectura" style="${col.color ? `--col:${esc(col.color)}` : ''}">
        <header class="lectura-barra">
          <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
          <a class="lectura-cabecera-col" href="#columna/${esc(col.id)}">${logoColumna(col, 32)}<span>${esc(nombreColumna(col))}</span></a>
          <span class="lectura-barra-der">
            <button type="button" class="boton-cuadrado lectura-letra" data-accion="letra" aria-label="Tamaño de letra: ${tam === 'peq' ? 'pequeña' : tam === 'grande' ? 'grande' : 'normal'}"><span class="aa-${tam}">Aa</span></button>
            ${mia ? `<a class="boton-secundario boton-pequeno" href="#escribir/${esc(e.id)}">Editar</a>` : ''}
          </span>
        </header>
        <article class="lectura-articulo tam-${tam}">
          ${e.estado !== 'publicada' ? '<p class="lectura-borrador">Borrador: solo lo ves tú</p>' : ''}
          ${cabeceraEntrada(e)}
          <div class="lectura-cuerpo" data-ref="cuerpo">${cuerpo != null ? markdown(cuerpo, { autorId: e.usuario_id, entradaId: e.id, yoId: yo?.id, spoilers, cambiarVoto }) : fallo
            ? '<p class="vacio-texto">No se ha podido cargar el texto. Revisa la conexión.</p>'
            : '<div class="sk sk-linea" style="width:92%;height:16px"></div><div class="sk sk-linea" style="width:86%;height:16px"></div><div class="sk sk-linea" style="width:90%;height:16px"></div>'}</div>
          ${cuerpo != null && e.estado === 'publicada' ? `
            ${!mia && yo && datos.leida(yo.id, e.id) ? `<p class="lectura-leida">${icono('hecho', { tam: 16, color: 'currentColor' })}Leída</p>` : ''}
            <section class="lectura-social">
              ${leidoPor(e)}
              ${social.tira('entrada', e.id, { visibles: 5 })}
            </section>
            ${mia ? numerosAutor(e, cuerpo) : ''}
            ${replicas.length ? `
              <section class="lectura-replicas">
                <h2 class="lectura-replicas-titulo">Réplicas</h2>
                ${replicas.map((r) => filaEntrada(r, yo?.id)).join('')}
              </section>` : ''}` : ''}
          ${cuerpo != null ? `
            <footer class="lectura-fin">
              ${logoColumna(col, 44)}
              <div><strong>${esc(nombreColumna(col))}</strong><span>${esLegado(col) ? `Su autor descansa en el <a href="#cementerio">cementerio</a>` : `por ${esc(autor?.nombre ?? '')}`}</span></div>
              <a class="boton-secundario boton-pequeno" href="#columna/${esc(col.id)}">Más de la columna</a>
            </footer>
            ${puedoReplicar ? `<a class="boton-secundario neutro con-icono lectura-replicar" href="#escribir/nueva/replica/${esc(e.id)}">${logoColumna(miCol, 22)}<span>Escribir una réplica</span></a>` : ''}` : ''}
        </article>
      </section>`;
    progreso();
    ofrecerSeguir();
  };

  // ---- Seguir donde lo dejaste ---------------------------------------------------------
  const total = () => {
    const art = el.querySelector('.lectura-articulo');
    return art ? Math.max(1, art.getBoundingClientRect().height - window.innerHeight + 80) : 1;
  };
  const ofrecerSeguir = () => {
    if (ofrecido || cuerpo == null) return;
    ofrecido = true;
    const f = posicionLectura(id);
    if (f == null || f < 0.05 || f > 0.95 || window.scrollY > 200) return;
    const chip = document.createElement('div');
    chip.className = 'lectura-seguir';
    chip.innerHTML = `<button type="button" data-seguir>${icono('adelante', { tam: 16, color: 'currentColor' })}<span>Seguir donde lo dejaste · ${Math.round(f * 100)}%</span></button><button type="button" class="lectura-seguir-x" data-seguir-no aria-label="Empezar desde el principio">${icono('cerrar', { tam: 14, color: 'currentColor' })}</button>`;
    el.appendChild(chip);
    const quitar = () => { chip.classList.add('saliendo'); setTimeout(() => chip.remove(), 200); };
    chip.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-seguir]')) {
        const art = el.querySelector('.lectura-articulo');
        const arriba = art.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: arriba + f * total(), behavior: 'smooth' });
      }
      quitar();
    });
    setTimeout(() => { if (chip.isConnected) quitar(); }, 12000);
  };
  let relojPos = 0;
  const apuntarPosicion = () => {
    if (cuerpo == null || datos.entrada(id)?.usuario_id === yo?.id) return;
    clearTimeout(relojPos);
    relojPos = setTimeout(() => {
      const art = el.querySelector('.lectura-articulo');
      if (!art) return;
      guardarPosicion(id, Math.min(1, Math.max(0, -art.getBoundingClientRect().top / total())));
    }, 600);
  };

  // Barra de progreso de lectura.
  const progreso = () => {
    const p = el.querySelector('[data-ref="progreso"]');
    const art = el.querySelector('.lectura-articulo');
    if (!p || !art) return;
    const r = art.getBoundingClientRect();
    const total = Math.max(1, r.height - window.innerHeight + 80);
    p.style.transform = `scaleX(${Math.min(1, Math.max(0, -r.top / total))})`;
    // ¿Se ha llegado (más o menos) al final del texto?
    const c = el.querySelector('[data-ref="cuerpo"]');
    if (cuerpo != null && c && c.getBoundingClientRect().bottom <= window.innerHeight * 1.05) finAlcanzado = true;
    contar();
    apuntarPosicion();
  };

  // ---- ¿Leída de verdad? ----------------------------------------------------------
  // Al final del texto con unos segundos de lectura, o con la entrada a la vista la mitad
  // de su tiempo de lectura (entre 20 s y 2,5 min). Abrirla y salir no cuenta.
  let finAlcanzado = false;
  let contada = false;
  let aLaVista = 0;
  let antes = performance.now();
  const umbral = () => Math.min(150000, Math.max(20000, minutosLectura(datos.entrada(id)?.palabras) * 60000 * 0.5));
  const contar = () => {
    const e = datos.entrada(id);
    if (contada || cuerpo == null || !yo || !e || e.estado !== 'publicada' || e.usuario_id === yo.id) return;
    // Ya leída (antes): solo falta apuntar si ha llegado al final.
    if (datos.leida(yo.id, id)) {
      if (finAlcanzado && aLaVista >= 4000) { contada = true; datos.marcarLeida(yo.id, id, { alFinal: true }); }
      return;
    }
    if ((finAlcanzado && aLaVista >= 8000) || aLaVista >= umbral()) {
      contada = true;
      datos.marcarLeida(yo.id, id, { alFinal: finAlcanzado });
    }
  };
  const relojLectura = setInterval(() => {
    const ahora = performance.now();
    if (document.visibilityState === 'visible' && cuerpo != null) aLaVista += Math.min(ahora - antes, 2000);
    antes = ahora;
    contar();
  }, 1000);
  window.addEventListener('scroll', progreso, { passive: true });

  el.addEventListener('click', (e) => {
    if (clicContenido(e, el.querySelector('[data-ref="cuerpo"]'), { spoilers })) return;
    const voto = e.target.closest('[data-votar-encuesta]');
    if (voto && yo) {
      cambiarVoto = false;
      datos.votarEncuesta(yo.id, id, Number(voto.dataset.votarEncuesta), aviso);
      return;
    }
    if (e.target.closest('[data-votar-cambiar]')) { cambiarVoto = true; pintar(); return; }
    if (e.target.closest('[data-accion="letra"]')) {
      // Mantener el sitio: lo que se leía sigue a la vista al cambiar de tamaño.
      const art = el.querySelector('.lectura-articulo');
      const f = art ? -art.getBoundingClientRect().top / total() : 0;
      tam = TAMANOS[(TAMANOS.indexOf(tam) + 1) % TAMANOS.length];
      guardarTam(tam);
      pintar();
      const art2 = el.querySelector('.lectura-articulo');
      if (art2 && f > 0) window.scrollTo(0, art2.getBoundingClientRect().top + window.scrollY + f * total());
      return;
    }
    if (e.target.closest('[data-accion="leidos"]')) {
      const en = datos.entrada(id);
      if (en) abrirLeidos(en, en.usuario_id === yo?.id);
      return;
    }
    if (e.target.closest('[data-accion="atras"]')) {
      const en = datos.entrada(id);
      volver(en ? `#columna/${en.columna_id}` : '#inicio');
    }
  });

  datos.cuerpoDe(id).then((t) => {
    cuerpo = t;
    pintar();
  }).catch(() => { fallo = true; pintar(); });
  // "Leído por" se pone al día solo (al contar la mía o al llegar las de los demás).
  const quitarSocial = datos.suscribirSocial(() => {
    const e = datos.entrada(id);
    const x = el.querySelector('[data-leidos]');
    if (e && x) x.outerHTML = leidoPor(e);
  });

  const desuscribir = datos.suscribir(() => { if (cuerpo != null || fallo) pintar(); });
  pintar();
  return () => { desuscribir(); quitarSocial(); clearInterval(relojLectura); clearTimeout(relojPos); window.removeEventListener('scroll', progreso); };
}

/** Los números de una entrada, para su autor: lecturas, hasta el final, reacciones, encuesta y réplicas. */
function numerosAutor(e, cuerpo) {
  const ls = datos.lecturasDe(e.id).filter((l) => l.usuario_id !== e.usuario_id && datos.usuario(l.usuario_id));
  const alFinal = ls.filter((l) => l.al_final).length;
  const reac = datos.reaccionesDe('entrada', e.id).length;
  const resp = datos.comentariosDe('entrada', e.id).length;
  const hayEncuesta = /^:::encuesta\s*$/m.test(cuerpo);
  const votos = hayEncuesta ? datos.votosEncuesta(e.id).length : 0;
  const replicas = datos.replicasDe(e.id).length;
  const cifra = (n, t) => `<div class="lectura-num"><b>${n}</b><span>${t}</span></div>`;
  return `
    <section class="lectura-numeros">
      <h2 class="lectura-numeros-titulo">Tus números</h2>
      <div class="lectura-numeros-cifras">
        ${cifra(ls.length, ls.length === 1 ? 'lectura' : 'lecturas')}
        ${cifra(alFinal, 'llegaron al final')}
        ${cifra(reac, reac === 1 ? 'reacción' : 'reacciones')}
        ${cifra(resp, resp === 1 ? 'respuesta' : 'respuestas')}
        ${hayEncuesta ? cifra(votos, votos === 1 ? 'voto en la encuesta' : 'votos en la encuesta') : ''}
        ${cifra(replicas, replicas === 1 ? 'réplica' : 'réplicas')}
      </div>
    </section>`;
}
