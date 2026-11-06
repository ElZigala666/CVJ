// "¿Es el mismo juego?": tarjeta discreta y hoja para fusionar dos versiones
// (o decir que son distintos y no volver a preguntar).
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { abrirHoja } from './hoja.js';
import { esc, portada, aviso } from './ui.js';
import { formatearNota } from './notas.js';
import { icono } from './icons.js';

const MOTIVOS = {
  version: 'IGDB dice que una es una edición o versión de la otra.',
  remaster: 'Una es el remaster de la otra.',
  port: 'Una es una adaptación de la otra.',
  ampliado: 'Una es la versión ampliada de la otra.',
  saga: 'Son de la misma saga y se llaman casi igual.',
};

/** Tarjeta "¿{A} y {B} son el mismo juego para ti?" (vacía si falta algún juego). */
export function tarjetaFusion(p) {
  const a = datos.juegoConocido(p.a);
  const b = datos.juegoConocido(p.b);
  if (!a || !b) return '';
  return `
    <div class="tarjeta-fusion" data-pareja="${p.a}:${p.b}">
      <div class="tarjeta-fusion-portadas">
        ${portada(a, { clase: 'portada-lista' })}
        ${portada(b, { clase: 'portada-lista' })}
      </div>
      <div class="tarjeta-fusion-texto">
        <strong>¿«${esc(a.nombre)}» y «${esc(b.nombre)}» son el mismo juego para ti?</strong>
        <span>${esc(MOTIVOS[p.motivo] ?? '')}</span>
        <div class="tarjeta-fusion-botones">
          <button type="button" class="boton-secundario boton-pequeno" data-fusion-si="${p.a}:${p.b}">Sí, fusionar</button>
          <button type="button" class="boton-secundario neutro boton-pequeno" data-fusion-no="${p.a}:${p.b}">No, son distintos</button>
        </div>
      </div>
    </div>`;
}

/** Gestiona los botones de las tarjetas (devuelve true si el clic era suyo). */
export function clicFusion(e, uid) {
  const si = e.target.closest('[data-fusion-si]');
  const no = e.target.closest('[data-fusion-no]');
  if (!si && !no) return false;
  const [a, b] = (si ?? no).dataset[si ? 'fusionSi' : 'fusionNo'].split(':').map(Number);
  if (no) {
    datos.rechazarFusion(uid, a, b, aviso);
    aviso('No volveremos a preguntar por esta pareja');
  } else {
    abrirFusion(uid, a, b);
  }
  return true;
}

/** Hoja para fusionar: qué portada y nombre se quedan y, si hay dos notas, con cuál. */
export function abrirFusion(uid, a, b) {
  const ja = datos.juegoConocido(a);
  const jb = datos.juegoConocido(b);
  if (!ja || !jb) return;
  // Mis valoraciones de verdad en cada versión (antes de fusionar).
  const vDe = (id) => datos.estado.valoraciones
    .filter((v) => v.usuario_id === uid && [id, ...datos.aliasDe(id)].includes(Number(v.juego_id)))
    .sort((x, y) => new Date(y.actualizado_en) - new Date(x.actualizado_en))[0] ?? null;
  const va = vDe(a);
  const vb = vDe(b);
  const dosNotas = va?.nota != null && vb?.nota != null;
  // Por defecto: se queda el que tiene valoración (o el de la valoración más reciente).
  const s = {
    principal: va && (!vb || new Date(va.actualizado_en) >= new Date(vb.actualizado_en)) ? a : b,
    nota: va && vb ? (new Date(va.actualizado_en) >= new Date(vb.actualizado_en) ? a : b) : null,
  };
  const ha = metricas.horasDe(uid, a) ?? 0;
  const hb = metricas.horasDe(uid, b) ?? 0;
  const manual = va?.horas != null || vb?.horas != null;

  const opcion = (j, campo, valor, extra = '') => `
    <button type="button" class="fusion-opcion${s[campo] === valor ? ' activa' : ''}" data-${campo}="${valor}" aria-pressed="${s[campo] === valor}">
      ${portada(j, { clase: 'portada-lista' })}
      <span><strong>${esc(j.nombre)}</strong>${extra}</span>
    </button>`;
  const pintar = (cuerpo) => {
    cuerpo.innerHTML = `
      <div class="fusion">
        <p class="ajustes-nota">Contarán como un solo juego para todo el grupo: en la ficha, los rankings y la nota media. Se puede deshacer desde la ficha.</p>
        <span class="campo-titulo">¿Qué portada y nombre se quedan?</span>
        <div class="fusion-opciones">
          ${opcion(ja, 'principal', a, ja.anio ? `<small>${ja.anio}</small>` : '')}
          ${opcion(jb, 'principal', b, jb.anio ? `<small>${jb.anio}</small>` : '')}
        </div>
        ${dosNotas ? `
          <span class="campo-titulo">Tienes nota en los dos: ¿con cuál te quedas?</span>
          <div class="fusion-opciones">
            ${opcion(ja, 'nota', a, `<small>Tu nota: ${formatearNota(va.nota)}</small>`)}
            ${opcion(jb, 'nota', b, `<small>Tu nota: ${formatearNota(vb.nota)}</small>`)}
          </div>` : ''}
        ${ha + hb > 0 ? `<p class="ajustes-nota">Las horas se suman: ${Math.round((ha + hb) * 10) / 10} h.</p>` : ''}
        <button type="button" class="boton-principal" data-fusionar>Fusionar</button>
      </div>`;
  };
  abrirHoja({
    titulo: '¿Es el mismo juego?',
    html: '<div data-ref="fusion"></div>',
    alMontar(cuerpo, cerrar) {
      const cont = cuerpo.querySelector('[data-ref="fusion"]');
      pintar(cont);
      cont.addEventListener('click', async (e) => {
        const p = e.target.closest('[data-principal]');
        const n = e.target.closest('[data-nota]');
        if (p) { s.principal = Number(p.dataset.principal); pintar(cont); return; }
        if (n) { s.nota = Number(n.dataset.nota); pintar(cont); return; }
        if (!e.target.closest('[data-fusionar]')) return;
        const alias = s.principal === a ? b : a;
        const ok = await datos.fusionar({
          usuarioId: uid,
          principal: s.principal,
          alias,
          notaDe: s.nota == null || s.nota === s.principal ? 'principal' : 'alias',
          // Si alguna tenía horas a mano, se guardan sumadas; si no, ya las suma PSN.
          horas: manual ? Math.round((ha + hb) * 10) / 10 : null,
        }, aviso);
        if (ok) aviso('Fusionados: ahora cuentan como un solo juego');
        cerrar();
        if (ok && location.hash === `#juego/${alias}`) location.replace(`#juego/${datos.canonico(alias)}`);
      });
    },
  });
}
