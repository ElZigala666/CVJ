// Bloque "PlayStation" de la hoja de Ajustes: vincular / cambiar / desvincular,
// sincronizar ahora, guía de privacidad y (solo admin) estado del token.
import { icono } from './icons.js';
import { esc, tiempoRelativo, aviso } from './ui.js';
import * as datos from './datos.js';
import * as psn from './psn.js';
import { usuarioActual } from './sesion.js';
import { textoHoras } from './metricas.js';
import * as metricas from './metricas.js';

/** Pasos para renovar el NPSSO (los usan Ajustes y el aviso de Inicio). */
export function pasosRenovarHtml() {
  return `
    <ol class="pasos-lista">
      <li>En el ordenador, entra en <strong>playstation.com</strong> con la cuenta de PlayStation del token (arriba a la derecha, <em>Iniciar sesión</em>).</li>
      <li>En el <strong>mismo navegador</strong>, abre <strong>ca.account.sony.com/api/v1/ssocookie</strong>. Sale un texto como <code>{"npsso":"…"}</code>.</li>
      <li>Copia solo lo que va entre las comillas después de <code>npsso</code> (unos 64 caracteres).</li>
      <li>En <strong>supabase.com</strong> → tu proyecto → <strong>Edge Functions</strong> → <strong>Secrets</strong>, edita <strong>PSN_NPSSO</strong>, pega el valor nuevo y guarda.</li>
      <li>Vuelve aquí y pulsa <strong>Comprobar</strong>: debe decir que funciona.</li>
    </ol>`;
}

const GUIA_PRIVACIDAD = `
  <div class="guia-psn">
    <p>Para que CVJ vea tus juegos, horas y trofeos, en la privacidad de PlayStation tienen que poder verlos <strong>Cualquiera</strong>. Los nombres de los menús cambian un poco según la versión; busca algo así:</p>
    <p><strong>En la PS5:</strong> Ajustes → Usuarios y cuentas → Privacidad → Ver y personalizar tus ajustes de privacidad. Ahí, en el apartado de tu actividad de juego, pon en <strong>Cualquiera</strong> los <strong>trofeos</strong> y los <strong>juegos a los que juegas</strong>.</p>
    <p><strong>En la app de PlayStation:</strong> toca tu perfil → el engranaje (Ajustes) → Ajustes de privacidad, y cambia lo mismo.</p>
    <p>Si prefieres dejarlo en <strong>Solo amigos</strong>, tendrás que ser amigo en PSN de la cuenta que usa CVJ (pregunta al admin cuál es).</p>
    <p>Después, vuelve aquí y pulsa <strong>Sincronizar ahora</strong>. A veces Sony tarda unos minutos en aplicar el cambio.</p>
  </div>`;

function hace(iso) {
  return iso ? tiempoRelativo(iso).replace(/^Ahora$/, 'ahora mismo').toLowerCase() : 'nunca';
}

/** Monta el bloque en un contenedor de la hoja de Ajustes. */
export function montarPsn(cont) {
  const yo = usuarioActual();
  const s = { cambiando: false, confirmarQuitar: false, ocupado: null, mensaje: null, error: false, guia: false, estadoAdmin: psn.estadoGuardado() };

  const pintar = () => {
    const u = yo && datos.usuario(yo.id);
    // Sin la migración de PSN (o sin datos aún) no se enseña nada.
    if (!u || !('psn_account_id' in u)) { cont.innerHTML = ''; return; }
    const vinculado = !!u.psn_account_id;
    const bib = metricas.biblioteca(u.id);
    const formulario = !vinculado || s.cambiando;

    cont.innerHTML = `
      <section class="ajustes-bloque ajustes-psn">
        <span class="campo-titulo">PlayStation</span>
        ${vinculado && !s.cambiando ? `
          <div class="psn-conectado">
            <span class="psn-icono">${icono('jugando', { tam: 22, color: 'var(--acento)', trazo: 'var(--acento-suave)' })}</span>
            <div class="psn-conectado-texto">
              <strong>${esc(u.psn_online_id)}</strong>
              <span>${bib.total ? `${bib.total} ${bib.total === 1 ? 'juego' : 'juegos'} · ${bib.horas} h · ` : ''}Sincronizado ${esc(hace(u.psn_sincronizado_en))}</span>
            </div>
          </div>
          <button type="button" class="boton-principal" data-psn="sincronizar"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'sincronizar' ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
          <div class="psn-acciones">
            <button type="button" class="enlace-discreto" data-psn="cambiar">Cambiar de ID</button>
            ${s.confirmarQuitar
              ? `<span class="psn-confirmar">¿Desvincular y borrar tu biblioteca de CVJ?
                   <button type="button" class="enlace-discreto peligro" data-psn="desvincular">Sí, desvincular</button>
                   <button type="button" class="enlace-discreto" data-psn="no-desvincular">No</button></span>`
              : '<button type="button" class="enlace-discreto" data-psn="pedir-desvincular">Desvincular</button>'}
          </div>` : ''}
        ${formulario ? `
          <p class="ajustes-nota">Escribe tu ID online de PlayStation (el nombre que ven tus amigos) para traer tus juegos, horas y trofeos. Nunca se crean valoraciones solas.</p>
          <div class="psn-form">
            <label for="psn-id" class="sr">ID online de PlayStation</label>
            <input id="psn-id" class="psn-input" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="16"
              placeholder="Tu ID online" value="${esc(s.cambiando ? u.psn_online_id ?? '' : '')}">
            <button type="button" class="boton-principal" data-psn="vincular"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'vincular' ? 'Buscando…' : vinculado ? 'Cambiar' : 'Vincular'}</button>
          </div>
          ${s.cambiando ? '<button type="button" class="enlace-discreto" data-psn="cancelar">Cancelar</button>' : ''}` : ''}
        ${s.mensaje ? `<p class="psn-mensaje${s.error ? ' error' : ''}" role="status">${esc(s.mensaje)}</p>` : ''}
        <button type="button" class="enlace-discreto" data-psn="guia">${s.guia ? 'Ocultar la guía de privacidad' : 'Cómo hacer visible tu perfil de PlayStation'}</button>
        ${s.guia ? GUIA_PRIVACIDAD : ''}
      </section>
      ${u.es_admin ? bloqueAdmin() : ''}`;
  };

  const bloqueAdmin = () => {
    const e = s.estadoAdmin;
    let texto = 'Comprueba si la conexión con PlayStation funciona.';
    let mal = false;
    if (e) {
      if (e.necesita_npsso || e.codigo === 'npsso_caducado' || e.codigo === 'falta_npsso') {
        texto = e.codigo === 'falta_npsso' ? 'Falta el secreto PSN_NPSSO en Supabase.' : 'El NPSSO ha caducado: hay que poner uno nuevo.';
        mal = true;
      } else if (e.codigo === 'sin_funcion') {
        texto = 'La función psn aún no está desplegada en Supabase.'; mal = true;
      } else if (!e.ok || !e.funciona) {
        texto = `No funciona ahora mismo${e.mensaje ? `: ${e.mensaje}` : ''}.`; mal = true;
      } else {
        texto = `Funciona. ${e.refresh_dias_restantes != null ? `El acceso se renueva solo durante ${e.refresh_dias_restantes} días más; después hará falta un NPSSO nuevo.` : ''}`;
      }
    }
    return `
      <section class="ajustes-bloque ajustes-admin">
        <span class="campo-titulo">Estado de PSN <span class="etiqueta-gris">Admin</span></span>
        <p class="psn-mensaje${mal ? ' error' : ''}">${esc(texto)}</p>
        <button type="button" class="boton-secundario neutro" data-psn="estado"${s.ocupado ? ' disabled' : ''}>${s.ocupado === 'estado' ? 'Comprobando…' : 'Comprobar'}</button>
        ${mal ? pasosRenovarHtml() : ''}
      </section>`;
  };

  const ejecutar = async (accion, fn) => {
    s.ocupado = accion;
    s.mensaje = null;
    pintar();
    try {
      const r = await fn();
      s.error = !r.ok;
      return r;
    } finally {
      s.ocupado = null;
    }
  };

  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-psn]');
    if (!b || !yo) return;
    const a = b.dataset.psn;
    if (a === 'guia') { s.guia = !s.guia; pintar(); return; }
    if (a === 'cambiar') { s.cambiando = true; s.mensaje = null; pintar(); cont.querySelector('#psn-id')?.focus(); return; }
    if (a === 'cancelar') { s.cambiando = false; pintar(); return; }
    if (a === 'pedir-desvincular') { s.confirmarQuitar = true; pintar(); return; }
    if (a === 'no-desvincular') { s.confirmarQuitar = false; pintar(); return; }

    if (a === 'vincular') {
      const id = cont.querySelector('#psn-id')?.value.trim();
      if (!id) { s.mensaje = 'Escribe tu ID online.'; s.error = true; pintar(); return; }
      const r = await ejecutar('vincular', () => psn.vincular(yo.id, id));
      if (r.ok) {
        s.cambiando = false;
        s.mensaje = `Vinculado como ${r.online_id}. Sincronizando…`;
        s.error = false;
        pintar();
        const r2 = await ejecutar('sincronizar', () => psn.sincronizar(yo.id));
        s.mensaje = r2.ok ? resumen(r2) : psn.mensajePsn(r2);
        s.guia = r2.codigo === 'privado' || s.guia;
      } else {
        s.mensaje = psn.mensajePsn(r);
      }
      pintar();
      return;
    }
    if (a === 'sincronizar') {
      const r = await ejecutar('sincronizar', () => psn.sincronizar(yo.id));
      s.mensaje = r.ok ? resumen(r) : psn.mensajePsn(r);
      if (r.codigo === 'privado') s.guia = true;
      pintar();
      return;
    }
    if (a === 'desvincular') {
      const r = await ejecutar('desvincular', () => psn.desvincular(yo.id));
      s.confirmarQuitar = false;
      s.mensaje = r.ok ? 'Cuenta de PlayStation desvinculada.' : psn.mensajePsn(r);
      if (r.ok) aviso('PlayStation desvinculada');
      pintar();
      return;
    }
    if (a === 'estado') {
      s.estadoAdmin = await ejecutar('estado', () => psn.pedirEstado());
      pintar();
    }
  });

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}

function resumen(r) {
  const partes = [`Sincronizado: ${r.juegos} ${r.juegos === 1 ? 'juego' : 'juegos'}`];
  if (r.horas) partes.push(textoHoras(r.horas));
  if (r.sin_emparejar) partes.push(`${r.sin_emparejar} sin emparejar (puedes elegirlos en tu perfil)`);
  return partes.join(' · ') + '.';
}
