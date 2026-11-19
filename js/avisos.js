// Notificaciones (migración 040): un solo sistema para todos los avisos. Se generan en el
// servidor (disparadores y la tarea cvj-avisos); aquí se pintan:
//   · textos e iconos de cada tipo (agrupados: "Nico y Javi han reaccionado a tu reseña de…");
//   · el contador y el botón de la cabecera (y de la barra lateral en escritorio);
//   · abrir uno: lleva al sitio exacto (y lo resalta un momento) y lo marca como leído;
//   · "Mientras no estabas": al entrar, un carrusel con lo más importante sin ver (como
//     mucho 5), que sustituye a las capas sueltas de insignias y "¡Completado!";
//   · Ajustes → Notificaciones: qué tipos salen en ese resumen (en el centro, todo siempre).
// La pantalla del centro de avisos está en js/pantallas/avisos.js.
import * as datos from './datos.js';
import { icono } from './icons.js';
import { esc, avatar, portada, tiempoRelativo, aviso } from './ui.js';
import { usuarioActual } from './sesion.js';
import { definicion, medalla, NIVELES, NOMBRE_NIVEL } from './insignias.js';

const DIA = 86400000;
const MAX_RESUMEN = 5;
const DIAS_RESUMEN = 14; // más antiguos ya no salen en el resumen (sí en el centro)

/** Tipos agrupados para Ajustes (y para saber qué apagar en el resumen). */
export const GRUPOS = [
  { id: 'reaccion', nombre: 'Reacciones a lo tuyo', tipos: ['reaccion'] },
  { id: 'respuesta', nombre: 'Respuestas a lo tuyo', tipos: ['respuesta'] },
  { id: 'lectura', nombre: 'Lecturas de tu columna', tipos: ['lectura'] },
  { id: 'insignia', nombre: 'Insignias', tipos: ['insignia', 'insignia_perdida'] },
  { id: 'entrada', nombre: 'Entradas nuevas en las columnas', tipos: ['entrada'] },
  { id: 'cementerio', nombre: 'Cementerio (muertes y vueltas)', tipos: ['muerte', 'reanimacion', 'reanimacion_respondida', 'reanimacion_caducada', 'vuelta'] },
  { id: 'propuesta', nombre: 'Propuestas de nuevos miembros', tipos: ['propuesta', 'propuesta_lista', 'propuesta_caducada'] },
  { id: 'completo', nombre: 'Juegos completados', tipos: ['completo'] },
  { id: 'evento', nombre: 'Eventos (Game Awards...)', tipos: ['evento_resultados', 'evento_cierra'] },
  { id: 'admin', nombre: 'Del Dictador (apelaciones, reanimaciones, propuestas con apoyo)', tipos: ['apelacion', 'reanimacion_pronto', 'reanimacion_sin_codigo', 'propuesta_apoyo'], admin: true },
];
const grupoDe = (tipo) => GRUPOS.find((g) => g.tipos.includes(tipo))?.id ?? tipo;

const ICONO = {
  reaccion: 'reaccionar', respuesta: 'comentario', lectura: 'leido', insignia: 'trofeo', insignia_perdida: 'trofeo',
  entrada: 'columnas', muerte: 'lapida', reanimacion: 'rayo', vuelta: 'rayo', reanimacion_pronto: 'rayo',
  reanimacion_respondida: 'rayo', reanimacion_sin_codigo: 'rayo', reanimacion_caducada: 'lapida', propuesta_lista: 'urna', propuesta_caducada: 'urna',
  propuesta: 'urna', propuesta_apoyo: 'urna', apelacion: 'sello', completo: 'completado',
  evento_resultados: 'trofeo', evento_cierra: 'trofeo',
};

const mias = () => {
  const yo = usuarioActual()?.id;
  return datos.notificaciones().filter((n) => n.usuario_id === yo);
};
export const sinLeer = () => mias().filter((n) => !n.leida).length;

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------
const nombre = (id) => datos.usuario(id)?.nombre ?? 'Alguien';
/** "Nico", "Nico y Javi", "Nico, Javi y 2 más". */
function quienes(ids) {
  const n = [...new Set(ids ?? [])].filter((id) => datos.usuario(id)).map(nombre);
  if (!n.length) return 'Alguien';
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} y ${n[1]}`;
  return `${n[0]}, ${n[1]} y ${n.length - 2} más`;
}
const ha = (ids) => (new Set(ids ?? []).size > 1 ? 'han' : 'ha');
const b = (t) => `<strong>${esc(t)}</strong>`;

function cosa(d) {
  if (d.objetivo === 'entrada' || d.entrada_id) {
    const e = datos.entrada(d.entrada_id ?? d.objetivo_id);
    return e?.titulo ? `tu entrada «${esc(e.titulo)}»` : 'tu entrada';
  }
  if (d.coleccion_id) return `tu reseña de ${b(datos.coleccion(d.coleccion_id)?.nombre ?? 'la colección')}`;
  if (d.juego_id) return `tu reseña de ${b(datos.juegoConocido(d.juego_id)?.nombre ?? 'un juego')}`;
  return 'lo tuyo';
}

/** { titulo (html), extra (html), visual (html) } de un aviso. */
export function describir(n) {
  const d = n.datos ?? {};
  const A = n.actores ?? [];
  const ins = d.insignia ? definicion(d.insignia) : null;
  const juego = d.juego_id ? datos.juegoConocido(d.juego_id) : null;
  const ev = d.evento_id ? datos.evento(d.evento_id) : null;
  const sujeto = d.sujeto ? datos.usuario(d.sujeto) : null;
  let titulo = '';
  let extra = '';
  switch (n.tipo) {
    case 'reaccion': titulo = `${b(quienes(A))} ${ha(A)} reaccionado a ${cosa(d)}`; break;
    case 'respuesta': titulo = `${b(quienes(A))} ${ha(A)} respondido a ${cosa(d)}`; extra = d.texto ? `«${esc(d.texto)}»` : ''; break;
    case 'lectura': titulo = `${b(quienes(A))} ${ha(A)} leído ${cosa({ entrada_id: d.entrada_id })}`; break;
    case 'insignia':
      titulo = d.grupo ? `Ahora es tuya: ${b(ins?.nombre ?? 'una insignia')}` : d.sube ? `${b(ins?.nombre ?? 'Tu insignia')} sube a ${NOMBRE_NIVEL[d.nivel] ?? 'otro nivel'}` : `Nueva insignia: ${b(ins?.nombre ?? '')}`;
      extra = d.grupo && d.quitada && datos.usuario(d.quitada) ? `Se la has quitado a ${esc(nombre(d.quitada))}` : esc(ins?.desc ?? '');
      break;
    case 'insignia_perdida': titulo = `${b(nombre(d.quien))} te ha quitado ${b(ins?.nombre ?? 'una insignia')}`; break;
    case 'entrada': {
      const e = datos.entrada(d.entrada_id);
      const c = e ? datos.columna(e.columna_id) : null;
      titulo = `${b(quienes(A))} ha publicado ${e?.titulo ? `«${esc(e.titulo)}»` : 'una entrada nueva'}`;
      extra = c ? `En ${esc(c.nombre)}` : '';
      break;
    }
    case 'muerte': titulo = `${b(sujeto?.nombre ?? 'Alguien')} ha muerto${d.exorcismo ? ' (exorcizado)' : ''}`; extra = d.causa ? `Causa: ${esc(d.causa)}` : 'El Dictador no da explicaciones.'; break;
    case 'reanimacion': titulo = `${b(quienes(A))} intenta reanimar a ${b(sujeto?.nombre ?? 'alguien')}`; extra = 'Intentando contactar con el más allá…'; break;
    case 'reanimacion_respondida': titulo = `${b(sujeto?.nombre ?? 'Alguien')} ha respondido a la llamada`; extra = 'Si nadie lo veta, vuelve en 12 horas.'; break;
    case 'reanimacion_sin_codigo': titulo = `${b(sujeto?.nombre ?? 'Alguien')} quiere volver, sin código`; extra = 'Solo vuelve si lo apruebas (con un código nuevo).'; break;
    case 'reanimacion_caducada': titulo = `${b(sujeto?.nombre ?? 'Alguien')} no respondió a la llamada`; extra = 'Sigue bajo tierra.'; break;
    case 'propuesta_lista': titulo = `${b(d.nombre ?? 'Tu candidato')} ha aceptado tu propuesta`; extra = 'Ya se puede votar.'; break;
    case 'propuesta_caducada': titulo = `${b(d.nombre ?? 'Tu candidato')} no aceptó a tiempo`; extra = 'La propuesta ha caducado.'; break;
    case 'vuelta': titulo = `${b(sujeto?.nombre ?? 'Alguien')} ha vuelto ${d.apelacion ? 'tras apelar' : 'de entre los muertos'}`; break;
    case 'reanimacion_pronto': titulo = `${b(sujeto?.nombre ?? 'Alguien')} vuelve en menos de 2 horas`; extra = 'Si no lo vetas, vuelve solo.'; break;
    case 'propuesta': titulo = `${b(quienes(A))} propone a ${b(d.nombre ?? 'alguien')}`; extra = n.leida ? '' : 'Falta tu voto.'; break;
    case 'propuesta_apoyo': titulo = `${b(d.nombre ?? 'Una propuesta')} tiene mucho apoyo`; extra = `${d.favor ?? 0} a favor, ${d.contra ?? 0} en contra.`; break;
    case 'apelacion': titulo = `${b(sujeto?.nombre ?? 'Alguien')} apela desde el más allá`; extra = d.exorcizado ? 'Está exorcizado.' : ''; break;
    case 'completo': titulo = `${b(quienes(A))} ${ha(A)} completado ${b(juego?.nombre ?? (d.coleccion_id ? datos.coleccion(d.coleccion_id)?.nombre : '') ?? 'un juego')}`; extra = d.tambien ? 'Tú también lo has jugado.' : ''; break;
    case 'evento_resultados': titulo = `Ya hay resultados: ${b(ev?.titulo ?? 'el evento')}`; extra = 'Mira cómo ha quedado la porra.'; break;
    case 'evento_cierra': titulo = `La votación de ${b(ev?.titulo ?? 'el evento')} cierra pronto`; extra = 'Revisa tu papeleta y vota en la web oficial.'; break;
    default: titulo = esc(n.tipo);
  }
  return { titulo, extra };
}

/** Lo que va a la izquierda: la medalla, la portada o el avatar de quien lo hizo. */
function visual(n, tam = 40) {
  const d = n.datos ?? {};
  if ((n.tipo === 'insignia' || n.tipo === 'insignia_perdida') && d.insignia && definicion(d.insignia)) {
    return `<span class="aviso-visual medalla">${medalla(definicion(d.insignia), { nivel: d.nivel ?? 1, tam, bloqueada: n.tipo === 'insignia_perdida' })}</span>`;
  }
  const quien = d.sujeto ?? (n.actores ?? [])[0];
  const u = quien ? datos.usuario(quien) : null;
  const muerto = ['muerte', 'apelacion', 'reanimacion', 'reanimacion_pronto', 'reanimacion_respondida', 'reanimacion_sin_codigo', 'reanimacion_caducada'].includes(n.tipo);
  return `
    <span class="aviso-visual${muerto ? ' difunto-foto' : ''}">
      ${u ? avatar(u, tam) : `<span class="aviso-visual-icono">${icono(ICONO[n.tipo] ?? 'aviso', { tam: tam * 0.55, color: 'currentColor' })}</span>`}
      <span class="aviso-tipo t-${grupoDe(n.tipo)}">${icono(ICONO[n.tipo] ?? 'aviso', { tam: 12, color: 'currentColor' })}</span>
    </span>`;
}

/** Una fila del centro de avisos. */
export function fila(n, ahora = new Date()) {
  const { titulo, extra } = describir(n);
  return `
    <a class="aviso-fila${n.leida ? '' : ' nueva'}" href="${esc(n.destino ?? '#avisos')}" data-aviso="${esc(n.id)}" data-k="${esc(n.id)}">
      ${visual(n)}
      <span class="aviso-fila-texto">
        <span class="aviso-fila-titulo">${titulo}</span>
        ${extra ? `<span class="aviso-fila-extra">${extra}</span>` : ''}
        <span class="aviso-fila-tiempo">${tiempoRelativo(n.actualizado_en ?? n.creado_en, ahora)}</span>
      </span>
      ${n.leida ? '' : '<span class="aviso-punto" aria-label="Sin leer"></span>'}
    </a>`;
}

// ---------------------------------------------------------------------------
// Abrir uno: al sitio exacto y leído
// ---------------------------------------------------------------------------
export function abrir(id) {
  const n = mias().find((x) => x.id === id);
  if (!n) return;
  const yo = usuarioActual();
  if (!n.leida) datos.marcarAvisos(yo.id, [n.id], {}, aviso);
  const d = n.datos ?? {};
  const destino = n.destino || '#avisos';
  if (d.destacar) { try { sessionStorage.setItem('cvj.destacar', d.destacar); } catch { /* nada */ } }
  const despues = () => {
    if (n.tipo === 'insignia' || n.tipo === 'insignia_perdida') import('./insignias.js').then((m) => m.abrirColeccion(yo.id));
    window.dispatchEvent(new Event('cvj:destacar'));
  };
  if (location.hash === destino) despues();
  else {
    window.addEventListener('cvj:pantalla', () => setTimeout(despues, 300), { once: true });
    location.hash = destino;
  }
}

/** Botón de la cabecera de Inicio (con el contador de no leídas). */
export function botonCabecera() {
  const n = sinLeer();
  return `
    <a class="cabecera-avisos" href="#avisos" aria-label="Avisos${n ? `: ${n} sin leer` : ''}">
      ${icono('aviso', { tam: 26, color: 'currentColor' })}
      ${n ? `<b class="avisos-contador">${n > 99 ? '99+' : n}</b>` : ''}
    </a>`;
}

// ---------------------------------------------------------------------------
// "Mientras no estabas": el resumen al entrar
// ---------------------------------------------------------------------------
let toca = true;          // al abrir la app; y al volver tras un rato fuera
let fueraDesde = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') fueraDesde = Date.now();
  else if (fueraDesde && Date.now() - fueraDesde > 5 * 60000) toca = true;
});
let mostrando = false;

function pendientesResumen() {
  const u = datos.usuario(usuarioActual()?.id);
  const apagados = u?.avisos_resumen ?? {};
  const limite = Date.now() - DIAS_RESUMEN * DIA;
  return mias()
    .filter((n) => !n.leida && !n.en_resumen && apagados[grupoDe(n.tipo)] !== false && new Date(n.actualizado_en).getTime() > limite)
    .sort((a, b) => b.prioridad - a.prioridad || new Date(b.actualizado_en) - new Date(a.actualizado_en));
}

function tarjetaResumen(n) {
  const d = n.datos ?? {};
  const { titulo, extra } = describir(n);
  let grande;
  if ((n.tipo === 'insignia' || n.tipo === 'insignia_perdida') && d.insignia && definicion(d.insignia)) {
    grande = `<div class="resumen-medalla nivel-${NIVELES[d.nivel ?? 1] || 'unico'}${n.tipo === 'insignia_perdida' ? ' perdida' : ''}">${medalla(definicion(d.insignia), { nivel: d.nivel ?? 1, tam: 120, bloqueada: n.tipo === 'insignia_perdida' })}</div>`;
  } else if (n.tipo === 'completo' && (d.juego_id ? datos.juegoConocido(d.juego_id) : null)) {
    grande = `<div class="resumen-portada">${portada(datos.juegoConocido(d.juego_id), { clase: 'portada-resumen', ancho: 120, prioridad: true })}<span class="resumen-sello">${icono('completado', { tam: 22, color: 'currentColor' })}</span></div>`;
  } else {
    const ids = [...new Set([d.sujeto, ...(n.actores ?? [])].filter(Boolean))].filter((id) => datos.usuario(id)).slice(0, 3);
    grande = `<div class="resumen-avatares${['muerte', 'apelacion'].includes(n.tipo) ? ' difunto-foto' : ''}">${ids.length ? ids.map((id) => avatar(datos.usuario(id), 76)).join('') : `<span class="resumen-icono">${icono(ICONO[n.tipo] ?? 'aviso', { tam: 46, color: 'currentColor' })}</span>`}<span class="resumen-tipo">${icono(ICONO[n.tipo] ?? 'aviso', { tam: 18, color: 'currentColor' })}</span></div>`;
  }
  return `
    <button type="button" class="resumen-tarjeta" data-aviso="${esc(n.id)}">
      ${grande}
      <span class="resumen-titulo">${titulo}</span>
      ${extra ? `<span class="resumen-extra">${extra}</span>` : ''}
      <span class="resumen-ir">Ir ${icono('adelante', { tam: 14, color: 'currentColor' })}</span>
    </button>`;
}

/** Si toca (al abrir la app, o al volver tras un rato) y hay algo sin ver: el resumen. */
export function revisarResumen() {
  const yo = usuarioActual();
  if (!toca || mostrando || !yo || !datos.datosFrescos()) return;
  if (document.body.classList.contains('hoja-abierta') || document.body.classList.contains('celebrando')) return;
  if (document.querySelector('.tut-capa')) return; // un tutorial abierto: luego
  toca = false;
  const lista = pendientesResumen();
  if (!lista.length) return;
  // Todas las de ahora quedan vistas en el resumen (las que no caben, en el centro).
  datos.marcarAvisos(yo.id, lista.map((n) => n.id), { resumen: true });
  mostrarResumen(lista.slice(0, MAX_RESUMEN), lista.length);
}

function mostrarResumen(lista, total) {
  mostrando = true;
  const capa = document.createElement('div');
  capa.className = 'celebra resumen-capa';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-label', 'Mientras no estabas');
  capa.innerHTML = `
    <div class="celebra-fondo"></div>
    <div class="resumen">
      <header class="resumen-cab">
        <span class="resumen-ante">${icono('aviso', { tam: 18, color: 'currentColor' })} Mientras no estabas</span>
        <button type="button" class="resumen-cerrar" data-cerrar aria-label="Cerrar">${icono('cerrar', { tam: 18, color: 'currentColor' })}</button>
      </header>
      <div class="resumen-pista" data-sin-deslizar>${lista.map(tarjetaResumen).join('')}</div>
      ${lista.length > 1 ? `<div class="celebra-puntos resumen-puntos">${lista.map((_, i) => `<i${i ? '' : ' class="activo"'}></i>`).join('')}</div>` : ''}
      <a class="resumen-todo" href="#avisos" data-todo>Ver todo${total > lista.length ? ` (${total})` : ''}</a>
    </div>`;
  document.body.appendChild(capa);
  document.body.classList.add('celebrando');
  const pista = capa.querySelector('.resumen-pista');
  const cerrar = () => {
    capa.classList.add('saliendo');
    document.body.classList.remove('celebrando');
    document.removeEventListener('keydown', alTeclado);
    setTimeout(() => { capa.remove(); mostrando = false; }, 220);
  };
  const alTeclado = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', alTeclado);
  pista.addEventListener('scroll', () => {
    const i = Math.round(pista.scrollLeft / Math.max(1, pista.clientWidth));
    capa.querySelectorAll('.resumen-puntos i').forEach((p, k) => p.classList.toggle('activo', k === i));
  }, { passive: true });
  capa.addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar]') || e.target.classList.contains('celebra-fondo')) { cerrar(); return; }
    if (e.target.closest('[data-todo]')) { cerrar(); return; } // el enlace lleva a #avisos
    const t = e.target.closest('[data-aviso]');
    if (t) { cerrar(); abrir(t.dataset.aviso); }
  });
  setTimeout(() => capa.classList.add('visible'), 20);
}

// ---------------------------------------------------------------------------
// Ajustes → Notificaciones
// ---------------------------------------------------------------------------
export function bloqueAjustes(u) {
  if (!u || !('avisos_resumen' in u)) return '';
  const apagados = u.avisos_resumen ?? {};
  return `
    <section class="ajustes-bloque">
      <span class="campo-titulo">Notificaciones</span>
      <p class="ajustes-nota">Qué sale en "Mientras no estabas" al entrar. En Avisos se ve siempre todo.</p>
      <div class="avisos-ajustes">
        ${GRUPOS.filter((g) => !g.admin || u.es_admin).map((g) => `
          <label class="interruptor mini">
            <input type="checkbox" data-aviso-grupo="${g.id}"${apagados[g.id] === false ? '' : ' checked'}>
            <span>${esc(g.nombre)}</span>
          </label>`).join('')}
      </div>
    </section>`;
}
/** Cambio de un interruptor de Ajustes. true si era suyo. */
export function cambioAjustes(e) {
  const c = e.target.closest?.('[data-aviso-grupo]');
  if (!c) return false;
  const yo = usuarioActual();
  const u = datos.usuario(yo?.id);
  if (!u) return true;
  const nuevo = { ...(u.avisos_resumen ?? {}) };
  if (c.checked) delete nuevo[c.dataset.avisoGrupo]; else nuevo[c.dataset.avisoGrupo] = false;
  datos.actualizarUsuario(yo.id, { avisos_resumen: nuevo }, aviso, 'No se ha podido guardar. Se ha deshecho el cambio.');
  return true;
}

// ---------------------------------------------------------------------------
// Resaltar el sitio al que lleva un aviso (la reseña, la lápida...) un momento
// ---------------------------------------------------------------------------
export function destacarPendiente() {
  let sel = null;
  try { sel = sessionStorage.getItem('cvj.destacar'); } catch { /* nada */ }
  if (!sel) return;
  const t0 = Date.now();
  const buscar = () => {
    let el = null;
    try { el = document.querySelector(`#vista > .pantalla:not([hidden]) ${sel}`); } catch { /* selector raro */ }
    if (!el && Date.now() - t0 < 4000) { setTimeout(buscar, 200); return; }
    try { sessionStorage.removeItem('cvj.destacar'); } catch { /* nada */ }
    if (!el) return;
    const caja = el.closest('.grupo-fila, .lapida, .prop-tarjeta, article, li') ?? el;
    caja.scrollIntoView({ block: 'center' });
    caja.classList.add('destacado-aviso');
    setTimeout(() => caja.classList.remove('destacado-aviso'), 2200);
  };
  buscar();
}
window.addEventListener('cvj:destacar', destacarPendiente);
