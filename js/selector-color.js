// Selector de color propio (el <input type="color"> de Android es muy pobre):
// hoja inferior con un cuadrado de saturación y brillo, un deslizador de tono, vista
// previa (un botón y una letra de tier con ese color), campo HEX editable y los
// últimos 5 colores personalizados. Táctil y sin librerías.
import { abrirHoja } from './hoja.js';
import { esc } from './ui.js';
import { hexARgb, rgbAHex, textoSobre, mezclar } from './acento.js';

const CLAVE_RECIENTES = 'cvj.colores.recientes';

/** Últimos colores personalizados usados (como mucho 5). */
export function recientes() {
  try {
    const l = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || '[]');
    return Array.isArray(l) ? l.filter((x) => /^#[0-9A-F]{6}$/i.test(x)).slice(0, 5) : [];
  } catch { return []; }
}
export function recordar(hex) {
  const h = String(hex).toUpperCase();
  const l = [h, ...recientes().filter((x) => x.toUpperCase() !== h)].slice(0, 5);
  try { localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(l)); } catch { /* nada */ }
}

// HSV (h 0-360, s y v 0-1) ↔ RGB
function hsvARgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}
function rgbAHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

/**
 * @param {{ inicial: string, alAplicar: (hex: string) => void, alCerrar?: () => void }} op
 */
export function abrirSelectorColor({ inicial, alAplicar, alCerrar }) {
  let [h, s, v] = rgbAHsv(hexARgb(inicial) ?? [109, 40, 217]);
  const hex = () => rgbAHex(hsvARgb(h, s, v));

  abrirHoja({
    titulo: 'Color personalizado',
    alCerrar,
    html: `
      <div class="selector-color">
        <div class="sc-cuadro" data-ref="cuadro" role="slider" aria-label="Saturación y brillo" tabindex="0">
          <span class="sc-punto" data-ref="punto"></span>
        </div>
        <div class="sc-tono" data-ref="tono" role="slider" aria-label="Tono" aria-valuemin="0" aria-valuemax="360" tabindex="0">
          <span class="sc-tirador" data-ref="tirador"></span>
        </div>
        <div class="sc-fila">
          <div class="sc-vista" aria-hidden="true">
            <span class="sc-boton" data-ref="boton">Valorar</span>
            <span class="sc-tier" data-ref="tier">A</span>
          </div>
          <label class="sc-hex">
            <span>HEX</span>
            <input data-ref="hex" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text">
          </label>
        </div>
        ${recientes().length ? `
          <span class="campo-titulo">Últimos usados</span>
          <div class="paleta sc-recientes">
            ${recientes().map((c) => `<button type="button" class="muestra" style="--muestra:${c}" data-reciente="${c}" aria-label="${esc(c)}"></button>`).join('')}
          </div>` : ''}
        <button type="button" class="boton-principal" data-ref="aplicar">Aplicar</button>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      const cuadro = $('cuadro');
      const tono = $('tono');

      const pintar = (desdeHex = false) => {
        const c = hex();
        const rgb = hexARgb(c);
        cuadro.style.setProperty('--tono', `hsl(${h} 100% 50%)`);
        $('punto').style.left = `${s * 100}%`;
        $('punto').style.top = `${(1 - v) * 100}%`;
        $('punto').style.background = c;
        $('tirador').style.left = `${(h / 360) * 100}%`;
        $('tirador').style.background = `hsl(${h} 100% 50%)`;
        tono.setAttribute('aria-valuenow', String(Math.round(h)));
        const b = $('boton');
        b.style.background = c;
        b.style.color = textoSobre(rgb);
        const a = mezclar(rgb, [255, 255, 255], 0.25);
        const t = $('tier');
        t.style.background = rgbAHex(a);
        t.style.color = textoSobre(a);
        if (!desdeHex) $('hex').value = c;
      };

      // Arrastrar (dedo o ratón) en el cuadrado y en la barra de tono.
      const arrastrar = (el, mover) => {
        const enPunto = (e) => {
          const r = el.getBoundingClientRect();
          mover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
          pintar();
        };
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          el.setPointerCapture(e.pointerId);
          enPunto(e);
          const mov = (ev) => enPunto(ev);
          const fin = () => { el.removeEventListener('pointermove', mov); el.removeEventListener('pointerup', fin); el.removeEventListener('pointercancel', fin); };
          el.addEventListener('pointermove', mov);
          el.addEventListener('pointerup', fin);
          el.addEventListener('pointercancel', fin);
        });
      };
      arrastrar(cuadro, (x, y) => { s = x; v = 1 - y; });
      arrastrar(tono, (x) => { h = x * 360; });
      // Teclado (accesibilidad): flechas.
      cuadro.addEventListener('keydown', (e) => {
        const p = 0.02;
        if (e.key === 'ArrowLeft') s = Math.max(0, s - p);
        else if (e.key === 'ArrowRight') s = Math.min(1, s + p);
        else if (e.key === 'ArrowUp') v = Math.min(1, v + p);
        else if (e.key === 'ArrowDown') v = Math.max(0, v - p);
        else return;
        e.preventDefault(); pintar();
      });
      tono.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') h = (h + 355) % 360;
        else if (e.key === 'ArrowRight') h = (h + 5) % 360;
        else return;
        e.preventDefault(); pintar();
      });

      $('hex').addEventListener('input', (e) => {
        let t = e.target.value.trim().toUpperCase();
        if (t && !t.startsWith('#')) t = `#${t}`;
        const rgb = /^#[0-9A-F]{6}$/.test(t) ? hexARgb(t) : null;
        e.target.classList.toggle('error', !!t && t.length >= 7 && !rgb);
        if (!rgb) return;
        [h, s, v] = rgbAHsv(rgb);
        pintar(true);
      });
      $('hex').addEventListener('blur', () => pintar());
      cuerpo.querySelector('.sc-recientes')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-reciente]');
        if (!b) return;
        [h, s, v] = rgbAHsv(hexARgb(b.dataset.reciente));
        pintar();
      });
      $('aplicar').addEventListener('click', () => {
        const c = hex();
        recordar(c);
        alAplicar(c);
        cerrar();
      });
      pintar();
    },
  });
}
