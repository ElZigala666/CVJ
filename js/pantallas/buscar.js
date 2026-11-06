// Pantalla 03 · Buscar: IGDB (vía Edge Function) cruzado con los datos del grupo.
import { icono } from '../icons.js';
import { buscarJuegos } from '../igdb.js';
import * as datos from '../datos.js';
import { esc, portada, notaConLetra, skeletonFila } from '../ui.js';

const PLATAFORMAS = ['Todas', 'PS5', 'PS4', 'PC', 'Xbox', 'Switch'];
const ESPERA_MS = 300;
const MIN_LETRAS = 2;

// Se conserva entre visitas a la pestaña: al volver de una ficha sigue todo igual.
const memoria = {
  texto: '',
  plataforma: 'Todas',
  resultados: null,   // array o null (sin búsqueda)
  cargando: false,
  error: null,
  scroll: 0,
};
const cache = new Map(); // texto normalizado → resultados

let controlador = null;
let temporizador = null;

const clave = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** "Switch" también cuenta "Switch 2"; "Xbox" cuenta "Xbox 360". */
function tienePlataforma(juego, p) {
  return p === 'Todas' || (juego.plataformas || []).some((x) => x === p || x.startsWith(`${p} `));
}

export function render(el) {
  el.innerHTML = `
    <section class="buscar">
      <div class="buscar-cab">
        <h1 class="titulo-pantalla">Buscar</h1>
        <div class="campo-busqueda">
          ${icono('buscar', { tam: 20, color: 'var(--texto-2)' })}
          <label for="q" class="sr">Buscar juego</label>
          <input id="q" type="search" placeholder="Busca cualquier juego" autocomplete="off"
            autocorrect="off" spellcheck="false" enterkeyhint="search">
        </div>
      </div>
      <div class="chips" role="group" aria-label="Filtrar por plataforma">
        ${PLATAFORMAS.map((p) => `<button type="button" class="chip" data-p="${p}" aria-pressed="false">${p}</button>`).join('')}
      </div>
      <div class="lista" id="resultados" aria-live="polite"></div>
    </section>`;

  const input = el.querySelector('#q');
  const lista = el.querySelector('#resultados');
  const chips = el.querySelector('.chips');

  input.value = memoria.texto;

  const pintarChips = () => {
    for (const b of chips.querySelectorAll('.chip')) {
      const activo = b.dataset.p === memoria.plataforma;
      b.classList.toggle('activo', activo);
      b.setAttribute('aria-pressed', String(activo));
    }
  };

  const pintar = () => {
    if (memoria.cargando) {
      lista.innerHTML = `<span class="lista-cuenta sk-texto">Buscando…</span>${[65, 55, 70, 50, 60].map((w, i) => skeletonFila(w, 30 + (i % 3) * 8)).join('')}`;
      return;
    }
    if (memoria.error) {
      lista.innerHTML = `
        <div class="lista-mensaje">
          <p>No se ha podido buscar. Revisa la conexión.</p>
          <button type="button" class="boton-secundario" data-accion="reintentar">Reintentar</button>
        </div>`;
      return;
    }
    if (memoria.resultados === null) {
      lista.innerHTML = `<p class="lista-mensaje">Escribe el nombre de un juego para buscarlo en el catálogo.</p>`;
      return;
    }
    const filtrados = memoria.resultados.filter((j) => tienePlataforma(j, memoria.plataforma));
    if (!filtrados.length) {
      lista.innerHTML = `<p class="lista-mensaje">${memoria.resultados.length
        ? `Ningún resultado en ${esc(memoria.plataforma)}.`
        : `Sin resultados para «${esc(memoria.texto.trim())}».`}</p>`;
      return;
    }
    const n = filtrados.length;
    lista.innerHTML = `<span class="lista-cuenta">${n} ${n === 1 ? 'resultado' : 'resultados'}</span>${filtrados.map(fila).join('')}`;
  };

  const lanzarBusqueda = async () => {
    const texto = memoria.texto;
    const k = clave(texto);
    controlador?.abort();
    if (cache.has(k)) {
      Object.assign(memoria, { resultados: cache.get(k), cargando: false, error: null });
      pintar();
      return;
    }
    controlador = new AbortController();
    const propio = controlador;
    try {
      const res = await buscarJuegos(texto, propio.signal);
      if (propio.signal.aborted) return;
      cache.set(k, res);
      Object.assign(memoria, { resultados: res, cargando: false, error: null });
    } catch (e) {
      if (propio.signal.aborted || e.name === 'AbortError') return;
      console.warn('[buscar]', e.message);
      Object.assign(memoria, { cargando: false, error: e.message });
    }
    if (input.isConnected) pintar();
  };

  input.addEventListener('input', () => {
    memoria.texto = input.value;
    clearTimeout(temporizador);
    controlador?.abort();
    if (clave(memoria.texto).length < MIN_LETRAS) {
      Object.assign(memoria, { resultados: null, cargando: false, error: null });
      pintar();
      return;
    }
    const k = clave(memoria.texto);
    if (cache.has(k)) {
      lanzarBusqueda();
      return;
    }
    if (!memoria.cargando) {
      memoria.cargando = true;
      memoria.error = null;
      pintar();
    }
    temporizador = setTimeout(lanzarBusqueda, ESPERA_MS);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur(); // cierra el teclado en móvil
  });

  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    memoria.plataforma = b.dataset.p;
    pintarChips();
    pintar();
  });

  lista.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="reintentar"]')) {
      memoria.cargando = true;
      memoria.error = null;
      pintar();
      lanzarBusqueda();
    }
  });

  // Si llegan datos nuevos del grupo, actualizar las notas de los resultados.
  const desuscribir = datos.suscribir(() => {
    if (!memoria.cargando) pintar();
  });

  pintarChips();
  // Búsqueda que se quedó a medias en la visita anterior: repetirla.
  if (memoria.resultados === null && !memoria.error && clave(memoria.texto).length >= MIN_LETRAS) {
    memoria.cargando = true;
    lanzarBusqueda();
  }
  pintar();
  if (!memoria.texto) requestAnimationFrame(() => input.focus({ preventScroll: true }));

  return () => {
    desuscribir();
    clearTimeout(temporizador);
    // Si se sale a mitad de búsqueda, se cancela y la próxima visita la repite.
    if (memoria.cargando) {
      controlador?.abort();
      memoria.cargando = false;
      memoria.resultados = null;
    }
  };
}

function fila(j) {
  const s = datos.statsJuego(j.igdb_id);
  const meta = [j.anio, (j.plataformas || []).join(', ')].filter(Boolean).join(' · ');
  const grupo = s.votos
    ? `<div class="fila-grupo">${notaConLetra(s.media, 'sm')}<span class="fila-sub">${s.votos} del grupo</span></div>`
    : `<span class="fila-sub">${s.jugadores ? `${s.jugadores} del grupo, sin nota todavía` : 'Nadie del grupo lo ha jugado'}</span>`;
  const href = `#juego/${j.igdb_id}`;
  return `
    <div class="fila-juego">
      <a class="fila-enlace" href="${href}">
        ${portada(j, 'lista')}
        <div class="fila-info">
          <span class="fila-titulo">${esc(j.nombre)}</span>
          ${meta ? `<span class="fila-meta">${esc(meta)}</span>` : ''}
          ${grupo}
        </div>
      </a>
      <a class="boton-mas" href="${href}" aria-label="Valorar ${esc(j.nombre)}">${icono('mas', { tam: 20, color: 'var(--acento-texto)' })}</a>
    </div>`;
}
