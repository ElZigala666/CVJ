// "Editar perfil": una hoja con todo lo personalizable del perfil (js/perfil-personal.js).
// Los cambios se ven en la hoja al momento y se guardan en la cuenta al pulsar "Guardar".
// Elegir juegos abre el buscador en otra hoja; al cerrarla se vuelve aquí sin perder nada.
import { abrirHoja } from './hoja.js';
import { icono } from './icons.js';
import { esc, aviso, portada } from './ui.js';
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { elegirJuegos } from './colecciones-ui.js';
import { perfilDe, MAX_BIO, MAX_ESTADO, MAX_VITRINA, PLATAFORMAS_PERFIL } from './perfil-personal.js';


/**
 * @param {string} uid  el usuario con sesión
 * @param {object} [s]  estado a medias (al volver del buscador de juegos)
 * @param {'bio'|'estado'|'plataforma'} [foco]  el campo al que ir (desde el perfil casi vacío)
 */
export function abrirEditarPerfil(uid, s = null, foco = null) {
  const u = datos.usuario(uid);
  if (!u) return;
  s ??= { ...perfilDe(u) };
  // Mis juegos, los mejor valorados primero: lo normal es elegir entre ellos.
  const mios = metricas.valoracionesDe(uid).slice().sort((a, b) => (Number(b.nota) || 0) - (Number(a.nota) || 0)).map((v) => Number(v.juego_id));
  const jugando = metricas.valoracionesDe(uid).filter((v) => v.estado === 'jugando' || (v.estado === 'completado' && v.rejugando)).map((v) => datos.juegoConocido(v.juego_id)?.nombre).filter(Boolean).slice(0, 3);
  let guardando = false;
  let volver = false; // se ha abierto el buscador: al cerrarlo se vuelve aquí

  const juegoMini = (id, quitar) => {
    const j = datos.juegoConocido(id);
    return j ? `
      <span class="editar-juego">
        ${portada(j, { clase: 'portada-lista' })}
        <span class="editar-juego-nombre">${esc(j.nombre)}</span>
        <button type="button" class="boton-cuadrado" ${quitar} aria-label="Quitar ${esc(j.nombre)}">${icono('cerrar', { tam: 14, color: 'var(--texto)' })}</button>
      </span>` : '';
  };

  const html = () => `
    <div class="editar-perfil">
      <div class="bloque-campo">
        <label class="campo-titulo" for="editar-bio">Sobre mí <span class="campo-opcional">(opcional)</span></label>
        <textarea id="editar-bio" class="resena" rows="2" maxlength="${MAX_BIO}" placeholder="Una o dos frases: qué juegas, qué te gusta…">${esc(s.bio)}</textarea>
        <span class="contador" data-ref="cuenta-bio">${s.bio.length} / ${MAX_BIO}</span>
      </div>

      <div class="bloque-campo">
        <label class="campo-titulo" for="editar-estado">Ahora mismo <span class="campo-opcional">(opcional)</span></label>
        <input id="editar-estado" class="resena" maxlength="${MAX_ESTADO}" placeholder="Enganchado a…, buscando el platino de…" value="${esc(s.estado)}" autocomplete="off">
        ${jugando.length ? `<div class="chips-plataforma">${jugando.map((n) => `<button type="button" class="chip" data-estado-sug="${esc(`Jugando a ${n}`.slice(0, MAX_ESTADO))}">Jugando a ${esc(n)}</button>`).join('')}</div>` : ''}
      </div>

      <div class="bloque-campo">
        <span class="campo-titulo">Plataforma principal</span>
        <div class="chips-plataforma">
          <button type="button" class="chip${s.plataforma ? '' : ' activo'}" data-plataforma-p="">Automática</button>
          ${PLATAFORMAS_PERFIL.map((p) => `<button type="button" class="chip${s.plataforma === p ? ' activo' : ''}" data-plataforma-p="${esc(p)}">${esc(p)}</button>`).join('')}
        </div>
      </div>

      <div class="bloque-campo">
        <span class="campo-titulo">Juego favorito</span>
        ${s.favorito ? juegoMini(s.favorito, 'data-quitar-favorito') : ''}
        <button type="button" class="boton-secundario neutro boton-pequeno" data-elegir-favorito>${s.favorito ? 'Cambiar' : 'Elegir juego favorito'}</button>
      </div>

      <div class="bloque-campo">
        <span class="campo-titulo">Mi top ${MAX_VITRINA} <span class="campo-opcional">(en el orden en que los elijas)</span></span>
        ${s.vitrina.map((id) => juegoMini(id, `data-quitar-vitrina="${id}"`)).join('')}
        ${s.vitrina.length < MAX_VITRINA ? `<button type="button" class="boton-secundario neutro boton-pequeno" data-elegir-vitrina>${s.vitrina.length ? 'Añadir otro' : `Elegir hasta ${MAX_VITRINA} juegos`}</button>` : ''}
      </div>

      <button type="button" class="boton-principal" data-guardar-perfil${guardando ? ' disabled' : ''}>${guardando ? 'Guardando…' : 'Guardar perfil'}</button>
    </div>`;

  abrirHoja({
    titulo: 'Editar perfil',
    html: '<div data-ref="editar"></div>',
    alMontar(cuerpo, cerrar) {
      const cont = cuerpo.querySelector('[data-ref="editar"]');
      const leer = () => {
        const bio = cont.querySelector('#editar-bio'); const est = cont.querySelector('#editar-estado');
        if (bio) s.bio = bio.value.slice(0, MAX_BIO);
        if (est) s.estado = est.value.slice(0, MAX_ESTADO);
      };
      const pintar = () => { cont.innerHTML = html(); };
      const buscar = (op) => {
        leer();
        volver = true;
        elegirJuegos({ ...op, primero: mios, alCerrar: () => abrirEditarPerfil(uid, s) });
      };
      pintar();
      if (foco) {
        setTimeout(() => {
          const el = cont.querySelector(foco === 'bio' ? '#editar-bio' : foco === 'estado' ? '#editar-estado' : '[data-plataforma-p]');
          el?.scrollIntoView({ block: 'center' });
          if (foco !== 'plataforma') el?.focus({ preventScroll: true });
        }, 250);
      }

      cont.addEventListener('input', (e) => {
        if (e.target.id === 'editar-bio') cont.querySelector('[data-ref="cuenta-bio"]').textContent = `${e.target.value.length} / ${MAX_BIO}`;
      });
      cont.addEventListener('click', async (e) => {
        const t = e.target;
        const sug = t.closest('[data-estado-sug]');
        if (sug) { leer(); s.estado = sug.dataset.estadoSug; pintar(); return; }
        const pl = t.closest('[data-plataforma-p]');
        if (pl) { leer(); s.plataforma = pl.dataset.plataformaP; pintar(); return; }
        if (t.closest('[data-quitar-favorito]')) { leer(); s.favorito = null; pintar(); return; }
        const qv = t.closest('[data-quitar-vitrina]');
        if (qv) { leer(); s.vitrina = s.vitrina.filter((x) => x !== Number(qv.dataset.quitarVitrina)); pintar(); return; }
        if (t.closest('[data-elegir-favorito]')) {
          buscar({ titulo: 'Tu juego favorito', alElegir: ([id]) => { s.favorito = datos.canonico(id); } });
          return;
        }
        if (t.closest('[data-elegir-vitrina]')) {
          const hueco = MAX_VITRINA - s.vitrina.length;
          buscar({
            titulo: `Tu top ${MAX_VITRINA}`, antetitulo: hueco === 1 ? 'Queda un hueco' : `Quedan ${hueco} huecos`, multiple: true, max: hueco, boton: 'Añadir', excluir: s.vitrina,
            alElegir: (ids) => { s.vitrina = [...new Set([...s.vitrina, ...ids.map((x) => datos.canonico(x))])].slice(0, MAX_VITRINA); },
          });
          return;
        }
        if (!t.closest('[data-guardar-perfil]') || guardando) return;
        leer();
        guardando = true; pintar();
        try {
          // Lo de esta hoja; lo demás del perfil (cabecera, insignias destacadas...) se queda.
          const pd = { ...(datos.usuario(uid)?.perfil_datos ?? {}) };
          const campos = { bio: s.bio.trim(), estado: s.estado.trim(), plataforma: s.plataforma, favorito: s.favorito, vitrina: s.vitrina };
          for (const [k, v] of Object.entries(campos)) {
            if (Array.isArray(v) ? v.length : v) pd[k] = v; else delete pd[k];
          }
          const ok = await datos.actualizarUsuario(uid, { perfil_datos: Object.keys(pd).length ? pd : null }, null);
          if (!ok) throw new Error('usuarios');
          aviso('Perfil guardado');
          cerrar();
        } catch (err) {
          console.warn('[perfil]', err?.message || err);
          guardando = false; pintar();
          aviso('No se ha podido guardar el perfil. Revisa la conexión.', 5000);
        }
      });
    },
  });
}
