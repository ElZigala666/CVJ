// Ajustes → Plataformas, compacto:
//  - Conectadas, arriba y desplegadas (su tarjeta de siempre).
//  - No conectadas, abajo, en una línea ("PlayStation · Conectar"); al tocarla se
//    despliega su asistente. Ahí está "No uso esta plataforma".
//  - Las que el usuario no usa, en un bloque plegado "Otras plataformas" al final
//    (usuarios.plataformas_ocultas; se puede deshacer).
// Las tarjetas no se vuelven a montar al cambiar de sitio: se mueven, y conservan su
// estado (el asistente a medias, el mensaje de "Conectado como…").
import { esc, aviso } from './ui.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';
import { iconoFuente, PLATAFORMAS_FUENTE } from './plataformas-ui.js';
import { icono } from './icons.js';
import { montarPsn } from './ajustes-psn.js';
import { montarXbox } from './ajustes-xbox.js';
import { montarSteam } from './ajustes-steam.js';

const FUENTES = ['psn', 'xbox', 'steam'];
const MONTAR = { psn: montarPsn, xbox: montarXbox, steam: montarSteam };

/**
 * @param {HTMLElement} cont
 * @param {{ abrir?: 'psn'|'xbox'|'steam' }} op  plataforma que se abre desplegada
 */
export function montarPlataformas(cont, { abrir = null } = {}) {
  const yo = usuarioActual();
  const tarjetas = new Map(); // fuente → { el, quitar }
  const desplegadas = new Set(abrir ? [abrir] : []);
  let verOtras = false;

  cont.innerHTML = `
    <div class="plat-tarjetas" data-ref="tarjetas"></div>
    <div class="plat-lineas" data-ref="lineas"></div>
    <div data-ref="otras"></div>`;
  const $ = (r) => cont.querySelector(`[data-ref="${r}"]`);

  const ocultas = () => {
    const l = datos.usuario(yo?.id)?.plataformas_ocultas;
    return new Set(Array.isArray(l) ? l : []);
  };

  const tarjeta = (f) => {
    if (!tarjetas.has(f)) {
      const el = document.createElement('div');
      el.className = 'plat-tarjeta';
      el.dataset.fuente = f;
      const dentro = document.createElement('div');
      el.append(dentro);
      tarjetas.set(f, { el, quitar: MONTAR[f](dentro) });
    }
    return tarjetas.get(f);
  };

  const guardarOcultas = (set) => {
    datos.actualizarUsuario(yo.id, { plataformas_ocultas: [...set] }, aviso, 'No se ha podido guardar. Se ha deshecho el cambio.');
  };

  const pintar = () => {
    if (!yo || !datos.usuario(yo.id)) return;
    const fuera = ocultas();
    const conectadas = FUENTES.filter((f) => datos.cuentasDe(yo.id, f).length);
    // Arriba: las conectadas y las que se han desplegado para conectar.
    const arriba = [...conectadas, ...FUENTES.filter((f) => !conectadas.includes(f) && desplegadas.has(f) && !fuera.has(f))];
    for (const f of arriba) {
      const t = tarjeta(f);
      const sinConectar = !conectadas.includes(f);
      // "No uso esta plataforma" / "Plegar" bajo las desplegadas sin conectar.
      let pie = t.el.querySelector('.plat-pie');
      if (sinConectar && !pie) {
        pie = document.createElement('div');
        pie.className = 'plat-pie';
        pie.innerHTML = `
          <button type="button" class="enlace-discreto" data-plegar="${f}">Plegar</button>
          <button type="button" class="enlace-discreto" data-no-uso="${f}">No uso esta plataforma</button>`;
        t.el.append(pie);
      } else if (!sinConectar && pie) pie.remove();
      $('tarjetas').append(t.el); // mover (no vuelve a montar)
    }
    for (const [f, t] of tarjetas) {
      if (!arriba.includes(f)) { t.quitar?.(); t.el.remove(); tarjetas.delete(f); }
    }
    // Abajo: las no conectadas, en una línea.
    const lineas = FUENTES.filter((f) => !arriba.includes(f) && !fuera.has(f));
    $('lineas').innerHTML = lineas.map((f) => `
      <button type="button" class="plat-linea" data-desplegar="${f}">
        ${iconoFuente(f, 22)}
        <span><strong>${esc(PLATAFORMAS_FUENTE[f].nombre)}</strong> · Conectar</span>
        ${icono('adelante', { tam: 16, color: 'var(--texto-2)' })}
      </button>`).join('');
    // Al final: las que no usa.
    const otras = FUENTES.filter((f) => fuera.has(f) && !conectadas.includes(f));
    $('otras').innerHTML = otras.length ? `
      <details class="plat-otras"${verOtras ? ' open' : ''}>
        <summary>Otras plataformas (${otras.length})</summary>
        ${otras.map((f) => `
          <div class="plat-linea plat-oculta">
            ${iconoFuente(f, 22)}
            <span>${esc(PLATAFORMAS_FUENTE[f].nombre)}</span>
            <button type="button" class="enlace-discreto" data-si-uso="${f}">Volver a mostrar</button>
          </div>`).join('')}
      </details>` : '';
  };

  cont.addEventListener('click', (e) => {
    const d = e.target.closest('[data-desplegar]');
    if (d) { desplegadas.add(d.dataset.desplegar); pintar(); return; }
    const p = e.target.closest('[data-plegar]');
    if (p) { desplegadas.delete(p.dataset.plegar); pintar(); return; }
    const no = e.target.closest('[data-no-uso]');
    if (no) {
      const f = no.dataset.noUso;
      desplegadas.delete(f);
      guardarOcultas(new Set([...ocultas(), f]));
      aviso(`${PLATAFORMAS_FUENTE[f].nombre} va a «Otras plataformas»`);
      return;
    }
    const si = e.target.closest('[data-si-uso]');
    if (si) {
      const set = ocultas();
      set.delete(si.dataset.siUso);
      guardarOcultas(set);
    }
  });
  cont.addEventListener('toggle', (e) => { if (e.target.matches?.('.plat-otras')) verOtras = e.target.open; }, true);

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return () => {
    desuscribir();
    for (const t of tarjetas.values()) t.quitar?.();
    tarjetas.clear();
  };
}
