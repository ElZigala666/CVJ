// Lectura de una entrada de columna (#entrada/{id}). Editorial y cómoda para leer
// mucho rato: cabecera con el logo y el nombre de la columna, autor, fecha, tiempo
// de lectura, portada del tema y barra de progreso arriba.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import { esc, portada, avatar } from '../ui.js';
import { volver } from '../navegacion.js';
import { markdown, textoLectura, logoColumna } from '../columnas-ui.js';

const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

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
    document.title = `CVJ · ${e.titulo || col.nombre}`;
    el.innerHTML = `
      <div class="lectura-progreso" aria-hidden="true"><span data-ref="progreso"></span></div>
      <section class="lectura" style="${col.color ? `--col:${esc(col.color)}` : ''}">
        <header class="lectura-barra">
          <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
          <a class="lectura-cabecera-col" href="#columna/${esc(col.id)}">${logoColumna(col, 32)}<span>${esc(col.nombre)}</span></a>
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
          ${cuerpo != null ? `
            <footer class="lectura-fin">
              ${logoColumna(col, 44)}
              <div><strong>${esc(col.nombre)}</strong><span>por ${esc(autor?.nombre ?? '')}</span></div>
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
  };
  window.addEventListener('scroll', progreso, { passive: true });

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="atras"]')) {
      const en = datos.entrada(id);
      volver(en ? `#columna/${en.columna_id}` : '#inicio');
    }
  });

  datos.cuerpoDe(id).then((t) => {
    cuerpo = t;
    pintar();
    const e = datos.entrada(id);
    if (e?.estado === 'publicada' && yo) datos.marcarLeida(yo.id, id);
  }).catch(() => { fallo = true; pintar(); });

  const desuscribir = datos.suscribir(() => { if (cuerpo != null || fallo) pintar(); });
  pintar();
  return () => { desuscribir(); window.removeEventListener('scroll', progreso); };
}
