// Menú de los tres puntos de un juego o una saga (en mi biblioteca o mi historial).
// Hoja inferior con iconos propios, en este orden:
//   Valorar / Editar mi valoración · Abrir ficha · Añadir a una saga… (o Quitar de la
//   saga) · Fusionar con otro juego… · Mover a Probados / a Mis juegos · Ocultar de mi
//   biblioteca · (admin) Marcar como juego online / Quitar de online.
import { abrirHoja } from './hoja.js';
import { icono } from './icons.js';
import { esc, aviso } from './ui.js';
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { abrirValorar } from './hoja-valorar.js';
import { abrirFusion } from './fusiones.js';
import { anadirASagaUI, elegirJuegos } from './sagas-ui.js';

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
  const sg = datos.sagaDeJuego(id);
  const admin = !!datos.usuario(uid)?.es_admin;
  const online = datos.esOnline(id);
  abrirHoja({
    titulo: j.nombre,
    antetitulo: sg ? `Saga · ${sg.nombre}` : 'Juego',
    html: `
      <div class="menu-opciones">
        ${opcion('valorar', 'valorar', mia && mia.estado !== 'pendiente' ? 'Editar mi valoración' : 'Valorar')}
        ${opcion('ficha', 'ficha', 'Abrir ficha')}
        ${sg ? opcion('quitar-saga', 'saga', `Quitar de la saga «${sg.nombre}»`) : opcion('saga', 'saga', 'Añadir a una saga…')}
        ${opcion('fusionar', 'fusionar', 'Fusionar con otro juego…')}
        ${bib ? (bib.probado ? opcion('mis', 'probados', 'Mover a Mis juegos') : opcion('probados', 'probados', 'Mover a Probados')) : ''}
        ${bib ? opcion('ocultar', 'ocultar', 'Ocultar de mi biblioteca') : ''}
        ${admin && datos.juego(id) ? opcion('online', 'online', online ? 'Quitar de online' : 'Marcar como juego online') : ''}
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-opcion]');
        if (!b) return;
        const o = b.dataset.opcion;
        cerrar(true);
        if (o === 'valorar') abrirValorar(id, bib?.plataformaPrincipal ? { plataforma: bib.plataformaPrincipal } : {});
        else if (o === 'ficha') location.hash = `#juego/${id}`;
        else if (o === 'saga') anadirASagaUI(id, uid);
        else if (o === 'quitar-saga') { datos.quitarDeSaga(id, aviso); aviso(`Quitado de «${sg.nombre}»`); }
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
          aviso(online ? 'Ya no es un juego online' : 'Marcado como juego online');
        }
      });
    },
  });
}

/**
 * Menú de una saga. bib: su tarjeta en mi biblioteca (con los juegos que junta), si sale de ahí.
 */
export function abrirMenuSaga({ uid, sagaId, bib = null }) {
  const sg = datos.saga(sagaId);
  if (!sg) return;
  const mia = datos.miValoracionSaga(uid, sg.id);
  const titulos = bib ? bib.hijos.flatMap((x) => x.titulos ?? []) : [];
  const probada = bib ? bib.hijos.every((x) => x.probado) : false;
  abrirHoja({
    titulo: sg.nombre,
    antetitulo: 'Saga',
    html: `
      <div class="menu-opciones">
        ${opcion('valorar', 'valorar', mia && mia.estado !== 'pendiente' ? 'Editar mi valoración' : 'Valorar la saga')}
        ${opcion('ficha', 'ficha', 'Abrir ficha')}
        ${opcion('anadir', 'saga', 'Añadir juegos a la saga…')}
        ${titulos.length ? (probada ? opcion('mis', 'probados', 'Mover a Mis juegos') : opcion('probados', 'probados', 'Mover a Probados')) : ''}
        ${titulos.length ? opcion('ocultar', 'ocultar', 'Ocultar de mi biblioteca') : ''}
        ${datos.usuario(uid)?.es_admin ? opcion('online', 'online', sg.es_online ? 'Quitar de online' : 'Marcar como juego online') : ''}
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-opcion]');
        if (!b) return;
        const o = b.dataset.opcion;
        cerrar(true);
        if (o === 'valorar') abrirValorar(null, { saga: sg.id });
        else if (o === 'ficha') location.hash = `#saga/${sg.id}`;
        else if (o === 'anadir') anadirJuegosUI(sg.id, uid);
        else if (o === 'mis' || o === 'probados') {
          datos.ponerEnMisJuegos(uid, titulos, o === 'mis', aviso);
          aviso(o === 'mis' ? 'En «Mis juegos»' : 'En «Probados»');
        } else if (o === 'ocultar') {
          datos.ocultarBiblioteca(uid, titulos, true, aviso);
          aviso('Ocultos de tu biblioteca');
        } else if (o === 'online') {
          datos.editarSaga(sg.id, { es_online: !sg.es_online }, aviso);
          aviso(sg.es_online ? 'Ya no es una saga online' : 'Marcada como juego online');
        }
      });
    },
  });
}

/** Buscador de selección múltiple para añadir juegos a una saga. */
export function anadirJuegosUI(sagaId, uid) {
  const sg = datos.saga(sagaId);
  if (!sg) return;
  const mios = [...metricas.valoracionesDe(uid).map((v) => Number(v.juego_id)), ...metricas.biblioteca(uid).juegos.map((x) => x.igdbId).filter((x) => x != null)];
  elegirJuegos({
    titulo: 'Añadir juegos',
    antetitulo: sg.nombre,
    multiple: true,
    excluir: datos.juegosDeSaga(sg.id),
    primero: mios,
    alElegir: (ids) => {
      if (!ids.length) return;
      datos.anadirASaga(sg.id, ids, aviso);
      aviso(ids.length === 1 ? 'Añadido a la saga' : `${ids.length} juegos añadidos`);
    },
  });
}
