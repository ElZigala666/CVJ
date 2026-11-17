// Eventos destacados (migración 039): galas y presentaciones (The Game Awards, Summer Game
// Fest, Directs...). Aquí, la lógica y las piezas que salen fuera de su página:
//   · el banner de Inicio (cuenta atrás, enlace externo, "Ver más"; se cierra por persona y
//     vuelve si cambia algo importante: aviso_version);
//   · categorías incluidas, "Mi voto" (a quién quiero que gane) y "Mi pronóstico" (quién
//     creo que ganará: la porra), resúmenes del grupo, el veredicto de CVJ y la porra;
//   · la etiqueta de la ficha ("Nominado · TGA 2026 · Juego del Año") y la actividad.
// La página está en js/pantallas/evento.js (y el editor del admin en js/pantallas/evento-editar.js).
import * as datos from './datos.js';
import { icono } from './icons.js';
import { esc, avatar, tiempoRelativo, urlPortada } from './ui.js';
import { usuarioActual } from './sesion.js';
import { mediaGrupo, notaALetra } from './notas.js';

const MIN = 60000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const FECHA_HORA = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
export const fechaHora = (f) => (f ? FECHA_HORA.format(new Date(f)).replace(/\./g, '') : '');

export const activo = (e, ahora = Date.now()) => new Date(e.inicio).getTime() <= ahora && ahora < new Date(e.fin).getTime();
/** Los eventos activos, el más cercano a su fecha clave primero. */
export const activos = (ahora = Date.now()) => datos.eventos().filter((e) => activo(e, ahora))
  .sort((a, b) => new Date(a.fecha_clave ?? a.fin) - new Date(b.fecha_clave ?? b.fin));
/** Desde la fecha clave (la gala) no se elige ni se cambia nada. */
export const cerrado = (e, ahora = Date.now()) => !!e?.fecha_clave && ahora >= new Date(e.fecha_clave).getTime();
export const votacionAbierta = (e, ahora = Date.now()) => !e?.votacion_fin || ahora < new Date(e.votacion_fin).getTime();
export const conPagina = (e) => datos.categoriasDe(e.id).length > 0;

/** "23 d 4 h", "5 h 12 min", "12 min" (o null si ya ha pasado). */
export function cuentaAtras(fecha, ahora = Date.now()) {
  if (!fecha) return null;
  const ms = new Date(fecha).getTime() - ahora;
  if (ms <= 0) return null;
  const d = Math.floor(ms / DIA);
  const h = Math.floor((ms % DIA) / HORA);
  const m = Math.max(1, Math.floor((ms % HORA) / MIN));
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

/** Imagen del evento: la subida o el arte horizontal del juego elegido. */
export function imagenDe(e) {
  if (e.imagen_url) return e.imagen_url;
  const j = e.juego_imagen_id ? datos.juegoConocido(e.juego_imagen_id) : null;
  if (j?.arte_id) return urlPortada(j.arte_id, '1080p');
  if (j?.cover_id) return urlPortada(j.cover_id, 'cover_big');
  return null;
}
export const colorDe = (e) => e.color || '#6D28D9';

// ---------------------------------------------------------------------------
// Categorías y elecciones
// ---------------------------------------------------------------------------
/** Las que cuentan: las incluidas, en el orden de la web oficial. */
export const incluidas = (eventoId) => datos.categoriasDe(eventoId).filter((c) => c.incluida !== false);
export const miEleccion = (categoriaId, tipo, uid = usuarioActual()?.id) => datos.eleccionesDe(categoriaId).find((x) => x.usuario_id === uid && x.tipo === tipo) ?? null;
const vivos = (lista) => lista.filter((x) => datos.usuario(x.usuario_id) && datos.usuario(x.usuario_id).activo !== false);

/** Quién ha elegido a cada nominado (voto o pronóstico). → Map(nominadoId → [usuarios]) */
export function eleccionesPorNominado(categoriaId, tipo) {
  const m = new Map();
  for (const x of vivos(datos.eleccionesDe(categoriaId)).filter((y) => y.tipo === tipo)) {
    if (!m.has(x.nominado_id)) m.set(x.nominado_id, []);
    m.get(x.nominado_id).push(datos.usuario(x.usuario_id));
  }
  return m;
}
/** El más elegido (si empatan, ninguno destaca: se dice "empate"). */
export function masElegido(categoriaId, tipo) {
  const m = eleccionesPorNominado(categoriaId, tipo);
  const orden = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  if (!orden.length) return null;
  const [id, quien] = orden[0];
  const empate = orden.length > 1 && orden[1][1].length === quien.length;
  return { nominado: datos.nominado(id), n: quien.length, empate };
}
/** Los pronósticos de los demás solo se ven si ya he hecho el mío (o tras la gala). */
export const veoPronosticos = (e, categoriaId) => cerrado(e) || !!miEleccion(categoriaId, 'pronostico');

/** La nota del grupo de un juego nominado y las letras de quienes lo han jugado. */
export function notaGrupo(igdbId) {
  if (!igdbId) return null;
  const vals = datos.valoracionesDeJuego(datos.canonico(igdbId)).filter((v) => datos.usuario(v.usuario_id) && v.nota != null);
  const m = mediaGrupo(vals);
  return { ...m, quien: vals.map((v) => ({ u: datos.usuario(v.usuario_id), letra: notaALetra(v.nota) })) };
}

/**
 * "El veredicto de CVJ": de los nominados a Juego del Año (o la primera categoría de
 * juegos), el de mejor nota del grupo. Con pocas notas, se avisa.
 */
export function veredicto(eventoId) {
  const cats = incluidas(eventoId).filter((c) => c.tipo === 'juegos');
  const goty = cats.find((c) => /juego del a[ñn]o|game of the year/i.test(c.nombre)) ?? cats[0];
  if (!goty) return null;
  const filas = datos.nominadosDe(goty.id).map((n) => ({ n, g: notaGrupo(n.juego_id) })).filter((x) => x.g?.media != null)
    .sort((a, b) => b.g.media - a.g.media || b.g.votos - a.g.votos);
  if (!filas.length) return { categoria: goty, favorito: null, filas: [] };
  const notas = filas.reduce((t, x) => t + x.g.votos, 0);
  return { categoria: goty, favorito: filas[0], filas, pocas: filas[0].g.votos < 2 || notas < 4 };
}

// ---------------------------------------------------------------------------
// Porra: un punto por pronóstico acertado (por su peso: Juego del Año vale más)
// ---------------------------------------------------------------------------
export function porra(eventoId) {
  const cats = incluidas(eventoId).filter((c) => c.ganador_id);
  const filas = new Map();
  for (const c of cats) {
    for (const x of vivos(datos.eleccionesDe(c.id)).filter((y) => y.tipo === 'pronostico')) {
      if (!filas.has(x.usuario_id)) filas.set(x.usuario_id, { u: datos.usuario(x.usuario_id), puntos: 0, aciertos: 0, jugadas: 0 });
      const f = filas.get(x.usuario_id);
      f.jugadas++;
      if (x.nominado_id === c.ganador_id) { f.aciertos++; f.puntos += c.peso ?? 1; }
    }
  }
  const lista = [...filas.values()].sort((a, b) => b.puntos - a.puntos || b.aciertos - a.aciertos || a.u.nombre.localeCompare(b.u.nombre));
  const top = lista[0]?.puntos ?? 0;
  return { lista, decididas: cats.length, total: incluidas(eventoId).length, ganadores: top > 0 ? lista.filter((f) => f.puntos === top) : [] };
}
/** "Nico" / "Nico y Marcos" / "Nico, Marcos y Javi". */
export const nombres = (us) => {
  const n = us.map((u) => u.nombre);
  return n.length < 2 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
};

// ---------------------------------------------------------------------------
// Banner de Inicio
// ---------------------------------------------------------------------------
const claveCerrado = (e) => `cvj.evento.cerrado.${e.id}`;
const cerradoPorMi = (e) => { try { return localStorage.getItem(claveCerrado(e)) === String(e.aviso_version ?? 1); } catch { return false; } };
export function cerrarBanner(e) { try { localStorage.setItem(claveCerrado(e), String(e.aviso_version ?? 1)); } catch { /* nada */ } }

export function bannerInicio(ahora = Date.now()) {
  return activos(ahora).filter((e) => !cerradoPorMi(e)).map((e) => {
    const img = imagenDe(e);
    const falta = cuentaAtras(e.fecha_clave, ahora);
    const res = e.resultados_en ? porra(e.id) : null;
    let linea;
    if (res?.ganadores.length) linea = `${esc(nombres(res.ganadores.map((f) => f.u)))} ${res.ganadores.length > 1 ? 'ganan' : 'gana'} la porra`;
    else if (e.resultados_en) linea = 'Ya hay ganadores';
    else if (falta) linea = `${esc(e.etiqueta_clave || 'Empieza')} en <b data-cuenta="${esc(e.fecha_clave)}">${esc(falta)}</b>`;
    else if (e.fecha_clave) linea = `${esc(e.etiqueta_clave || 'El evento')}: en marcha`;
    else linea = '';
    return `
      <section class="evento-banner${img ? ' con-imagen' : ''}" style="--evento:${esc(colorDe(e))}" aria-label="${esc(e.titulo)}">
        ${img ? `<img class="evento-banner-img" src="${esc(img)}" alt="" loading="lazy" decoding="async" crossorigin="anonymous">` : ''}
        <div class="evento-banner-velo"></div>
        <button type="button" class="evento-banner-cerrar" data-evento-cerrar="${esc(e.id)}" aria-label="Cerrar">${icono('cerrar', { tam: 16, color: 'currentColor' })}</button>
        <div class="evento-banner-texto">
          ${e.siglas ? `<span class="evento-banner-siglas">${esc(e.siglas)}</span>` : ''}
          <h2 class="evento-banner-titulo">${esc(e.titulo)}</h2>
          ${linea ? `<p class="evento-banner-cuenta">${linea}</p>` : ''}
        </div>
        <div class="evento-banner-botones fila-botones">
          ${e.enlace_url && !e.resultados_en ? `<a class="boton-principal con-icono" href="${esc(e.enlace_url)}" target="_blank" rel="noopener">${esc(e.enlace_texto || 'Ver en la web')}${icono('externo', { tam: 16, color: 'currentColor' })}</a>` : ''}
          ${conPagina(e) ? `<a class="boton-secundario" href="#evento/${esc(e.id)}">${e.resultados_en ? 'Ver resultados' : 'Ver más'}</a>` : ''}
        </div>
      </section>`;
  }).join('');
}

/** Las cuentas atrás se actualizan solas (sin repintar). */
export function actualizarCuentas(raiz, ahora = Date.now()) {
  for (const el of raiz.querySelectorAll('[data-cuenta]')) {
    const t = cuentaAtras(el.dataset.cuenta, ahora);
    if (t) el.textContent = t;
  }
}

/** Clic en el banner (cerrar). true si era suyo. */
export function clicBanner(ev, repintar) {
  const b = ev.target.closest('[data-evento-cerrar]');
  if (!b) return false;
  const e = datos.evento(b.dataset.eventoCerrar);
  if (e) cerrarBanner(e);
  repintar?.();
  return true;
}

// ---------------------------------------------------------------------------
// Ficha del juego: "Nominado · TGA 2026 · Juego del Año" (y "Ganador")
// ---------------------------------------------------------------------------
export function etiquetasJuego(igdbId) {
  const ids = new Set([Number(igdbId), datos.canonico(igdbId)]);
  const filas = (datos.estado.eventosNominados ?? []).filter((n) => n.juego_id != null && ids.has(Number(n.juego_id)));
  const out = [];
  for (const n of filas) {
    const c = datos.categoriaEvento(n.categoria_id);
    const e = c && datos.evento(c.evento_id);
    if (!c || !e || c.incluida === false) continue;
    out.push({ e, c, gana: c.ganador_id === n.id, orden: c.orden });
  }
  if (!out.length) return '';
  // Una etiqueta por evento: "Ganador · TGA 2026 · Juego del Año" o "Nominado · TGA 2026 · Juego del Año y 3 más".
  const porEvento = new Map();
  for (const x of out) { if (!porEvento.has(x.e.id)) porEvento.set(x.e.id, []); porEvento.get(x.e.id).push(x); }
  return `<div class="evento-etiquetas">${[...porEvento.values()].map((l) => {
    l.sort((a, b) => a.orden - b.orden);
    const e = l[0].e;
    const ganadas = l.filter((x) => x.gana);
    const lista = ganadas.length ? ganadas : l;
    const texto = `${lista[0].c.nombre}${lista.length > 1 ? (ganadas.length ? ` y ${lista.length - 1} más` : ` y ${lista.length - 1} más`) : ''}`;
    return `
    <a class="evento-etiqueta${ganadas.length ? ' ganador' : ''}" href="#evento/${esc(e.id)}" title="${esc(lista.map((x) => x.c.nombre).join(', '))}">
      ${icono(ganadas.length ? 'trofeo' : 'diana', { tam: 13, color: 'currentColor' })}<span>${ganadas.length ? 'Ganador' : 'Nominado'} · ${esc(e.siglas || e.titulo)} · ${esc(texto)}</span>
    </a>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Actividad: quién gana la porra
// ---------------------------------------------------------------------------
export function eventosActividad() {
  return datos.eventos().filter((e) => e.resultados_en).map((e) => ({ e, p: porra(e.id), fecha: e.resultados_en })).filter((x) => x.p.ganadores.length);
}
export function filaActividad({ e, p, fecha }, ahora = new Date()) {
  const g = p.ganadores;
  const us = g.map((f) => f.u);
  const corto = (e.titulo || '').replace(/\s+\d{4}$/, '');
  return `
    <a class="actividad-fila actividad-evento" href="#evento/${esc(e.id)}">
      ${avatar(us[0], 36)}
      <div class="actividad-texto">
        <span class="actividad-frase"><strong>${esc(nombres(us))}</strong> ${g.length > 1 ? 'ganan' : 'gana'} la porra de ${esc(corto.startsWith('The ') ? `los ${corto.slice(4)}` : corto)} con ${g[0].aciertos} ${g[0].aciertos === 1 ? 'acierto' : 'aciertos'}</span>
        <span class="actividad-tiempo" data-fecha="${esc(fecha)}">${tiempoRelativo(fecha, ahora)}</span>
      </div>
      <span class="actividad-evento-icono" aria-hidden="true">${icono('trofeo', { tam: 24, color: 'currentColor' })}</span>
    </a>`;
}

// ---------------------------------------------------------------------------
// Celebración corta para el ganador de la porra (una vez por persona y evento)
// ---------------------------------------------------------------------------
export function celebrarPorra() {
  const yo = usuarioActual();
  if (!yo || document.querySelector('.porra-celebracion')) return;
  for (const { e, p } of eventosActividad()) {
    const clave = `cvj.porra.vista.${e.id}`;
    try { if (localStorage.getItem(clave)) continue; localStorage.setItem(clave, '1'); } catch { continue; }
    const g = p.ganadores;
    const soyYo = g.some((u) => u.u.id === yo.id);
    const capa = document.createElement('div');
    capa.className = 'porra-celebracion';
    capa.setAttribute('role', 'dialog');
    capa.innerHTML = `
      <div class="porra-celebracion-caja" style="--evento:${esc(colorDe(e))}">
        <span class="porra-celebracion-trofeo">${icono('trofeo', { tam: 46, color: 'currentColor' })}</span>
        <div class="porra-celebracion-avatares">${g.map((f) => avatar(f.u, 64)).join('')}</div>
        <p class="porra-celebracion-sub">${esc(e.siglas || e.titulo)} · La porra</p>
        <h2>${soyYo ? (g.length > 1 ? 'Has ganado la porra (compartida)' : 'Has ganado la porra') : `${esc(nombres(g.map((f) => f.u)))} ${g.length > 1 ? 'ganan' : 'gana'} la porra`}</h2>
        <p>${g[0].aciertos} ${g[0].aciertos === 1 ? 'acierto' : 'aciertos'} · ${g[0].puntos} ${g[0].puntos === 1 ? 'punto' : 'puntos'}</p>
        <small>Toca para seguir</small>
      </div>`;
    const quitar = () => capa.remove();
    capa.addEventListener('click', quitar);
    setTimeout(quitar, 6000);
    document.body.appendChild(capa);
    return;
  }
}
