// #evento/{id}/papeleta(/{categoriaId}): la papeleta paso a paso, una categoría por pantalla.
//   Paso 1: "¿Cuál es tu favorito?" (corazón). Paso 2: "¿Quién crees que se lo lleva?"
//   (diana; con el atajo "El mismo"). Con los dos, pasa sola a la siguiente. "Atrás" y
//   "Saltar" siempre visibles; también se desliza. Se guarda al momento: se puede dejar a
//   medias y seguir donde iba. Al terminar, "Tu papeleta" en una pantalla.
// Lo de los demás (favoritos y apuestas, con avatares) solo después de elegir lo tuyo.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as ev from '../eventos.js';
import { usuarioActual } from '../sesion.js';
import { esc, avatar, portada, aviso } from '../ui.js';
import { volver } from '../navegacion.js';
import { hojaChuleta } from './evento.js';

const PASOS = ['voto', 'pronostico'];
const PREGUNTA = { voto: '¿Cuál es tu favorito?', pronostico: '¿Quién crees que se lo lleva?' };

export function render(el, { params = [] } = {}) {
  const id = params[0];
  const yo = usuarioActual();
  let i = null;            // categoría que se ve
  let paso = 'voto';       // lo que se elige ahora
  let fin = false;         // "Tu papeleta"
  let direccion = 0;       // para la transición (-1 atrás, 1 adelante)
  let avanzando = 0;

  const cats = () => ev.incluidas(id);
  const pasoDe = (c) => (!ev.miEleccion(c.id, 'voto', yo.id) ? 'voto' : !ev.miEleccion(c.id, 'pronostico', yo.id) ? 'pronostico' : 'voto');

  function colocar() {
    const lista = cats();
    if (!lista.length) return;
    if (i === null) {
      const pedida = params[2] ? lista.findIndex((c) => c.id === params[2]) : -1;
      const pr = ev.progreso(id, yo.id);
      i = pedida >= 0 ? pedida : pr.siguiente ? lista.indexOf(pr.siguiente) : 0;
      fin = pedida < 0 && pr.completa;
      paso = pasoDe(lista[i]);
    }
    i = Math.min(Math.max(0, i), lista.length - 1);
  }

  const pintar = () => {
    const e = datos.evento(id);
    if (!e) { el.innerHTML = `<section class="papeleta"><p class="evento-nota">${datos.datosFrescos() ? 'Este evento ya no existe.' : 'Cargando…'}</p></section>`; return; }
    colocar();
    document.title = `CVJ · Mi porra · ${e.titulo}`;
    el.innerHTML = fin ? resumen(e, yo) : pantalla(e, cats(), i, paso, yo, direccion);
    direccion = 0;
  };

  const ir = (n, dir) => {
    const lista = cats();
    clearTimeout(avanzando);
    if (n >= lista.length) { fin = true; direccion = 1; pintar(); el.scrollTo?.(0, 0); window.scrollTo(0, 0); return; }
    if (n < 0) return;
    fin = false;
    i = n;
    paso = pasoDe(lista[i]);
    direccion = dir;
    pintar();
    window.scrollTo(0, 0);
  };

  el.addEventListener('click', (e) => {
    const t = e.target;
    const evt = datos.evento(id);
    if (!evt) return;
    if (t.closest('[data-salir]')) { volver(`#evento/${id}`); return; }
    if (t.closest('[data-atras]')) { ir(i - 1, -1); return; }
    if (t.closest('[data-saltar]')) { ir(i + 1, 1); return; }
    if (t.closest('[data-revisar]')) { const n = Number(t.closest('[data-revisar]').dataset.revisar); fin = false; ir(n, -1); return; }
    if (t.closest('[data-chuleta]')) { hojaChuleta(evt, yo); return; }
    const p = t.closest('[data-paso]');
    if (p) { paso = p.dataset.paso; pintar(); return; }
    const mismo = t.closest('[data-mismo]');
    const tarjeta = t.closest('[data-nominado]');
    if (!mismo && !tarjeta) return;
    if (ev.cerrado(evt)) { aviso('La gala ya ha empezado: la papeleta está cerrada.'); return; }
    const c = cats()[i];
    const nom = mismo ? ev.miEleccion(c.id, 'voto', yo.id)?.nominado_id : tarjeta.dataset.nominado;
    if (!nom) return;
    const ya = ev.miEleccion(c.id, paso, yo.id)?.nominado_id;
    datos.elegirEnEvento(yo.id, c.id, paso, ya === nom && !mismo ? null : nom, aviso);
    if (ya === nom && !mismo) return;
    // Siguiente paso; con los dos, a la siguiente categoría (un momento para ver la marca).
    const otro = paso === 'voto' ? 'pronostico' : 'voto';
    if (!ev.miEleccion(c.id, otro, yo.id)) { paso = otro; pintar(); return; }
    clearTimeout(avanzando);
    avanzando = setTimeout(() => ir(i + 1, 1), 450);
  });

  // Deslizar entre categorías.
  let x0 = null; let y0 = null;
  el.addEventListener('touchstart', (e) => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 === null || fin) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0; const dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? i + 1 : i - 1, dx < 0 ? 1 : -1);
  }, { passive: true });

  const quitar = datos.suscribir(pintar);
  pintar();
  return () => { clearTimeout(avanzando); quitar(); };
}

function pantalla(e, lista, i, paso, yo, direccion) {
  const c = lista[i];
  const noms = datos.nominadosDe(c.id);
  const fav = ev.miEleccion(c.id, 'voto', yo.id)?.nominado_id;
  const apu = ev.miEleccion(c.id, 'pronostico', yo.id)?.nominado_id;
  const cerrado = ev.cerrado(e);
  // Lo de los demás, después de lo mío (o tras la gala).
  const verFav = cerrado || !!fav;
  const verApu = cerrado || !!apu;
  const otrosFav = verFav ? ev.eleccionesPorNominado(c.id, 'voto') : new Map();
  const otrosApu = verApu ? ev.eleccionesPorNominado(c.id, 'pronostico') : new Map();
  const sinMi = (l) => (l ?? []).filter((u) => u.id !== yo.id);
  const pr = ev.progreso(e.id, yo.id);
  const textos = c.tipo === 'texto';
  const tarjeta = (n) => {
    const j = !textos && n.juego_id ? datos.juegoConocido(n.juego_id) : null;
    const of = sinMi(otrosFav.get(n.id));
    const oa = sinMi(otrosApu.get(n.id));
    const marcas = `${fav === n.id ? `<span class="pap-marca voto">${icono('corazon', { tam: 16, color: 'currentColor' })}</span>` : ''}${apu === n.id ? `<span class="pap-marca pronostico">${icono('diana', { tam: 16, color: 'currentColor' })}</span>` : ''}`;
    const otros = of.length || oa.length ? `
      <span class="pap-otros">
        ${of.length ? `<span class="evento-quien voto">${icono('corazon', { tam: 11, color: 'currentColor' })}${of.map((u) => avatar(u, 18)).join('')}</span>` : ''}
        ${oa.length ? `<span class="evento-quien pronostico">${icono('diana', { tam: 11, color: 'currentColor' })}${oa.map((u) => avatar(u, 18)).join('')}</span>` : ''}
      </span>` : '';
    const elegida = (paso === 'voto' ? fav : apu) === n.id;
    return `
      <button type="button" class="pap-tarjeta${elegida ? ` elegida ${paso}` : ''}${fav === n.id ? ' es-fav' : ''}${apu === n.id ? ' es-apu' : ''}" data-nominado="${esc(n.id)}" aria-pressed="${elegida}"${cerrado ? ' disabled' : ''}>
        ${textos ? '' : (j ? portada(j, { clase: 'portada-papeleta', ancho: 170 }) : '<span class="portada portada-papeleta evento-sin-portada"></span>')}
        <span class="pap-nombre"><strong>${esc(n.nombre)}</strong>${n.detalle ? `<small>${esc(n.detalle)}</small>` : ''}</span>
        ${marcas ? `<span class="pap-marcas">${marcas}</span>` : ''}
        ${otros}
      </button>`;
  };
  const anim = direccion > 0 ? ' entra-dcha' : direccion < 0 ? ' entra-izda' : '';
  return `
    <section class="papeleta" style="--evento:${esc(ev.colorDe(e))}">
      <header class="pap-cab">
        <div class="pap-cab-fila">
          <button type="button" class="boton-cuadrado" data-salir aria-label="Salir de la papeleta">${icono('cerrar', { tam: 18, color: 'var(--texto)' })}</button>
          <span class="pap-cuenta">${i + 1} de ${lista.length}</span>
          <span class="pap-hechas">${icono('hecho', { tam: 14, color: 'currentColor' })}${pr.hechas}</span>
        </div>
        <div class="pap-progreso" role="progressbar" aria-valuemin="0" aria-valuemax="${lista.length}" aria-valuenow="${i + 1}"><i style="width:${((i + 1) / lista.length) * 100}%"></i></div>
      </header>
      <div class="pap-cuerpo${anim}">
        <h1 class="pap-categoria">${esc(c.nombre)}${(c.peso ?? 1) > 1 ? ` <span class="pap-doble">×${c.peso}</span>` : ''}</h1>
        ${cerrado ? `<p class="pap-cerrada">${icono('candado', { tam: 14, color: 'currentColor' })}La gala ya ha empezado: la papeleta está cerrada.</p>` : `
        <div class="pap-pasos" role="tablist">
          ${['voto', 'pronostico'].map((p) => `
            <button type="button" role="tab" class="pap-paso ${p}${paso === p ? ' activo' : ''}${(p === 'voto' ? fav : apu) ? ' hecho' : ''}" data-paso="${p}" aria-selected="${paso === p}">
              ${icono(ev.ICONO[p], { tam: 16, color: 'currentColor' })}<span>${PREGUNTA[p]}</span>
            </button>`).join('')}
        </div>
        ${paso === 'pronostico' && fav && fav !== apu ? '<button type="button" class="pap-mismo" data-mismo>El mismo que mi favorito</button>' : ''}`}
        <div class="pap-nominados${textos ? ' textos' : ''}">${noms.map(tarjeta).join('')}</div>
      </div>
      <footer class="pap-pie">
        <button type="button" class="boton-secundario neutro" data-atras${i === 0 ? ' disabled' : ''}>Atrás</button>
        <button type="button" class="boton-secundario" data-saltar>${i === lista.length - 1 ? 'Terminar' : (fav && apu ? 'Siguiente' : 'Saltar')}</button>
      </footer>
    </section>`;
}

function resumen(e, yo) {
  const lista = ev.incluidas(e.id);
  const pr = ev.progreso(e.id, yo.id);
  const nombre = (c, tipo) => datos.nominado(ev.miEleccion(c.id, tipo, yo.id)?.nominado_id)?.nombre;
  return `
    <section class="papeleta pap-fin" style="--evento:${esc(ev.colorDe(e))}">
      <header class="pap-cab">
        <div class="pap-cab-fila">
          <button type="button" class="boton-cuadrado" data-salir aria-label="Salir">${icono('cerrar', { tam: 18, color: 'var(--texto)' })}</button>
          <span class="pap-cuenta">${pr.completa ? 'Completa' : `${pr.hechas} de ${pr.total}`}</span>
          <span></span>
        </div>
      </header>
      <div class="pap-cuerpo entra-dcha">
        <h1 class="pap-categoria">Tu papeleta</h1>
        <p class="pap-leyenda"><span class="marca-voto">${icono('corazon', { tam: 14, color: 'currentColor' })}</span> tu favorito · <span class="marca-pronostico">${icono('diana', { tam: 14, color: 'currentColor' })}</span> tu apuesta</p>
        <ol class="pap-resumen">
          ${lista.map((c, n) => {
            const f = nombre(c, 'voto');
            const a = nombre(c, 'pronostico');
            return `
              <li>
                <button type="button" data-revisar="${n}">
                  <span class="pap-resumen-cat">${esc(c.nombre)}${(c.peso ?? 1) > 1 ? ` ×${c.peso}` : ''}</span>
                  <span class="pap-resumen-sel"><span class="marca-voto">${icono('corazon', { tam: 12, color: 'currentColor' })}</span>${f ? esc(f) : '<em>—</em>'}</span>
                  <span class="pap-resumen-sel"><span class="marca-pronostico">${icono('diana', { tam: 12, color: 'currentColor' })}</span>${a ? (a === f ? '<em>el mismo</em>' : esc(a)) : '<em>—</em>'}</span>
                </button>
              </li>`;
          }).join('')}
        </ol>
      </div>
      <footer class="pap-pie pap-pie-fin">
        <a class="boton-principal" href="#evento/${esc(e.id)}">Ver la porra del grupo</a>
        ${e.enlace_url && ev.votacionAbierta(e) ? `<button type="button" class="boton-secundario con-icono" data-chuleta>Votar en la web oficial (con tu chuleta)</button>` : ''}
      </footer>
    </section>`;
}
