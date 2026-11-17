// #propuestas (y #propuestas/{id}): proponer a alguien, votar (público, se puede cambiar) y,
// el Dictador, decidir: invitar (abre "Añadir persona" con el nombre puesto), aparcar o
// rechazar. Abajo, los que entraron y los que no pasaron el casting. La lógica está en
// js/propuestas.js.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as prop from '../propuestas.js';
import { DICTADOR, fecha, soyAdmin } from '../cementerio.js';
import { usuarioActual } from '../sesion.js';
import { esc, avatar, conservarScroll, aviso, tiempoRelativo } from '../ui.js';
import { volver } from '../navegacion.js';
import { abrirHoja } from '../hoja.js';
import { llamarAdmin } from '../admin-api.js';

const DIA = 24 * 60 * 60 * 1000;

export function render(el, { params = [] } = {}) {
  document.title = 'CVJ · Propuestas';
  const yo = usuarioActual();
  let destacar = params[0] ?? null;

  const pintar = () => {
    conservarScroll(el, () => { el.innerHTML = html(yo); });
    // #propuestas/{id}: a esa propuesta, una vez.
    if (destacar) {
      const t = el.querySelector(`#prop-${CSS.escape(destacar)}`);
      if (t) {
        t.scrollIntoView({ block: 'center' });
        t.classList.add('prop-destacada');
        setTimeout(() => t.classList.remove('prop-destacada'), 1800);
        destacar = null;
      }
    }
  };

  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-accion="atras"]')) { volver('#inicio'); return; }
    if (t.closest('[data-proponer]')) { hojaProponer(yo); return; }
    const v = t.closest('[data-votar]');
    if (v) { hojaVotar(datos.propuesta(v.dataset.votar), v.dataset.voto, yo); return; }
    const inv = t.closest('[data-invitar]');
    if (inv) {
      const p = datos.propuesta(inv.dataset.invitar);
      const { anadirPersona } = await import('../ajustes-grupo.js');
      anadirPersona({ nombre: p.nombre, propuesta: p });
      return;
    }
    const rech = t.closest('[data-rechazar]');
    if (rech) { hojaRechazar(datos.propuesta(rech.dataset.rechazar)); return; }
    const ap = t.closest('[data-aparcar], [data-reabrir]');
    if (ap) {
      const p = datos.propuesta(ap.dataset.aparcar ?? ap.dataset.reabrir);
      ap.disabled = true;
      const r = await llamarAdmin(ap.dataset.aparcar ? 'aparcar' : 'reabrir', { propuesta_id: p.id });
      ap.disabled = false;
      if (!r.ok) { aviso(r.error ?? 'No se ha podido'); return; }
      await datos.refrescar();
      aviso(ap.dataset.aparcar ? `${p.nombre}, a la nevera` : `${p.nombre} vuelve a votación`);
    }
  });

  const quitar = datos.suscribir(pintar);
  pintar();
  return () => quitar();
}

function html(yo) {
  const { abiertas, aparcadas, aceptadas, rechazadas } = prop.porEstado();
  const vivo = yo && datos.usuario(yo.id)?.activo !== false;
  const mias = yo ? prop.misAbiertas(yo.id) : 0;
  return `
    <section class="propuestas">
      <header class="cementerio-cab">
        <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
        <div class="cementerio-cab-texto">
          <h1 class="cementerio-titulo">Propuestas</h1>
          <p class="cementerio-sub">Aquí nadie invita. Se propone, se vota y decide ${DICTADOR}.</p>
          ${abiertas.length ? `<p class="cementerio-cuenta">${abiertas.length} ${abiertas.length === 1 ? 'propuesta abierta' : 'propuestas abiertas'}</p>` : ''}
        </div>
      </header>
      ${vivo ? `
        <div class="prop-proponer">
          ${mias >= prop.MAX_ABIERTAS
            ? `<p class="prop-limite">Ya tienes ${prop.MAX_ABIERTAS} propuestas abiertas. Espera a que ${DICTADOR} se pronuncie.</p>`
            : `<button type="button" class="boton-principal con-icono" data-proponer>${icono('mas', { tam: 18, color: 'currentColor' })}<span>Proponer a alguien</span></button>
               <p class="prop-limite">Como mucho ${prop.MAX_ABIERTAS} abiertas a la vez. Elige bien a tus amigos.</p>`}
        </div>` : ''}
      ${abiertas.length
        ? `<div class="prop-lista">${abiertas.map(({ p, r }) => tarjeta(p, r, yo, vivo)).join('')}</div>`
        : `<div class="cem-vacio">
            <span class="cem-vacio-icono">${icono('urna', { tam: 44, color: 'currentColor' })}</span>
            <p><strong>No hay nadie en la puerta.</strong> Ni falta que hace.</p>
          </div>`}
      ${aparcadas.length ? `
        <section class="prop-seccion">
          <h2 class="seccion-titulo">En la nevera</h2>
          <p class="prop-seccion-sub">Aparcadas por ${DICTADOR}. Ni sí ni no: ya veremos.</p>
          <div class="prop-lista">${aparcadas.map(({ p, r }) => tarjeta(p, r, yo, vivo)).join('')}</div>
        </section>` : ''}
      ${aceptadas.length ? `
        <section class="prop-seccion">
          <h2 class="seccion-titulo">Pasaron el casting</h2>
          <div class="prop-filas">${aceptadas.map(filaAceptada).join('')}</div>
        </section>` : ''}
      ${rechazadas.length ? `
        <section class="prop-seccion">
          <h2 class="seccion-titulo">No pasaron el casting</h2>
          <div class="prop-filas">${rechazadas.map(filaRechazada).join('')}</div>
        </section>` : ''}
    </section>`;
}

/** Una propuesta abierta o aparcada: quién, por qué, recuento, mi voto y, el Dictador, decidir. */
function tarjeta(p, r, yo, vivo) {
  const autor = datos.usuario(p.autor_id);
  const mio = yo ? prop.miVoto(p, yo.id) : null;
  const total = r.favor.length + r.contra.length;
  const pf = total ? Math.round((r.favor.length / total) * 100) : 50;
  const comentarios = [...r.favor, ...r.contra].filter((v) => v.comentario)
    .sort((a, b) => new Date(b.actualizado_en ?? b.creado_en) - new Date(a.actualizado_en ?? a.creado_en));
  const pila = (vs) => vs.map((v) => avatar(datos.usuario(v.usuario_id), 26)).join('');
  return `
    <article class="prop${p.estado === 'aparcada' ? ' aparcada' : ''}" id="prop-${esc(p.id)}">
      <header class="prop-cab">
        <span class="prop-inicial" aria-hidden="true">${esc((p.nombre.match(/\p{L}|\p{N}/u)?.[0] ?? '?').toUpperCase())}</span>
        <div class="prop-cab-texto">
          <h3 class="prop-nombre">${esc(p.nombre)}</h3>
          <p class="prop-meta">Propuesto por <strong>${esc(autor?.nombre ?? 'alguien')}</strong> · ${esc(tiempoRelativo(p.creado_en).toLowerCase())}</p>
        </div>
        <span class="prop-apoyo${r.apoyo > 0 ? ' a-favor' : r.apoyo < 0 ? ' en-contra' : ''}" aria-label="Apoyo ${r.apoyo}">${r.apoyo > 0 ? '+' : ''}${r.apoyo}</span>
      </header>
      ${p.de_que ? `<p class="prop-de-que"><span>De qué lo conoce</span>${esc(p.de_que)}</p>` : ''}
      <blockquote class="prop-motivo texto-seleccionable">${esc(p.motivo)}</blockquote>
      ${p.plataformas?.length ? `<div class="prop-plataformas">${p.plataformas.map((x) => `<span class="prop-plat">${esc(prop.nombrePlataforma(x))}</span>`).join('')}</div>` : ''}
      <div class="prop-recuento">
        <div class="prop-barra" style="--pf:${pf}%" aria-hidden="true"><i></i></div>
        <div class="prop-lados">
          <div class="prop-lado favor">
            <span class="prop-lado-n"><b>${r.favor.length}</b> a favor</span>
            <span class="prop-pila">${pila(r.favor)}</span>
          </div>
          <div class="prop-lado contra">
            <span class="prop-lado-n"><b>${r.contra.length}</b> en contra</span>
            <span class="prop-pila">${pila(r.contra)}</span>
          </div>
        </div>
      </div>
      ${comentarios.length ? `
        <ul class="prop-comentarios">
          ${comentarios.map((v) => {
            const u = datos.usuario(v.usuario_id);
            return `<li>${avatar(u, 24)}<span><strong>${esc(u.nombre)}</strong> <em class="${v.voto}">${v.voto === 'favor' ? 'a favor' : 'en contra'}</em> <span class="texto-seleccionable">${esc(v.comentario)}</span></span></li>`;
          }).join('')}
        </ul>` : ''}
      ${vivo ? `
        <div class="prop-votar" role="group" aria-label="Tu voto">
          <button type="button" class="prop-voto favor${mio?.voto === 'favor' ? ' activo' : ''}" data-votar="${esc(p.id)}" data-voto="favor" aria-pressed="${mio?.voto === 'favor'}">${icono('completado', { tam: 18, color: 'currentColor', trazo: 'var(--voto-trazo)' })}<span>${mio?.voto === 'favor' ? 'Votas a favor' : 'A favor'}</span></button>
          <button type="button" class="prop-voto contra${mio?.voto === 'contra' ? ' activo' : ''}" data-votar="${esc(p.id)}" data-voto="contra" aria-pressed="${mio?.voto === 'contra'}">${icono('cerrar', { tam: 16, color: 'currentColor' })}<span>${mio?.voto === 'contra' ? 'Votas en contra' : 'En contra'}</span></button>
        </div>` : ''}
      ${soyAdmin() ? `
        <div class="prop-decidir">
          <span class="prop-decidir-etq">Decide ${DICTADOR}</span>
          <div class="prop-decidir-botones">
            <button type="button" class="boton-principal boton-pequeno" data-invitar="${esc(p.id)}">Invitar</button>
            ${p.estado === 'aparcada'
              ? `<button type="button" class="boton-secundario neutro boton-pequeno" data-reabrir="${esc(p.id)}">Reabrir</button>`
              : `<button type="button" class="boton-secundario neutro boton-pequeno" data-aparcar="${esc(p.id)}">Aparcar</button>`}
            <button type="button" class="boton-secundario boton-pequeno peligro" data-rechazar="${esc(p.id)}">Rechazar</button>
          </div>
        </div>` : ''}
    </article>`;
}

function filaAceptada(p) {
  const u = p.usuario_id ? datos.usuario(p.usuario_id) : null;
  const autor = datos.usuario(p.autor_id);
  const muerto = u?.activo === false;
  return `
    <a class="prop-fila" href="${u ? `#perfil/${esc(u.id)}` : '#propuestas'}" id="prop-${esc(p.id)}">
      <span class="${muerto ? 'difunto-foto' : ''}">${u ? avatar(u, 36) : `<span class="prop-inicial mini">${esc(p.nombre[0] ?? '?')}</span>`}</span>
      <span class="prop-fila-texto">
        <strong>${esc(u?.nombre ?? p.nombre)}</strong>
        <small>Propuesto por ${esc(autor?.nombre ?? 'alguien')} · entró el ${esc(fecha(p.resuelta_en))}${muerto ? ' · ya descansa en el cementerio' : ''}</small>
      </span>
    </a>`;
}

function filaRechazada(p) {
  const autor = datos.usuario(p.autor_id);
  const vuelve = new Date(p.resuelta_en).getTime() + 30 * DIA;
  return `
    <div class="prop-fila rechazada" id="prop-${esc(p.id)}">
      <span class="prop-inicial mini sellada" aria-hidden="true">${icono('sello', { tam: 22, color: 'currentColor' })}</span>
      <span class="prop-fila-texto">
        <strong>${esc(p.nombre)}</strong>
        <small>${esc(fecha(p.resuelta_en))} · propuesto por ${esc(autor?.nombre ?? 'alguien')}</small>
        <small class="prop-fila-motivo">${p.motivo_rechazo ? `Motivo: ${esc(p.motivo_rechazo)}` : `${DICTADOR} no da explicaciones.`}</small>
        ${vuelve > Date.now() ? `<small>Se le podrá volver a proponer el ${esc(fecha(new Date(vuelve).toISOString()))}.</small>` : ''}
      </span>
    </div>`;
}

// ---------------------------------------------------------------------------
// Hojas
// ---------------------------------------------------------------------------
function mostrarError(cuerpo, texto) {
  const err = cuerpo.querySelector('[data-ref="error"]');
  err.textContent = texto;
  err.hidden = false;
}

function hojaProponer(yo) {
  let plataformas = [];
  abrirHoja({
    titulo: 'Proponer a alguien',
    html: `
      <div class="elegir-juegos prop-form">
        <label class="campo-titulo" for="prop-nombre">Quién</label>
        <input id="prop-nombre" class="psn-input" maxlength="40" autocomplete="off" placeholder="Su nombre o como lo llamáis">
        <label class="campo-titulo" for="prop-de-que">De qué lo conoces <small>(opcional)</small></label>
        <input id="prop-de-que" class="psn-input" maxlength="140" autocomplete="off" placeholder="Del trabajo, del instituto, de una partida…">
        <label class="campo-titulo" for="prop-motivo">Por qué debería entrar</label>
        <textarea id="prop-motivo" class="psn-input prop-textarea" maxlength="300" rows="3" placeholder="Convence al grupo. Y sobre todo, al Dictador."></textarea>
        <span class="campo-titulo">En qué juega <small>(opcional)</small></span>
        <div class="prop-chips" role="group" aria-label="Plataformas">
          ${prop.PLATAFORMAS.map(([k, n]) => `<button type="button" class="chip" data-plat="${k}" aria-pressed="false">${esc(n)}</button>`).join('')}
        </div>
        <p class="ajustes-nota">Todo el grupo lo verá y votará. Si lo rechazan, no se le podrá volver a proponer hasta dentro de 30 días.</p>
        <p class="psn-mensaje error" data-ref="error" hidden></p>
        <button type="button" class="boton-principal" data-ref="enviar">Proponer</button>
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.querySelector('.prop-chips').addEventListener('click', (e) => {
        const b = e.target.closest('[data-plat]');
        if (!b) return;
        const on = !plataformas.includes(b.dataset.plat);
        plataformas = on ? [...plataformas, b.dataset.plat] : plataformas.filter((x) => x !== b.dataset.plat);
        b.classList.toggle('activo', on);
        b.setAttribute('aria-pressed', String(on));
      });
      const enviar = cuerpo.querySelector('[data-ref="enviar"]');
      enviar.addEventListener('click', async () => {
        const nombre = cuerpo.querySelector('#prop-nombre').value.trim();
        const deQue = cuerpo.querySelector('#prop-de-que').value.trim();
        const motivo = cuerpo.querySelector('#prop-motivo').value.trim();
        if (!nombre) { mostrarError(cuerpo, 'Escribe a quién propones.'); return; }
        if (!motivo) { mostrarError(cuerpo, 'Di por qué debería entrar. «Porque sí» no cuela.'); return; }
        enviar.disabled = true;
        const r = await datos.proponer(yo.id, { nombre, deQue, motivo, plataformas });
        enviar.disabled = false;
        if (!r.ok) { mostrarError(cuerpo, r.error ?? 'No se ha podido proponer.'); return; }
        cerrar(true);
        aviso(`${nombre} está en la puerta. Que vote el grupo.`, 3200);
      });
      cuerpo.querySelector('#prop-nombre').focus();
    },
  });
}

function hojaVotar(p, voto, yo) {
  if (!p || !yo) return;
  const mio = prop.miVoto(p, yo.id);
  let elegido = voto ?? mio?.voto ?? 'favor';
  abrirHoja({
    titulo: `Tu voto: ${p.nombre}`,
    html: `
      <div class="elegir-juegos prop-form">
        <div class="prop-votar grande" role="radiogroup" aria-label="Tu voto">
          <button type="button" role="radio" class="prop-voto favor" data-elegir="favor">${icono('completado', { tam: 20, color: 'currentColor', trazo: 'var(--voto-trazo)' })}<span>A favor</span></button>
          <button type="button" role="radio" class="prop-voto contra" data-elegir="contra">${icono('cerrar', { tam: 18, color: 'currentColor' })}<span>En contra</span></button>
        </div>
        <label class="campo-titulo" for="prop-comentario">Comentario <small>(opcional, lo verá todo el mundo)</small></label>
        <input id="prop-comentario" class="psn-input" maxlength="140" autocomplete="off" value="${esc(mio?.comentario ?? '')}" placeholder="Corto y con cariño. O sin él.">
        <p class="psn-mensaje error" data-ref="error" hidden></p>
        <button type="button" class="boton-principal" data-ref="guardar">Votar</button>
        ${mio ? '<button type="button" class="boton-secundario neutro" data-ref="quitar">Quitar mi voto</button>' : ''}
      </div>`,
    alMontar(cuerpo, cerrar) {
      const marcar = () => {
        for (const b of cuerpo.querySelectorAll('[data-elegir]')) {
          const on = b.dataset.elegir === elegido;
          b.classList.toggle('activo', on);
          b.setAttribute('aria-checked', String(on));
        }
        cuerpo.querySelector('[data-ref="guardar"]').textContent = elegido === 'favor' ? 'Votar a favor' : 'Votar en contra';
      };
      marcar();
      cuerpo.querySelector('.prop-votar').addEventListener('click', (e) => {
        const b = e.target.closest('[data-elegir]');
        if (b) { elegido = b.dataset.elegir; marcar(); }
      });
      const enviar = async (v) => {
        const botones = cuerpo.querySelectorAll('button');
        botones.forEach((b) => { b.disabled = true; });
        const r = await datos.votarPropuesta(yo.id, p.id, v, v ? cuerpo.querySelector('#prop-comentario').value.trim() : null);
        botones.forEach((b) => { b.disabled = false; });
        if (!r.ok) { mostrarError(cuerpo, r.error ?? 'No se ha podido votar.'); return; }
        cerrar(true);
        aviso(!v ? 'Voto retirado. Neutralidad suiza.' : v === 'favor' ? `A favor de ${p.nombre}` : `En contra de ${p.nombre}. Sin rencores.`);
      };
      cuerpo.querySelector('[data-ref="guardar"]').addEventListener('click', () => enviar(elegido));
      cuerpo.querySelector('[data-ref="quitar"]')?.addEventListener('click', () => enviar(null));
    },
  });
}

function hojaRechazar(p) {
  if (!p) return;
  abrirHoja({
    titulo: `¿Rechazar a ${p.nombre}?`,
    html: `
      <div class="elegir-juegos prop-form">
        <p>Irá a «No pasaron el casting» y no se le podrá volver a proponer hasta dentro de 30 días.</p>
        <label class="campo-titulo" for="prop-rechazo">Motivo <small>(opcional, lo verá todo el mundo)</small></label>
        <input id="prop-rechazo" class="psn-input" maxlength="140" autocomplete="off" placeholder="Por ejemplo: juega con el volumen del mando al máximo">
        <p class="psn-mensaje error" data-ref="error" hidden></p>
        <button type="button" class="boton-principal peligro" data-ref="si">Rechazar</button>
        <button type="button" class="boton-secundario neutro" data-ref="no">Mejor no</button>
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.querySelector('[data-ref="no"]').addEventListener('click', () => cerrar());
      const si = cuerpo.querySelector('[data-ref="si"]');
      si.addEventListener('click', async () => {
        si.disabled = true;
        const motivo = cuerpo.querySelector('#prop-rechazo').value.trim();
        const r = await llamarAdmin('rechazar', { propuesta_id: p.id, ...(motivo ? { motivo } : {}) });
        si.disabled = false;
        if (!r.ok) { mostrarError(cuerpo, r.error ?? 'No se ha podido.'); return; }
        await datos.refrescar();
        cerrar(true);
        aviso(`${p.nombre} no ha pasado el casting`);
      });
      cuerpo.querySelector('#prop-rechazo').focus();
    },
  });
}
