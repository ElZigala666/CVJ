// Pantallas 04 / 11 · Ficha de juego.
import { icono } from '../icons.js';
import { fichaJuego } from '../igdb.js';
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import { LETRAS } from '../notas.js';
import {
  esc, urlPortada, colorBloque, colorFondo, mejorCargada, notaConLetra,
  iconoRecomendacion, avatar, avatarInsignia, avatarPerfil, nombrePerfil, nombreEstado, ESTADOS, aviso,
} from '../ui.js';
import { yaCargada, tamPara, ANCHOS } from '../portadas.js';
import { volver } from '../navegacion.js';
import * as metricas from '../metricas.js';
import { abrirValorar } from '../hoja-valorar.js';
import { colorDominante, hexAHsl } from '../color-dominante.js';

export function render(el, { params }) {
  const id = Number(params[0]);
  if (!Number.isInteger(id) || id <= 0) {
    location.hash = '#buscar';
    return;
  }
  const yo = usuarioActual();
  const controlador = new AbortController();
  let pidiendo = false;
  let fallo = false;
  let coverPintado;

  el.innerHTML = `
    <section class="ficha">
      <div class="ficha-hero" data-ref="hero"></div>
      <div class="ficha-info" data-ref="info"></div>
      <div class="ficha-cuerpo" data-ref="cuerpo"></div>
    </section>
    <div class="ficha-barra" data-ref="barra"></div>`;
  const $ = (r) => el.querySelector(`[data-ref="${r}"]`);

  // -------------------------------------------------------------------------
  // Cabecera: portada pequeña (ya en caché) al instante y la grande encima.
  // -------------------------------------------------------------------------
  function pintarHero(j) {
    const cover = j?.cover_id ?? null;
    if (coverPintado === cover && $('hero').childElementCount) return;
    coverPintado = cover;
    // La grande según el ancho real; mientras carga, la mejor que ya esté en caché.
    const grande = urlPortada(cover, tamPara(ANCHOS['portada-ficha']));
    const previa = mejorCargada(cover) || urlPortada(cover, tamPara(ANCHOS['portada-lista']));
    const capas = [];
    if (previa && previa !== grande) capas.push(`<img class="ficha-previa${yaCargada(previa) ? ' ok' : ''}" data-portada crossorigin="anonymous" src="${previa}" alt="" decoding="sync">`);
    if (grande) capas.push(`<img data-portada crossorigin="anonymous" src="${grande}" alt="" loading="eager" fetchpriority="high" decoding="async"${yaCargada(grande) ? ' class="ok"' : ''}>`);
    $('hero').style.setProperty('--fondo-hero', colorFondo(id));
    aplicarColor(j);
    $('hero').innerHTML = `
      <button type="button" class="ficha-volver" data-accion="atras" aria-label="Volver">
        ${icono('atras', { tam: 22, color: '#FFFFFF' })}
      </button>
      <div class="portada portada-ficha" style="--bloque:${colorBloque(id)}">
        <span class="portada-deco"></span>
        <span class="portada-titulo portada-titulo-abajo">${esc(j?.nombre ?? '')}</span>
        ${capas.join('')}
      </div>`;
  }

  // Fondo de la cabecera: color dominante de la portada (guardado en juegos o calculado una vez).
  let colorPedido = false;
  function aplicarColor(j) {
    const hero = $('hero');
    const pintarColor = (hex) => {
      const [h, s] = hexAHsl(hex);
      hero.style.setProperty('--hero-h', String(h));
      hero.style.setProperty('--hero-s', `${Math.min(s, 72)}%`);
      hero.classList.add('con-color');
    };
    if (j?.color_dominante) { pintarColor(j.color_dominante); return; }
    if (!j?.cover_id || colorPedido) return;
    colorPedido = true;
    // La pequeña basta (64 px) y suele estar ya en caché.
    colorDominante(mejorCargada(j.cover_id) || urlPortada(j.cover_id, 'cover_small')).then((hex) => {
      if (!hex || controlador.signal.aborted) return;
      pintarColor(hex);
      datos.guardarColorDominante(id, hex);
    });
  }

  function pintarInfo(j) {
    if (!j) {
      $('info').innerHTML = fallo
        ? `<h1 class="ficha-titulo">Juego no disponible</h1><p class="ficha-meta">No se ha podido cargar. Revisa la conexión.</p>`
        : `<div class="sk sk-linea" style="width:75%;height:26px;border-radius:8px"></div>
           <div class="sk sk-linea" style="width:55%;height:14px"></div>
           <div class="ficha-chips"><span class="sk" style="width:44px;height:26px;border-radius:8px"></span><span class="sk" style="width:36px;height:26px;border-radius:8px"></span></div>`;
      return;
    }
    const meta = [j.anio, j.desarrolladora, j.generos?.[0]].filter(Boolean).join(' · ');
    $('info').innerHTML = `
      <h1 class="ficha-titulo">${esc(j.nombre)}</h1>
      ${meta ? `<span class="ficha-meta">${esc(meta)}</span>` : (pidiendo ? '<div class="sk sk-linea" style="width:55%;height:14px"></div>' : '')}
      ${j.plataformas?.length ? `<div class="ficha-chips">${j.plataformas.map((p) => `<span class="ficha-chip">${esc(p)}</span>`).join('')}</div>` : ''}
      ${'es_online' in j && datos.juego(id) ? `
        <div class="ficha-online">
          <span>Juego online / sin final</span>
          <div class="conmutador" role="group" aria-label="Juego online / sin final">
            <button type="button" data-online="si" class="${j.es_online ? 'activo' : ''}" aria-pressed="${!!j.es_online}">Sí</button>
            <button type="button" data-online="no" class="${j.es_online ? '' : 'activo'}" aria-pressed="${!j.es_online}">No</button>
          </div>
        </div>` : ''}`;
  }

  // -------------------------------------------------------------------------
  // Métricas del grupo y lista de valoraciones
  // -------------------------------------------------------------------------
  function bloqueMetricas(st) {
    if (st.votos === 0) {
      return `
        <section class="ficha-metricas metricas-vacio">
          <span class="vacio-icono">${icono('valorar', { tam: 30, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}</span>
          <h2 class="vacio-titulo">Nadie del grupo le ha puesto nota</h2>
          <p class="vacio-texto">Sé el primero en valorarlo y abre el debate.</p>
          <button type="button" class="boton-secundario" data-accion="valorar">Valorarlo ahora</button>
        </section>`;
    }

    const conNota = st.valoraciones.filter((v) => v.nota != null);
    let notaHtml;
    if (st.votos === 1) {
      const quien = datos.usuario(conNota[0].usuario_id);
      notaHtml = `
        <div class="metrica">
          <span class="metrica-etiqueta">Nota</span>
          <div class="metrica-nota">${notaConLetra(st.media, 'xl')}</div>
          <span class="metrica-sub">Solo lo ha valorado ${esc(quien?.id === yo?.id ? 'tú' : quien?.nombre ?? 'alguien')}</span>
        </div>`;
    } else {
      notaHtml = `
        <div class="metrica">
          <span class="metrica-etiqueta">Nota del grupo</span>
          <div class="metrica-nota">${notaConLetra(st.media, 'xl')}</div>
          <span class="metrica-sub">Media de ${st.votos} notas</span>
        </div>`;
    }

    const opinan = st.valoraciones
      .filter((v) => v.recomendado === true || v.recomendado === false)
      .sort((a, b) => Number(b.recomendado) - Number(a.recomendado));
    const r = st.recomendacion;
    const nombresSi = opinan.filter((v) => v.recomendado).map((v) => datos.usuario(v.usuario_id)?.nombre).filter(Boolean);
    const nombresNo = opinan.filter((v) => !v.recomendado).map((v) => datos.usuario(v.usuario_id)?.nombre).filter(Boolean);
    const recHtml = r.total
      ? `
        <div class="metrica">
          <span class="metrica-etiqueta">Lo recomiendan</span>
          <div class="pila-avatares" role="img" aria-label="${esc(`Lo recomiendan ${nombresSi.join(', ') || 'nadie'}${nombresNo.length ? `; ${nombresNo.join(', ')} no` : ''}`)}">
            ${opinan.map((v) => avatarInsignia(datos.usuario(v.usuario_id), v.recomendado, 32, 'var(--superficie)')).join('')}
          </div>
          <span class="metrica-sub"><strong>${r.si} de ${r.total}</strong> · ${r.porcentaje}%</span>
        </div>`
      : `
        <div class="metrica">
          <span class="metrica-etiqueta">Lo recomiendan</span>
          <span class="metrica-sub metrica-nadie">Nadie ha dicho aún si lo recomienda.</span>
        </div>`;

    let repartoHtml = '';
    if (st.votos >= 2) {
      const max = Math.max(...Object.values(st.reparto));
      repartoHtml = `
        <div class="reparto">
          <span class="metrica-etiqueta">Reparto de notas</span>
          <div class="reparto-barras">
            ${LETRAS.map((l) => {
              const k = st.reparto[l];
              const alto = k ? Math.max(8, Math.round((k / max) * 42)) : 3;
              return `<div class="reparto-col" title="${l}: ${k}">
                <div class="reparto-barra${k ? '' : ' vacia'}" data-tier="${l}" style="height:${alto}px"></div>
                <span class="reparto-letra">${l}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    return `<section class="ficha-metricas">${notaHtml}${recHtml}${repartoHtml}</section>`;
  }

  /** Horas y trofeos de PSN de un usuario en este juego: " · 42 h · 35 % trofeos". */
  function extraPsn(uid) {
    const b = metricas.bibliotecaDeJuego(id).get(uid);
    const partes = [];
    // Las horas puestas a mano mandan sobre las de PSN.
    const h = metricas.textoHoras(metricas.horasDe(uid, id));
    if (h) partes.push(h);
    if (b?.progreso) partes.push(`${b.progreso} % trofeos`);
    return partes.length ? ` · ${partes.join(' · ')}` : '';
  }

  function filaGrupo(v) {
    const u = datos.usuario(v.usuario_id);
    if (!u) return '';
    const est = ESTADOS.find((e) => e.id === v.estado);
    const sub = [nombreEstado(v.estado), v.plataforma].filter(Boolean).join(' · ') + extraPsn(u.id);
    const derecha = v.nota != null
      ? `<div class="grupo-nota">${notaConLetra(v.nota, 'lg')}${iconoRecomendacion(v.recomendado, 20)}</div>`
      : `<span class="grupo-sin-nota">Sin nota aún</span>`;
    return `
      <div class="grupo-fila">
        <div class="grupo-cab">
          ${avatarPerfil(u, 40)}
          <div class="grupo-quien">
            <span class="grupo-nombre">${nombrePerfil(u)}${u.id === yo?.id ? ' <span class="grupo-tu">(tú)</span>' : ''}</span>
            <span class="grupo-estado">${icono(est?.icono ?? 'pendiente', { tam: 14, color: 'var(--acento)', grosor: 2.6 })}${esc(sub)}</span>
          </div>
          ${derecha}
        </div>
        ${v.resena ? `<p class="grupo-resena">${esc(v.resena)}</p>` : ''}
      </div>`;
  }

  /** Quien lo tiene en su biblioteca de PSN pero no lo ha valorado: al final, sin nota. */
  function filaBiblioteca(uid, b) {
    const u = datos.usuario(uid);
    if (!u) return '';
    return `
      <div class="grupo-fila grupo-biblioteca">
        <div class="grupo-cab">
          ${avatarPerfil(u, 40)}
          <div class="grupo-quien">
            <span class="grupo-nombre">${nombrePerfil(u)}${u.id === yo?.id ? ' <span class="grupo-tu">(tú)</span>' : ''}</span>
            <span class="grupo-estado">${icono('jugando', { tam: 14, color: 'var(--texto-2)', grosor: 2.6, trazo: 'var(--fondo)' })}${u.id === yo?.id ? 'En tu biblioteca' : 'En su biblioteca'}${b.plataformas.length ? ` · ${b.plataformas.join(', ')}` : ''}${extraPsn(uid)}</span>
          </div>
          <span class="etiqueta-psn">PSN</span>
        </div>
      </div>`;
  }

  /** Títulos de PSN emparejados con este juego, para poder corregirlo si está mal. */
  function corregirEmparejamiento() {
    const titulos = new Map();
    // Uno por nombre (las versiones de PS4 y PS5 suelen llamarse igual).
    const nombres = new Set();
    for (const f of datos.bibliotecaDeJuego(id)) {
      if (nombres.has(f.nombre_psn)) continue;
      nombres.add(f.nombre_psn);
      titulos.set(f.psn_title_id, f.nombre_psn);
    }
    if (!titulos.size) return '';
    return `
      <p class="ficha-psn-nota">
        ${icono('jugando', { tam: 16, color: 'var(--texto-2)', trazo: 'var(--fondo)' })}
        <span>Emparejado desde PlayStation con ${[...titulos].map(([t, n]) => `«${esc(n)}» <a href="#elegir/${encodeURIComponent(t)}" class="enlace-discreto">¿No es este juego?</a>`).join(', ')}</span>
      </p>`;
  }

  function pintarCuerpo() {
    const st = datos.statsJuego(id);
    const filas = [...st.valoraciones].sort((a, b) => {
      if (a.nota != null && b.nota != null) return Number(b.nota) - Number(a.nota);
      if (a.nota != null) return -1;
      if (b.nota != null) return 1;
      return new Date(b.actualizado_en) - new Date(a.actualizado_en);
    });
    const conValoracion = new Set(st.valoraciones.map((v) => v.usuario_id));
    const soloBiblioteca = [...metricas.bibliotecaDeJuego(id)]
      .filter(([uid]) => !conValoracion.has(uid))
      .sort((a, b) => b[1].horas - a[1].horas);
    const hayGrupo = filas.length || soloBiblioteca.length;
    $('cuerpo').innerHTML = `
      ${bloqueMetricas(st)}
      ${hayGrupo ? `
        <section class="ficha-grupo">
          <div class="seccion-cab">
            <h2 class="seccion-titulo">El grupo</h2>
            <span class="seccion-extra">${st.jugadores === 1 ? '1 lo ha jugado' : `${st.jugadores} lo han jugado`}</span>
          </div>
          ${filas.map(filaGrupo).join('')}
          ${soloBiblioteca.map(([uid, b]) => filaBiblioteca(uid, b)).join('')}
          ${corregirEmparejamiento()}
        </section>` : ''}`;
  }

  function pintarBarra(j) {
    const mia = yo ? datos.miValoracion(yo.id, id) : null;
    const enPendientes = mia?.estado === 'pendiente';
    $('barra').innerHTML = `
      <button type="button" class="boton-principal con-icono" data-accion="valorar"${j ? '' : ' disabled'}>
        ${mia && !enPendientes ? '' : icono('mas', { tam: 20, color: 'currentColor' })}
        <span>${mia && !enPendientes ? 'Editar mi valoración' : 'Valorar'}</span>
      </button>
      <button type="button" class="boton-pendiente${enPendientes ? ' activo' : ''}" data-accion="pendiente"
        aria-pressed="${enPendientes}" aria-label="${enPendientes ? 'Quitar de pendientes' : 'Añadir a pendientes'}"${j ? '' : ' disabled'}>
        ${icono('pendiente', { tam: 24, color: 'currentColor', trazo: 'var(--fondo-btn)' })}
      </button>`;
  }

  function pintarTodo() {
    const j = datos.juegoConocido(id);
    pintarHero(j);
    pintarInfo(j);
    pintarCuerpo();
    pintarBarra(j);
    document.title = j ? `CVJ · ${j.nombre}` : 'CVJ · Juego';
  }

  // -------------------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------------------
  function alternarPendiente() {
    if (!yo) return;
    const mia = datos.miValoracion(yo.id, id);
    if (mia && mia.estado !== 'pendiente') {
      aviso(`Ya lo tienes como ${nombreEstado(mia.estado).toLowerCase()}`);
      return;
    }
    if (mia) {
      datos.quitarValoracion(yo.id, id, aviso);
      aviso('Quitado de pendientes');
    } else {
      datos.guardarValoracion({
        usuarioId: yo.id, igdbId: id, estado: 'pendiente', nota: null, recomendado: null,
        plataforma: null, resena: null,
      }, aviso);
      aviso('Añadido a pendientes');
    }
  }

  el.addEventListener('click', (e) => {
    const on = e.target.closest('[data-online]');
    if (on) {
      const valor = on.dataset.online === 'si';
      if (valor !== datos.esOnline(id)) {
        datos.marcarOnline(id, valor, aviso);
        aviso(valor ? 'Marcado como juego online: no cuenta en la tier list ni en los rankings de nota' : 'Ya no es un juego online');
      }
      return;
    }
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'atras') {
      volver('#inicio');
    } else if (b.dataset.accion === 'valorar') {
      abrirValorar(id);
    } else if (b.dataset.accion === 'pendiente') {
      alternarPendiente();
    }
  });

  const desuscribir = datos.suscribir(pintarTodo);
  pintarTodo();

  // Si el juego no está en la tabla, pedir la ficha (la función también la guarda).
  if (!datos.juego(id)) {
    pidiendo = true;
    pintarInfo(datos.juegoConocido(id));
    fichaJuego(id, controlador.signal)
      .then((j) => {
        pidiendo = false;
        if (j && !controlador.signal.aborted) datos.recordarJuego(j);
      })
      .catch((e) => {
        pidiendo = false;
        if (controlador.signal.aborted || e.name === 'AbortError') return;
        console.warn('[ficha]', e.message);
        fallo = true;
        pintarTodo();
      });
  }

  return () => {
    controlador.abort();
    desuscribir();
  };
}
