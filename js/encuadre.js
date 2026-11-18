// Encuadrar una imagen (fondo de la app o cabecera del perfil): arrastrar para elegir qué
// parte se ve y zoom, en un marco con la forma en que se va a ver. No recorta la imagen:
// guarda un punto de foco (x, y en %) y un zoom, y se pinta igual en todas partes
// (background-position + scale con ese origen), así sirve para móvil y para escritorio.
import { abrirHoja } from './hoja.js';
import { esc } from './ui.js';

/** Estilo para pintar una imagen encuadrada en un elemento que la cubre entera. */
export const estiloEncuadre = (url, { x = 50, y = 50, zoom = 1 } = {}) =>
  `background-image:url('${esc(url)}');background-size:cover;background-position:${x}% ${y}%;transform:scale(${zoom});transform-origin:${x}% ${y}%`;

// ---------------------------------------------------------------------------
// Encuadre doble (cabecera del perfil): la imagen entera con DOS marcos encima, el de MÓVIL
// (alto) y el de ESCRITORIO (franja ancha y baja). Se elige cuál se ajusta (Móvil /
// Escritorio), se arrastra el marco y se cambia su zoom, con la vista previa de los dos.
// Cada marco es justo lo que se verá: background-size: cover + scale(zoom) con origen x% y%.
// ---------------------------------------------------------------------------
/** La zona visible (en px de la imagen W×H) de un marco de proporción a con {x, y, zoom}. */
function zona(W, H, a, { x, y, zoom }) {
  let w; let h;
  if (W / H > a) { h = H; w = H * a; } else { w = W; h = W / a; }
  w /= zoom; h /= zoom;
  return { l: (W - w) * x / 100, t: (H - h) * y / 100, w, h };
}

/**
 * @param {{ url: string, aspectos: {movil: number, escritorio: number}, movil: {x,y,zoom}, escritorio: {x,y,zoom},
 *   titulo?: string, alGuardar: (v: {movil, escritorio}) => void, alCerrar?: () => void }} op
 */
export function abrirEncuadreDoble({ url, aspectos, movil, escritorio, titulo = 'Encuadrar', alGuardar, alCerrar }) {
  const v = {
    movil: { x: movil?.x ?? 50, y: movil?.y ?? 50, zoom: movil?.zoom ?? 1 },
    escritorio: { x: escritorio?.x ?? 50, y: escritorio?.y ?? 50, zoom: escritorio?.zoom ?? 1 },
  };
  let activo = 'movil';
  abrirHoja({
    titulo,
    alCerrar,
    html: `
      <div class="encd">
        <div class="segmentado" role="tablist" aria-label="Qué encuadre ajustas" data-ref="selector">
          <button type="button" role="tab" data-formato="movil" class="activo" aria-selected="true">Móvil</button>
          <button type="button" role="tab" data-formato="escritorio" aria-selected="false">Escritorio</button>
        </div>
        <div class="encd-lienzo-caja">
          <div class="encd-lienzo" data-ref="lienzo">
            <img src="${esc(url)}" alt="" data-ref="img" draggable="false" crossorigin="anonymous">
            <div class="encd-marco movil" data-ref="m-movil"><span>Móvil</span></div>
            <div class="encd-marco escritorio" data-ref="m-escritorio"><span>Escritorio</span></div>
          </div>
        </div>
        <p class="ajustes-nota">Arrastra el marco para elegir qué se ve en cada formato.</p>
        <label class="encuadre-zoom"><span>Zoom</span><input type="range" class="deslizador" min="1" max="3" step="0.01" value="${v.movil.zoom}" data-ref="zoom" aria-label="Zoom"></label>
        <div class="encd-previas">
          <figure class="encd-previa movil"><div class="encd-previa-marco" style="aspect-ratio:${aspectos.movil}"><div data-ref="p-movil"></div></div><figcaption>Móvil</figcaption></figure>
          <figure class="encd-previa escritorio"><div class="encd-previa-marco" style="aspect-ratio:${aspectos.escritorio}"><div data-ref="p-escritorio"></div></div><figcaption>Escritorio</figcaption></figure>
        </div>
        <button type="button" class="boton-principal" data-ref="guardar">Guardar encuadre</button>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      const img = $('img');
      const lienzo = $('lienzo');
      let W = 0; let H = 0;
      const pintar = () => {
        for (const f of ['movil', 'escritorio']) {
          $(`p-${f}`).setAttribute('style', `${estiloEncuadre(url, v[f])};position:absolute;inset:0`);
          const m = $(`m-${f}`);
          m.classList.toggle('activo', f === activo);
          if (!W) continue;
          const z = zona(W, H, aspectos[f], v[f]);
          Object.assign(m.style, { left: `${(z.l / W) * 100}%`, top: `${(z.t / H) * 100}%`, width: `${(z.w / W) * 100}%`, height: `${(z.h / H) * 100}%` });
        }
      };
      const medir = () => { W = img.naturalWidth; H = img.naturalHeight; pintar(); };
      if (img.complete && img.naturalWidth) medir(); else img.addEventListener('load', medir, { once: true });
      pintar();

      $('selector').addEventListener('click', (e) => {
        const b = e.target.closest('[data-formato]');
        if (!b) return;
        activo = b.dataset.formato;
        for (const x of $('selector').querySelectorAll('[data-formato]')) {
          x.classList.toggle('activo', x === b);
          x.setAttribute('aria-selected', String(x === b));
        }
        $('zoom').value = v[activo].zoom;
        pintar();
      });
      // Arrastrar el marco activo (se mueve con el dedo, sobre la imagen entera).
      let ini = null;
      lienzo.addEventListener('pointerdown', (e) => {
        if (!W) return;
        ini = { px: e.clientX, py: e.clientY, z: zona(W, H, aspectos[activo], v[activo]) };
        try { lienzo.setPointerCapture(e.pointerId); } catch { /* sin captura, se sigue igual */ }
      });
      lienzo.addEventListener('pointermove', (e) => {
        if (!ini) return;
        const r = lienzo.getBoundingClientRect();
        const { z } = ini;
        const l = z.l + ((e.clientX - ini.px) / r.width) * W;
        const t = z.t + ((e.clientY - ini.py) / r.height) * H;
        v[activo].x = W - z.w > 1 ? Math.min(100, Math.max(0, (l / (W - z.w)) * 100)) : 50;
        v[activo].y = H - z.h > 1 ? Math.min(100, Math.max(0, (t / (H - z.h)) * 100)) : 50;
        pintar();
      });
      const soltar = () => { ini = null; };
      lienzo.addEventListener('pointerup', soltar);
      lienzo.addEventListener('pointercancel', soltar);
      $('zoom').addEventListener('input', (e) => { v[activo].zoom = Number(e.target.value) || 1; pintar(); });
      const redondear = (x) => ({ x: Math.round(x.x * 10) / 10, y: Math.round(x.y * 10) / 10, zoom: Math.round(x.zoom * 100) / 100 });
      $('guardar').addEventListener('click', () => {
        alGuardar({ movil: redondear(v.movil), escritorio: redondear(v.escritorio) });
        cerrar();
      });
    },
  });
}

/**
 * @param {{ url: string, aspecto: number, valor?: {x,y,zoom}, titulo?: string, alGuardar: (v) => void, alCerrar?: () => void }} op
 *   aspecto: ancho / alto del marco (la forma en que se verá).
 */
export function abrirEncuadre({ url, aspecto = 390 / 844, valor = {}, titulo = 'Encuadrar', alGuardar, alCerrar }) {
  const v = { x: valor.x ?? 50, y: valor.y ?? 50, zoom: valor.zoom ?? 1 };
  abrirHoja({
    titulo,
    alCerrar,
    html: `
      <div class="encuadre">
        <div class="encuadre-marco" data-ref="marco" style="aspect-ratio:${aspecto};width:min(100%, calc(56vh * ${aspecto}))">
          <div class="encuadre-img" data-ref="img"></div>
        </div>
        <p class="ajustes-nota">Arrastra para elegir qué parte se ve.</p>
        <label class="encuadre-zoom"><span>Zoom</span><input type="range" class="deslizador" min="1" max="3" step="0.01" value="${v.zoom}" data-ref="zoom" aria-label="Zoom"></label>
        <button type="button" class="boton-principal" data-ref="guardar">Guardar encuadre</button>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      const marco = $('marco');
      const img = $('img');
      const pintar = () => { img.setAttribute('style', estiloEncuadre(url, v)); };
      pintar();
      let ini = null;
      marco.addEventListener('pointerdown', (e) => {
        ini = { px: e.clientX, py: e.clientY, x: v.x, y: v.y };
        marco.setPointerCapture(e.pointerId);
      });
      marco.addEventListener('pointermove', (e) => {
        if (!ini) return;
        const r = marco.getBoundingClientRect();
        // Arrastrar a la derecha enseña lo de la izquierda: el foco va al revés.
        v.x = Math.min(100, Math.max(0, ini.x - ((e.clientX - ini.px) / r.width) * 100 / v.zoom));
        v.y = Math.min(100, Math.max(0, ini.y - ((e.clientY - ini.py) / r.height) * 100 / v.zoom));
        pintar();
      });
      const soltar = () => { ini = null; };
      marco.addEventListener('pointerup', soltar);
      marco.addEventListener('pointercancel', soltar);
      $('zoom').addEventListener('input', (e) => { v.zoom = Number(e.target.value) || 1; pintar(); });
      $('guardar').addEventListener('click', () => {
        alGuardar({ x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10, zoom: Math.round(v.zoom * 100) / 100 });
        cerrar();
      });
    },
  });
}
