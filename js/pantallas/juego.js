// Ficha de juego PROVISIONAL (la ficha completa es de la fase 2).
// Muestra nombre y portada. Pide la ficha a la Edge Function, que además la
// guarda en la tabla juegos.
import { icono } from '../icons.js';
import { fichaJuego } from '../igdb.js';
import * as datos from '../datos.js';
import { esc, portada } from '../ui.js';

export function render(el, { params }) {
  const id = Number(params[0]);
  if (!Number.isInteger(id) || id <= 0) {
    location.hash = '#buscar';
    return;
  }

  const controlador = new AbortController();

  const pintar = (j, cargando) => {
    const meta = j ? [j.anio, (j.plataformas || []).join(', ')].filter(Boolean).join(' · ') : '';
    el.innerHTML = `
      <section class="juego">
        <div class="juego-barra">
          <button type="button" class="boton-redondo" data-accion="atras" aria-label="Volver">
            ${icono('atras', { tam: 22, color: 'var(--texto)' })}
          </button>
        </div>
        <div class="juego-cuerpo">
          ${portada(j || { igdb_id: id }, 'grande')}
          ${j
            ? `<h1 class="juego-titulo">${esc(j.nombre)}</h1>${meta ? `<p class="juego-meta">${esc(meta)}</p>` : ''}`
            : cargando
              ? `<div class="sk sk-linea" style="width:70%;height:28px;border-radius:8px"></div><div class="sk sk-linea" style="width:45%;height:14px"></div>`
              : `<h1 class="juego-titulo">Juego no disponible</h1><p class="juego-meta">No se ha podido cargar. Revisa la conexión.</p>`}
          <p class="juego-nota">La ficha completa, con las notas y reseñas del grupo, llega en la fase 2.</p>
        </div>
      </section>`;
  };

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="atras"]')) {
      if (history.length > 1) history.back();
      else location.hash = '#buscar';
    }
  });

  const enCache = datos.juego(id);
  pintar(enCache, true);

  fichaJuego(id, controlador.signal)
    .then((j) => {
      if (!j || controlador.signal.aborted) return;
      datos.recordarJuego(j);
      pintar(j, false);
    })
    .catch((e) => {
      if (controlador.signal.aborted || e.name === 'AbortError') return;
      console.warn('[juego]', e.message);
      if (!enCache) pintar(null, false);
    });

  return () => controlador.abort();
}
