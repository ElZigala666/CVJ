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
import { volver, reemplazarRuta } from '../navegacion.js';
import * as metricas from '../metricas.js';
import { abrirValorar } from '../hoja-valorar.js';
import { colorDominante, hexAHsl } from '../color-dominante.js';
import { tarjetaFusion, clicFusion } from '../fusiones.js';
import { activarDeslizar } from '../galeria.js';
import { anadirASagaUI } from '../sagas-ui.js';

export function render(el, { params }) {
  const id = Number(params[0]);
  if (!Number.isInteger(id) || id <= 0) {
    location.hash = '#buscar';
    return;
  }
  const yo = usuarioActual();
  const esAdmin = () => !!datos.usuario(yo?.id)?.es_admin;
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
      ${'es_online' in j && datos.juego(id) && !esAdmin() && j.es_online ? `
        <div class="ficha-online"><span class="etiqueta-gris">Sin final (online, competitivo...)</span></div>` : ''}
      ${'es_online' in j && datos.juego(id) && esAdmin() ? `
        <div class="ficha-online">
          <span>Sin final (online, competitivo...)</span>
          <div class="conmutador" role="group" aria-label="Sin final (online, competitivo...)">
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
    // El total de cada uno (sincronizadas de todas sus cuentas + extra); el desglose, en "Tus horas".
    const h = metricas.textoHoras(metricas.horasDe(uid, id));
    if (h) partes.push(h);
    if (b?.progreso) partes.push(`${b.progreso} % trofeos`);
    return partes.length ? ` · ${partes.join(' · ')}` : '';
  }

  /** "Remastered", "Definitive Edition"... de la versión que jugó (si no es el principal). */
  function nombreVersion(origen) {
    if (origen == null || origen === id) return '';
    const n = datos.juegoConocido(origen)?.nombre ?? '';
    const base = datos.juegoConocido(id)?.nombre ?? '';
    const corto = base && n.toLowerCase().startsWith(base.toLowerCase()) ? n.slice(base.length).replace(/^[\s:\-–—]+/, '') : '';
    return corto || n;
  }

  function filaGrupo(v) {
    const u = datos.usuario(v.usuario_id);
    if (!u) return '';
    const est = ESTADOS.find((e) => e.id === v.estado);
    const version = nombreVersion(v.juego_origen);
    const sub = [nombreEstado(v.estado), version, ...datos.plataformasDe(v)].filter(Boolean).join(' · ') + extraPsn(u.id);
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
          <span class="etiqueta-psn">${[...new Set(b.filas.map((f) => (f.fuente === 'xbox' ? 'Xbox' : 'PSN')))].join(' · ')}</span>
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
        <span>Emparejado desde tu biblioteca con ${[...titulos].map(([t, n]) => `«${esc(n)}» <a href="#elegir/${encodeURIComponent(t)}" class="enlace-discreto">¿No es este juego?</a>`).join(', ')}</span>
      </p>`;
  }

  /** "Tus horas": total grande y desglose por plataforma, cuenta y extra. */
  function bloqueTusHoras() {
    if (!yo) return '';
    const d = metricas.desgloseDe(yo.id, id);
    if (!d.total) return '';
    const partes = [...d.sinc, ...(d.extra ? [{ plataforma: 'Horas extra', horas: d.extra }] : [])];
    return `
      <section class="ficha-horas">
        <div class="horas-total">
          <span>Tus horas</span>
          <strong>${esc(metricas.textoHoras(d.total))}</strong>
        </div>
        ${partes.length > 1 || d.extra ? `
          <ul class="horas-desglose">
            ${partes.map((p) => `<li><span>${esc(p.plataforma)}${p.cuenta ? ` <small>${esc(p.cuenta)}</small>` : ''}</span><span>${esc(metricas.textoHoras(p.horas))}</span></li>`).join('')}
          </ul>` : ''}
      </section>`;
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
      ${bloqueTusHoras()}
      ${hayGrupo ? `
        <section class="ficha-grupo">
          <div class="seccion-cab">
            <h2 class="seccion-titulo">El grupo</h2>
            <span class="seccion-extra">${st.jugadores === 1 ? '1 lo ha jugado' : `${st.jugadores} lo han jugado`}</span>
          </div>
          ${filas.map(filaGrupo).join('')}
          ${soloBiblioteca.map(([uid, b]) => filaBiblioteca(uid, b)).join('')}
          ${corregirEmparejamiento()}
        </section>` : ''}
      ${bloqueVersiones()}`;
  }

  /**
   * Lo que IGDB sabe (saga, versión de, incluido en...), "¿Es el mismo juego?" con
   * mis otras versiones y las versiones ya fusionadas (con "Deshacer").
   */
  function bloqueVersiones() {
    const j = datos.juegoConocido(id);
    const r = j?.relaciones ?? {};
    const enlace = (gid) => {
      const g = datos.juegoConocido(datos.canonico(gid));
      return g && g.igdb_id !== id ? `<a href="#juego/${g.igdb_id}" class="enlace-discreto">${esc(g.nombre)}</a>` : '';
    };
    const lineas = [];
    const sgGrupo = datos.sagaDeJuego(id);
    const sagas = (r.colecciones ?? []).map((c) => esc(c.nombre)).filter(Boolean);
    if (!sgGrupo && sagas.length) lineas.push(`Saga en IGDB: ${sagas.join(', ')}`);
    const padre = [r.version_parent, r.parent_game].filter(Boolean).map(enlace).filter(Boolean);
    if (padre.length) lineas.push(`Versión de ${padre.join(', ')}`);
    const remasters = (r.remasters ?? []).map(enlace).filter(Boolean);
    if (remasters.length) lineas.push(`Remaster: ${remasters.join(', ')}`);
    const remakes = (r.remakes ?? []).map(enlace).filter(Boolean);
    if (remakes.length) lineas.push(`Remake: ${remakes.join(', ')}`);
    const bundles = (r.bundles ?? []).map(enlace).filter(Boolean);
    if (bundles.length) lineas.push(`Incluido en ${bundles.join(', ')}`);
    const parejas = yo ? metricas.parejasDeJuego(yo.id, id) : [];
    const filasAlias = (datos.estado.alias ?? []).filter((x) => Number(x.principal_id) === id);
    const alias = filasAlias.map((x) => ({ j: datos.juegoConocido(Number(x.alias_id)), x })).filter((a) => a.j);
    const admin = esAdmin();
    const bloqueSaga = datos.haySagas() && yo ? (sgGrupo ? `
        <a class="enlace-fila ficha-saga" href="#saga/${esc(sgGrupo.id)}">
          ${icono('saga', { tam: 22, color: 'var(--acento)' })}
          <span class="enlace-fila-texto">Saga «${esc(sgGrupo.nombre)}» · ${datos.juegosDeSaga(sgGrupo.id).length} juegos</span>
          ${icono('adelante', { tam: 18, color: 'var(--texto-2)' })}
        </a>
        <button type="button" class="enlace-discreto" data-quitar-saga>Quitar de la saga</button>`
      : '<button type="button" class="boton-secundario neutro con-icono" data-anadir-saga>' + icono('saga', { tam: 20, color: 'currentColor' }) + '<span>Añadir a una saga…</span></button>') : '';
    if (!lineas.length && !parejas.length && !alias.length && !bloqueSaga) return '';
    return `
      <section class="ficha-versiones">
        ${bloqueSaga}
        ${lineas.length ? `<p class="ficha-relaciones">${lineas.join(' · ')}</p>` : ''}
        ${parejas.map(tarjetaFusion).join('')}
        ${alias.length ? `
          <div class="ficha-fusionadas">
            <span class="campo-titulo">Versiones incluidas</span>
            ${alias.map(({ j: a, x }) => `
              <div class="ficha-fusionada">
                <span>«${esc(a.nombre)}»${a.anio ? ` · ${a.anio}` : ''}${x.auto ? '' : ' · fusionada a mano'}</span>
                ${admin ? `<button type="button" class="enlace-discreto" data-separar="${a.igdb_id}">Separar</button>`
                  : !x.auto && x.creado_por && x.creado_por === yo?.id ? `<button type="button" class="enlace-discreto" data-deshacer-fusion="${a.igdb_id}">Deshacer</button>` : ''}
              </div>`).join('')}
          </div>` : ''}
      </section>`;
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
    // Una versión fusionada se ve como su juego principal.
    const canon = datos.canonico(id);
    if (canon !== id) { reemplazarRuta(`#juego/${canon}`); return; }
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
    if (yo && clicFusion(e, yo.id)) return;
    if (e.target.closest('[data-anadir-saga]') && yo) { anadirASagaUI(id, yo.id); return; }
    if (e.target.closest('[data-quitar-saga]')) {
      const sg = datos.sagaDeJuego(id);
      if (sg) { datos.quitarDeSaga(id, aviso); aviso(`Quitado de «${sg.nombre}»`); }
      return;
    }
    const separar = e.target.closest('[data-separar]');
    if (separar && yo) {
      datos.separarVersion(separar.dataset.separar, yo.id, aviso);
      aviso('Separada: vuelve a contar como otro juego y no se fusionará sola');
      return;
    }
    const deshacer = e.target.closest('[data-deshacer-fusion]');
    if (deshacer) {
      datos.deshacerFusion(deshacer.dataset.deshacerFusion, aviso);
      aviso('Fusión deshecha: vuelven a contar por separado');
      return;
    }
    const on = e.target.closest('[data-online]');
    if (on && esAdmin()) {
      const valor = on.dataset.online === 'si';
      if (valor !== datos.esOnline(id)) {
        datos.marcarOnline(id, valor, aviso);
        aviso(valor ? 'Marcado como sin final: fuera de «Jugando ahora» y en «Juegos sin final»' : 'Ya no es un juego sin final');
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

  // Abierta desde una lista: deslizar al anterior / siguiente de esa lista.
  const quitarGaleria = datos.canonico(id) === id ? activarDeslizar(el, id, el.querySelector('.ficha')) : () => {};
  return () => {
    controlador.abort();
    desuscribir();
    quitarGaleria();
  };
}
