// Todas las columnas (#columnas): cada una con su logo, autor, número de entradas y sus
// últimas entradas (con la marca de las que no he leído). Se llega desde Inicio y, en
// escritorio, desde la barra lateral.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import { esc } from '../ui.js';
import { volver } from '../navegacion.js';
import { logoColumna, filaEntrada, nombreColumna, esLegado } from '../columnas-ui.js';

const ULTIMAS = 3;

export function render(el) {
  const yo = usuarioActual();
  document.title = 'CVJ · Columnas';

  const pintar = () => {
    // Las activas; primero la que ha publicado más recientemente.
    const cols = (datos.estado.columnas ?? []).filter((c) => c.activa !== false && datos.usuario(c.usuario_id))
      .map((c) => ({ c, ents: datos.entradasPublicadas(c.id) }))
      .sort((a, b) => new Date(b.ents[0]?.publicada_en ?? 0) - new Date(a.ents[0]?.publicada_en ?? 0));
    const sinLeer = datos.entradasPublicadas().filter((e) => e.usuario_id !== yo?.id && !datos.leida(yo?.id, e.id)).length;
    el.innerHTML = `
      <section class="columnas-pagina">
        <header class="columnas-cab">
          <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
          <div>
            <h1 class="columnas-titulo">Columnas</h1>
            <p class="columnas-sub">${cols.length} ${cols.length === 1 ? 'columna' : 'columnas'} del grupo${sinLeer ? ` · ${sinLeer} sin leer` : ''}</p>
          </div>
        </header>
        ${cols.length ? cols.map(({ c, ents }) => {
          const autor = datos.usuario(c.usuario_id);
          return `
            <section class="columnas-bloque" style="${c.color ? `--col:${esc(c.color)}` : ''}">
              <a class="columnas-bloque-cab" href="#columna/${esc(c.id)}">
                ${logoColumna(c, 52)}
                <span class="columnas-bloque-texto">
                  <strong>${esc(nombreColumna(c))}</strong>
                  <small>${esLegado(c) ? 'Su autor descansa en el cementerio' : `por ${esc(autor?.nombre ?? '')}`} · ${ents.length} ${ents.length === 1 ? 'entrada' : 'entradas'}</small>
                </span>
                ${icono('adelante', { tam: 18, color: 'var(--texto-2)' })}
              </a>
              ${ents.length
                ? `<div class="col-ultimas">${ents.slice(0, ULTIMAS).map((e) => filaEntrada(e, yo?.id)).join('')}</div>
                   ${ents.length > ULTIMAS ? `<a class="enlace-discreto columnas-mas" href="#columna/${esc(c.id)}">Ver las ${ents.length} entradas</a>` : ''}`
                : `<p class="columnas-vacia">${c.usuario_id === yo?.id ? 'Tu columna está esperando su primer texto.' : 'Todavía no ha publicado nada.'}</p>`}
            </section>`;
        }).join('') : '<p class="columnas-vacia">Todavía no hay columnas. El admin las da en Ajustes → Gestionar grupo.</p>'}
      </section>`;
  };

  el.addEventListener('click', (e) => { if (e.target.closest('[data-accion="atras"]')) volver('#inicio'); });
  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}
