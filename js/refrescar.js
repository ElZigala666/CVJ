// "Tirar hacia abajo para refrescar" propio (instalada no existe el del navegador).
// Solo se activa con la página arriba del todo y sin hojas abiertas.

const UMBRAL = 70;      // px de recorrido (ya amortiguado) para soltar y refrescar
const MAXIMO = 110;
const AMORTIGUACION = 0.5;
const MIN_VISIBLE_MS = 600;

/** Engancha el gesto a la pantalla. Devuelve la función para quitarlo. */
export function tirarParaRefrescar(alRefrescar) {
  const ind = document.createElement('div');
  ind.className = 'tirar-indicador';
  ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = '<span class="tirar-circulo"></span>';
  document.body.appendChild(ind);

  let inicioY = null;
  let recorrido = 0;
  let cargando = false;

  const colocar = (d, animar) => {
    ind.classList.toggle('animando', animar);
    ind.style.transform = `translate(-50%, ${d - 48}px) rotate(${d * 3}deg)`;
    ind.style.opacity = String(Math.min(1, d / UMBRAL));
    ind.classList.toggle('listo', d >= UMBRAL);
  };
  const esconder = () => {
    colocar(0, true);
    ind.classList.remove('cargando', 'listo');
  };

  const inicio = (e) => {
    if (cargando || window.scrollY > 0 || e.touches.length !== 1) return;
    if (document.body.classList.contains('hoja-abierta')) return;
    inicioY = e.touches[0].clientY;
    recorrido = 0;
  };
  const mover = (e) => {
    if (inicioY === null) return;
    const dy = e.touches[0].clientY - inicioY;
    if (dy <= 0 || window.scrollY > 0) {
      if (recorrido) colocar(0, false);
      recorrido = 0;
      return;
    }
    recorrido = Math.min(MAXIMO, dy * AMORTIGUACION);
    colocar(recorrido, false);
    if (e.cancelable) e.preventDefault(); // que no se mueva la página mientras se tira
  };
  const fin = async () => {
    if (inicioY === null) return;
    inicioY = null;
    if (recorrido < UMBRAL) { esconder(); return; }
    cargando = true;
    colocar(UMBRAL, true);
    ind.classList.add('cargando');
    navigator.vibrate?.(8);
    try {
      await Promise.all([alRefrescar(), new Promise((r) => setTimeout(r, MIN_VISIBLE_MS))]);
    } finally {
      cargando = false;
      esconder();
    }
  };

  window.addEventListener('touchstart', inicio, { passive: true });
  window.addEventListener('touchmove', mover, { passive: false });
  window.addEventListener('touchend', fin, { passive: true });
  window.addEventListener('touchcancel', fin, { passive: true });

  return () => {
    window.removeEventListener('touchstart', inicio);
    window.removeEventListener('touchmove', mover);
    window.removeEventListener('touchend', fin);
    window.removeEventListener('touchcancel', fin);
    ind.remove();
  };
}
