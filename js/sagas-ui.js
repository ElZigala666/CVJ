// Piezas de sagas que se usan desde varios sitios:
//  - elegirJuegos: buscador en hoja inferior (uno o varios), con los juegos que ya
//    conoce la app y, si se escribe, los de IGDB.
//  - anadirASagaUI: "Añadir a una saga…" desde un juego (cualquier saga o una nueva;
//    la sugerencia automática sale primero, pero se puede elegir otra).
import { abrirHoja } from './hoja.js';
import { icono } from './icons.js';
import { esc, portada, aviso } from './ui.js';
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { buscarJuegos } from './igdb.js';
import { normalizarBusqueda } from './psn-nombres.js';

/**
 * Buscador de juegos en una hoja.
 * @param {{ titulo: string, antetitulo?: string, multiple?: boolean, excluir?: number[],
 *           boton?: string, primero?: number[], alElegir: (ids: number[]) => void }} op
 */
export function elegirJuegos({ titulo, antetitulo = '', multiple = false, excluir = [], boton = 'Añadir', primero = [], alElegir }) {
  const fuera = new Set(excluir.map(Number));
  const elegidos = new Set();
  let remotos = [];
  let texto = '';
  let pidiendo = null;

  // Los conocidos: primero los que se piden (p. ej. mis juegos), luego el resto.
  const locales = () => {
    const vistos = new Set();
    const lista = [];
    for (const id of [...primero.map(Number), ...datos.estado.juegos.map((j) => Number(j.igdb_id))]) {
      const c = datos.canonico(id);
      if (vistos.has(c) || fuera.has(c)) continue;
      vistos.add(c);
      const j = datos.juegoConocido(c);
      if (j) lista.push(j);
    }
    return lista;
  };

  const fila = (j) => {
    const sel = elegidos.has(Number(j.igdb_id));
    return `
      <button type="button" class="fila-elegir${sel ? ' elegida' : ''}" data-elegir="${j.igdb_id}" aria-pressed="${sel}">
        ${portada(j, { clase: 'portada-lista' })}
        <span class="fila-elegir-texto"><strong>${esc(j.nombre)}</strong>${j.anio ? `<small>${j.anio}</small>` : ''}</span>
        ${multiple ? `<span class="casilla${sel ? ' marcada' : ''}" aria-hidden="true">${sel ? icono('completado', { tam: 22, color: 'var(--acento)', trazo: 'var(--sobre-acento)' }) : ''}</span>` : ''}
      </button>`;
  };

  abrirHoja({
    titulo,
    antetitulo,
    html: `
      <div class="elegir-juegos">
        <input type="search" class="psn-input" data-ref="q" placeholder="Busca un juego" autocomplete="off" enterkeyhint="search">
        <div class="elegir-lista" data-ref="lista"></div>
        ${multiple ? `<button type="button" class="boton-principal" data-ref="ok" disabled>${esc(boton)}</button>` : ''}
      </div>`,
    alMontar(cuerpo, cerrar) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      const pintar = () => {
        const q = normalizarBusqueda(texto);
        const loc = locales().filter((j) => !q || normalizarBusqueda(j.nombre).includes(q)).slice(0, q ? 30 : 40);
        const ids = new Set(loc.map((j) => Number(j.igdb_id)));
        const rem = remotos.filter((j) => !ids.has(datos.canonico(j.igdb_id)) && !fuera.has(datos.canonico(j.igdb_id)));
        $('lista').innerHTML = [...loc, ...rem].map(fila).join('')
          || `<p class="ajustes-nota">${pidiendo ? 'Buscando…' : 'Ningún juego con ese nombre.'}</p>`;
        const ok = $('ok');
        if (ok) { ok.disabled = !elegidos.size; ok.textContent = elegidos.size ? `${boton} (${elegidos.size})` : boton; }
      };
      let reloj = null;
      $('q').addEventListener('input', (e) => {
        texto = e.target.value;
        pintar();
        clearTimeout(reloj);
        if (texto.trim().length < 2) { remotos = []; return; }
        reloj = setTimeout(async () => {
          pidiendo?.abort();
          pidiendo = new AbortController();
          try {
            const r = await buscarJuegos(texto.trim(), pidiendo.signal);
            datos.recordarParciales(r);
            remotos = r;
          } catch { /* sin conexión: quedan los conocidos */ }
          pidiendo = null;
          pintar();
        }, 350);
      });
      $('lista').addEventListener('click', (e) => {
        const b = e.target.closest('[data-elegir]');
        if (!b) return;
        const id = Number(b.dataset.elegir);
        if (!multiple) { cerrar(); alElegir([id]); return; }
        if (elegidos.has(id)) elegidos.delete(id); else elegidos.add(id);
        pintar();
      });
      $('ok')?.addEventListener('click', () => { cerrar(); alElegir([...elegidos]); });
      pintar();
    },
  });
}

/** "Añadir a una saga…": elegir cualquier saga o crear una; la sugerida va primero. */
export function anadirASagaUI(igdbId, uid) {
  const id = datos.canonico(igdbId);
  const j = datos.juegoConocido(id);
  if (!j) return;
  const sug = metricas.sagaSugerida(id);
  let texto = '';
  const tarjeta = (sg, etiqueta = '') => {
    const ids = datos.juegosDeSaga(sg.id);
    return `
      <button type="button" class="fila-elegir" data-saga="${esc(sg.id)}">
        ${portada(datos.comoJuego(sg), { clase: 'portada-lista' })}
        <span class="fila-elegir-texto"><strong>${esc(sg.nombre)}</strong><small>${etiqueta ? `${esc(etiqueta)} · ` : ''}${ids.length} ${ids.length === 1 ? 'juego' : 'juegos'}</small></span>
      </button>`;
  };
  abrirHoja({
    titulo: 'Añadir a una saga',
    antetitulo: j.nombre,
    html: `
      <div class="elegir-juegos">
        ${sug?.saga ? tarjeta(sug.saga, 'Sugerida') : ''}
        ${sug?.crear ? `
          <button type="button" class="fila-elegir" data-crear="${esc(sug.crear.nombre)}" data-coleccion="${sug.crear.coleccionId}">
            <span class="fila-elegir-icono">${icono('saga', { tam: 22, color: 'var(--acento)' })}</span>
            <span class="fila-elegir-texto"><strong>Crear «${esc(sug.crear.nombre)}»</strong><small>Sugerida por su saga en IGDB</small></span>
          </button>` : ''}
        <input type="search" class="psn-input" data-ref="q" placeholder="Busca una saga" autocomplete="off">
        <div class="elegir-lista" data-ref="lista"></div>
        <span class="campo-titulo">O crea una nueva</span>
        <div class="psn-form">
          <input class="psn-input" data-ref="nueva" maxlength="80" placeholder="Nombre de la saga" autocomplete="off">
          <button type="button" class="boton-principal" data-ref="crear">Crear</button>
        </div>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      const pintar = () => {
        const q = normalizarBusqueda(texto);
        const lista = datos.sagas()
          .filter((sg) => sg.id !== sug?.saga?.id && (!q || normalizarBusqueda(sg.nombre).includes(q)))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        $('lista').innerHTML = lista.map((sg) => tarjeta(sg)).join('')
          || `<p class="ajustes-nota">${datos.sagas().length ? 'Ninguna saga con ese nombre.' : 'Todavía no hay sagas.'}</p>`;
      };
      const crear = (nombre, coleccionId = null) => {
        if (!nombre.trim()) { $('nueva').focus(); return; }
        cerrar();
        const nueva = datos.crearSaga({ nombre, juegos: [id], coleccionId, usuarioId: uid }, aviso);
        aviso(`Saga «${nombre.trim()}» creada`);
        return nueva;
      };
      $('q').addEventListener('input', (e) => { texto = e.target.value; pintar(); });
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-saga]');
        if (b) {
          const sg = datos.saga(b.dataset.saga);
          cerrar();
          datos.anadirASaga(sg.id, [id], aviso);
          aviso(`Añadido a «${sg.nombre}»`);
          return;
        }
        const c = e.target.closest('[data-crear]');
        if (c) { crear(c.dataset.crear, Number(c.dataset.coleccion) || null); return; }
        if (e.target.closest('[data-ref="crear"]')) crear($('nueva').value);
      });
      $('nueva').addEventListener('keydown', (e) => { if (e.key === 'Enter') crear($('nueva').value); });
      pintar();
    },
  });
}
