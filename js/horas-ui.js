// Desglose de horas con control manual (ficha, hoja de Valorar y "Revisar posibles
// duplicados"): cada línea (fuente y cuenta) tiene "Contar"; la de Xbox, "Fue en PC";
// y, si Steam (o Epic) y Xbox pueden ser las mismas partidas, el aviso con tres atajos.
// Por defecto todo suma; lo que se decide aquí se guarda por usuario y juego
// (horas_ajustes) y la sincronización no lo toca nunca.
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { esc, aviso, avisoDeshacer } from './ui.js';

const { FUENTES_PC, NOMBRE_FUENTE, NOMBRE_ESTIMACION, textoHoras } = metricas;

/** "PS5", "Xbox Series", "Xbox · PC", "Steam" */
const nombreLinea = (d) => (FUENTES_PC.includes(d.fuente) ? NOMBRE_FUENTE[d.fuente]
  : d.fuente === 'xbox' && d.plataforma === 'PC' ? 'Xbox · PC' : d.plataforma);
const nombrePc = (dup) => [...new Set(dup.pc.map((d) => NOMBRE_FUENTE[d.fuente] ?? d.fuente))].join(' y ');

/** Etiqueta discreta para listas (rejilla de la biblioteca, revisión). */
export const etiquetaDuplicado = (dup) => (dup ? `<span class="etiqueta-duplicado${dup.probable ? ' probable' : ''}">Posible duplicado</span>` : '');

/** Aviso con los tres atajos. */
export function avisoDuplicado(dup, igdbId) {
  if (!dup) return '';
  return `
    <div class="aviso-duplicado">
      <div class="aviso-duplicado-texto">
        ${etiquetaDuplicado(dup)}
        <span>${esc(nombrePc(dup))} y Xbox pueden ser las mismas partidas.${dup.motivos.length ? ` ${esc(dup.motivos.join('. '))}.` : ''} Ahora suman las dos.</span>
      </div>
      <div class="aviso-duplicado-botones">
        <button type="button" class="boton-secundario boton-pequeno" data-hd="pc" data-hd-juego="${igdbId}">Contar solo ${esc(nombrePc(dup))}</button>
        <button type="button" class="boton-secundario boton-pequeno" data-hd="xbox" data-hd-juego="${igdbId}">Contar solo Xbox</button>
        <button type="button" class="enlace-discreto" data-hd="distintas" data-hd-juego="${igdbId}">Son partidas distintas</button>
      </div>
    </div>`;
}

/**
 * Lista de líneas con sus controles. op.extra: horas extra a mano (se suman aparte y no
 * llevan interruptor). Con una sola línea sincronizada y sin aviso, no hace falta control.
 */
export function lineasHoras(uid, igdbId, { extra = 0, textoExtra = 'Horas extra' } = {}) {
  const d = metricas.desgloseDe(uid, igdbId);
  const conControl = d.sinc.length > 1 || d.sinc.some((x) => x.excluida || x.plataforma !== x.plataformaOriginal);
  const linea = (x) => `
    <li class="horas-linea${x.excluida ? ' excluida' : ''}">
      <span class="horas-linea-nombre">${esc(nombreLinea(x))}${x.cuenta ? ` <small>${esc(x.cuenta)}</small>` : ''}${x.plataforma !== x.plataformaOriginal ? ` <small>antes ${esc(x.plataformaOriginal)}</small>` : ''}</span>
      <span class="horas-linea-h">${esc(textoHoras(x.horas))}</span>
      ${conControl ? `
        <span class="horas-linea-control">
          ${x.fuente === 'xbox' && x.plataformaOriginal !== 'PC' ? `<button type="button" class="enlace-discreto" data-hd-plataforma="${esc(x.clave)}" data-hd-juego="${igdbId}">${x.plataforma === 'PC' ? `Era ${esc(x.plataformaOriginal)}` : 'Fue en PC'}</button>` : ''}
          <label class="interruptor mini"><input type="checkbox" data-hd-contar="${esc(x.clave)}" data-hd-juego="${igdbId}"${x.excluida ? '' : ' checked'}><span>Contar</span></label>
        </span>` : ''}
    </li>`;
  const est = d.estimada;
  const hayLineas = d.sinc.length || extra || est;
  return `
    ${avisoDuplicado(d.duplicado, igdbId)}
    ${hayLineas ? `
      <ul class="horas-desglose">
        ${d.sinc.map(linea).join('')}
        ${extra ? `<li class="horas-linea"><span class="horas-linea-nombre">${esc(textoExtra)}</span><span class="horas-linea-h">${esc(textoHoras(extra))}</span></li>` : ''}
        ${est ? `
          <li class="horas-linea estimada">
            <span class="horas-linea-nombre">Estimado (IGDB) <small>${esc(NOMBRE_ESTIMACION[est.tipo] ?? '')}${est.auto ? ' · automático' : ''}</small></span>
            <span class="horas-linea-h">≈${esc(textoHoras(est.horas))}</span>
            <span class="horas-linea-control">
              <button type="button" class="enlace-discreto" data-hd-est-real="${igdbId}">Son mis horas reales</button>
              <button type="button" class="enlace-discreto" data-hd-est-borrar="${igdbId}">Borrar</button>
            </span>
          </li>` : ''}
      </ul>` : ''}
    ${est ? '' : selectorEstimacion(uid, igdbId)}`;
}

/** "Usar tiempo estimado": se despliega con las opciones de IGDB; la propuesta, resaltada. */
function selectorEstimacion(uid, igdbId) {
  const ops = metricas.opcionesEstimacion(uid, igdbId);
  if (!ops.length) return '';
  return `
    <details class="horas-estimar">
      <summary class="enlace-discreto">Usar tiempo estimado</summary>
      <div class="horas-estimar-opciones">
        ${ops.map((o) => `<button type="button" class="${o.propuesta ? 'boton-principal' : 'boton-secundario neutro'} boton-pequeno" data-hd-usar="${o.tipo}" data-hd-horas="${o.horas}" data-hd-juego="${igdbId}">${esc(o.nombre)} (~${esc(textoHoras(o.horas))})</button>`).join('')}
      </div>
      <p class="ajustes-nota">Tiempos de IGDB. Se verán como «≈», aparte de tus horas reales.</p>
    </details>`;
}

/** Contar solo PC / solo Xbox / partidas distintas, en uno o varios juegos (una escritura). */
export function resolverDuplicados(uid, ids, modo) {
  return datos.ajustesHorasEnLote(uid, ids, (antes, id) => {
    const lineas = metricas.desgloseDe(uid, id).sinc;
    const pc = lineas.filter((x) => FUENTES_PC.includes(x.fuente)).map((x) => x.clave);
    const xbox = lineas.filter((x) => x.fuente === 'xbox').map((x) => x.clave);
    if (!pc.length || !xbox.length) return null;
    const ex = new Set(antes.excluidas);
    const [fuera, dentro] = modo === 'pc' ? [xbox, pc] : modo === 'xbox' ? [pc, xbox] : [[], [...pc, ...xbox]];
    for (const k of fuera) ex.add(k);
    for (const k of dentro) ex.delete(k);
    return { excluidas: [...ex], distintas: modo === 'distintas' };
  }, aviso);
}

export const TEXTO_RESUELTO = { pc: 'Solo cuentan las horas de PC (Steam)', xbox: 'Solo cuentan las horas de Xbox', distintas: 'Hecho: son partidas distintas y suman las dos' };

/** Clics y cambios de estos controles. Devuelve true si eran suyos. */
export function manejarHoras(e, uid, alCambiar = () => {}) {
  const t = e.target;
  const contar = t.closest?.('[data-hd-contar]');
  if (contar && e.type === 'change') {
    const clave = contar.dataset.hdContar;
    const cuenta = contar.checked;
    datos.ajustesHorasEnLote(uid, [Number(contar.dataset.hdJuego)], (antes) => {
      const ex = new Set(antes.excluidas);
      if (cuenta) ex.delete(clave); else ex.add(clave);
      return { excluidas: [...ex] };
    }, aviso);
    alCambiar();
    return true;
  }
  if (e.type !== 'click') return !!contar;
  const usar = t.closest?.('[data-hd-usar]');
  if (usar) {
    e.preventDefault();
    datos.guardarEstimacion(uid, Number(usar.dataset.hdJuego), { horas: Number(usar.dataset.hdHoras), tipo: usar.dataset.hdUsar }, aviso);
    aviso('Horas estimadas añadidas');
    alCambiar();
    return true;
  }
  const real = t.closest?.('[data-hd-est-real]');
  if (real) {
    e.preventDefault();
    datos.estimacionAReales(uid, Number(real.dataset.hdEstReal), aviso);
    aviso('Ahora son horas extra normales');
    alCambiar();
    return true;
  }
  const borrar = t.closest?.('[data-hd-est-borrar]');
  if (borrar) {
    e.preventDefault();
    datos.descartarEstimacion(uid, Number(borrar.dataset.hdEstBorrar), aviso);
    aviso('Estimación borrada');
    alCambiar();
    return true;
  }
  const plat = t.closest?.('[data-hd-plataforma]');
  if (plat) {
    e.preventDefault();
    const clave = plat.dataset.hdPlataforma;
    datos.ajustesHorasEnLote(uid, [Number(plat.dataset.hdJuego)], (antes) => {
      const p = { ...(antes.plataformas ?? {}) };
      if (p[clave]) delete p[clave]; else p[clave] = 'PC';
      return { plataformas: p };
    }, aviso);
    alCambiar();
    return true;
  }
  const hd = t.closest?.('[data-hd]');
  if (hd) {
    e.preventDefault();
    const r = resolverDuplicados(uid, [Number(hd.dataset.hdJuego)], hd.dataset.hd);
    avisoDeshacer(TEXTO_RESUELTO[hd.dataset.hd], r.deshacer);
    alCambiar();
    return true;
  }
  return false;
}
