// Lista de cuentas de una plataforma en Ajustes (PSN, Xbox y, en el futuro, Steam):
// una fila por cuenta con su nombre, juegos, horas, última sincronización, una
// etiqueta opcional editable ("Cuenta principal", "Cuenta 2") y su botón de quitar.
import { esc, tiempoRelativo, aviso } from './ui.js';
import * as datos from './datos.js';
import * as metricas from './metricas.js';

const hace = (iso) => (iso ? tiempoRelativo(iso).replace(/^Ahora$/, 'ahora mismo').toLowerCase() : 'nunca');

/** Cuentas de una fuente (psn, xbox, steam) de un usuario. */
export const cuentasDe = (u, fuente) => datos.cuentasDe(u.id, fuente);

/**
 * HTML de las filas.
 * @param {{ uid: string, fuente: string, cuentas: object[], attr: string, confirmar: string|null,
 *           ocupado: string|null, quitar: string, pregunta: string, quitando: string }} op
 *   attr: data-atributo de las acciones (psn, xbox); confirmar: id de la cuenta que pide confirmación.
 */
export function filasCuentas({ uid, fuente, cuentas, attr, confirmar, ocupado, quitar, pregunta, quitando }) {
  const filas = datos.bibliotecaDe(uid).filter((f) => f.fuente === fuente && !f.oculto);
  const varias = cuentas.length > 1;
  return `<div class="cuentas-lista">${cuentas.map((c) => {
    const suyas = c.id ? filas.filter((f) => f.cuenta_id === c.id) : filas;
    const horas = metricas.sumarHoras(suyas, uid).total;
    const idc = c.id ?? '';
    return `
      <div class="cuenta-fila${c.reconectar ? ' caducada' : ''}">
        <div class="cuenta-cab">
          <div class="cuenta-texto">
            <strong>${esc(c.nombre ?? '')}</strong>
            <span>${suyas.length} ${suyas.length === 1 ? 'juego' : 'juegos'}${horas ? ` · ${esc(metricas.textoHoras(horas))}` : ''} · ${c.reconectar ? 'conexión caducada' : `sincronizado ${esc(hace(c.sincronizado_en))}`}</span>
          </div>
          ${confirmar === idc ? '' : `<button type="button" class="enlace-discreto cuenta-quitar" data-${attr}="pedir-quitar" data-id="${esc(idc)}">${esc(quitar)}</button>`}
        </div>
        ${c.id && (varias || c.etiqueta) ? `
          <label class="sr" for="etiqueta-${esc(c.id)}">Etiqueta de ${esc(c.nombre ?? '')}</label>
          <input id="etiqueta-${esc(c.id)}" class="cuenta-etiqueta" data-etiqueta="${esc(c.id)}" maxlength="40" autocomplete="off"
            placeholder="Etiqueta (opcional): Cuenta principal, Cuenta 2…" value="${esc(c.etiqueta ?? '')}">` : ''}
        ${confirmar === idc ? `
          <div class="psn-confirmar" role="group" aria-label="Confirmar">
            <p>${esc(pregunta)}</p>
            <div class="psn-confirmar-botones">
              <button type="button" class="boton-secundario neutro" data-${attr}="no-quitar">Cancelar</button>
              <button type="button" class="boton-secundario peligro" data-${attr}="quitar" data-id="${esc(idc)}"${ocupado ? ' disabled' : ''}>${ocupado === 'quitar' ? esc(quitando) : `Sí, ${esc(quitar.toLowerCase())}`}</button>
            </div>
          </div>` : ''}
      </div>`;
  }).join('')}</div>`;
}

/** Guarda la etiqueta al salir del campo (o con Intro). Devuelve la función para desmontar. */
export function escucharEtiquetas(cont) {
  const alCambiar = (e) => {
    const c = e.target.closest('[data-etiqueta]');
    if (!c) return;
    const antes = datos.cuenta(c.dataset.etiqueta)?.etiqueta ?? '';
    if (c.value.trim() === antes) return;
    datos.cambiarEtiqueta(c.dataset.etiqueta, c.value, aviso);
    aviso('Etiqueta guardada');
  };
  const alTecla = (e) => { if (e.key === 'Enter' && e.target.closest('[data-etiqueta]')) e.target.blur(); };
  cont.addEventListener('change', alCambiar);
  cont.addEventListener('keydown', alTecla);
  return () => { cont.removeEventListener('change', alCambiar); cont.removeEventListener('keydown', alTecla); };
}
