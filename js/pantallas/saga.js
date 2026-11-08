// Página de una saga (#saga/{id}): Persona, Zelda, Final Fantasy...
// Juegos independientes que se ven juntos: cada uno con su nota y sus horas. La saga
// no se valora. Estilo editorial: mosaico de portadas, resumen del grupo y todos los
// juegos principales en orden de salida (los que nadie ha jugado, atenuados).
// El admin puede renombrar, ocultar, fusionar y quitar o añadir juegos.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import { esc, portada, urlPortada, mejorCargada, notaConLetra, avatar, aviso, colorFondo } from '../ui.js';
import { volver } from '../navegacion.js';
import * as metricas from '../metricas.js';
import { formatearNota } from '../notas.js';
import { abrirHoja } from '../hoja.js';
import { colorDominante, hexAHsl } from '../color-dominante.js';
import { elegirJuegos } from '../colecciones-ui.js';
import { bloqueColumnas } from '../columnas-ui.js';

export function render(el, { params }) {
  const id = params[0];
  const yo = usuarioActual();
  const esAdmin = () => !!datos.usuario(yo?.id)?.es_admin;
  const vista = { editando: false, confirmarOcultar: false };
  let colorPuesto = null;

  const pintar = () => {
    const sg = datos.saga(id);
    if (!sg) {
      el.innerHTML = `
        <section class="saga">
          <button type="button" class="ficha-volver" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 22, color: '#FFFFFF' })}</button>
          <div class="saga-vacia"><h1 class="ficha-titulo">Saga no encontrada</h1></div>
        </section>`;
      return;
    }
    // Fusionada con otra: se va a esa sin dejar paso en el historial.
    if (sg.fusionada_en && datos.saga(sg.fusionada_en)) {
      history.replaceState(history.state, '', `#saga/${sg.fusionada_en}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return;
    }
    const r = metricas.resumenSaga(id, yo?.id);
    const jugadosPrimero = [...r.juegos].sort((a, b) => Number(b.jugado) - Number(a.jugado));
    const mosaico = jugadosPrimero.filter((x) => x.juego.cover_id).slice(0, 4);
    const anios = r.juegos.map((x) => x.juego.anio).filter(Boolean);
    document.title = `CVJ · ${sg.nombre}`;

    el.innerHTML = `
      <section class="saga">
        <header class="saga-cab" data-ref="cab">
          <button type="button" class="ficha-volver" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 22, color: '#FFFFFF' })}</button>
          <div class="saga-mosaico n${mosaico.length}">
            ${mosaico.map((x, i) => portada(x.juego, { clase: 'portada-saga', prioridad: i < 4 })).join('')}
          </div>
          <div class="saga-cab-texto">
            <span class="saga-antetitulo">${icono('saga', { tam: 16, color: 'currentColor' })} Saga</span>
            <h1 class="saga-titulo">${esc(sg.nombre)}</h1>
            <span class="saga-meta">${r.juegos.length} juegos${anios.length ? ` · ${Math.min(...anios)}–${Math.max(...anios)}` : ''} · el grupo ha jugado ${r.jugados}</span>
          </div>
        </header>

        <section class="saga-resumen">
          ${r.mejor ? `
            <a class="saga-dato saga-mejor" href="#juego/${r.mejor.id}">
              <span class="saga-dato-etq">Mejor de la saga para el grupo</span>
              <strong>${esc(r.mejor.juego.nombre)}</strong>
              <span class="saga-dato-nota">${notaConLetra(r.mejor.media, 'lg')}</span>
            </a>` : ''}
          <div class="saga-dato">
            <span class="saga-dato-etq">Horas del grupo</span>
            <strong class="saga-num">${r.horasGrupo ? esc(metricas.textoAprox(r.horasGrupo, r.estimadasGrupo)) : '—'}</strong>
          </div>
          ${r.masJugador ? `
            <div class="saga-dato">
              <span class="saga-dato-etq">Quien más ha jugado</span>
              <span class="saga-quien">${avatar(r.masJugador.usuario, 28)}<strong>${esc(r.masJugador.usuario?.nombre ?? '')}</strong></span>
              <span class="saga-dato-sub">${r.masJugador.n} de ${r.juegos.length} juegos</span>
            </div>` : ''}
        </section>

        <div class="saga-bloque">${bloqueColumnas({ saga: id })}</div>

        ${r.ranking.length >= 2 ? `
          <section class="saga-bloque">
            <h2 class="seccion-titulo">Ranking de la saga</h2>
            <ol class="saga-ranking">
              ${r.ranking.map((x, i) => `
                <li><a href="#juego/${x.id}"><span class="saga-pos">${i + 1}</span><span class="saga-rk-nombre">${esc(x.juego.nombre)}</span><span>${notaConLetra(x.media, 'act')}</span></a></li>`).join('')}
            </ol>
          </section>` : ''}

        <section class="saga-bloque">
          <h2 class="seccion-titulo">Todos los juegos</h2>
          <ol class="saga-lista" data-lista>
            ${r.juegos.map((x) => `
              <li class="saga-juego${x.jugado ? '' : ' sin-jugar'}" data-sel="${x.id}" data-sel-tipo="fila">
                <a href="#juego/${x.id}" data-precarga="${esc(x.juego.cover_id ?? '')}">
                  ${portada(x.juego, { clase: 'portada-lista' })}
                  <span class="saga-juego-texto">
                    <strong>${esc(x.juego.nombre)}</strong>
                    <small>${[x.juego.anio, x.jugado ? '' : 'Nadie del grupo lo ha jugado'].filter(Boolean).join(' · ')}</small>
                    ${x.jugado ? `<small class="saga-juego-mio">${[
                      x.mia?.nota != null ? `Tu nota ${esc(formatearNota(x.mia.nota))}` : '',
                      x.misHoras ? `${esc(metricas.textoHorasDe(yo.id, x.id))} tuyas` : '',
                    ].filter(Boolean).join(' · ')}</small>` : ''}
                  </span>
                  ${x.media != null ? `<span class="saga-juego-nota">${notaConLetra(x.media, 'act')}</span>` : ''}
                </a>
                ${vista.editando ? `<button type="button" class="boton-cuadrado" data-quitar="${x.id}" aria-label="Quitar de la saga">${icono('cerrar', { tam: 14, color: 'var(--peligro)' })}</button>` : ''}
              </li>`).join('')}
          </ol>
        </section>

        ${esAdmin() ? `
          <section class="saga-bloque saga-admin">
            ${vista.editando ? `
              <label class="campo-titulo" for="saga-nombre">Nombre</label>
              <input id="saga-nombre" class="psn-input" maxlength="80" value="${esc(sg.nombre)}" autocomplete="off">
              <button type="button" class="boton-secundario" data-accion="anadir">Añadir juegos</button>
              <button type="button" class="boton-secundario neutro" data-accion="fusionar">Fusionar con otra saga…</button>
              ${vista.confirmarOcultar ? `
                <div class="psn-confirmar" role="group" aria-label="Confirmar">
                  <p>¿Ocultar la saga? Deja de salir en las fichas de sus juegos. Se puede volver a mostrar desde Ajustes → Gestionar grupo.</p>
                  <div class="psn-confirmar-botones">
                    <button type="button" class="boton-secundario neutro" data-accion="no-ocultar">Cancelar</button>
                    <button type="button" class="boton-secundario peligro" data-accion="ocultar">Sí, ocultar</button>
                  </div>
                </div>` : '<button type="button" class="enlace-discreto peligro-texto" data-accion="pedir-ocultar">Ocultar saga</button>'}
              <button type="button" class="boton-principal" data-accion="editar">Hecho</button>`
            : `<button type="button" class="enlace-discreto" data-accion="editar">Editar saga (admin)</button>
               <p class="ajustes-nota">Sale sola de IGDB. Si se equivoca, aquí puedes renombrarla, quitar o añadir juegos, fusionarla u ocultarla.</p>`}
          </section>` : ''}
      </section>`;

    // Color dominante de la primera portada (como en las fichas).
    const cab = el.querySelector('[data-ref="cab"]');
    const primera = mosaico[0]?.juego;
    cab.style.setProperty('--fondo-hero', colorFondo(primera?.igdb_id ?? 0));
    const pintarColor = (hex) => {
      const [h, s] = hexAHsl(hex);
      cab.style.setProperty('--hero-h', String(h));
      cab.style.setProperty('--hero-s', `${Math.min(s, 72)}%`);
      cab.classList.add('con-color');
    };
    if (primera?.color_dominante) pintarColor(primera.color_dominante);
    else if (primera?.cover_id && colorPuesto !== primera.cover_id) {
      colorPuesto = primera.cover_id;
      colorDominante(mejorCargada(primera.cover_id) || urlPortada(primera.cover_id, 'cover_small')).then((hex) => { if (hex && el.isConnected) pintarColor(hex); });
    }
  };

  const fusionarCon = () => {
    const otras = datos.sagas().filter((x) => x.id !== id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    abrirHoja({
      titulo: 'Fusionar con otra saga',
      antetitulo: datos.saga(id)?.nombre ?? '',
      html: `
        <div class="elegir-juegos">
          <p class="ajustes-nota">Los juegos de la otra saga pasan a esta, que se queda con su nombre.</p>
          ${otras.map((x) => `
            <button type="button" class="fila-elegir" data-otra="${esc(x.id)}">
              <span class="fila-elegir-icono">${icono('saga', { tam: 22, color: 'var(--acento)' })}</span>
              <span class="fila-elegir-texto"><strong>${esc(x.nombre)}</strong><small>${datos.juegosDeSaga(x.id).length} juegos</small></span>
            </button>`).join('') || '<p class="ajustes-nota">No hay otras sagas.</p>'}
        </div>`,
      alMontar(cuerpo, cerrar) {
        cuerpo.addEventListener('click', (e) => {
          const b = e.target.closest('[data-otra]');
          if (!b) return;
          cerrar();
          datos.fusionarSagas(id, b.dataset.otra, aviso);
          aviso('Sagas fusionadas');
        });
      },
    });
  };

  el.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quitar]');
    if (q && esAdmin()) { datos.quitarDeSaga(id, Number(q.dataset.quitar), aviso); aviso('Quitado de la saga'); return; }
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const a = b.dataset.accion;
    if (a === 'atras') { volver('#inicio'); return; }
    if (!esAdmin()) return;
    if (a === 'editar') { vista.editando = !vista.editando; vista.confirmarOcultar = false; pintar(); }
    else if (a === 'anadir') {
      elegirJuegos({
        titulo: 'Añadir juegos', antetitulo: datos.saga(id)?.nombre ?? '', multiple: true, excluir: datos.juegosDeSaga(id),
        alElegir: (ids) => { if (ids.length) { datos.anadirASaga(id, ids, aviso); aviso('Añadidos a la saga'); } },
      });
    } else if (a === 'fusionar') fusionarCon();
    else if (a === 'pedir-ocultar') { vista.confirmarOcultar = true; pintar(); }
    else if (a === 'no-ocultar') { vista.confirmarOcultar = false; pintar(); }
    else if (a === 'ocultar') { datos.editarSaga(id, { oculta: true }, aviso); aviso('Saga oculta'); volver('#inicio'); }
  });
  el.addEventListener('change', (e) => {
    if (e.target.id !== 'saga-nombre') return;
    const v = e.target.value.trim();
    if (v && v !== datos.saga(id)?.nombre) { datos.editarSaga(id, { nombre: v }, aviso); aviso('Nombre guardado'); }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'saga-nombre') e.target.blur(); });

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}
