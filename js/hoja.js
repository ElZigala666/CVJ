// Hoja inferior genérica (Ajustes, elegir usuario en Comparar...).
// Mismo aspecto y gestos que la hoja de Valorar: fondo atenuado, cerrar con la X,
// tocando fuera, con Escape o arrastrando hacia abajo desde la cabecera.
import { icono } from './icons.js';
import { esc } from './ui.js';

let abierta = null;

export function cerrarHoja() {
  abierta?.();
}

/**
 * @param {{ titulo: string, antetitulo?: string, html: string, alMontar?: (cuerpo: HTMLElement, cerrar: Function) => void }} op
 */
export function abrirHoja({ titulo, antetitulo = '', html, alMontar, alCerrar }) {
  abierta?.(true, true);
  const capa = document.createElement('div');
  capa.className = 'capa-hoja';
  capa.innerHTML = `
    <div class="hoja-fondo" data-cerrar></div>
    <div class="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-gen-titulo">
      <div class="hoja-arrastre">
        <div class="hoja-asa" aria-hidden="true"></div>
        <div class="hoja-cab">
          <div class="hoja-cab-texto">
            ${antetitulo ? `<span class="hoja-antetitulo">${esc(antetitulo)}</span>` : ''}
            <span class="hoja-titulo" id="hoja-gen-titulo">${esc(titulo)}</span>
          </div>
          <button type="button" class="boton-cuadrado" data-cerrar aria-label="Cerrar">
            ${icono('cerrar', { tam: 18, color: 'var(--texto)' })}
          </button>
        </div>
      </div>
      <div class="hoja-cuerpo">${html}</div>
    </div>`;
  document.body.appendChild(capa);
  document.body.classList.add('hoja-abierta');
  const hoja = capa.querySelector('.hoja');

  let cerrando = false;
  const alTeclado = (e) => { if (e.key === 'Escape') cerrar(); };
  const alCambiarRuta = () => cerrar(true, true);
  function cerrar(inmediato = false, porOtra = false) {
    if (cerrando) return;
    cerrando = true;
    // Al cerrarla el usuario (no al abrir otra hoja encima ni al cambiar de pantalla).
    if (!porOtra) setTimeout(() => alCerrar?.(), inmediato ? 0 : 190);
    abierta = null;
    document.removeEventListener('keydown', alTeclado);
    window.removeEventListener('hashchange', alCambiarRuta);
    document.body.classList.remove('hoja-abierta');
    if (inmediato) { capa.remove(); return; }
    capa.classList.remove('visible');
    hoja.style.transform = '';
    setTimeout(() => capa.remove(), 180);
  }
  document.addEventListener('keydown', alTeclado);
  window.addEventListener('hashchange', alCambiarRuta);
  capa.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) cerrar(); });

  // Arrastrar hacia abajo para cerrar.
  const zona = capa.querySelector('.hoja-arrastre');
  let inicioY = null;
  let ultimoY = 0;
  let ultimoT = 0;
  let velocidad = 0;
  zona.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    inicioY = ultimoY = e.clientY;
    ultimoT = performance.now();
    velocidad = 0;
    zona.setPointerCapture(e.pointerId);
    hoja.classList.add('arrastrando');
  });
  zona.addEventListener('pointermove', (e) => {
    if (inicioY === null) return;
    const t = performance.now();
    velocidad = (e.clientY - ultimoY) / Math.max(1, t - ultimoT);
    ultimoY = e.clientY;
    ultimoT = t;
    hoja.style.transform = `translate(-50%, ${Math.max(0, e.clientY - inicioY)}px)`;
  });
  const soltar = (e) => {
    if (inicioY === null) return;
    const dy = Math.max(0, e.clientY - inicioY);
    inicioY = null;
    hoja.classList.remove('arrastrando');
    if (dy > Math.min(140, hoja.offsetHeight * 0.25) || velocidad > 0.6) cerrar();
    else hoja.style.transform = '';
  };
  zona.addEventListener('pointerup', soltar);
  zona.addEventListener('pointercancel', soltar);

  abierta = cerrar;
  alMontar?.(capa.querySelector('.hoja-cuerpo'), cerrar);
  requestAnimationFrame(() => requestAnimationFrame(() => capa.classList.add('visible')));
  return cerrar;
}
