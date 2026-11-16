// Ajustes → Plataformas, compacto. Cada plataforma (conectada o no) es una línea plegada:
//  - conectada: icono, nombre, cuenta(s), "hace 4 h" y un botón pequeño de sincronizar
//    que funciona sin desplegar;
//  - sin conectar: "Conectar".
// Al tocar la línea se despliega su tarjeta de siempre (cuentas, desvincular, añadir otra
// cuenta, PC detectados, guías...). Se recuerda en el móvil cuáles estaban desplegadas.
// "No uso esta plataforma" la manda al bloque plegado "Otras plataformas" del final
// (usuarios.plataformas_ocultas; se puede deshacer).
// Las tarjetas se montan la primera vez que se despliegan y luego se mueven, no se vuelven
// a montar: conservan su estado (el asistente a medias, el mensaje de "Conectado como…").
import { esc, aviso, tiempoRelativo } from './ui.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';
import { iconoFuente, PLATAFORMAS_FUENTE } from './plataformas-ui.js';
import { icono } from './icons.js';
import { montarPsn } from './ajustes-psn.js';
import { montarXbox } from './ajustes-xbox.js';
import { montarSteam } from './ajustes-steam.js';

const FUENTES = ['psn', 'xbox', 'steam'];
const MONTAR = { psn: montarPsn, xbox: montarXbox, steam: montarSteam };
const MODULO = { psn: () => import('./psn.js'), xbox: () => import('./xbox.js'), steam: () => import('./steam.js') };
const MENSAJE = { psn: 'mensajePsn', xbox: 'mensajeXbox', steam: 'mensajeSteam' };
const CLAVE = 'cvj.ajustes.plataformas';

const leerDesplegadas = () => { try { return new Set(JSON.parse(localStorage.getItem(CLAVE) || '[]')); } catch { return new Set(); } };
const guardarDesplegadas = (s) => { try { localStorage.setItem(CLAVE, JSON.stringify([...s])); } catch { /* nada */ } };

/**
 * @param {HTMLElement} cont
 * @param {{ abrir?: 'psn'|'xbox'|'steam' }} op  plataforma que se abre desplegada
 */
export function montarPlataformas(cont, { abrir = null } = {}) {
  const yo = usuarioActual();
  const tarjetas = new Map(); // fuente → { el, quitar }
  const desplegadas = leerDesplegadas();
  if (abrir) desplegadas.add(abrir);
  const sincronizando = new Set();
  let verOtras = false;

  cont.innerHTML = `
    <div class="plat-filas" data-ref="filas"></div>
    <div data-ref="otras"></div>`;
  const $ = (r) => cont.querySelector(`[data-ref="${r}"]`);

  const ocultas = () => {
    const l = datos.usuario(yo?.id)?.plataformas_ocultas;
    return new Set(Array.isArray(l) ? l : []);
  };
  const tarjeta = (f) => {
    if (!tarjetas.has(f)) {
      const el = document.createElement('div');
      el.className = 'plat-cuerpo';
      const dentro = document.createElement('div');
      el.append(dentro);
      tarjetas.set(f, { el, quitar: MONTAR[f](dentro) });
    }
    return tarjetas.get(f);
  };
  const guardarOcultas = (set) => {
    datos.actualizarUsuario(yo.id, { plataformas_ocultas: [...set] }, aviso, 'No se ha podido guardar. Se ha deshecho el cambio.');
  };

  /** La línea de una plataforma: lo que se ve plegada. */
  const cabecera = (f) => {
    const cuentas = datos.cuentasDe(yo.id, f);
    const abierta = desplegadas.has(f);
    const nombre = PLATAFORMAS_FUENTE[f].nombre;
    let sub = 'Conectar';
    let accion = '';
    if (cuentas.length) {
      const ultima = cuentas.map((c) => c.sincronizado_en).filter(Boolean).sort().at(-1);
      const nombres = cuentas.map((c) => c.etiqueta || c.nombre).filter(Boolean).join(', ');
      const caducada = cuentas.some((c) => c.reconectar);
      sub = [nombres, caducada ? 'hay que reconectar' : ultima ? tiempoRelativo(ultima).toLowerCase() : 'sin sincronizar'].filter(Boolean).join(' · ');
      const ocupado = sincronizando.has(f);
      accion = caducada ? '' : `
        <button type="button" class="plat-sinc${ocupado ? ' girando' : ''}" data-sincronizar="${f}" aria-label="Sincronizar ${esc(nombre)}"${ocupado ? ' disabled' : ''}>
          ${icono('recargar', { tam: 18 })}
        </button>`;
    }
    return `
      <div class="plat-cab">
        <button type="button" class="plat-cab-boton" data-desplegar="${f}" aria-expanded="${abierta}">
          ${iconoFuente(f, 22)}
          <span class="plat-cab-texto">
            <strong>${esc(nombre)}</strong>
            <small class="${cuentas.length ? '' : 'plat-conectar'}">${esc(sub)}</small>
          </span>
        </button>
        ${accion}
        <button type="button" class="plat-flecha" data-desplegar="${f}" aria-label="${abierta ? 'Plegar' : 'Desplegar'} ${esc(nombre)}">
          ${icono('desplegable', { tam: 12, color: 'var(--texto-2)', clase: abierta ? 'girar-180' : '' })}
        </button>
      </div>`;
  };

  const pintar = () => {
    if (!yo || !datos.usuario(yo.id)) return;
    const fuera = ocultas();
    const conectadas = FUENTES.filter((f) => datos.cuentasDe(yo.id, f).length);
    // Primero las conectadas; luego las demás que no están en "Otras plataformas".
    const visibles = [...conectadas, ...FUENTES.filter((f) => !conectadas.includes(f) && !fuera.has(f))];
    const filas = $('filas');
    for (const f of visibles) {
      let fila = filas.querySelector(`.plat-fila[data-fuente="${f}"]`);
      if (!fila) {
        fila = document.createElement('div');
        fila.className = 'plat-fila';
        fila.dataset.fuente = f;
        fila.innerHTML = '<div data-cab></div>';
      }
      fila.querySelector('[data-cab]').innerHTML = cabecera(f);
      const abierta = desplegadas.has(f);
      fila.classList.toggle('abierta', abierta);
      if (abierta) {
        const t = tarjeta(f);
        let pie = t.el.querySelector('.plat-pie');
        const sinConectar = !conectadas.includes(f);
        if (sinConectar && !pie) {
          pie = document.createElement('div');
          pie.className = 'plat-pie';
          pie.innerHTML = `<button type="button" class="enlace-discreto" data-no-uso="${f}">No uso esta plataforma</button>`;
          t.el.append(pie);
        } else if (!sinConectar && pie) pie.remove();
        if (t.el.parentElement !== fila) fila.append(t.el);
      } else if (tarjetas.has(f)) tarjetas.get(f).el.remove(); // plegada: se guarda (sin desmontar)
      filas.append(fila); // en su orden
    }
    for (const fila of [...filas.querySelectorAll('.plat-fila')]) {
      if (!visibles.includes(fila.dataset.fuente)) fila.remove();
    }
    for (const [f, t] of tarjetas) {
      if (!visibles.includes(f)) { t.quitar?.(); t.el.remove(); tarjetas.delete(f); }
    }
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

  /** Sincronizar sin desplegar (el mismo botón que dentro de la tarjeta). */
  const sincronizar = async (f) => {
    if (sincronizando.has(f)) return;
    const m = await MODULO[f]();
    if (f === 'xbox') {
      const espera = m.esperaRestante?.(datos.usuario(yo.id)) ?? 0;
      if (espera > 0) { aviso(`Xbox: podrás volver a sincronizar en ${Math.ceil(espera / 60000)} min`); return; }
    }
    sincronizando.add(f);
    pintar();
    try {
      const r = await m.sincronizar(yo.id);
      aviso(r?.ok ? `${PLATAFORMAS_FUENTE[f].nombre}: sincronizada` : m[MENSAJE[f]]?.(r) ?? 'No se ha podido sincronizar');
    } catch {
      aviso('No se ha podido sincronizar. Revisa la conexión.');
    } finally {
      sincronizando.delete(f);
      pintar();
    }
  };

  cont.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sincronizar]');
    if (s) { sincronizar(s.dataset.sincronizar); return; }
    const d = e.target.closest('[data-desplegar]');
    if (d) {
      const f = d.dataset.desplegar;
      if (desplegadas.has(f)) desplegadas.delete(f); else desplegadas.add(f);
      guardarDesplegadas(desplegadas);
      pintar();
      return;
    }
    const no = e.target.closest('[data-no-uso]');
    if (no) {
      const f = no.dataset.noUso;
      desplegadas.delete(f);
      guardarDesplegadas(desplegadas);
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
