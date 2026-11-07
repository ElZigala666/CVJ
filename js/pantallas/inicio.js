// Pantallas 02 / 10 · Inicio: jugando ahora, destacados del grupo y actividad reciente.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { tirarParaRefrescar } from '../refrescar.js';
import * as psn from '../psn.js';
import * as xbox from '../xbox.js';
import * as metricas from '../metricas.js';
import { usuarioActual } from '../sesion.js';
import { mediaGrupo, recomendacionGrupo, desviacionTipica } from '../notas.js';
import {
  esc, cabecera, portada, notaConLetra, avatar, iconoRecomendacion, avatarPerfil, nombrePerfil, avatarInsignia,
  tiempoRelativo, conservarScroll, aviso,
} from '../ui.js';

const PESTANAS = [
  { id: 'mejor', nombre: 'Mejor valorados' },
  { id: 'jugados', nombre: 'Más jugados' },
  { id: 'polemicos', nombre: 'Más polémicos' },
];
const MAX_DESTACADOS = 10;
const MAX_ACTIVIDAD = 30;
const VERBOS = {
  valoro: 'valoró',
  empezo: 'empezó a jugar',
  completo: 'completó',
  abandono: 'abandonó',
  pendiente: 'añadió a pendientes',
};

let pestana = 'mejor'; // se recuerda mientras la app está abierta

export function render(el) {
  const pintar = () => conservarScroll(el, () => { el.innerHTML = html(); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pestana]');
    if (!b || b.dataset.pestana === pestana) return;
    pestana = b.dataset.pestana;
    const cont = el.querySelector('[data-ref="destacados"]');
    if (cont) {
      cont.outerHTML = destacados();
      for (const x of el.querySelectorAll('[data-pestana]')) {
        const on = x.dataset.pestana === pestana;
        x.classList.toggle('activa', on);
        x.setAttribute('aria-selected', String(on));
      }
    }
  });
  const desuscribir = datos.suscribir(pintar);
  // Aviso de reconectar PlayStation: abre el asistente en Ajustes.
  const alPulsar = (e) => {
    if (e.target.closest('[data-accion="reconectar-psn"]')) psn.abrirAsistente();
    if (e.target.closest('[data-accion="conectar-plataformas"]')) window.dispatchEvent(new CustomEvent('cvj:ajustes-plataformas'));
    const leido = e.target.closest('[data-aviso-leido]');
    if (leido) datos.marcarAvisoLeido(leido.dataset.avisoLeido, aviso);
  };
  el.addEventListener('click', alPulsar);
  pintar();
  // Los "Hace 5 min" se actualizan solos sin repintar la pantalla.
  const reloj = setInterval(() => {
    const ahora = new Date();
    for (const t of el.querySelectorAll('[data-fecha]')) t.textContent = tiempoRelativo(t.dataset.fecha, ahora);
  }, 60_000);
  // Tirar hacia abajo para refrescar (la app instalada no tiene el del navegador).
  const quitarGesto = tirarParaRefrescar(() => datos.refrescar());
  return () => {
    desuscribir();
    el.removeEventListener('click', alPulsar);
    clearInterval(reloj);
    quitarGesto();
  };
}

function html() {
  const yo = usuarioActual();
  const hayAlgo = datos.valoracionesEfectivas().length > 0 || jugandoPsn(new Set()).length > 0;
  if (!hayAlgo) {
    return `
      ${cabecera(yo)}
      ${elGrupo()}
      ${avisoPsn()}
      <div class="inicio-vacio">
        <span class="vacio-icono grande">${icono('valorar', { tam: 36, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}</span>
        <h1 class="inicio-vacio-titulo">Aún no hay nada por aquí</h1>
        <p class="vacio-texto">Cuando el grupo empiece a valorar, aquí verás qué está jugando cada uno, los juegos mejor valorados y lo último que ha pasado.</p>
        <a class="boton-principal enlace" href="#valorar">${icono('mas', { tam: 20, color: 'currentColor' })}<span>Valorar mi primer juego</span></a>
        ${datos.cuentasDe(yo?.id).length ? '' : '<button type="button" class="boton-secundario" data-accion="conectar-plataformas">Conectar PlayStation, Xbox o Steam</button>'}
      </div>`;
  }
  return `
    ${cabecera(yo)}
    ${elGrupo()}
    ${avisoPsn()}
    ${avisoRevisar()}
    ${avisosPersonales()}
    ${bienvenida()}
    <div class="inicio">
      ${jugandoAhora()}
      <section class="inicio-seccion">
        <h2 class="seccion-titulo con-margen">Destacados del grupo</h2>
        <div class="pestanas" role="tablist" aria-label="Destacados">
          ${PESTANAS.map((p) => `<button type="button" role="tab" class="pestana${p.id === pestana ? ' activa' : ''}" aria-selected="${p.id === pestana}" data-pestana="${p.id}">${p.nombre}</button>`).join('')}
        </div>
        ${destacados()}
      </section>
      ${actividad()}
    </div>`;
}

// ---------------------------------------------------------------------------
// Jugando ahora: un juego por usuario (el más reciente en estado Jugando)
// ---------------------------------------------------------------------------
function jugandoAhora() {
  const porUsuario = new Map();
  for (const v of datos.valoracionesEfectivas()) {
    // Los juegos online / sin final no salen: se juegan siempre.
    if (v.estado !== 'jugando' || !datos.usuario(v.usuario_id) || datos.esOnline(v.juego_id)) continue;
    const prev = porUsuario.get(v.usuario_id);
    if (!prev || new Date(v.actualizado_en) > new Date(prev.actualizado_en)) porUsuario.set(v.usuario_id, v);
  }
  const lista = [...porUsuario.values()]
    .sort((a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en))
    .map((v) => ({ v, j: datos.juegoConocido(v.juego_id), u: datos.usuario(v.usuario_id), cuando: v.actualizado_en }))
    .filter((x) => x.j);
  // Quien no tiene nada en "Jugando" pero ha jugado en PSN en los últimos 3 días.
  const conJugando = new Set(lista.map((x) => x.u.id));
  const todos = [...lista, ...jugandoPsn(conJugando)];

  const contenido = todos.length
    ? `<div class="carrusel" data-scroll="jugando">
        ${todos.map((x, i) => tarjetaJugando(x, i)).join('')}
      </div>`
    : `<p class="seccion-vacia">${icono('jugando', { tam: 20, color: 'var(--texto-2)', trazo: 'var(--fondo)' })}<span>Nadie está jugando nada ahora mismo.</span></p>`;

  return `
    <section class="inicio-seccion">
      <h2 class="seccion-titulo con-margen">Jugando ahora</h2>
      ${contenido}
    </section>`;
}

/** Fila de avatares con todo el grupo: tocar uno abre su perfil. */
function elGrupo() {
  const yo = usuarioActual();
  const lista = datos.estado.usuarios.filter((u) => u.activo !== false).sort((a, b) => (a.id === yo?.id ? -1 : b.id === yo?.id ? 1 : a.nombre.localeCompare(b.nombre, 'es')));
  if (lista.length < 2) return '';
  return `
    <section class="el-grupo" aria-label="El grupo">
      <div class="el-grupo-fila" data-scroll="grupo">
        ${lista.map((u) => `
          <a class="el-grupo-persona" href="#perfil/${esc(u.id)}">
            ${avatar(u, 52)}
            <span>${u.id === yo?.id ? 'Tú' : esc(u.nombre)}</span>
          </a>`).join('')}
      </div>
    </section>`;
}

const DIAS_PSN = 3;

/** Entradas de "Jugando ahora" sacadas de PSN para quien no tiene nada en Jugando. */
function jugandoPsn(excluir) {
  const limite = Date.now() - DIAS_PSN * 86400000;
  const porUsuario = new Map();
  for (const f of datos.estado.biblioteca ?? []) {
    if (excluir.has(f.usuario_id) || f.oculto || !f.ultima_vez || !datos.usuario(f.usuario_id)) continue;
    const jid = datos.igdbDeBiblioteca(f);
    if (jid != null && datos.esOnline(jid)) continue;
    if (new Date(f.ultima_vez).getTime() < limite) continue;
    const prev = porUsuario.get(f.usuario_id);
    if (!prev || f.ultima_vez > prev.ultima_vez) porUsuario.set(f.usuario_id, f);
  }
  return [...porUsuario.values()]
    .sort((a, b) => b.ultima_vez.localeCompare(a.ultima_vez))
    .map((f) => {
      const igdbId = datos.igdbDeBiblioteca(f);
      return { u: datos.usuario(f.usuario_id), j: igdbId != null ? datos.juegoConocido(igdbId) : null, fila: f, psn: true };
    });
}

function tarjetaJugando(x, i) {
  const { j, u } = x;
  const etiqueta = x.psn ? `<span class="etiqueta-psn sobre-portada">${x.fila?.fuente === 'xbox' ? 'Xbox' : 'PSN'}</span>` : '';
  if (j) {
    return `
      <a class="tarjeta-jugando" href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}">
        <div class="tarjeta-jugando-portada">
          ${portada(j, { clase: 'portada-jugando', titulo: 'arriba', deco: true, prioridad: i < 4 })}
          <span class="tarjeta-avatar">${avatarPerfil(u, 30)}</span>
          ${etiqueta}
        </div>
        ${nombrePerfil(u, 'span', 'tarjeta-nombre')}
        ${(() => { const h = metricas.horasDe(u.id, j.igdb_id); return h ? `<span class="tarjeta-horas">${esc(metricas.textoHoras(h))}</span>` : ''; })()}
      </a>`;
  }
  // Juego de PSN sin emparejar: su imagen de PSN; tocarla lleva a elegir qué juego es.
  return `
    <a class="tarjeta-jugando" href="#elegir/${encodeURIComponent(x.fila.psn_title_id)}">
      <div class="tarjeta-jugando-portada">
        <div class="portada portada-jugando portada-psn" style="--bloque:var(--superficie-2)">
          <span class="portada-titulo portada-titulo-arriba">${esc(x.fila.nombre_psn)}</span>
          ${x.fila.imagen_psn ? `<img src="${esc(x.fila.imagen_psn)}" alt="" loading="lazy" decoding="async" onload="this.classList.add('ok')" onerror="this.remove()">` : ''}
        </div>
        <span class="tarjeta-avatar">${avatarPerfil(u, 30)}</span>
        ${etiqueta}
      </div>
      ${nombrePerfil(u, 'span', 'tarjeta-nombre')}
    </a>`;
}

/** Solo para mí: mi conexión con PlayStation ha caducado. */
/** "Revisa N juegos nuevos de tu biblioteca" (tras sincronizar con PSN). */
function avisoRevisar() {
  const yo = usuarioActual();
  const n = yo ? metricas.biblioteca(yo.id).porRevisar.length : 0;
  if (!n) return '';
  return `
    <a class="aviso-revisar" href="#revisar">
      ${icono('jugando', { tam: 20, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}
      <span>Revisa ${n} ${n === 1 ? 'juego nuevo' : 'juegos nuevos'} de tu biblioteca</span>
      ${icono('adelante', { tam: 16, color: 'var(--texto-2)' })}
    </a>`;
}

/** Mis avisos (p. ej. "tenías valoración en dos versiones de un juego"): Ver y Vale. */
/**
 * Primer arranque de alguien nuevo (sin valoraciones ni plataformas): bienvenida con
 * los dos primeros pasos. Se va sola en cuanto valora algo y conecta una plataforma.
 */
function bienvenida() {
  const yo = usuarioActual();
  if (!yo) return '';
  const sinValorar = !datos.valoracionesEfectivas().some((v) => v.usuario_id === yo.id);
  const sinPlataformas = !datos.cuentasDe(yo.id).length;
  if (!sinValorar && !sinPlataformas) return '';
  if (!sinValorar && sinPlataformas && datos.valoracionesEfectivas().filter((v) => v.usuario_id === yo.id).length > 3) return '';
  return `
    <section class="bienvenida">
      <h2 class="bienvenida-titulo">${sinValorar ? `Hola, ${esc(yo.nombre)}` : 'Tu biblioteca, sola'}</h2>
      <p class="bienvenida-texto">${sinValorar
        ? 'Así funciona CVJ: valoras los juegos que juegas y ves qué opina el grupo. Empieza por aquí:'
        : 'Conecta tus plataformas y tus juegos y tus horas se cargarán solos.'}</p>
      <div class="bienvenida-pasos">
        ${sinValorar ? `<a class="boton-principal enlace con-icono" href="#valorar">${icono('mas', { tam: 20, color: 'currentColor' })}<span>Valorar mi primer juego</span></a>` : ''}
        ${sinPlataformas ? `<button type="button" class="boton-secundario con-icono" data-accion="conectar-plataformas">${icono('jugando', { tam: 20, color: 'currentColor', trazo: 'var(--superficie)' })}<span>Conectar PlayStation, Xbox o Steam</span></button>` : ''}
      </div>
      <p class="ajustes-nota">Nunca se crean valoraciones solas: la biblioteca solo sirve para tener tus horas y lo que has jugado a mano.</p>
    </section>`;
}

function avisosPersonales() {
  const yo = usuarioActual();
  if (!yo) return '';
  return datos.avisosDe(yo.id).map((a) => `
    <div class="aviso-personal" role="status">
      ${icono('jugando', { tam: 20, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}
      <p>${esc(a.texto)}</p>
      <div class="aviso-personal-botones">
        ${a.juego_id ? `<a class="boton-secundario boton-pequeno" href="#juego/${esc(String(a.juego_id))}" data-aviso-leido="${esc(a.id)}">Revisar</a>` : ''}
        <button type="button" class="enlace-discreto" data-aviso-leido="${esc(a.id)}">Vale</button>
      </div>
    </div>`).join('');
}

/** Solo para el admin: la clave de OpenXBL del grupo ha dejado de funcionar. */
function avisoXbox() {
  if (!xbox.claveConProblemas()) return '';
  return `
    <button type="button" class="aviso-psn" data-accion="reconectar-psn">
      ${icono('jugando', { tam: 20, color: 'var(--peligro)', trazo: 'var(--fondo)' })}
      <span>La clave de Xbox (OpenXBL) no funciona · <strong>Revisar</strong></span>
    </button>`;
}

function avisoPsn() {
  if (!psn.hayQueReconectar()) return avisoXbox();
  return `
    <button type="button" class="aviso-psn" data-accion="reconectar-psn">
      ${icono('jugando', { tam: 20, color: 'var(--peligro)', trazo: 'var(--fondo)' })}
      <span>Tu conexión con PlayStation ha caducado · <strong>Reconectar</strong></span>
    </button>`;
}

// ---------------------------------------------------------------------------
// Destacados
// ---------------------------------------------------------------------------
function candidatos() {
  const porJuego = new Map();
  for (const v of datos.valoracionesEfectivas()) {
    if (!datos.usuario(v.usuario_id)) continue;
    const id = Number(v.juego_id);
    if (!porJuego.has(id)) porJuego.set(id, []);
    porJuego.get(id).push(v);
  }
  return [...porJuego.entries()].map(([id, vals]) => {
    const m = mediaGrupo(vals);
    return {
      j: datos.juegoConocido(id),
      vals,
      media: m.media,
      letra: m.letra,
      votos: m.votos,
      rec: recomendacionGrupo(vals),
      jugadores: vals.filter((v) => v.estado !== 'pendiente').length,
      desviacion: desviacionTipica(vals),
      online: datos.esOnline(id),
    };
  }).filter((x) => x.j);
}

function destacados() {
  let lista = candidatos();
  let vacio = '';
  if (pestana === 'mejor') {
    lista = lista.filter((x) => x.votos >= 2 && !x.online).sort((a, b) => b.media - a.media || b.votos - a.votos);
    vacio = 'Aquí saldrán los juegos con al menos 2 notas del grupo.';
  } else if (pestana === 'jugados') {
    lista = lista.filter((x) => x.jugadores > 0).sort((a, b) => b.jugadores - a.jugadores || (b.media ?? -1) - (a.media ?? -1));
    vacio = 'Aquí saldrán los juegos que más gente del grupo ha jugado.';
  } else {
    lista = lista.filter((x) => x.desviacion !== null && !x.online).sort((a, b) => b.desviacion - a.desviacion || b.votos - a.votos);
    vacio = 'Cuando dos o más personas puntúen el mismo juego, aquí saldrán los que más dividen al grupo.';
  }
  lista = lista.slice(0, MAX_DESTACADOS);

  if (!lista.length) {
    return `<div data-ref="destacados"><p class="seccion-vacia">${icono('rankings', { tam: 20, color: 'var(--texto-2)' })}<span>${vacio}</span></p></div>`;
  }

  return `
    <div class="carrusel" data-ref="destacados" data-scroll="destacados-${pestana}">
      ${lista.map((x, i) => tarjetaDestacado(x, i)).join('')}
    </div>`;
}

function tarjetaDestacado(x, i) {
  const opinan = x.vals
    .filter((v) => v.recomendado === true || v.recomendado === false)
    .sort((a, b) => Number(b.recomendado) - Number(a.recomendado));
  const extra = pestana === 'jugados'
    ? `${x.jugadores} ${x.jugadores === 1 ? 'jugador' : 'jugadores'}`
    : x.rec.total ? `${x.rec.si} de ${x.rec.total}` : '';
  return `
    <a class="tarjeta-destacado" href="#juego/${x.j.igdb_id}" data-precarga="${esc(x.j.cover_id ?? '')}">
      ${portada(x.j, { clase: 'portada-destacado', titulo: 'abajo', deco: true, prioridad: i < 3 })}
      <div class="destacado-nota">
        ${x.media !== null ? notaConLetra(x.media, 'md2') : '<span class="destacado-sin-nota">Sin nota</span>'}
        ${extra ? `<span class="destacado-extra">${extra}</span>` : ''}
      </div>
      ${opinan.length ? `
        <div class="pila-avatares mini" role="img" aria-label="Lo recomiendan ${x.rec.si} de ${x.rec.total}">
          ${opinan.map((v) => avatarInsignia(datos.usuario(v.usuario_id), v.recomendado, 18)).join('')}
        </div>` : ''}
    </a>`;
}

// ---------------------------------------------------------------------------
// Actividad reciente
// ---------------------------------------------------------------------------
function actividad() {
  const ahora = new Date();
  const filas = datos.estado.actividad
    .slice()
    .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))
    .map((a) => ({ a, u: datos.usuario(a.usuario_id), j: datos.juegoConocido(a.juego_id) }))
    .filter((x) => x.u && x.j)
    .slice(0, MAX_ACTIVIDAD);

  const contenido = filas.length
    ? filas.map(({ a, u, j }) => { const h = metricas.horasDe(u.id, j.igdb_id); return `
        <a class="actividad-fila" href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}">
          ${avatarPerfil(u, 36)}
          <div class="actividad-texto">
            <span class="actividad-frase">${nombrePerfil(u, 'strong')} ${VERBOS[a.tipo] ?? 'actualizó'} <strong>${esc(j.nombre)}</strong></span>
            ${a.nota != null || a.recomendado != null || h ? `
              <div class="actividad-nota">
                ${a.nota != null ? notaConLetra(a.nota, 'act') : ''}
                ${iconoRecomendacion(a.recomendado, 16)}
                ${h ? `<span class="actividad-horas">${esc(metricas.textoHoras(h))}</span>` : ''}
              </div>` : ''}
            ${a.texto ? `<p class="actividad-resena">«${esc(a.texto)}»</p>` : ''}
            <span class="actividad-tiempo" data-fecha="${esc(a.creado_en)}">${tiempoRelativo(a.creado_en, ahora)}</span>
          </div>
          ${portada(j, { clase: 'portada-actividad' })}
        </a>`; }).join('')
    : `<p class="seccion-vacia">${icono('pendiente', { tam: 20, color: 'var(--texto-2)', trazo: 'var(--fondo)' })}<span>Todavía no hay actividad.</span></p>`;

  return `
    <section class="inicio-seccion actividad">
      <h2 class="seccion-titulo">Actividad reciente</h2>
      ${contenido}
    </section>`;
}
