// Pantalla del expulsado (sin sesión): si abre la app con su sesión o mete su código en
// cualquier dispositivo, en vez de un error ve su lápida, con el estilo del cementerio
// ("Fuiste expulsado el…", la causa y cuánto duró) y puede apelar. Todo sale del servidor
// (estado_difunto y apelar, migración 038): no tiene datos del grupo cargados. Si el admin
// acepta la apelación, al volver a abrirla entra solo (con el código que metió aquí).
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { esc, avatar, aviso } from '../ui.js';
import { abrirHoja } from '../hoja.js';
import { fecha, fechaHora, duracion, DICTADOR } from '../cementerio.js';
import { entrarConHash, guardarDifunto, olvidarDifunto, difuntoGuardado } from '../sesion.js';
import { hashCodigo, normalizarCodigo, LARGO_CODIGO } from '../codigo.js';

const MAX = 500;
// En segunda persona: "Aguantaste 12 días", "Sobreviviste 3 h".
const tuDuracion = (desde, hasta) => duracion(desde, hasta).replace(/^Sobrevivió/, 'Sobreviviste').replace(/^Aguantó/, 'Aguantaste');

export function render(el, { difunto, alEntrar, alOtro }) {
  let d = difunto;
  let est = null;
  let cargando = false;

  const otro = () => { olvidarDifunto(); alOtro?.(); };

  async function cargar() {
    if (cargando) return;
    cargando = true;
    const r = await datos.estadoDifunto({ hash: d.hash, id: d.id });
    cargando = false;
    if (!el.isConnected) return;
    if (!r.ok && r.codigo === 'codigo') {
      // Código cambiado o persona borrada: con lo que hay no se le encuentra.
      if (d.hash) { d = { id: d.id, hash: null }; guardarDifunto(d); cargar(); return; }
      otro();
      return;
    }
    if (!r.ok) {
      if (!est) pintarError(r.error);
      return;
    }
    if (r.vivo) { await haVuelto(); return; }
    est = r;
    pintar();
  }

  async function haVuelto() {
    if (d.hash) {
      try {
        const u = await entrarConHash(d.hash);
        aviso('Has vuelto de entre los muertos. Pórtate bien.', 3600);
        alEntrar(u);
        return;
      } catch { /* sin red: que meta su código */ }
    }
    olvidarDifunto();
    el.innerHTML = `
      <section class="difunto">
        <div class="difunto-vuelta">
          <span class="difunto-vuelta-icono">${icono('rayo', { tam: 34, color: 'currentColor' })}</span>
          <h1 class="difunto-titulo">Has vuelto de entre los muertos</h1>
          <p class="difunto-sub">Entra con tu código de siempre.</p>
          <button type="button" class="boton-principal" data-accion="otro">Entrar</button>
        </div>
      </section>`;
  }

  function pintarError(msg) {
    el.innerHTML = `
      <section class="difunto">
        <div class="difunto-vuelta">
          <p class="difunto-sub">${esc(msg ?? 'No hay conexión con el más allá.')}</p>
          <div class="fila-botones">
            <button type="button" class="boton-secundario neutro" data-accion="otro">Otro código</button>
            <button type="button" class="boton-principal" data-accion="reintentar">Reintentar</button>
          </div>
        </div>
      </section>`;
  }

  function pintar() {
    const e = est;
    const u = e.usuario;
    const sellada = e.exorcizado;
    const muerte = e.muerte;
    const n = e.apelaciones;
    let estado = '';
    if (e.pendiente) {
      estado = `
        <div class="difunto-estado espera" role="status">
          ${icono('urna', { tam: 20, color: 'currentColor' })}
          <p><strong>Tu apelación está en manos de ${DICTADOR}</strong><span>Enviada el ${esc(fechaHora(e.pendiente))}. Paciencia: los muertos no tienen prisa.</span></p>
        </div>`;
    } else if (e.rechazo) {
      estado = `
        <div class="difunto-estado rechazo" role="status">
          ${icono('sello', { tam: 20, color: 'currentColor' })}
          <p><strong>${DICTADOR} rechazó tu apelación</strong><span>El ${esc(fecha(e.rechazo.fecha))}.</span>
          ${e.rechazo.respuesta ? `<q class="difunto-respuesta">${esc(e.rechazo.respuesta)}</q>` : e.con_codigo ? '<span>Sin explicaciones.</span>' : ''}</p>
        </div>`;
    }
    let accion;
    if (e.pendiente) accion = '';
    else if (e.puede_desde) accion = `<p class="difunto-espera">Podrás volver a apelar el ${esc(fechaHora(e.puede_desde))}.</p>`;
    else accion = `<button type="button" class="boton-principal con-icono" data-accion="apelar">${icono('urna', { tam: 18, color: 'currentColor' })}<span>Apelar</span></button>`;

    el.innerHTML = `
      <section class="difunto">
        <p class="difunto-desde">Desde el más allá</p>
        <article class="lapida difunto-lapida${sellada ? ' sellada' : ''}">
          <div class="lapida-piedra">
            ${sellada ? `<span class="lapida-sello" aria-label="Exorcizado">${icono('sello', { tam: 58, color: 'currentColor' })}</span>` : `<span class="lapida-cruz" aria-hidden="true">${icono('lapida', { tam: 22, color: 'currentColor' })}</span>`}
            <p class="lapida-aqui">Aquí yaces</p>
            <span class="difunto-foto lapida-foto">${avatar(u, 84)}</span>
            <h1 class="lapida-nombre">${esc(u.nombre)}</h1>
            ${muerte ? `<p class="difunto-fecha">Fuiste ${muerte.tipo === 'exorcismo' ? 'exorcizado' : 'expulsado'} el ${esc(fecha(muerte.fecha))}</p>` : '<p class="difunto-fecha">Fuiste expulsado</p>'}
            ${muerte && e.nacio ? `<p class="lapida-duracion">${esc(tuDuracion(e.nacio, muerte.fecha))}</p>` : ''}
            <dl class="lapida-datos">
              <div><dt>Causa de la muerte</dt><dd>${muerte?.causa ? esc(muerte.causa) : `<span class="lapida-nada">No consta. ${DICTADOR} no da explicaciones.</span>`}</dd></div>
            </dl>
            ${sellada ? `<p class="lapida-exorcizado">Exorcizado: solo ${DICTADOR} puede levantar el sello. Puedes apelar una vez cada 30 días.</p>` : ''}
            ${n ? `<p class="lapida-muertes">Has apelado ${n} ${n === 1 ? 'vez' : 'veces'}</p>` : ''}
          </div>
        </article>
        ${estado}
        <div class="difunto-acciones">
          ${accion}
          <button type="button" class="enlace-discreto" data-accion="otro">No soy yo: entrar con otro código</button>
        </div>
      </section>`;
  }

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'otro') otro();
    else if (b.dataset.accion === 'reintentar') cargar();
    else if (b.dataset.accion === 'apelar') hojaApelar();
  });

  function hojaApelar() {
    const pideCodigo = !d.hash;
    abrirHoja({
      titulo: 'Apelar',
      html: `
        <div class="elegir-juegos prop-form">
          <p>Explica por qué deberías volver. Solo lo leerá ${DICTADOR}.</p>
          ${pideCodigo ? `
            <label class="campo-titulo" for="apel-codigo">Tu código</label>
            <input id="apel-codigo" class="psn-input" maxlength="${LARGO_CODIGO + 4}" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="······">` : ''}
          <label class="campo-titulo" for="apel-texto">Tu alegato</label>
          <textarea id="apel-texto" class="psn-input prop-textarea apel-textarea" maxlength="${MAX}" rows="6" placeholder="Prometo valorar algo más que el FIFA."></textarea>
          <p class="apel-contador" data-ref="contador">0 / ${MAX}</p>
          <p class="ajustes-nota">${est?.exorcizado
            ? 'Estás exorcizado: si la rechaza, no podrás volver a apelar hasta dentro de 30 días.'
            : 'Una apelación cada vez. Si la rechaza, podrás volver a intentarlo a los 7 días.'}</p>
          <p class="psn-mensaje error" data-ref="error" hidden></p>
          <button type="button" class="boton-principal" data-ref="enviar">Enviar apelación</button>
        </div>`,
      alMontar(cuerpo, cerrar) {
        const texto = cuerpo.querySelector('#apel-texto');
        const contador = cuerpo.querySelector('[data-ref="contador"]');
        const error = cuerpo.querySelector('[data-ref="error"]');
        const fallo = (m) => { error.textContent = m; error.hidden = false; };
        texto.addEventListener('input', () => { contador.textContent = `${texto.value.length} / ${MAX}`; error.hidden = true; });
        const enviar = cuerpo.querySelector('[data-ref="enviar"]');
        enviar.addEventListener('click', async () => {
          const t = texto.value.trim();
          let hash = d.hash;
          if (pideCodigo) {
            const cod = normalizarCodigo(cuerpo.querySelector('#apel-codigo').value);
            if (cod.length !== LARGO_CODIGO) { fallo('Escribe tu código (6 caracteres).'); return; }
            hash = await hashCodigo(cod);
          }
          if (!t) { fallo('Explica por qué quieres volver. El silencio no convence a nadie.'); return; }
          enviar.disabled = true;
          const r = await datos.apelar(hash, t);
          enviar.disabled = false;
          if (!r.ok) {
            fallo(r.codigo === 'codigo' ? 'Ese código no es el tuyo. Revísalo.' : r.error ?? 'No se ha podido enviar.');
            return;
          }
          // Con el código ya comprobado, se recuerda aquí (para ver la respuesta y volver solo).
          d = { id: r.apelacion?.usuario_id ?? d.id, hash };
          guardarDifunto(d);
          cerrar(true);
          aviso(`Apelación enviada. ${DICTADOR} la leerá. O no.`, 3200);
          cargar();
        });
        (pideCodigo ? cuerpo.querySelector('#apel-codigo') : texto).focus();
      },
    });
  }

  // Si el admin decide mientras está aquí: al volver a la app y cada minuto.
  const alVer = () => { if (document.visibilityState === 'visible' && difuntoGuardado()) cargar(); };
  document.addEventListener('visibilitychange', alVer);
  const reloj = setInterval(alVer, 60_000);

  el.innerHTML = '<section class="difunto"><p class="difunto-desde">Desde el más allá…</p></section>';
  cargar();
  return () => { document.removeEventListener('visibilitychange', alVer); clearInterval(reloj); };
}
