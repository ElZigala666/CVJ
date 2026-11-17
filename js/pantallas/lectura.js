// Lectura de una entrada de columna (#entrada/{id}). Editorial y cómoda para leer
// mucho rato: cabecera con el logo y el nombre de la columna, autor, fecha, tiempo
// de lectura, portada del tema y barra de progreso arriba. Al final: "Leído por",
// reacciones y respuestas. Cuenta como leída al llegar al final del texto (y llevar un
// poco leyendo) o tras un rato razonable con la entrada a la vista, no solo por abrirla.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import { esc, portada, avatar, avatarPerfil, nombrePerfil } from '../ui.js';
import { abrirHoja } from '../hoja.js';
import * as social from '../social.js';
import { volver } from '../navegacion.js';
import { markdown, textoLectura, logoColumna, minutosLectura, nombreColumna, esLegado } from '../columnas-ui.js';

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
    const tema = temaDe(e);
    const mia = e.usuario_id === yo?.id;
    document.title = `CVJ · ${e.titulo || nombreColumna(col)}`;
    el.innerHTML = `
      <div class="lectura-progreso" aria-hidden="true"><span data-ref="progreso"></span></div>
      <section class="lectura" style="${col.color ? `--col:${esc(col.color)}` : ''}">
        <header class="lectura-barra">
          <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
          <a class="lectura-cabecera-col" href="#columna/${esc(col.id)}">${logoColumna(col, 32)}<span>${esc(nombreColumna(col))}</span></a>
          ${mia ? `<a class="boton-secundario boton-pequeno" href="#escribir/${esc(e.id)}">Editar</a>` : '<span></span>'}
        </header>
        <article class="lectura-articulo">
          ${e.estado !== 'publicada' ? '<p class="lectura-borrador">Borrador: solo lo ves tú</p>' : ''}
          ${tema ? `<a class="lectura-tema" href="${tema.ruta}">${tema.juego ? portada(tema.juego, { clase: 'portada-lectura' }) : ''}<span>Sobre <strong>${esc(tema.nombre)}</strong></span></a>` : ''}
          <h1 class="lectura-titulo">${esc(e.titulo || 'Sin título')}</h1>
          ${e.subtitulo ? `<p class="lectura-subtitulo">${esc(e.subtitulo)}</p>` : ''}
          <div class="lectura-firma">
            ${avatar(autor, 36)}
            <div>
              <strong>${esc(autor?.nombre ?? '')}</strong>
              <span>${esc(FECHA.format(new Date(e.publicada_en ?? e.actualizado_en)))} · ${esc(textoLectura(e.palabras))}</span>
            </div>
          </div>
          <div class="lectura-cuerpo" data-ref="cuerpo">${cuerpo != null ? markdown(cuerpo) : fallo
            ? '<p class="vacio-texto">No se ha podido cargar el texto. Revisa la conexión.</p>'
            : '<div class="sk sk-linea" style="width:92%;height:16px"></div><div class="sk sk-linea" style="width:86%;height:16px"></div><div class="sk sk-linea" style="width:90%;height:16px"></div>'}</div>
          ${cuerpo != null && e.estado === 'publicada' ? `
            <section class="lectura-social">
              ${leidoPor(e)}
              ${social.tira('entrada', e.id, { visibles: 5 })}
            </section>` : ''}
          ${cuerpo != null ? `
            <footer class="lectura-fin">
              ${logoColumna(col, 44)}
              <div><strong>${esc(nombreColumna(col))}</strong><span>${esLegado(col) ? `Su autor descansa en el <a href="#cementerio">cementerio</a>` : `por ${esc(autor?.nombre ?? '')}`}</span></div>
              <a class="boton-secundario boton-pequeno" href="#columna/${esc(col.id)}">Más de la columna</a>
            </footer>` : ''}
        </article>
      </section>`;
    progreso();
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
    if (contada || cuerpo == null || !yo || !e || e.estado !== 'publicada' || e.usuario_id === yo.id || datos.leida(yo.id, id)) return;
    if ((finAlcanzado && aLaVista >= 8000) || aLaVista >= umbral()) {
      contada = true;
      datos.marcarLeida(yo.id, id);
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
  return () => { desuscribir(); quitarSocial(); clearInterval(relojLectura); window.removeEventListener('scroll', progreso); };
}
