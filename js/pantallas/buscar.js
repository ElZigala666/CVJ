// Pantalla 03 · Buscar: IGDB (vía Edge Function) cruzado con los datos del grupo.
import { icono } from '../icons.js';
import { buscarJuegos } from '../igdb.js';
import * as datos from '../datos.js';
import { esc, portada, notaConLetra, skeletonFila } from '../ui.js';
import { abrirValorar } from '../hoja-valorar.js';

const PLATAFORMAS = ['Todas', 'PS5', 'PS4', 'PC', 'Xbox', 'Switch'];
const ESPERA_MS = 300;
const MIN_LETRAS = 2;

// Se conserva entre visitas a la pestaña: al volver de una ficha sigue todo igual.
const memoria = {
  texto: '',
  plataforma: 'Todas',
  error: null, // { k, mensaje } del último fallo
};

// Resultados de cada texto ya buscado en esta sesión (memoria + sessionStorage):
// borrar y volver a escribir es instantáneo.
const CLAVE_CACHE = 'cvj.busquedas.v2';
const MAX_CACHE = 60;
const cache = new Map();
try {
  const guardado = JSON.parse(sessionStorage.getItem(CLAVE_CACHE) || '[]');
  for (const [k, v] of guardado) cache.set(k, v);
} catch { /* nada */ }
function recordarBusqueda(k, res) {
  cache.delete(k);
  cache.set(k, res);
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  try { sessionStorage.setItem(CLAVE_CACHE, JSON.stringify([...cache])); } catch { /* sin espacio */ }
}

let controlador = null;
let enCurso = null; // clave de la petición que está en marcha
let temporizador = null;

const clave = (t) => normalizar(t);

/** minúsculas, sin tildes ni signos (igual que en la función igdb). */
function normalizar(t) {
  return String(t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** El nombre contiene todas las palabras (la última puede estar a medias). */
function coincide(nombre, k) {
  const n = normalizar(nombre);
  const palabrasNombre = n.split(' ');
  return k.split(' ').every((w) => n.includes(w) || palabrasNombre.some((x) => x.startsWith(w)));
}

/** Juegos que el grupo ya tiene y coinciden con el texto (van primero). */
function delGrupo(k) {
  return datos.estado.juegos
    .filter((j) => datos.valoracionesDeJuego(j.igdb_id).length && coincide(j.nombre, k))
    .map((j) => ({ j, n: datos.valoracionesDeJuego(j.igdb_id).length }))
    .sort((a, b) => b.n - a.n || a.j.nombre.localeCompare(b.j.nombre))
    .map((x) => x.j);
}

/** "Switch" también cuenta "Switch 2"; "Xbox" cuenta "Xbox 360". */
function tienePlataforma(juego, p) {
  return p === 'Todas' || (juego.plataformas || []).some((x) => x === p || x.startsWith(`${p} `));
}

export function render(el, { ruta } = {}) {
  // Modo valorar (botón central): mismo buscador, pero tocar un resultado abre la hoja.
  const modoValorar = ruta === 'valorar';
  el.innerHTML = `
    <section class="buscar">
      <div class="buscar-cab">
        <h1 class="titulo-pantalla">${modoValorar ? '¿Qué juego quieres valorar?' : 'Buscar'}</h1>
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

  // Todo se deriva del texto actual y de la caché: mientras no haya respuesta
  // para ESTE texto se ven skeletons; "Sin resultados" solo con la respuesta final vacía.
  const pintar = () => {
    const k = clave(memoria.texto);
    if (k.length < MIN_LETRAS) {
      lista.innerHTML = `<p class="lista-mensaje">Escribe el nombre de un juego para buscarlo en el catálogo.</p>`;
      return;
    }
    const locales = delGrupo(k);
    const res = cache.get(k);
    const filtrar = (l) => l.filter((j) => tienePlataforma(j, memoria.plataforma));

    if (!res) {
      const filasLocales = filtrar(locales);
      if (memoria.error?.k === k) {
        lista.innerHTML = `
          ${filasLocales.map((j, i) => fila(j, i, modoValorar)).join('')}
          <div class="lista-mensaje">
            <p>No se ha podido buscar en el catálogo. Revisa la conexión.</p>
            <button type="button" class="boton-secundario" data-accion="reintentar">Reintentar</button>
          </div>`;
        return;
      }
      lista.innerHTML = `<span class="lista-cuenta sk-texto">Buscando…</span>${filasLocales.map((j, i) => fila(j, i, modoValorar)).join('')}${[65, 55, 70, 50, 60].map((w, i) => skeletonFila(w, 30 + (i % 3) * 8)).join('')}`;
      return;
    }

    const ids = new Set(locales.map((j) => Number(j.igdb_id)));
    const todos = [...locales, ...res.filter((j) => !ids.has(Number(j.igdb_id)))];
    const filtrados = filtrar(todos);
    if (!filtrados.length) {
      lista.innerHTML = `<p class="lista-mensaje">${todos.length
        ? `Ningún resultado en ${esc(memoria.plataforma)}.`
        : `Sin resultados para «${esc(memoria.texto.trim())}».`}</p>`;
      return;
    }
    const n = filtrados.length;
    lista.innerHTML = `<span class="lista-cuenta">${n} ${n === 1 ? 'resultado' : 'resultados'}</span>${filtrados.map((j, i) => fila(j, i, modoValorar)).join('')}`;
  };

  const lanzarBusqueda = async () => {
    const texto = memoria.texto;
    const k = clave(texto);
    if (k.length < MIN_LETRAS || cache.has(k)) { pintar(); return; }
    if (enCurso === k) return; // ya se está pidiendo este mismo texto
    controlador?.abort();
    controlador = new AbortController();
    const propio = controlador;
    enCurso = k;
    try {
      const res = await buscarJuegos(texto, propio.signal);
      recordarBusqueda(k, res);
      datos.recordarParciales(res);
      if (memoria.error?.k === k) memoria.error = null;
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn('[buscar]', e.message);
      memoria.error = { k, mensaje: e.message };
    } finally {
      if (enCurso === k) enCurso = null;
    }
    if (input.isConnected) pintar();
  };

  input.addEventListener('input', () => {
    memoria.texto = input.value;
    clearTimeout(temporizador);
    const k = clave(memoria.texto);
    if (enCurso && enCurso !== k) {
      controlador?.abort(); // una respuesta vieja ya no sirve
      enCurso = null;
    }
    pintar(); // al instante: caché, coincidencias del grupo o skeletons
    if (k.length >= MIN_LETRAS && !cache.has(k)) temporizador = setTimeout(lanzarBusqueda, ESPERA_MS);
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
    const valorar = e.target.closest('[data-valorar]');
    if (valorar) {
      e.preventDefault();
      abrirValorar(valorar.dataset.valorar);
      return;
    }
    if (e.target.closest('[data-accion="reintentar"]')) {
      memoria.error = null;
      pintar();
      lanzarBusqueda();
    }
  });

  // Si llegan datos nuevos del grupo, actualizar las notas de los resultados.
  const desuscribir = datos.suscribir(pintar);

  pintarChips();
  pintar();
  // Búsqueda que se quedó a medias en la visita anterior: repetirla.
  if (clave(memoria.texto).length >= MIN_LETRAS && !cache.has(clave(memoria.texto))) lanzarBusqueda();
  if (!memoria.texto || modoValorar) requestAnimationFrame(() => input.focus({ preventScroll: true }));

  return () => {
    desuscribir();
    clearTimeout(temporizador);
    // Si se sale a mitad de búsqueda, se deja terminar: el resultado queda en la caché.
  };
}

function fila(j, i, modoValorar) {
  const s = datos.statsJuego(j.igdb_id);
  const meta = [j.anio, (j.plataformas || []).join(', ')].filter(Boolean).join(' · ');
  const grupo = s.votos
    ? `<div class="fila-grupo">${notaConLetra(s.media, 'sm')}<span class="fila-sub">${s.votos} del grupo</span></div>`
    : `<span class="fila-sub">${s.jugadores ? `${s.jugadores} del grupo, sin nota todavía` : 'Nadie del grupo lo ha jugado'}</span>`;
  const href = `#juego/${j.igdb_id}`;
  const cover = esc(j.cover_id ?? '');
  // En modo valorar, toda la fila abre la hoja; si no, abre la ficha (precargando la portada grande).
  const enlaceFila = modoValorar
    ? `<a class="fila-enlace" href="${href}" data-valorar="${j.igdb_id}">`
    : `<a class="fila-enlace" href="${href}" data-precarga="${cover}">`;
  return `
    <div class="fila-juego">
      ${enlaceFila}
        ${portada(j, { clase: 'portada-lista', prioridad: i < 6 })}
        <div class="fila-info">
          <span class="fila-titulo">${esc(j.nombre)}</span>
          ${meta ? `<span class="fila-meta">${esc(meta)}</span>` : ''}
          ${grupo}
        </div>
      </a>
      <button type="button" class="boton-mas" data-valorar="${j.igdb_id}" aria-label="Valorar ${esc(j.nombre)}">${icono('mas', { tam: 20, color: 'var(--acento-texto)' })}</button>
    </div>`;
}
