// Menú de los tres puntos de un juego o una colección (en mi biblioteca o mi historial).
// Hoja inferior con iconos propios, en este orden:
//   Valorar / Editar mi valoración · Abrir ficha · Añadir a una colección… (o Quitar de la
//   coleccion) · Fusionar con otro juego… · Mover a Probados / a Mis juegos · Ocultar de mi
//   biblioteca · (admin) Marcar como juego online / Quitar de online.
import { abrirHoja } from './hoja.js';
import { icono } from './icons.js';
import { esc, aviso } from './ui.js';
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { abrirValorar } from './hoja-valorar.js';
import { abrirFusion } from './fusiones.js';
import { anadirAColeccionUI, elegirJuegos } from './colecciones-ui.js';

const opcion = (accion, ic, texto, extra = '') => `
  <button type="button" class="menu-opcion${extra}" data-opcion="${accion}">
    <span class="menu-opcion-icono">${icono(ic, { tam: 22, color: 'currentColor', trazo: 'var(--superficie)' })}</span>
    <span>${esc(texto)}</span>
  </button>`;

/**
 * @param {{ uid: string, igdbId: number, bib?: object|null }} op  bib: la entrada de mi
 *   biblioteca (si sale de ahí), para Probados y Ocultar.
 */
export function abrirMenuJuego({ uid, igdbId, bib = null }) {
  const id = datos.canonico(igdbId);
  const j = datos.juegoConocido(id);
  if (!j) return;
  const mia = datos.miValoracion(uid, id);
  const sg = datos.coleccionDeJuego(id);
  const admin = !!datos.usuario(uid)?.es_admin;
  const online = datos.esOnline(id);
  abrirHoja({
    titulo: j.nombre,
    antetitulo: sg ? `Colección · ${sg.nombre}` : 'Juego',
    html: `
      <div class="menu-opciones">
        ${opcion('valorar', 'valorar', mia && mia.estado !== 'pendiente' ? 'Editar mi valoración' : 'Valorar')}
        ${opcion('ficha', 'ficha', 'Abrir ficha')}
        ${!admin ? '' : sg ? opcion('quitar-coleccion', 'coleccion', `Quitar de la colección «${sg.nombre}»`) : opcion('coleccion', 'coleccion', 'Añadir a una colección…')}
        ${opcion('fusionar', 'fusionar', 'Fusionar con otro juego…')}
        ${bib ? (bib.probado ? opcion('mis', 'probados', 'Mover a Mis juegos') : opcion('probados', 'probados', 'Mover a Probados')) : ''}
        ${bib ? opcion('ocultar', 'ocultar', 'Ocultar de mi biblioteca') : ''}
        ${admin && datos.juego(id) ? opcion('online', 'online', online ? 'Quitar de «Sin final»' : 'Marcar como sin final') : ''}
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-opcion]');
        if (!b) return;
        const o = b.dataset.opcion;
        cerrar(true);
        if (o === 'valorar') abrirValorar(id, bib?.plataformaPrincipal ? { plataforma: bib.plataformaPrincipal } : {});
        else if (o === 'ficha') location.hash = `#juego/${id}`;
        else if (o === 'coleccion') anadirAColeccionUI(id, uid);
        else if (o === 'quitar-coleccion') { datos.quitarDeColeccion(id, aviso); aviso(`Quitado de «${sg.nombre}»`); }
        else if (o === 'fusionar') {
          const mios = [...metricas.valoracionesDe(uid).map((v) => Number(v.juego_id)), ...metricas.biblioteca(uid).juegos.map((x) => x.igdbId).filter((x) => x != null)];
          elegirJuegos({
            titulo: '¿Con qué juego?', antetitulo: `Fusionar ${j.nombre}`, excluir: [id], primero: mios,
            alElegir: ([otro]) => abrirFusion(uid, id, datos.canonico(otro)),
          });
        } else if (o === 'mis' || o === 'probados') {
          datos.ponerEnMisJuegos(uid, bib.titulos, o === 'mis', aviso);
          aviso(o === 'mis' ? 'En «Mis juegos»' : 'En «Probados»');
        } else if (o === 'ocultar') {
          datos.ocultarBiblioteca(uid, bib.titulos, true, aviso);
          aviso('Oculto de tu biblioteca');
        } else if (o === 'online') {
          datos.marcarOnline(id, !online, aviso);
          aviso(online ? 'Ya no es un juego sin final' : 'Marcado como sin final');
        }
      });
    },
  });
}

/**
 * Menú de una colección. bib: su tarjeta en mi biblioteca (con los juegos que junta), si sale de ahí.
 */
export function abrirMenuColeccion({ uid, coleccionId, bib = null }) {
  const sg = datos.coleccion(coleccionId);
  if (!sg) return;
  const mia = datos.miValoracionColeccion(uid, sg.id);
  const titulos = bib ? bib.hijos.flatMap((x) => x.titulos ?? []) : [];
  const probada = bib ? bib.hijos.every((x) => x.probado) : false;
  abrirHoja({
    titulo: sg.nombre,
    antetitulo: 'Colección',
    html: `
      <div class="menu-opciones">
        ${opcion('valorar', 'valorar', mia && mia.estado !== 'pendiente' ? 'Editar mi valoración' : 'Valorar la colección')}
        ${opcion('ficha', 'ficha', 'Abrir ficha')}
        ${datos.usuario(uid)?.es_admin ? opcion('anadir', 'coleccion', 'Añadir juegos a la colección…') : ''}
        ${titulos.length ? (probada ? opcion('mis', 'probados', 'Mover a Mis juegos') : opcion('probados', 'probados', 'Mover a Probados')) : ''}
        ${titulos.length ? opcion('ocultar', 'ocultar', 'Ocultar de mi biblioteca') : ''}
        ${datos.usuario(uid)?.es_admin ? opcion('online', 'online', sg.es_online ? 'Quitar de «Sin final»' : 'Marcar como sin final') : ''}
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-opcion]');
        if (!b) return;
        const o = b.dataset.opcion;
        cerrar(true);
        if (o === 'valorar') abrirValorar(null, { coleccion: sg.id });
        else if (o === 'ficha') location.hash = `#coleccion/${sg.id}`;
        else if (o === 'anadir') anadirJuegosUI(sg.id, uid);
        else if (o === 'mis' || o === 'probados') {
          datos.ponerEnMisJuegos(uid, titulos, o === 'mis', aviso);
          aviso(o === 'mis' ? 'En «Mis juegos»' : 'En «Probados»');
        } else if (o === 'ocultar') {
          datos.ocultarBiblioteca(uid, titulos, true, aviso);
          aviso('Ocultos de tu biblioteca');
        } else if (o === 'online') {
          datos.editarColeccion(sg.id, { es_online: !sg.es_online }, aviso);
          aviso(sg.es_online ? 'Ya no es una colección sin final' : 'Marcada como sin final');
        }
      });
    },
  });
}

/** Buscador de selección múltiple para añadir juegos a una colección. */
export function anadirJuegosUI(coleccionId, uid) {
  const sg = datos.coleccion(coleccionId);
  if (!sg) return;
  const mios = [...metricas.valoracionesDe(uid).map((v) => Number(v.juego_id)), ...metricas.biblioteca(uid).juegos.map((x) => x.igdbId).filter((x) => x != null)];
  elegirJuegos({
    titulo: 'Añadir juegos',
    antetitulo: sg.nombre,
    multiple: true,
    excluir: datos.juegosDeColeccion(sg.id),
    primero: mios,
    alElegir: (ids) => {
      if (!ids.length) return;
      datos.anadirAColeccion(sg.id, ids, aviso);
      aviso(ids.length === 1 ? 'Añadido a la colección' : `${ids.length} juegos añadidos`);
    },
  });
}
