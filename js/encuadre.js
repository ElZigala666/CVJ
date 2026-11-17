// Encuadrar una imagen (fondo de la app o cabecera del perfil): arrastrar para elegir qué
// parte se ve y zoom, en un marco con la forma en que se va a ver. No recorta la imagen:
// guarda un punto de foco (x, y en %) y un zoom, y se pinta igual en todas partes
// (background-position + scale con ese origen), así sirve para móvil y para escritorio.
import { abrirHoja } from './hoja.js';
import { esc } from './ui.js';

/** Estilo para pintar una imagen encuadrada en un elemento que la cubre entera. */
export const estiloEncuadre = (url, { x = 50, y = 50, zoom = 1 } = {}) =>
  `background-image:url('${esc(url)}');background-size:cover;background-position:${x}% ${y}%;transform:scale(${zoom});transform-origin:${x}% ${y}%`;

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
