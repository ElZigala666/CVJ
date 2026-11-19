// Mini tutoriales de Propuestas y Cementerio: 3 tarjetas animadas que se pasan deslizando
// (o con Siguiente), con "Saltar". Salen solos la primera vez que alguien entra en esa
// sección (en ese dispositivo) y luego con "¿Cómo funciona?" de su cabecera.
// Ilustraciones hechas con los iconos propios y animaciones CSS (.tut-* en css/app.css).
import { icono } from './icons.js';
import { esc } from './ui.js';

const DICTADOR = 'El Dictador';
const ic = (n, tam, extra = '') => `<span class="tut-ic ${extra}">${icono(n, { tam, color: 'currentColor', trazo: 'var(--fondo)' })}</span>`;

// Escenas: cada una, una pequeña ilustración animada.
const ESCENAS = {
  lapida: `
    <div class="tut-escena tut-e-lapida">
      ${ic('lapida', 92, 'tut-lapida')}
      ${ic('vela', 34, 'tut-vela tut-vela-1')}${ic('vela', 28, 'tut-vela tut-vela-2')}
      <span class="tut-llama tut-llama-1"></span><span class="tut-llama tut-llama-2"></span>
    </div>`,
  reanimar: `
    <div class="tut-escena tut-e-reanimar">
      <span class="tut-boton">Reanimar</span>
      ${ic('compartir', 30, 'tut-viaja')}
      ${ic('lapida', 72, 'tut-lapida tut-brilla')}
      <span class="tut-chip tut-chip-12">12 h</span>
    </div>`,
  caduca: `
    <div class="tut-escena tut-e-caduca">
      ${ic('lapida', 72, 'tut-lapida tut-gris')}
      ${ic('candado', 34, 'tut-candado')}
      <span class="tut-chip tut-chip-72">72 h</span>
    </div>`,
  proponer: `
    <div class="tut-escena tut-e-proponer">
      ${ic('urna', 84, 'tut-urna')}
      ${ic('mas', 26, 'tut-mas')}
    </div>`,
  enlace: `
    <div class="tut-escena tut-e-enlace">
      ${ic('perfil', 46, 'tut-yo')}
      ${ic('compartir', 28, 'tut-viaja')}
      ${ic('perfil', 46, 'tut-el')}
      ${ic('hecho', 24, 'tut-ok')}
    </div>`,
  votar: `
    <div class="tut-escena tut-e-votar">
      <span class="tut-voto tut-voto-1">${icono('hecho', { tam: 16, color: 'currentColor' })}A favor</span>
      <span class="tut-voto tut-voto-2">${icono('hecho', { tam: 16, color: 'currentColor' })}A favor</span>
      <span class="tut-voto tut-voto-3 contra">${icono('cerrar', { tam: 14, color: 'currentColor' })}En contra</span>
      ${ic('sello', 64, 'tut-sello')}
    </div>`,
};

export const TUTORIALES = {
  cementerio: [
    { escena: 'lapida', titulo: 'Bienvenido al cementerio',
      texto: `Aquí acaban los que ${DICTADOR} expulsa. Sus notas siguen contando; ellos, no. Puedes dejarles una vela, que no cuesta nada.` },
    { escena: 'reanimar', titulo: 'Cómo se reanima',
      texto: `Pulsas Reanimar y le mandas el enlace al difunto. Cuando acepte, empieza una cuenta atrás de 12 h en la que ${DICTADOR} puede vetarlo.` },
    { escena: 'caduca', titulo: 'Sin aceptar, nadie vuelve',
      texto: 'Si el difunto no responde en 72 h, la llamada caduca. Y a los exorcizados no los saca ni la vela más gorda.' },
  ],
  propuestas: [
    { escena: 'proponer', titulo: 'Aquí nadie invita',
      texto: 'Si quieres que alguien entre, lo propones: quién es y por qué debería estar. Como mucho dos a la vez, así que elige bien.' },
    { escena: 'enlace', titulo: 'Que acepte el candidato',
      texto: 'Le mandas el enlace y tiene que aceptar él (tiene 7 días). Hasta entonces no se vota: nadie entra sin enterarse.' },
    { escena: 'votar', titulo: `Votáis y decide ${DICTADOR}`,
      texto: `Todos votáis a favor o en contra, con un comentario si queréis. La última palabra, como siempre, la tiene ${DICTADOR}.` },
  ],
};

const clave = (id) => `cvj.tutorial.${id}`;

/** La primera vez que se entra en la sección (en este dispositivo), el tutorial. */
export function tutorialPrimeraVez(id) {
  let visto = true;
  try { visto = !!localStorage.getItem(clave(id)); } catch { /* modo privado: no molestar */ }
  if (visto) return;
  // Espera a que no haya nada encima ("Mientras no estabas", una hoja) y solo si sigue ahí.
  const ruta = location.hash.split('/')[0];
  let intentos = 0;
  const probar = () => {
    if (location.hash.split('/')[0] !== ruta) return;
    if (document.querySelector('.resumen-capa, .capa-hoja, .tut-capa') && intentos++ < 200) { setTimeout(probar, 500); return; }
    abrirTutorial(id);
  };
  setTimeout(probar, 350);
}

/** Enlace discreto para volver a verlo (va en la cabecera de la sección). */
export const enlaceTutorial = () => '<button type="button" class="enlace-discreto tut-enlace" data-tutorial>¿Cómo funciona?</button>';

export function abrirTutorial(id) {
  const tarjetas = TUTORIALES[id];
  if (!tarjetas || document.querySelector('.tut-capa')) return;
  try { localStorage.setItem(clave(id), '1'); } catch { /* nada */ }
  const capa = document.createElement('div');
  capa.className = 'tut-capa';
  capa.innerHTML = `
    <div class="tut-fondo" data-tut-cerrar></div>
    <div class="tut-caja" role="dialog" aria-modal="true" aria-label="Cómo funciona">
      <button type="button" class="tut-saltar" data-tut-cerrar>Saltar</button>
      <div class="tut-pista" data-ref="pista">
        ${tarjetas.map((t, i) => `
          <section class="tut-tarjeta${i === 0 ? ' activa' : ''}" aria-roledescription="tarjeta" aria-label="${i + 1} de ${tarjetas.length}">
            ${ESCENAS[t.escena]}
            <h2 class="tut-titulo">${esc(t.titulo)}</h2>
            <p class="tut-texto">${esc(t.texto)}</p>
          </section>`).join('')}
      </div>
      <div class="tut-pie">
        <div class="tut-puntos" aria-hidden="true">${tarjetas.map((_, i) => `<i class="${i === 0 ? 'activo' : ''}"></i>`).join('')}</div>
        <button type="button" class="boton-principal tut-siguiente" data-ref="siguiente">Siguiente</button>
      </div>
    </div>`;
  document.body.appendChild(capa);
  const pista = capa.querySelector('[data-ref="pista"]');
  const sig = capa.querySelector('[data-ref="siguiente"]');
  const puntos = [...capa.querySelectorAll('.tut-puntos i')];
  const secciones = [...capa.querySelectorAll('.tut-tarjeta')];
  let actual = 0;

  const marcar = (i) => {
    if (i === actual) return;
    actual = i;
    puntos.forEach((p, k) => p.classList.toggle('activo', k === i));
    // Al llegar a una tarjeta, su animación empieza de nuevo.
    secciones.forEach((s, k) => s.classList.toggle('activa', k === i));
    sig.textContent = i === tarjetas.length - 1 ? 'Entendido' : 'Siguiente';
  };
  const ir = (i) => pista.scrollTo({ left: i * pista.clientWidth, behavior: 'smooth' });
  pista.addEventListener('scroll', () => marcar(Math.round(pista.scrollLeft / Math.max(1, pista.clientWidth))), { passive: true });

  const cerrar = () => {
    capa.classList.add('saliendo');
    window.removeEventListener('hashchange', cerrar);
    document.removeEventListener('keydown', teclas);
    setTimeout(() => capa.remove(), 200);
  };
  const teclas = (e) => {
    if (e.key === 'Escape') cerrar();
    else if (e.key === 'ArrowRight') ir(Math.min(tarjetas.length - 1, actual + 1));
    else if (e.key === 'ArrowLeft') ir(Math.max(0, actual - 1));
  };
  capa.addEventListener('click', (e) => {
    if (e.target.closest('[data-tut-cerrar]')) cerrar();
    else if (e.target.closest('[data-ref="siguiente"]')) { if (actual === tarjetas.length - 1) cerrar(); else ir(actual + 1); }
  });
  window.addEventListener('hashchange', cerrar);
  document.addEventListener('keydown', teclas);
  requestAnimationFrame(() => sig.focus({ preventScroll: true }));
}
