// Pantalla 05 · Valorar: hoja inferior deslizable.
// Se abre con abrirValorar(igdbId) desde la ficha, el "+" de Buscar y el modo valorar.
import { icono } from './icons.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';
import { notaALetra, letraANota, redondear, formatearNota, LETRAS } from './notas.js';
import { esc, portada, aviso, ESTADOS } from './ui.js';
import { fichaJuego } from './igdb.js';
import * as metricas from './metricas.js';

const MAX_RESENA = 280;
const AVISO_RESENA = 230;
const CLAVE_PLATAFORMA = 'cvj.ultimaPlataforma';
const CLAVE_MODO = 'cvj.modoNota';
const PLATAFORMAS_GENERICAS = ['PS5', 'PS4', 'PC', 'Xbox', 'Switch'];
const NOTA_INICIAL = 7.0;
const MAX_HORAS = 99999;

// Juegos online / sin final: no se completan.
const ESTADOS_ONLINE = [
  { id: 'jugando', nombre: 'Lo juego', icono: 'jugando' },
  { id: 'abandonado', nombre: 'Lo he dejado', icono: 'abandonado' },
  { id: 'pendiente', nombre: 'Pendiente', icono: 'pendiente' },
];

/** "42", "1,5", "12.5 h" → número con un decimal; vacío o raro → null. */
export function leerHoras(texto) {
  const t = String(texto ?? '').trim().replace(/\s*h(oras?)?$/i, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined; // no válido
  return Math.min(MAX_HORAS, Math.round(n * 10) / 10);
}

let abierta = null; // { cerrar }

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k, v) => { try { localStorage.setItem(k, v); } catch { /* nada */ } };

export function hojaAbierta() {
  return !!abierta;
}

export function cerrarValorar() {
  abierta?.cerrar();
}

/**
 * Abre la hoja de Valorar para un juego.
 * @param {{ plataforma?: string }} [op] plataforma ya puesta (p. ej. la de PSN)
 */
export function abrirValorar(igdbId, op = {}) {
  const yo = usuarioActual();
  const id = Number(igdbId);
  const juego = datos.juegoConocido(id);
  if (!yo || !juego) return;
  abierta?.cerrar(true);

  const previa = datos.miValoracion(yo.id, id);
  const online = datos.esOnline(id);
  const estados = online ? ESTADOS_ONLINE : ESTADOS;
  // Horas: las sincronizadas (solo lectura, por plataforma y cuenta) + las extra a mano.
  const horas = metricas.desgloseDe(yo.id, id);
  const conHoras = Array.isArray(datos.estado.horasExtra); // migración 011
  const conSinc = horas.sinc.length > 0;

  // Plataformas del juego (si IGDB no trae ninguna, las de siempre).
  let plataformas = juego.plataformas?.length ? [...juego.plataformas] : [...PLATAFORMAS_GENERICAS];
  for (const p of [previa?.plataforma, op.plataforma]) {
    if (p && !plataformas.includes(p)) plataformas.unshift(p);
  }
  const ultima = leer(CLAVE_PLATAFORMA);
  const plataformaInicial = previa?.plataforma
    ?? op.plataforma
    ?? (ultima && plataformas.includes(ultima) ? ultima : plataformas.includes('PS5') ? 'PS5' : plataformas[0]);

  const s = {
    // Un juego online no se "completa": si lo estaba, pasa a "Lo juego".
    estado: online ? (previa?.estado && previa.estado !== 'completado' ? previa.estado : 'jugando') : (previa?.estado ?? 'completado'),
    modo: leer(CLAVE_MODO) === 'letra' ? 'letra' : 'nota',
    nota: previa?.nota != null ? redondear(previa.nota) : null,
    recomendado: previa?.recomendado ?? null,
    plataforma: plataformaInicial,
    confirmandoQuitar: false,
  };

  // -------------------------------------------------------------------------
  // HTML (estático: luego solo se cambian clases y textos)
  // -------------------------------------------------------------------------
  const capa = document.createElement('div');
  capa.className = 'capa-hoja';
  capa.innerHTML = `
    <div class="hoja-fondo" data-accion="cerrar"></div>
    <div class="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo">
      <div class="hoja-arrastre">
        <div class="hoja-asa" aria-hidden="true"></div>
        <div class="hoja-cab">
          ${portada(juego, { clase: 'portada-hoja' })}
          <div class="hoja-cab-texto">
            <span class="hoja-antetitulo">${previa ? 'Editar valoración' : 'Valorar'}</span>
            <span class="hoja-titulo" id="hoja-titulo">${esc(juego.nombre)}</span>
          </div>
          <button type="button" class="boton-cuadrado" data-accion="cerrar" aria-label="Cerrar">
            ${icono('cerrar', { tam: 18, color: 'var(--texto)' })}
          </button>
        </div>
      </div>

      <div class="hoja-cuerpo">
        <div class="estados${online ? ' estados-3' : ''}" role="radiogroup" aria-label="Estado">
          ${estados.map((e) => `
            <button type="button" class="estado-btn" role="radio" data-estado="${e.id}">
              ${icono(e.icono, { tam: 22, color: 'currentColor', trazo: 'var(--fondo-btn)', grosor: 2.4 })}
              <span>${e.nombre}</span>
            </button>`).join('')}
        </div>

        <div class="bloque-nota" data-bloque="nota">
          <div class="fila-titulo-campo">
            <span class="campo-titulo">Tu nota</span>
            <div class="conmutador" role="group" aria-label="Valorar con">
              <button type="button" data-modo="nota">Nota</button>
              <button type="button" data-modo="letra">Letra</button>
            </div>
          </div>

          <div class="panel-nota" data-panel="nota">
            <div class="nota-control">
              <button type="button" class="boton-cuadrado grande" data-paso="-1" aria-label="Bajar 0,1">−</button>
              <div class="nota-grande">
                <span class="nota-grande-num" data-ref="num">–</span>
                <span data-ref="letra"></span>
              </div>
              <button type="button" class="boton-cuadrado grande" data-paso="1" aria-label="Subir 0,1">+</button>
            </div>
            <label for="hoja-slider" class="sr">Nota de 0 a 10</label>
            <input id="hoja-slider" class="deslizador" type="range" min="0" max="10" step="0.1">
          </div>

          <div class="panel-letra" data-panel="letra" role="group" aria-label="Letra">
            ${LETRAS.map((l) => `<button type="button" class="letra-btn" data-letra="${l}" data-tier="${l}">${l}</button>`).join('')}
          </div>

          <div class="nota-pie">
            <span class="nota-pista" data-ref="pista"></span>
            <button type="button" class="enlace-discreto" data-accion="quitar-nota">Quitar nota</button>
          </div>
        </div>

        <div class="bloque-campo" data-bloque="rec">
          <span class="campo-titulo">¿Lo recomiendas?</span>
          <div class="rec-botones">
            <button type="button" class="rec-btn" data-rec="si" aria-pressed="false">
              ${icono('recomendado', { tam: 22, color: 'currentColor', trazo: 'var(--fondo-btn)', grosor: 2.4 })}<span>Sí</span>
            </button>
            <button type="button" class="rec-btn" data-rec="no" aria-pressed="false">
              ${icono('no-recomendado', { tam: 22, color: 'currentColor', trazo: 'var(--fondo-btn)', grosor: 2.4 })}<span>No</span>
            </button>
          </div>
        </div>

        <div class="bloque-campo">
          <span class="campo-titulo">Plataforma</span>
          <div class="chips-plataforma">
            ${plataformas.map((p) => `<button type="button" class="chip" data-plataforma="${esc(p)}">${esc(p)}</button>`).join('')}
          </div>
        </div>

        ${conHoras ? `
          <div class="bloque-campo" data-bloque="horas">
            ${conSinc ? `
              <span class="campo-titulo">Horas</span>
              <ul class="horas-desglose">
                ${horas.sinc.map((p) => `<li><span>${esc(p.plataforma)}${p.cuenta ? ` <small>${esc(p.cuenta)}</small>` : ''}</span><span>${esc(metricas.textoHoras(p.horas))}</span></li>`).join('')}
              </ul>
              <label for="hoja-horas" class="campo-titulo campo-sub">+ Horas extra <span class="campo-opcional">(otras plataformas o cuentas)</span></label>`
            : `<label for="hoja-horas" class="campo-titulo">Horas jugadas <span class="campo-opcional">(opcional)</span></label>`}
            <div class="campo-horas">
              <input id="hoja-horas" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done"
                placeholder="0" value="${horas.extra ? esc(String(horas.extra).replace('.', ',')) : ''}">
              <span aria-hidden="true">h</span>
            </div>
            ${conSinc ? `<div class="horas-total"><span>Total</span><strong data-ref="horas-total">${esc(metricas.textoHoras(horas.total))}</strong></div>` : ''}
            <span class="campo-ayuda error" data-ref="horas-error" hidden>Escribe solo un número, por ejemplo 12 o 12,5.</span>
          </div>` : ''}

        <div class="bloque-campo">
          <label for="hoja-resena" class="campo-titulo">Reseña corta <span class="campo-opcional">(opcional)</span></label>
          <textarea id="hoja-resena" class="resena" rows="2" maxlength="${MAX_RESENA}" placeholder="Una o dos frases para el grupo">${esc(previa?.resena ?? '')}</textarea>
          <span class="contador" data-ref="contador" aria-live="polite"></span>
        </div>

        <button type="button" class="boton-principal" data-accion="guardar">Guardar valoración</button>

        ${previa ? `
          <div class="quitar" data-ref="quitar">
            <button type="button" class="enlace-discreto" data-accion="pedir-quitar">Quitar de mi historial</button>
            <div class="quitar-confirmar">
              <p>Se borrarán tu estado, tu nota y tu reseña de este juego.</p>
              <div class="quitar-botones">
                <button type="button" class="boton-secundario neutro" data-accion="cancelar-quitar">Cancelar</button>
                <button type="button" class="boton-secundario peligro" data-accion="quitar">Quitar</button>
              </div>
            </div>
          </div>` : ''}
      </div>
    </div>`;

  document.body.appendChild(capa);
  document.body.classList.add('hoja-abierta');
  const hoja = capa.querySelector('.hoja');
  const $ = (sel) => capa.querySelector(sel);
  const slider = $('#hoja-slider');
  const resena = $('#hoja-resena');

  // -------------------------------------------------------------------------
  // Pintado
  // -------------------------------------------------------------------------
  function pintar() {
    for (const b of capa.querySelectorAll('[data-estado]')) {
      const on = b.dataset.estado === s.estado;
      b.classList.toggle('activo', on);
      b.setAttribute('aria-checked', String(on));
    }
    const conNota = s.estado !== 'pendiente';
    $('[data-bloque="nota"]').hidden = !conNota;
    $('[data-bloque="rec"]').hidden = !conNota;
    const bh = $('[data-bloque="horas"]');
    if (bh) bh.hidden = s.estado === 'pendiente';

    for (const b of capa.querySelectorAll('[data-modo]')) b.classList.toggle('activo', b.dataset.modo === s.modo);
    $('[data-panel="nota"]').hidden = s.modo !== 'nota';
    $('[data-panel="letra"]').hidden = s.modo !== 'letra';
    pintarNota();

    for (const b of capa.querySelectorAll('[data-rec]')) {
      const on = (b.dataset.rec === 'si' && s.recomendado === true) || (b.dataset.rec === 'no' && s.recomendado === false);
      b.classList.toggle('activo', on);
      b.setAttribute('aria-pressed', String(on));
    }
    for (const b of capa.querySelectorAll('[data-plataforma]')) {
      const on = b.dataset.plataforma === s.plataforma;
      b.classList.toggle('activo', on);
      b.setAttribute('aria-pressed', String(on));
    }

    const q = $('[data-ref="quitar"]');
    if (q) q.classList.toggle('confirmando', s.confirmandoQuitar);
  }

  function pintarNota() {
    const hay = s.nota !== null;
    const l = hay ? notaALetra(s.nota) : null;
    $('[data-ref="num"]').textContent = hay ? formatearNota(s.nota) : '–';
    $('[data-ref="num"]').classList.toggle('vacia', !hay);
    $('[data-ref="letra"]').innerHTML = l ? `<span class="letra letra-xl" data-tier="${l}">${l}</span>` : '';
    slider.value = String(hay ? s.nota : NOTA_INICIAL);
    slider.classList.toggle('sin-valor', !hay);
    slider.style.setProperty('--pct', `${(hay ? s.nota : 0) * 10}%`);
    for (const b of capa.querySelectorAll('[data-letra]')) b.classList.toggle('activo', b.dataset.letra === l);
    $('[data-accion="quitar-nota"]').hidden = !hay;
    const pista = !hay && (s.estado === 'completado' || s.estado === 'abandonado')
      ? 'Ponle nota para que cuente en la media del grupo.'
      : !hay ? 'La nota es opcional mientras juegas.' : '';
    $('[data-ref="pista"]').textContent = pista;
  }

  function pintarContador() {
    const n = resena.value.length;
    const c = $('[data-ref="contador"]');
    c.textContent = n >= AVISO_RESENA ? `${n}/${MAX_RESENA}` : '';
    c.classList.toggle('al-limite', n >= MAX_RESENA);
  }

  // -------------------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------------------
  capa.addEventListener('click', (e) => {
    const b = e.target.closest('button, [data-accion]');
    if (!b) return;
    const d = b.dataset;
    if (d.accion === 'cerrar') return cerrar();
    if (d.estado) s.estado = d.estado;
    else if (d.modo) { s.modo = d.modo; escribir(CLAVE_MODO, d.modo); }
    else if (d.paso) {
      const base = s.nota ?? NOTA_INICIAL - Number(d.paso) * 0.1;
      s.nota = redondear(base + Number(d.paso) * 0.1);
    } else if (d.letra) s.nota = letraANota(d.letra);
    else if (d.rec) {
      const valor = d.rec === 'si';
      s.recomendado = s.recomendado === valor ? null : valor; // tocar otra vez desmarca
    } else if (d.plataforma) s.plataforma = d.plataforma;
    else if (d.accion === 'quitar-nota') s.nota = null;
    else if (d.accion === 'pedir-quitar') s.confirmandoQuitar = true;
    else if (d.accion === 'cancelar-quitar') s.confirmandoQuitar = false;
    else if (d.accion === 'quitar') return quitar();
    else if (d.accion === 'guardar') return guardar();
    pintar();
  });

  slider.addEventListener('input', () => {
    s.nota = redondear(slider.value);
    pintarNota();
  });
  resena.addEventListener('input', pintarContador);
  // Total de horas en vivo (sincronizadas + extra).
  $('#hoja-horas')?.addEventListener('input', (e) => {
    const t = $('[data-ref="horas-total"]');
    const extra = leerHoras(e.target.value);
    $('[data-ref="horas-error"]').hidden = extra !== undefined;
    if (t && extra !== undefined) t.textContent = metricas.textoHoras(Math.round((horas.horasSinc + (extra ?? 0)) * 10) / 10);
  });

  const alTeclado = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', alTeclado);
  const alCambiarRuta = () => cerrar(true);
  window.addEventListener('hashchange', alCambiarRuta);

  // Arrastrar hacia abajo desde la cabecera para cerrar.
  const zona = $('.hoja-arrastre');
  let inicioY = null;
  let ultimoY = 0;
  let ultimoT = 0;
  let velocidad = 0;
  zona.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    inicioY = e.clientY;
    ultimoY = e.clientY;
    ultimoT = performance.now();
    velocidad = 0;
    zona.setPointerCapture(e.pointerId);
    hoja.classList.add('arrastrando');
  });
  zona.addEventListener('pointermove', (e) => {
    if (inicioY === null) return;
    const dy = Math.max(0, e.clientY - inicioY);
    const t = performance.now();
    velocidad = (e.clientY - ultimoY) / Math.max(1, t - ultimoT);
    ultimoY = e.clientY;
    ultimoT = t;
    hoja.style.transform = `translate(-50%, ${dy}px)`;
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

  // -------------------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------------------
  function guardar() {
    const conNota = s.estado !== 'pendiente';
    // Horas: solo si hay campo y no es "Pendiente" (undefined = no tocar las que hubiera).
    const campoHoras = $('#hoja-horas');
    let extra;
    if (campoHoras && conNota) {
      extra = leerHoras(campoHoras.value);
      if (extra === undefined) {
        $('[data-ref="horas-error"]').hidden = false;
        campoHoras.focus();
        return;
      }
    }
    escribir(CLAVE_PLATAFORMA, s.plataforma ?? '');
    datos.guardarValoracion({
      usuarioId: yo.id,
      igdbId: id,
      estado: s.estado,
      nota: conNota ? s.nota : null,
      recomendado: conNota ? s.recomendado : null,
      plataforma: s.plataforma,
      resena: resena.value.slice(0, MAX_RESENA),
    }, aviso).then((ok) => {
      // Si el juego solo se conocía por Buscar, completar su ficha en la tabla.
      if (ok && !datos.juego(id)?.resumen && !datos.juego(id)?.desarrolladora) {
        fichaJuego(id).then((j) => j && datos.recordarJuego(j)).catch(() => {});
      }
    });
    // Horas extra: tabla aparte; solo si han cambiado.
    if (extra !== undefined && (extra ?? 0) !== horas.extra) datos.guardarHorasExtra(yo.id, id, extra, aviso);
    cerrar();
    aviso(s.estado === 'pendiente' ? 'Añadido a pendientes' : previa ? 'Valoración actualizada' : 'Valoración guardada');
  }

  function quitar() {
    datos.quitarValoracion(yo.id, id, aviso);
    cerrar();
    aviso('Quitado de tu historial');
  }

  let cerrando = false;
  function cerrar(inmediato = false) {
    if (cerrando) return;
    cerrando = true;
    abierta = null;
    document.removeEventListener('keydown', alTeclado);
    window.removeEventListener('hashchange', alCambiarRuta);
    document.body.classList.remove('hoja-abierta');
    if (inmediato) { capa.remove(); return; }
    capa.classList.remove('visible');
    hoja.style.transform = '';
    setTimeout(() => capa.remove(), 180);
  }

  abierta = { cerrar };
  pintar();
  pintarContador();
  // Siguiente frame: activar la transición de entrada.
  requestAnimationFrame(() => requestAnimationFrame(() => capa.classList.add('visible')));
}
