// Ficha de una saga (#saga/{id}): igual que la de un juego.
//  - Cabecera con portada y color dominante.
//  - Nota del grupo, recomendaciones y "El grupo" con las horas totales de cada uno.
//  - "Incluye": sus juegos, en orden, con mis horas en cada uno.
//  - Editable por cualquiera: nombre, portada, añadir / quitar / reordenar juegos,
//    fusionar con otra saga y eliminar.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import {
  esc, urlPortada, colorBloque, colorFondo, mejorCargada, notaConLetra, portada,
  iconoRecomendacion, avatarInsignia, avatarPerfil, nombrePerfil, aviso,
} from '../ui.js';
import { yaCargada, tamPara, ANCHOS } from '../portadas.js';
import { volver } from '../navegacion.js';
import * as metricas from '../metricas.js';
import { abrirValorar } from '../hoja-valorar.js';
import { abrirHoja } from '../hoja.js';
import { colorDominante, hexAHsl } from '../color-dominante.js';
import { anadirJuegosUI } from '../menu-juego.js';

const ESTADO_SAGA = { jugando: 'La sigue', abandonado: 'La dejó', pendiente: 'Pendiente' };

export function render(el, { params }) {
  const id = params[0];
  const yo = usuarioActual();
  const vista = { editando: false, confirmarBorrar: false };
  let coverPintado;
  let colorDe = null;

  el.innerHTML = `
    <section class="ficha">
      <div class="ficha-hero" data-ref="hero"></div>
      <div class="ficha-info" data-ref="info"></div>
      <div class="ficha-cuerpo" data-ref="cuerpo"></div>
    </section>
    <div class="ficha-barra" data-ref="barra"></div>`;
  const $ = (r) => el.querySelector(`[data-ref="${r}"]`);

  function pintarHero(sg) {
    const j = datos.comoJuego(sg);
    const cover = j.cover_id;
    if (coverPintado === cover && $('hero').childElementCount) return;
    coverPintado = cover;
    const grande = urlPortada(cover, tamPara(ANCHOS['portada-ficha']));
    const previa = mejorCargada(cover) || urlPortada(cover, tamPara(ANCHOS['portada-lista']));
    const capas = [];
    if (previa && previa !== grande) capas.push(`<img class="ficha-previa${yaCargada(previa) ? ' ok' : ''}" data-portada crossorigin="anonymous" src="${previa}" alt="" decoding="sync">`);
    if (grande) capas.push(`<img data-portada crossorigin="anonymous" src="${grande}" alt="" loading="eager" fetchpriority="high" decoding="async"${yaCargada(grande) ? ' class="ok"' : ''}>`);
    const hero = $('hero');
    hero.style.setProperty('--fondo-hero', colorFondo(cover));
    hero.innerHTML = `
      <button type="button" class="ficha-volver" data-accion="atras" aria-label="Volver">
        ${icono('atras', { tam: 22, color: '#FFFFFF' })}
      </button>
      <div class="portada portada-ficha" style="--bloque:${colorBloque(cover)}">
        <span class="portada-deco"></span>
        <span class="portada-titulo portada-titulo-abajo">${esc(sg.nombre)}</span>
        ${capas.join('')}
      </div>`;
    // Color dominante de la portada (como en la ficha de un juego).
    if (!cover || colorDe === cover) return;
    colorDe = cover;
    const conColor = datos.estado.juegos.find((x) => x.cover_id === cover && x.color_dominante);
    const pintarColor = (hex) => {
      const [h, s] = hexAHsl(hex);
      hero.style.setProperty('--hero-h', String(h));
      hero.style.setProperty('--hero-s', `${Math.min(s, 72)}%`);
      hero.classList.add('con-color');
    };
    if (conColor) { pintarColor(conColor.color_dominante); return; }
    colorDominante(mejorCargada(cover) || urlPortada(cover, 'cover_small')).then((hex) => { if (hex && el.isConnected) pintarColor(hex); });
  }

  function pintarInfo(sg) {
    const ids = datos.juegosDeSaga(sg.id);
    const anios = ids.map((x) => datos.juegoConocido(x)?.anio).filter(Boolean);
    const meta = [`Saga · ${ids.length} ${ids.length === 1 ? 'juego' : 'juegos'}`, anios.length ? `${Math.min(...anios)}–${Math.max(...anios)}` : ''].filter(Boolean).join(' · ');
    $('info').innerHTML = `
      <h1 class="ficha-titulo">${esc(sg.nombre)}</h1>
      <span class="ficha-meta">${esc(meta)}</span>
      <div class="saga-editar-fila">
        <button type="button" class="boton-secundario boton-pequeno" data-accion="editar" aria-pressed="${vista.editando}">${vista.editando ? 'Hecho' : 'Editar saga'}</button>
      </div>`;
  }

  function bloqueMetricas(st) {
    if (!st.votos && !st.recomendacion.total) {
      return `
        <section class="ficha-sin-notas">
          <p>Nadie ha valorado aún la saga. Sus juegos se pueden valorar sueltos en sus fichas.</p>
        </section>`;
    }
    const opinan = st.valoraciones.filter((v) => typeof v.recomendado === 'boolean').sort((a, b) => Number(b.recomendado) - Number(a.recomendado));
    const r = st.recomendacion;
    return `
      <section class="ficha-metricas">
        <div class="metrica">
          <span class="metrica-etiqueta">${st.votos === 1 ? 'Nota' : 'Nota del grupo'}</span>
          <div class="metrica-nota">${st.media != null ? notaConLetra(st.media, 'xl') : '—'}</div>
          <span class="metrica-sub">${st.votos === 1 ? '1 nota' : `Media de ${st.votos} notas`}</span>
        </div>
        <div class="metrica">
          <span class="metrica-etiqueta">La recomiendan</span>
          ${r.total ? `
            <div class="pila-avatares">${opinan.map((v) => avatarInsignia(datos.usuario(v.usuario_id), v.recomendado, 32, 'var(--superficie)')).join('')}</div>
            <span class="metrica-sub"><strong>${r.si} de ${r.total}</strong> · ${r.porcentaje}%</span>`
          : '<span class="metrica-sub metrica-nadie">Nadie ha dicho aún si la recomienda.</span>'}
        </div>
      </section>`;
  }

  function filaGrupo(uid, v) {
    const u = datos.usuario(uid);
    if (!u) return '';
    const h = metricas.horasSaga(uid, id).total;
    const sub = [v ? ESTADO_SAGA[v.estado] : 'Sin valorar la saga', h ? metricas.textoHoras(h) : ''].filter(Boolean).join(' · ');
    const derecha = v?.nota != null
      ? `<div class="grupo-nota">${notaConLetra(v.nota, 'lg')}${iconoRecomendacion(v.recomendado, 20)}</div>`
      : '<span class="grupo-sin-nota">Sin nota</span>';
    return `
      <div class="grupo-fila${v ? '' : ' grupo-biblioteca'}">
        <div class="grupo-cab">
          ${avatarPerfil(u, 40)}
          <div class="grupo-quien">
            <span class="grupo-nombre">${nombrePerfil(u)}${u.id === yo?.id ? ' <span class="grupo-tu">(tú)</span>' : ''}</span>
            <span class="grupo-estado">${esc(sub)}</span>
          </div>
          ${derecha}
        </div>
        ${v?.resena ? `<p class="grupo-resena">${esc(v.resena)}</p>` : ''}
      </div>`;
  }

  function bloqueIncluye(sg) {
    const ids = datos.juegosDeSaga(sg.id);
    const ed = vista.editando;
    return `
      <section class="ficha-grupo saga-incluye">
        <div class="seccion-cab">
          <h2 class="seccion-titulo">Incluye</h2>
          <span class="seccion-extra">${ids.length} ${ids.length === 1 ? 'juego' : 'juegos'}</span>
        </div>
        ${ids.length ? `<ol class="saga-juegos" data-lista>${ids.map((gid, i) => {
          const j = datos.juegoConocido(gid);
          if (!j) return '';
          const h = yo ? metricas.horasDe(yo.id, gid) : null;
          const mia = yo ? datos.miValoracion(yo.id, gid) : null;
          const sub = [j.anio, h ? `${metricas.textoHoras(h)} tuyas` : '', mia?.nota != null ? `tu nota ${String(mia.nota).replace('.', ',')}` : ''].filter(Boolean).join(' · ');
          return `
            <li class="saga-juego">
              <a href="#juego/${j.igdb_id}" class="saga-juego-enlace" data-precarga="${esc(j.cover_id ?? '')}">
                ${portada(j, { clase: 'portada-lista' })}
                <span class="saga-juego-texto"><strong>${esc(j.nombre)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
              </a>
              ${ed ? `
                <div class="saga-juego-acciones">
                  <button type="button" class="boton-cuadrado" data-subir="${i}" aria-label="Subir"${i === 0 ? ' disabled' : ''}>${icono('desplegable', { tam: 14, color: 'var(--texto)', clase: 'girar-180' })}</button>
                  <button type="button" class="boton-cuadrado" data-bajar="${i}" aria-label="Bajar"${i === ids.length - 1 ? ' disabled' : ''}>${icono('desplegable', { tam: 14, color: 'var(--texto)' })}</button>
                  <button type="button" class="boton-cuadrado" data-quitar-juego="${gid}" aria-label="Quitar de la saga">${icono('cerrar', { tam: 14, color: 'var(--peligro)' })}</button>
                </div>` : ''}
            </li>`;
        }).join('')}</ol>` : '<p class="ajustes-nota">La saga está vacía. Añade sus juegos.</p>'}
        ${ed ? '<button type="button" class="boton-secundario" data-accion="anadir">Añadir juegos</button>' : ''}
      </section>`;
  }

  function bloqueEditar(sg) {
    if (!vista.editando) return '';
    const portadas = datos.juegosDeSaga(sg.id).map((g) => datos.juegoConocido(g)).filter((j) => j?.cover_id);
    const elegida = datos.portadaSaga(sg);
    return `
      <section class="ficha-grupo saga-edicion">
        <label class="campo-titulo" for="saga-nombre">Nombre</label>
        <input id="saga-nombre" class="psn-input" maxlength="80" value="${esc(sg.nombre)}" autocomplete="off">
        ${portadas.length > 1 ? `
          <span class="campo-titulo">Portada</span>
          <div class="saga-portadas">${portadas.map((j) => `
            <button type="button" class="saga-portada${j.cover_id === elegida ? ' activa' : ''}" data-portada-saga="${esc(j.cover_id)}" aria-pressed="${j.cover_id === elegida}" aria-label="Portada de ${esc(j.nombre)}">
              ${portada(j, { clase: 'portada-lista' })}
            </button>`).join('')}</div>` : ''}
        <button type="button" class="boton-secundario neutro" data-accion="fusionar">Fusionar con otra saga…</button>
        ${vista.confirmarBorrar ? `
          <div class="psn-confirmar" role="group" aria-label="Confirmar">
            <p>¿Eliminar la saga? Sus juegos vuelven a verse sueltos y se borran las valoraciones de la saga. Las de cada juego no se tocan.</p>
            <div class="psn-confirmar-botones">
              <button type="button" class="boton-secundario neutro" data-accion="no-borrar">Cancelar</button>
              <button type="button" class="boton-secundario peligro" data-accion="borrar">Sí, eliminar</button>
            </div>
          </div>` : '<button type="button" class="enlace-discreto peligro-texto" data-accion="pedir-borrar">Eliminar saga</button>'}
      </section>`;
  }

  function pintarCuerpo(sg) {
    const st = metricas.statsSaga(sg.id);
    const conVal = new Map(st.valoraciones.map((v) => [v.usuario_id, v]));
    const filas = [...st.valoraciones].sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));
    // Quien tiene horas en sus juegos pero no ha valorado la saga, al final.
    const resto = metricas.usuarios().filter((u) => !conVal.has(u.id) && metricas.horasSaga(u.id, id).total > 0)
      .sort((a, b) => metricas.horasSaga(b.id, id).total - metricas.horasSaga(a.id, id).total);
    $('cuerpo').innerHTML = `
      ${bloqueEditar(sg)}
      ${bloqueMetricas(st)}
      ${filas.length || resto.length ? `
        <section class="ficha-grupo">
          <div class="seccion-cab"><h2 class="seccion-titulo">El grupo</h2></div>
          ${filas.map((v) => filaGrupo(v.usuario_id, v)).join('')}
          ${resto.map((u) => filaGrupo(u.id, null)).join('')}
        </section>` : ''}
      ${bloqueIncluye(sg)}`;
  }

  function pintarBarra() {
    const mia = yo ? datos.miValoracionSaga(yo.id, id) : null;
    $('barra').innerHTML = `
      <button type="button" class="boton-principal con-icono" data-accion="valorar">
        ${mia && mia.estado !== 'pendiente' ? '' : icono('mas', { tam: 20, color: 'currentColor' })}
        <span>${mia && mia.estado !== 'pendiente' ? 'Editar mi valoración' : 'Valorar la saga'}</span>
      </button>`;
  }

  function pintarTodo() {
    const sg = datos.saga(id);
    if (!sg) {
      $('hero').innerHTML = `<button type="button" class="ficha-volver" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 22, color: '#FFFFFF' })}</button>`;
      $('info').innerHTML = '<h1 class="ficha-titulo">Saga no encontrada</h1><p class="ficha-meta">Puede que la hayan eliminado o fusionado con otra.</p>';
      $('cuerpo').innerHTML = '';
      $('barra').innerHTML = '';
      document.title = 'CVJ · Saga';
      return;
    }
    // Conservar lo que se esté escribiendo en el nombre.
    const activo = document.activeElement?.id === 'saga-nombre';
    pintarHero(sg);
    pintarInfo(sg);
    pintarCuerpo(sg);
    pintarBarra();
    if (activo) el.querySelector('#saga-nombre')?.focus();
    document.title = `CVJ · ${sg.nombre}`;
  }

  function fusionarCon() {
    const sg = datos.saga(id);
    const otras = datos.sagas().filter((x) => x.id !== id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    abrirHoja({
      titulo: 'Fusionar con otra saga',
      antetitulo: sg.nombre,
      html: `
        <div class="elegir-juegos">
          <p class="ajustes-nota">Los juegos de la otra saga pasan al final de «${esc(sg.nombre)}», que se queda con su nombre y su portada.</p>
          ${otras.map((x) => `
            <button type="button" class="fila-elegir" data-otra="${esc(x.id)}">
              ${portada(datos.comoJuego(x), { clase: 'portada-lista' })}
              <span class="fila-elegir-texto"><strong>${esc(x.nombre)}</strong><small>${datos.juegosDeSaga(x.id).length} juegos</small></span>
            </button>`).join('') || '<p class="ajustes-nota">No hay otras sagas.</p>'}
        </div>`,
      alMontar(cuerpo, cerrar) {
        cuerpo.addEventListener('click', (e) => {
          const b = e.target.closest('[data-otra]');
          if (!b) return;
          const otra = datos.saga(b.dataset.otra);
          cerrar();
          datos.fusionarSagas(id, otra.id, aviso);
          aviso(`«${otra.nombre}» fusionada en «${sg.nombre}»`);
        });
      },
    });
  }

  const mover = (i, d) => {
    const ids = [...datos.juegosDeSaga(id)];
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    datos.ordenarSaga(id, ids, aviso);
  };

  el.addEventListener('click', (e) => {
    const sub = e.target.closest('[data-subir]');
    if (sub) { mover(Number(sub.dataset.subir), -1); return; }
    const baj = e.target.closest('[data-bajar]');
    if (baj) { mover(Number(baj.dataset.bajar), 1); return; }
    const q = e.target.closest('[data-quitar-juego]');
    if (q) { datos.quitarDeSaga(Number(q.dataset.quitarJuego), aviso); aviso('Quitado de la saga'); return; }
    const p = e.target.closest('[data-portada-saga]');
    if (p) { datos.editarSaga(id, { cover_id: p.dataset.portadaSaga }, aviso); coverPintado = undefined; return; }
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const a = b.dataset.accion;
    if (a === 'atras') volver('#inicio');
    else if (a === 'valorar') abrirValorar(null, { saga: id });
    else if (a === 'editar') { vista.editando = !vista.editando; vista.confirmarBorrar = false; pintarTodo(); }
    else if (a === 'anadir') anadirJuegosUI(id, yo?.id);
    else if (a === 'fusionar') fusionarCon();
    else if (a === 'pedir-borrar') { vista.confirmarBorrar = true; pintarTodo(); }
    else if (a === 'no-borrar') { vista.confirmarBorrar = false; pintarTodo(); }
    else if (a === 'borrar') {
      const nombre = datos.saga(id)?.nombre ?? '';
      datos.eliminarSaga(id, aviso);
      aviso(`Saga «${nombre}» eliminada`);
      volver('#inicio');
    }
  });
  // Nombre: se guarda al salir del campo o con Intro.
  el.addEventListener('change', (e) => {
    if (e.target.id !== 'saga-nombre') return;
    const v = e.target.value.trim();
    if (v && v !== datos.saga(id)?.nombre) { datos.editarSaga(id, { nombre: v }, aviso); aviso('Nombre guardado'); }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'saga-nombre') e.target.blur(); });

  const desuscribir = datos.suscribir(pintarTodo);
  pintarTodo();
  return () => desuscribir();
}
