// #cementerio: una lápida por cada expulsado (las de los exorcizados, selladas), con sus
// fechas, cuánto duró, la causa, sus últimas palabras, su legado y sus velas. Desde aquí
// cualquiera activo puede intentar reanimar a alguien (12 horas, salvo veto del Dictador).
// Récords arriba. La lógica está en js/cementerio.js.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as cem from '../cementerio.js';
import { usuarioActual } from '../sesion.js';
import { esc, avatar, notaConLetra, conservarScroll, aviso } from '../ui.js';
import { volver } from '../navegacion.js';
import { abrirHoja } from '../hoja.js';
import { textoHoras } from '../metricas.js';
import { padrino } from '../propuestas.js';
import { vecesApelado, clicApelaciones } from '../apelaciones.js';

export function render(el) {
  document.title = 'CVJ · Cementerio';
  const yo = usuarioActual();

  const pintar = () => conservarScroll(el, () => { el.innerHTML = html(yo); });

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-accion="atras"]')) { volver('#inicio'); return; }
    if (cem.clicAviso(e)) return;
    if (clicApelaciones(e)) return;
    const v = e.target.closest('[data-vela]');
    if (v) {
      const encender = !datos.velasDe(v.dataset.vela).some((x) => x.usuario_id === yo?.id);
      datos.cambiarVela(yo.id, v.dataset.vela, encender, aviso);
      if (encender) aviso('Vela encendida. Algo es algo.');
      return;
    }
    const r = e.target.closest('[data-reanimar]');
    if (r) confirmarReanimar(datos.usuario(r.dataset.reanimar));
  });

  // Las cuentas atrás, cada 30 s (sin repintar). Si alguna termina, a por los datos nuevos.
  const reloj = setInterval(() => {
    const ahora = Date.now();
    cem.actualizarCuentas(el, ahora);
    for (const b of el.querySelectorAll('[data-progreso]')) {
      const r = datos.reanimacion(b.dataset.progreso);
      if (r) b.style.setProperty('--p', `${Math.round(cem.progreso(r, ahora) * 1000) / 10}%`);
    }
    if (datos.reanimacionesEnCurso().some((r) => new Date(r.termina_en).getTime() <= ahora)
      || (datos.estado.reanimaciones ?? []).some((r) => r.estado === 'pendiente' && new Date(r.caduca_en).getTime() <= ahora)) datos.refrescar();
  }, 30_000);

  const quitar = [datos.suscribir(pintar), datos.suscribirSocial(pintar)];
  pintar();
  return () => { clearInterval(reloj); for (const q of quitar) q(); };
}

function html(yo) {
  const lista = cem.difuntos();
  const velas = lista.reduce((t, { u }) => t + datos.velasDe(u.id).length, 0);
  return `
    <section class="cementerio">
      <header class="cementerio-cab">
        <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
        <div class="cementerio-cab-texto">
          <h1 class="cementerio-titulo">Cementerio</h1>
          <p class="cementerio-sub">Aquí descansan los que no se lo tomaron en serio.</p>
          ${lista.length ? `<p class="cementerio-cuenta">${lista.length} ${lista.length === 1 ? 'difunto' : 'difuntos'}${velas ? ` · ${velas} ${velas === 1 ? 'vela encendida' : 'velas encendidas'}` : ''}</p>` : ''}
        </div>
      </header>
      ${records()}
      ${lista.length
        ? `<div class="cem-lapidas">${lista.map(({ u, h }) => lapida(u, h, yo)).join('')}</div>`
        : `<div class="cem-vacio">
            <span class="cem-vacio-icono">${icono('lapida', { tam: 44, color: 'currentColor' })}</span>
            <p><strong>El cementerio está vacío.</strong> De momento.</p>
          </div>`}
      <p class="cem-pie">Todo el mundo merece una segunda oportunidad. Salvo los exorcizados.</p>
    </section>`;
}

function records() {
  const r = cem.records();
  if (!r) return '';
  const tarjeta = (etq, u, valor) => `
    <a class="cem-record" href="#perfil/${esc(u.id)}">
      <span class="cem-record-etq">${etq}</span>
      <strong>${esc(u.nombre)}</strong>
      <span class="cem-record-valor">${valor}</span>
    </a>`;
  return `
    <section class="cem-records" aria-label="Récords del cementerio">
      ${tarjeta('Visto y no visto', r.corta.u, esc(cem.duracionCorta(r.corta.x.desde, r.corta.x.hasta)))}
      ${r.larga ? tarjeta('El que más aguantó', r.larga.u, esc(cem.duracionCorta(r.larga.x.desde, r.larga.x.hasta))) : ''}
      ${r.masMuertes ? tarjeta('Cliente habitual', r.masMuertes.u, `${r.masMuertes.n} muertes`) : ''}
    </section>`;
}

function lapida(u, h, yo) {
  const vida = h.ultima;
  const l = cem.legado(u.id);
  const pal = cem.ultimasPalabras(u.id);
  const r = datos.reanimacionViva(u.id);
  const velas = datos.velasDe(u.id);
  const miVela = velas.some((v) => v.usuario_id === yo?.id);
  const sellada = h.exorcizado;
  const anteriores = h.vidas.filter((x) => x.hasta && x !== vida);
  const datosLegado = [
    l.juegos ? `${l.juegos} ${l.juegos === 1 ? 'juego valorado' : 'juegos valorados'}` : 'Ni un juego valorado',
    l.media != null ? `media ${notaConLetra(l.media, 'act')}` : '',
    l.horas ? esc(textoHoras(l.horas)) : '',
  ].filter(Boolean);
  const causa = vida?.causa
    ? esc(vida.causa)
    : `<span class="lapida-nada">No consta. ${cem.DICTADOR} no da explicaciones.</span>`;
  return `
    <article class="lapida${sellada ? ' sellada' : ''}${r ? ' reanimando' : ''}" id="lapida-${esc(u.id)}">
      <div class="lapida-piedra">
        ${sellada ? `<span class="lapida-sello" aria-label="Exorcizado">${icono('sello', { tam: 58, color: 'currentColor' })}</span>` : `<span class="lapida-cruz" aria-hidden="true">${icono('lapida', { tam: 22, color: 'currentColor' })}</span>`}
        <p class="lapida-aqui">Aquí yace</p>
        <a class="difunto-foto lapida-foto" href="#perfil/${esc(u.id)}" aria-label="Perfil de ${esc(u.nombre)}">${avatar(u, 84)}</a>
        <h2 class="lapida-nombre">${esc(u.nombre)}</h2>
        ${padrino(u.id) ? `<p class="lapida-padrino">Propuesto por ${esc(cem.nombreAutor(padrino(u.id).id))}</p>` : ''}
        ${vida ? `
          <p class="lapida-fechas"><span title="Entró">* ${esc(cem.fecha(vida.desde))}</span><span class="lapida-guion" aria-hidden="true"></span><span title="Expulsado">† ${esc(cem.fecha(vida.hasta))}</span></p>
          <p class="lapida-duracion">${esc(cem.duracion(vida.desde, vida.hasta))}</p>` : ''}
        <p class="lapida-epitafio">${esc(cem.epitafio(u, h, l))}</p>
        ${h.muertes > 1 ? `<p class="lapida-muertes">Muertes: ${h.muertes}</p>` : ''}
        ${apelado(u)}
        <dl class="lapida-datos">
          <div><dt>Causa de la muerte</dt><dd>${causa}</dd></div>
          <div><dt>Últimas palabras</dt><dd>${pal
            ? `<a class="lapida-palabras" href="#${pal.v.coleccion_id ? `coleccion/${esc(pal.v.coleccion_id)}` : `juego/${esc(String(pal.j.igdb_id))}`}">«${esc(recortar(pal.v.resena, 160))}»<small>sobre ${esc(pal.j.nombre)}</small></a>`
            : '<span class="lapida-nada">Se fue sin decir nada.</span>'}</dd></div>
          <div><dt>Legado</dt><dd>${datosLegado.join(' · ')}</dd></div>
        </dl>
        ${anteriores.length ? `
          <details class="lapida-vidas">
            <summary>Vidas anteriores (${anteriores.length})</summary>
            <ol>${anteriores.map((x) => `<li><span>${esc(cem.fecha(x.desde))} – ${esc(cem.fecha(x.hasta))}</span><span>${esc(cem.duracionCorta(x.desde, x.hasta))}${x.causa ? ` · ${esc(x.causa)}` : ''}</span></li>`).join('')}</ol>
          </details>` : ''}
        ${sellada ? `<p class="lapida-exorcizado">Exorcizado por ${cem.DICTADOR}${h.exorcismo ? ` el ${esc(cem.fecha(h.exorcismo.fecha))}` : ''}. No se admiten resurrecciones.</p>` : ''}
        ${r ? reanimando(r, yo) : ''}
      </div>
      <div class="lapida-base">
        <button type="button" class="lapida-vela${miVela ? ' encendida' : ''}" data-vela="${esc(u.id)}" aria-pressed="${miVela}">
          <span class="vela-llama" aria-hidden="true">${icono('vela', { tam: 20, color: 'currentColor' })}</span>
          <span>${miVela ? 'Tu vela arde' : 'Encender vela'}</span>
          ${velas.length ? `<b class="lapida-velas-n" aria-label="${velas.length} ${velas.length === 1 ? 'vela' : 'velas'}">${velas.length}</b>` : ''}
        </button>
        ${sellada || r ? '' : botonReanimar(u, yo)}
      </div>
    </article>`;
}

/** "Ha apelado N veces" (para todos); el admin, además, puede leerlas desde aquí. */
function apelado(u) {
  const n = vecesApelado(u.id);
  if (!n) return '';
  const texto = `Ha apelado ${n} ${n === 1 ? 'vez' : 'veces'}`;
  return `<p class="lapida-apelaciones">${cem.soyAdmin() ? `<a href="#cementerio" data-apelaciones="${esc(u.id)}">${texto}</a>` : texto}</p>`;
}

function botonReanimar(u, yo) {
  const espera = yo ? cem.esperaDe(yo.id, u.id) : null;
  if (espera) return `<span class="lapida-espera">Podrás volver a intentarlo el ${esc(cem.fechaHora(espera))}</span>`;
  return `<button type="button" class="lapida-reanimar" data-reanimar="${esc(u.id)}">${icono('rayo', { tam: 18, color: 'currentColor' })}<span>Reanimar</span></button>`;
}

function reanimando(r, yo) {
  const a = datos.usuario(r.autor_id);
  const mio = a?.id === yo?.id;
  const d = datos.usuario(r.difunto_id);
  const admin = cem.soyAdmin();
  if (r.estado === 'pendiente') {
    return `
      <div class="lapida-reanimando llamando" role="status">
        <svg class="ecg" viewBox="0 0 300 26" aria-hidden="true"><path pathLength="100" d="M0 14h300" /></svg>
        <p><strong>Intentando contactar con el más allá</strong></p>
        <p class="lapida-nota">${mio ? 'Lo has llamado tú' : `Lo ha llamado ${esc(a?.nombre ?? 'alguien')}`}. Si ${esc(d?.nombre ?? 'no')} no responde antes del ${esc(cem.fechaHora(r.caduca_en))}, se queda donde está.</p>
        ${mio || admin ? `
          <div class="lapida-veto">
            <button type="button" class="boton-secundario neutro boton-pequeno con-icono" data-enlace="${esc(r.id)}">${icono('compartir', { tam: 16, color: 'currentColor' })}<span>Mandar el enlace</span></button>
            ${admin ? `<button type="button" class="boton-secundario boton-pequeno peligro" data-vetar="${esc(r.id)}">Vetar</button>` : ''}
          </div>` : ''}
      </div>`;
  }
  if (r.estado === 'sin_codigo') {
    return `
      <div class="lapida-reanimando" role="status">
        <p><strong>Ha respondido, pero sin código</strong></p>
        <p class="lapida-nota">${admin ? 'Si lo apruebas, vuelve con un código nuevo que tendrás que darle.' : `Solo vuelve si ${cem.DICTADOR} lo aprueba.`}</p>
        ${admin ? `
          <div class="lapida-veto">
            <button type="button" class="boton-secundario neutro boton-pequeno" data-aprobar="${esc(r.id)}">Aprobar y darle código</button>
            <button type="button" class="boton-secundario boton-pequeno peligro" data-vetar="${esc(r.id)}">Rechazar</button>
          </div>` : ''}
      </div>`;
  }
  const p = Math.round(cem.progreso(r) * 1000) / 10;
  return `
    <div class="lapida-reanimando" role="status">
      <svg class="ecg" viewBox="0 0 300 26" aria-hidden="true"><path pathLength="100" d="M0 14h96l6-9 9 18 7-13 5 4h40l6-9 9 18 7-13 5 4h110" /></svg>
      <p><strong>Ha respondido</strong> · quedan <b data-queda="${esc(r.termina_en)}">${esc(cem.queda(r))}</b></p>
      <p class="lapida-nota">${mio ? 'Lo estás reanimando tú' : `Lo está reanimando ${esc(a?.nombre ?? 'alguien')}`}.</p>
      <div class="lapida-progreso" data-progreso="${esc(r.id)}" style="--p:${p}%"><i></i></div>
      ${admin ? `
        <div class="lapida-veto">
          <button type="button" class="boton-secundario boton-pequeno peligro" data-vetar="${esc(r.id)}">Vetar</button>
          <button type="button" class="boton-secundario neutro boton-pequeno" data-permitir="${esc(r.id)}">Permitir ya</button>
        </div>` : '<p class="lapida-nota">Si nadie lo veta, volverá solo.</p>'}
    </div>`;
}

const recortar = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };

function confirmarReanimar(u) {
  const yo = usuarioActual();
  if (!u || !yo) return;
  abrirHoja({
    titulo: `¿Reanimar a ${u.nombre}?`,
    html: `
      <div class="elegir-juegos cem-confirmar">
        <span class="cem-confirmar-icono">${icono('rayo', { tam: 30, color: 'currentColor' })}</span>
        <p>Le mandarás un enlace a ${esc(u.nombre)}: tiene <strong>72 horas</strong> para responder. Cuando acepte, empieza una cuenta atrás de <strong>12 horas</strong> y, si ${cem.DICTADOR} no lo veta, volverá con su mismo código.</p>
        <p class="ajustes-nota">Todo el grupo verá que lo estás intentando. Si sale mal, no podrás volver a probar con ${esc(u.nombre)} hasta dentro de 7 días.</p>
        <p class="psn-mensaje error" data-ref="error" hidden></p>
        <button type="button" class="boton-principal con-icono" data-ref="si">${icono('rayo', { tam: 18, color: 'currentColor' })}<span>Llamar al más allá</span></button>
        <button type="button" class="boton-secundario neutro" data-ref="no">Mejor que descanse</button>
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.querySelector('[data-ref="no"]').addEventListener('click', () => cerrar());
      const si = cuerpo.querySelector('[data-ref="si"]');
      si.addEventListener('click', async () => {
        si.disabled = true;
        const r = await datos.pedirReanimacion(yo.id, u.id);
        si.disabled = false;
        if (!r.ok) {
          const err = cuerpo.querySelector('[data-ref="error"]');
          err.textContent = r.error ?? 'No ha habido manera.';
          err.hidden = false;
          return;
        }
        cerrar(true);
        const { hojaEnlace } = await import('../llamada.js');
        hojaEnlace({ tipo: 'reanimacion', nombre: u.nombre, token: r.token });
      });
    },
  });
}
