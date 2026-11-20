// Ajustes → Barra de navegación (móvil): qué pestañas van (2 a 4 además de Inicio), en qué
// orden (arrastrando por el tirador, o con las flechas) y cuál se abre al entrar. Vista previa
// en vivo arriba; cada cambio se aplica y se guarda al momento (js/barra.js). "Restablecer".
import { icono } from './icons.js';
import { esc, aviso } from './ui.js';
import { abrirHoja } from './hoja.js';
import * as barra from './barra.js';

/** La barra tal como se verá (Inicio, las elegidas y el "+" en el centro). */
export function previaBarra(c) {
  const ids = ['inicio', ...c.pestanas];
  const centro = Math.ceil(ids.length / 2);
  const celdas = ids.map((id) => {
    const o = barra.opcion(id);
    return `<span class="barra-previa-tab${id === c.inicio ? ' al-abrir' : ''}">${icono(o.icono, { tam: 20, color: 'currentColor' })}<small>${esc(o.texto)}</small></span>`;
  });
  celdas.splice(centro, 0, `<span class="barra-previa-mas">${icono('mas', { tam: 20, color: 'var(--sobre-acento)' })}</span>`);
  return `<div class="barra-previa" aria-hidden="true">${celdas.join('')}</div>`;
}

export function abrirBarra() {
  let c = barra.config();
  abrirHoja({
    titulo: 'Barra de navegación',
    html: '<div class="ajb" data-ref="ajb"></div>',
    alMontar(cuerpo) {
      const cont = cuerpo.querySelector('[data-ref="ajb"]');
      const cambiar = (nueva) => { c = barra.guardar(nueva, aviso); window.dispatchEvent(new Event('cvj:barra')); pintar(); };
      const pintar = () => {
        const restantes = barra.OPCIONES.filter((o) => !c.pestanas.includes(o.id));
        const lleno = c.pestanas.length >= barra.MAX;
        const justo = c.pestanas.length <= barra.MIN;
        cont.innerHTML = `
          ${previaBarra(c)}
          <p class="ajustes-nota">En el móvil. Inicio y el botón "+" van siempre; elige de ${barra.MIN} a ${barra.MAX} pestañas más y ordénalas arrastrando. En escritorio, la barra lateral no cambia.</p>
          <span class="campo-titulo">En la barra</span>
          <ol class="ajb-lista" data-ref="lista">
            <li class="ajb-fila fija">${icono('inicio', { tam: 20, color: 'currentColor' })}<span>Inicio</span><small>Siempre</small></li>
            ${c.pestanas.map((id, i) => {
              const o = barra.opcion(id);
              return `
                <li class="ajb-fila" data-id="${id}">
                  <span class="ajb-tirador" data-arrastrar aria-hidden="true">${icono('arrastrar', { tam: 18, color: 'currentColor' })}</span>
                  ${icono(o.icono, { tam: 20, color: 'currentColor' })}<span>${esc(o.texto)}</span>
                  <button type="button" class="ajb-mini" data-subir="${i}" aria-label="Subir ${esc(o.texto)}"${i === 0 ? ' disabled' : ''}>↑</button>
                  <button type="button" class="ajb-mini" data-bajar="${i}" aria-label="Bajar ${esc(o.texto)}"${i === c.pestanas.length - 1 ? ' disabled' : ''}>↓</button>
                  <button type="button" class="ajb-quitar" data-quitar="${id}" aria-label="Quitar ${esc(o.texto)}"${justo ? ' disabled' : ''}>${icono('cerrar', { tam: 16, color: 'currentColor' })}</button>
                </li>`;
            }).join('')}
          </ol>
          ${justo ? `<p class="ajustes-nota">Como mínimo, ${barra.MIN} además de Inicio.</p>` : ''}
          ${restantes.length ? `
            <span class="campo-titulo">Añadir${lleno ? ` (como mucho ${barra.MAX})` : ''}</span>
            <div class="ajb-anadir">
              ${restantes.map((o) => `<button type="button" class="ajb-chip" data-anadir="${o.id}"${lleno ? ' disabled' : ''}>${icono(o.icono, { tam: 16, color: 'currentColor' })}<span>${esc(o.texto)}</span></button>`).join('')}
            </div>` : ''}
          <span class="campo-titulo">Pestaña al abrir la app</span>
          <div class="ajb-anadir" role="radiogroup" aria-label="Pestaña al abrir la app">
            ${['inicio', ...c.pestanas].map((id) => `<button type="button" role="radio" aria-checked="${c.inicio === id}" class="ajb-chip${c.inicio === id ? ' activo' : ''}" data-inicio="${id}">${esc(barra.opcion(id).texto)}</button>`).join('')}
          </div>
          <button type="button" class="enlace-discreto ajb-restablecer" data-restablecer>Restablecer</button>`;
      };
      pintar();

      cont.addEventListener('click', (e) => {
        const t = e.target;
        const q = t.closest('[data-quitar]');
        if (q && !q.disabled) { const p = c.pestanas.filter((x) => x !== q.dataset.quitar); cambiar({ pestanas: p, inicio: p.includes(c.inicio) ? c.inicio : 'inicio' }); return; }
        const a = t.closest('[data-anadir]');
        if (a && !a.disabled) { cambiar({ ...c, pestanas: [...c.pestanas, a.dataset.anadir] }); return; }
        const s = t.closest('[data-subir], [data-bajar]');
        if (s && !s.disabled) {
          const i = Number(s.dataset.subir ?? s.dataset.bajar);
          const j = s.dataset.subir != null ? i - 1 : i + 1;
          const p = [...c.pestanas];
          [p[i], p[j]] = [p[j], p[i]];
          cambiar({ ...c, pestanas: p });
          return;
        }
        const ini = t.closest('[data-inicio]');
        if (ini) { cambiar({ ...c, inicio: ini.dataset.inicio }); return; }
        if (t.closest('[data-restablecer]')) { cambiar({ ...barra.DEFECTO, pestanas: [...barra.DEFECTO.pestanas] }); aviso('Barra restablecida'); }
      });

      // Arrastrar por el tirador para ordenar (dedo o ratón).
      let arr = null;
      cont.addEventListener('pointerdown', (e) => {
        const h = e.target.closest('[data-arrastrar]');
        if (!h) return;
        const fila = h.closest('.ajb-fila');
        e.preventDefault();
        arr = { fila, id: fila.dataset.id, y0: e.clientY, dy: 0 };
        fila.classList.add('arrastrando');
        try { h.setPointerCapture(e.pointerId); } catch { /* nada */ }
      });
      cont.addEventListener('pointermove', (e) => {
        if (!arr) return;
        arr.dy = e.clientY - arr.y0;
        arr.fila.style.transform = `translateY(${arr.dy}px)`;
        // Cruza la mitad de la vecina: se cambian (y se sigue arrastrando desde ahí).
        const filas = [...cont.querySelectorAll('.ajb-fila[data-id]')];
        const i = filas.indexOf(arr.fila);
        const alto = arr.fila.offsetHeight;
        const j = arr.dy > alto / 2 ? i + 1 : arr.dy < -alto / 2 ? i - 1 : i;
        if (j !== i && filas[j]) {
          const p = [...c.pestanas];
          [p[i], p[j]] = [p[j], p[i]];
          c = { ...c, pestanas: p };
          arr.y0 += (j - i) * alto;
          arr.dy = e.clientY - arr.y0;
          if (j > i) filas[j].after(arr.fila); else filas[j].before(arr.fila);
          arr.fila.style.transform = `translateY(${arr.dy}px)`;
          cont.querySelector('.barra-previa').outerHTML = previaBarra(c);
        }
      });
      const soltar = () => {
        if (!arr) return;
        arr.fila.classList.remove('arrastrando');
        arr.fila.style.transform = '';
        arr = null;
        cambiar(c);
      };
      cont.addEventListener('pointerup', soltar);
      cont.addEventListener('pointercancel', soltar);
    },
  });
}
