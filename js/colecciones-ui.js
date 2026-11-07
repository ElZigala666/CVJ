// Piezas de colecciones que se usan desde varios sitios:
//  - elegirJuegos: buscador en hoja inferior (uno o varios), con los juegos que ya
//    conoce la app y, si se escribe, los de IGDB.
//  - anadirAColeccionUI: "Añadir a una colección…" desde un juego (cualquier colección o una nueva;
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

/** "Añadir a una colección…": elegir cualquier colección o crear una; la sugerida va primero. */
export function anadirAColeccionUI(igdbId, uid) {
  const id = datos.canonico(igdbId);
  const j = datos.juegoConocido(id);
  if (!j) return;
  const sug = metricas.coleccionSugerida(id);
  let texto = '';
  const tarjeta = (sg, etiqueta = '') => {
    const ids = datos.juegosDeColeccion(sg.id);
    return `
      <button type="button" class="fila-elegir" data-coleccion="${esc(sg.id)}">
        ${portada(datos.comoJuego(sg), { clase: 'portada-lista' })}
        <span class="fila-elegir-texto"><strong>${esc(sg.nombre)}</strong><small>${etiqueta ? `${esc(etiqueta)} · ` : ''}${ids.length} ${ids.length === 1 ? 'juego' : 'juegos'}</small></span>
      </button>`;
  };
  abrirHoja({
    titulo: 'Añadir a una colección',
    antetitulo: j.nombre,
    html: `
      <div class="elegir-juegos">
        ${sug?.coleccion ? tarjeta(sug.coleccion, 'Sugerida') : ''}
        ${sug?.crear ? `
          <button type="button" class="fila-elegir" data-crear="${esc(sug.crear.nombre)}" data-coleccion="${sug.crear.coleccionId}">
            <span class="fila-elegir-icono">${icono('coleccion', { tam: 22, color: 'var(--acento)' })}</span>
            <span class="fila-elegir-texto"><strong>Crear «${esc(sug.crear.nombre)}»</strong><small>Sugerida por IGDB</small></span>
          </button>` : ''}
        <input type="search" class="psn-input" data-ref="q" placeholder="Busca una colección" autocomplete="off">
        <div class="elegir-lista" data-ref="lista"></div>
        <span class="campo-titulo">O crea una nueva</span>
        <div class="psn-form">
          <input class="psn-input" data-ref="nueva" maxlength="80" placeholder="Nombre de la colección" autocomplete="off">
          <button type="button" class="boton-principal" data-ref="crear">Crear</button>
        </div>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      const pintar = () => {
        const q = normalizarBusqueda(texto);
        const lista = datos.colecciones()
          .filter((sg) => sg.id !== sug?.coleccion?.id && (!q || normalizarBusqueda(sg.nombre).includes(q)))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        $('lista').innerHTML = lista.map((sg) => tarjeta(sg)).join('')
          || `<p class="ajustes-nota">${datos.colecciones().length ? 'Ninguna colección con ese nombre.' : 'Todavía no hay colecciones.'}</p>`;
      };
      const crear = (nombre, coleccionId = null) => {
        if (!nombre.trim()) { $('nueva').focus(); return; }
        cerrar();
        const nueva = datos.crearColeccion({ nombre, juegos: [id], igdbColeccionId: coleccionId, usuarioId: uid }, aviso);
        aviso(`Colección «${nombre.trim()}» creada`);
        return nueva;
      };
      $('q').addEventListener('input', (e) => { texto = e.target.value; pintar(); });
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-coleccion]');
        if (b) {
          const sg = datos.coleccion(b.dataset.coleccion);
          cerrar();
          datos.anadirAColeccion(sg.id, [id], aviso);
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

/** Tarjeta "¿Juntar … en una colección?" (solo la ve el admin, en Inicio). */
export function tarjetaSugerenciaColeccion(s) {
  const juegos = s.juegos.map((id) => datos.juegoConocido(id)).filter(Boolean);
  return `
    <div class="tarjeta-fusion">
      <div class="tarjeta-fusion-portadas">${juegos.slice(0, 3).map((j) => portada(j, { clase: 'portada-lista' })).join('')}</div>
      <div class="tarjeta-fusion-texto">
        <strong>¿Juntar ${esc(juegos.map((j) => j.nombre).slice(0, 3).join(', '))}${juegos.length > 3 ? '…' : ''} en una colección?</strong>
        <span>Contarán como un solo juego para todo el grupo: una tarjeta, una nota y las horas sumadas. Solo lo ves tú (admin).</span>
        <div class="tarjeta-fusion-botones">
          <button type="button" class="boton-secundario boton-pequeno" data-col-si="${s.id}">Crear colección «${esc(s.nombre)}»</button>
          <button type="button" class="boton-secundario neutro boton-pequeno" data-col-otra="${s.id}">Añadir a otra colección</button>
          <button type="button" class="enlace-discreto" data-col-no="${s.id}" data-nombre="${esc(s.nombre)}">No, son juegos distintos</button>
        </div>
      </div>
    </div>`;
}

/** Clics de esa tarjeta. Devuelve true si era suyo. */
export function clicSugerenciaColeccion(e, uid) {
  const b = e.target.closest('[data-col-si], [data-col-no], [data-col-otra]');
  if (!b) return false;
  const col = Number(b.dataset.colSi ?? b.dataset.colNo ?? b.dataset.colOtra);
  const sug = metricas.sugerenciasColeccion(uid).find((x) => Number(x.id) === col);
  if (b.dataset.colNo) {
    datos.guardarSugerenciaColeccion(uid, col, b.dataset.nombre, false, aviso);
    aviso('No volveremos a sugerirlo');
  } else if (b.dataset.colOtra && sug) {
    elegirColeccionParaVarios(sug.juegos, uid);
  } else if (sug) {
    datos.crearColeccion({ nombre: sug.nombre, juegos: sug.juegos, igdbColeccionId: col, usuarioId: uid }, aviso);
    aviso(`Colección «${sug.nombre}» creada`);
  }
  return true;
}

/** "Añadir a otra colección": todos esos juegos a la que se elija (o a una nueva). */
export function elegirColeccionParaVarios(ids, uid) {
  abrirHoja({
    titulo: 'Elegir colección',
    html: `
      <div class="elegir-juegos">
        ${datos.colecciones().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((sg) => `
          <button type="button" class="fila-elegir" data-a-coleccion="${esc(sg.id)}">
            ${portada(datos.comoJuego(sg), { clase: 'portada-lista' })}
            <span class="fila-elegir-texto"><strong>${esc(sg.nombre)}</strong><small>${datos.juegosDeColeccion(sg.id).length} juegos</small></span>
          </button>`).join('') || '<p class="ajustes-nota">Todavía no hay colecciones.</p>'}
        <span class="campo-titulo">O crea una con otro nombre</span>
        <div class="psn-form">
          <input class="psn-input" data-ref="nueva" maxlength="80" placeholder="Nombre de la colección" autocomplete="off">
          <button type="button" class="boton-principal" data-ref="crear">Crear</button>
        </div>
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a-coleccion]');
        if (b) { cerrar(); datos.anadirAColeccion(b.dataset.aColeccion, ids, aviso); aviso('Añadidos a la colección'); return; }
        if (e.target.closest('[data-ref="crear"]')) {
          const n = cuerpo.querySelector('[data-ref="nueva"]').value.trim();
          if (!n) return;
          cerrar();
          datos.crearColeccion({ nombre: n, juegos: ids, usuarioId: uid }, aviso);
          aviso(`Colección «${n}» creada`);
        }
      });
    },
  });
}
