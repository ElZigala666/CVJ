// Página de una columna (#columna/{id}): portada con el logo y el nombre, y todas sus
// entradas como en un periódico (la última, destacada), de la más reciente a la más
// antigua. El columnista ve además sus borradores y "Escribir una entrada".
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import { esc, portada } from '../ui.js';
import { volver } from '../navegacion.js';
import { textoLectura, logoColumna } from '../columnas-ui.js';
import { temaDe } from './lectura.js';

const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const FECHA_CORTA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

export function render(el, { params }) {
  const id = params[0];
  const yo = usuarioActual();

  const pintar = () => {
    const col = datos.columna(id);
    if (!col) {
      el.innerHTML = `<div class="vacio"><h2 class="vacio-titulo">Esta columna no existe</h2><a class="boton-secundario" href="#inicio">Volver</a></div>`;
      return;
    }
    const autor = datos.usuario(col.usuario_id);
    const mia = col.usuario_id === yo?.id;
    const ents = datos.entradasPublicadas(col.id);
    const borradores = mia ? datos.borradoresDe(yo.id).filter((e) => e.columna_id === col.id) : [];
    const [primera, ...resto] = ents;
    document.title = `CVJ · ${col.nombre}`;
    const tarjeta = (e, grande = false) => {
      const t = temaDe(e);
      return `
        <a class="col-entrada${grande ? ' destacada' : ''}" href="#entrada/${esc(e.id)}">
          ${t?.juego ? portada(t.juego, { clase: grande ? 'portada-col-grande' : 'portada-lista' }) : ''}
          <span class="col-entrada-texto">
            ${t ? `<small class="col-entrada-tema">${esc(t.nombre)}</small>` : ''}
            <strong>${esc(e.titulo || 'Sin título')}</strong>
            ${grande && e.subtitulo ? `<span class="col-entrada-sub">${esc(e.subtitulo)}</span>` : ''}
            <small>${esc((grande ? FECHA : FECHA_CORTA).format(new Date(e.publicada_en ?? e.actualizado_en)))} · ${esc(textoLectura(e.palabras))}</small>
          </span>
        </a>`;
    };
    el.innerHTML = `
      <section class="columna" style="${col.color ? `--col:${esc(col.color)}` : ''}">
        <header class="columna-portada">
          <button type="button" class="boton-cuadrado columna-volver" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
          ${logoColumna(col, 96)}
          <h1 class="columna-nombre">${esc(col.nombre)}</h1>
          <p class="columna-autor">por <a href="#perfil/${esc(col.usuario_id)}">${esc(autor?.nombre ?? '')}</a> · ${ents.length} ${ents.length === 1 ? 'entrada' : 'entradas'}</p>
          ${mia ? '<a class="boton-principal enlace" href="#escribir/nueva">Escribir una entrada</a>' : ''}
        </header>
        ${borradores.length ? `
          <section class="columna-seccion">
            <h2 class="columna-seccion-titulo">Tus borradores</h2>
            ${borradores.map((e) => `<a class="col-borrador" href="#escribir/${esc(e.id)}"><strong>${esc(e.titulo || 'Sin título')}</strong><small>${esc(textoLectura(e.palabras))} · guardado ${esc(FECHA_CORTA.format(new Date(e.actualizado_en)))}</small></a>`).join('')}
          </section>` : ''}
        ${primera ? `
          <section class="columna-seccion">
            ${tarjeta(primera, true)}
            ${resto.length ? `<div class="columna-lista">${resto.map((e) => tarjeta(e)).join('')}</div>` : ''}
          </section>`
          : `<p class="columna-vacia">${mia ? 'Tu columna está esperando su primer texto.' : `${esc(autor?.nombre ?? 'Su autor')} todavía no ha publicado nada.`}</p>`}
      </section>`;
  };

  el.addEventListener('click', (e) => { if (e.target.closest('[data-accion="atras"]')) volver('#inicio'); });
  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}
