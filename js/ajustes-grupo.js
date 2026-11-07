// "Gestionar grupo" en Ajustes (solo admin): lista de personas, añadir, código nuevo,
// editar nombre y color, foto y desactivar / reactivar.
// El código personal se genera aquí, se enseña UNA vez y solo se guarda su hash
// (SHA-256 del código normalizado, igual que el login) a través de la función "admin".
import { SUPABASE_BASE, SUPABASE_KEY } from './config.js';
import { abrirHoja } from './hoja.js';
import { icono } from './icons.js';
import { esc, aviso, avatar } from './ui.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';
import { PALETA } from './acento.js';
import { codigoAleatorio, hashCodigo } from './codigo.js';
import { botonFoto } from './foto-perfil.js';

const URL_ADMIN = `${SUPABASE_BASE}/functions/v1/admin`;
const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

async function llamarAdmin(accion, extra = {}) {
  try {
    const r = await fetch(URL_ADMIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ accion, admin_id: usuarioActual()?.id, ...extra }),
    });
    const d = await r.json().catch(() => null);
    if (!d) return { ok: false, error: r.status === 404 ? 'La gestión del grupo aún no está activada.' : `Respuesta ${r.status}` };
    return d;
  } catch {
    return { ok: false, error: 'Sin conexión. Prueba otra vez en un momento.' };
  }
}

/** Código nuevo que no tenga nadie del grupo (se reintenta si coincidiera). */
async function codigoNuevo(paraQuien, accion, extra) {
  for (let i = 0; i < 3; i++) {
    const codigo = codigoAleatorio(6);
    const r = await llamarAdmin(accion, { ...extra, codigo_hash: await hashCodigo(codigo) });
    if (r.ok) return { ...r, codigo };
    if (r.codigo !== 'repetido') return r;
  }
  return { ok: false, error: 'No se ha podido generar un código. Prueba otra vez.' };
}

/** Enseña el código UNA vez, en grande, con Copiar y Compartir. */
function mostrarCodigo(nombre, codigo) {
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
  const texto = `Te he dado acceso a CVJ: ${url}. Tu código es ${codigo}`;
  abrirHoja({
    titulo: `Código de ${nombre}`,
    html: `
      <div class="codigo-nuevo">
        <p class="codigo-grande" aria-label="Código ${esc(codigo.split('').join(' '))}">${esc(codigo)}</p>
        <p class="psn-mensaje error codigo-aviso">Apúntalo: no se puede volver a ver.</p>
        <div class="codigo-botones">
          <button type="button" class="boton-secundario" data-ref="copiar">Copiar</button>
          ${navigator.share ? '<button type="button" class="boton-principal" data-ref="compartir">Compartir</button>' : ''}
        </div>
        <p class="ajustes-nota">Mensaje listo para mandar: «${esc(texto)}»</p>
      </div>`,
    alMontar(cuerpo) {
      cuerpo.querySelector('[data-ref="copiar"]').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(texto); aviso('Copiado'); } catch { aviso('No se ha podido copiar: apúntalo a mano'); }
      });
      cuerpo.querySelector('[data-ref="compartir"]')?.addEventListener('click', () => {
        navigator.share({ title: 'CVJ', text: texto }).catch(() => {});
      });
    },
  });
}

/** Formulario de nombre y color (para añadir o editar). */
function hojaPersona({ titulo, u = null, boton, alGuardar }) {
  let color = u?.color ?? PALETA[0].hex;
  abrirHoja({
    titulo,
    html: `
      <div class="elegir-juegos">
        <label class="campo-titulo" for="grupo-nombre">Nombre</label>
        <input id="grupo-nombre" class="psn-input" maxlength="30" autocomplete="off" value="${esc(u?.nombre ?? '')}" placeholder="Cómo se llama">
        <span class="campo-titulo">Color del avatar</span>
        <div class="paleta" role="radiogroup" aria-label="Color del avatar">
          ${PALETA.map((p) => `<button type="button" role="radio" class="muestra${p.hex.toUpperCase() === color.toUpperCase() ? ' activa' : ''}" data-color="${p.hex}" style="--muestra:${p.hex}" aria-label="${esc(p.nombre)}" aria-checked="${p.hex.toUpperCase() === color.toUpperCase()}"></button>`).join('')}
        </div>
        ${u ? '' : '<p class="ajustes-nota">La foto se puede poner después, desde su ficha en esta lista.</p>'}
        <p class="psn-mensaje error" data-ref="error" hidden></p>
        <button type="button" class="boton-principal" data-ref="guardar">${esc(boton)}</button>
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.querySelector('.paleta').addEventListener('click', (e) => {
        const b = e.target.closest('[data-color]');
        if (!b) return;
        color = b.dataset.color;
        for (const x of cuerpo.querySelectorAll('[data-color]')) {
          const on = x === b;
          x.classList.toggle('activa', on);
          x.setAttribute('aria-checked', String(on));
        }
      });
      const guardar = async () => {
        const nombre = cuerpo.querySelector('#grupo-nombre').value.trim();
        const err = cuerpo.querySelector('[data-ref="error"]');
        if (!nombre) { err.textContent = 'Escribe un nombre.'; err.hidden = false; return; }
        const b = cuerpo.querySelector('[data-ref="guardar"]');
        b.disabled = true;
        const r = await alGuardar(nombre, color);
        b.disabled = false;
        if (!r.ok) { err.textContent = r.error ?? 'No se ha podido guardar.'; err.hidden = false; return; }
        cerrar(true);
        r.despues?.();
      };
      cuerpo.querySelector('[data-ref="guardar"]').addEventListener('click', guardar);
      cuerpo.querySelector('#grupo-nombre').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
      if (!u) cuerpo.querySelector('#grupo-nombre').focus();
    },
  });
}

/** Monta la sección en Ajustes (no pinta nada si no soy admin). Devuelve la función para desmontar. */
export function montarGrupo(cont) {
  const yo = usuarioActual();
  const vista = { abierto: null, confirmar: null };

  const pintar = () => {
    const soy = datos.usuario(yo?.id);
    if (!soy?.es_admin) { cont.innerHTML = ''; return; }
    const lista = [...datos.estado.usuarios].sort((a, b) => (a.activo === false) - (b.activo === false) || new Date(a.creado_en) - new Date(b.creado_en));
    cont.innerHTML = `
      <section class="ajustes-bloque">
        <span class="campo-titulo">Gestionar grupo</span>
        <div class="grupo-lista">
          ${lista.map((u) => {
            const abierto = vista.abierto === u.id;
            const inactivo = u.activo === false;
            return `
              <div class="grupo-persona${inactivo ? ' inactiva' : ''}">
                <button type="button" class="grupo-persona-cab" data-abrir="${esc(u.id)}" aria-expanded="${abierto}">
                  ${avatar(u, 40)}
                  <span class="grupo-persona-texto">
                    <strong>${esc(u.nombre)}${u.id === yo.id ? ' <small>(tú)</small>' : ''}</strong>
                    <small>${inactivo ? 'Desactivado · ' : ''}${u.creado_en ? `Desde el ${esc(FECHA.format(new Date(u.creado_en)))}` : ''}</small>
                  </span>
                  ${icono('desplegable', { tam: 12, color: 'var(--texto-2)', clase: abierto ? 'girar-180' : '' })}
                </button>
                ${abierto ? `
                  <div class="grupo-persona-acciones">
                    <button type="button" class="boton-secundario boton-pequeno" data-codigo="${esc(u.id)}">Generar código nuevo</button>
                    <button type="button" class="boton-secundario neutro boton-pequeno" data-editar="${esc(u.id)}">Editar nombre y color</button>
                    ${'foto_url' in u ? botonFoto(u) : ''}
                    ${u.id === yo.id ? '' : vista.confirmar === u.id ? `
                      <div class="psn-confirmar" role="group" aria-label="Confirmar">
                        <p>${inactivo ? `¿Reactivar a ${esc(u.nombre)}? Podrá volver a entrar con su código.` : `¿Desactivar a ${esc(u.nombre)}? No podrá entrar ni saldrá en las listas, pero sus valoraciones siguen contando. Se puede reactivar.`}</p>
                        <div class="psn-confirmar-botones">
                          <button type="button" class="boton-secundario neutro" data-no>Cancelar</button>
                          <button type="button" class="boton-secundario${inactivo ? '' : ' peligro'}" data-activo="${esc(u.id)}">${inactivo ? 'Sí, reactivar' : 'Sí, desactivar'}</button>
                        </div>
                      </div>` : `<button type="button" class="enlace-discreto${inactivo ? '' : ' peligro-texto'}" data-pedir="${esc(u.id)}">${inactivo ? 'Reactivar' : 'Desactivar'}</button>`}
                  </div>` : ''}
              </div>`;
          }).join('')}
        </div>
        <button type="button" class="boton-secundario con-icono" data-anadir>${icono('mas', { tam: 18, color: 'currentColor' })}<span>Añadir persona</span></button>
        ${datos.sagasOcultas().length ? `
          <details class="plat-otras">
            <summary>Sagas ocultas (${datos.sagasOcultas().length})</summary>
            ${datos.sagasOcultas().map((sg) => `
              <div class="plat-linea plat-oculta">
                ${icono('saga', { tam: 20, color: 'var(--texto-2)' })}
                <span>${esc(sg.nombre)}</span>
                <button type="button" class="enlace-discreto" data-mostrar-saga="${esc(sg.id)}">Volver a mostrar</button>
              </div>`).join('')}
          </details>` : ''}
      </section>`;
  };

  cont.addEventListener('click', async (e) => {
    const t = e.target;
    const ms = t.closest('[data-mostrar-saga]');
    if (ms) { datos.editarSaga(ms.dataset.mostrarSaga, { oculta: false }, aviso); aviso('La saga vuelve a verse'); return; }
    const abrir = t.closest('[data-abrir]');
    if (abrir) { vista.abierto = vista.abierto === abrir.dataset.abrir ? null : abrir.dataset.abrir; vista.confirmar = null; pintar(); return; }
    if (t.closest('[data-anadir]')) {
      hojaPersona({
        titulo: 'Añadir persona',
        boton: 'Crear y ver su código',
        alGuardar: async (nombre, color) => {
          const r = await codigoNuevo(nombre, 'crear', { nombre, color });
          if (r.ok) {
            await datos.refrescar();
            vista.abierto = r.usuario?.id ?? null;
            return { ok: true, despues: () => mostrarCodigo(nombre, r.codigo) };
          }
          return r;
        },
      });
      return;
    }
    const cod = t.closest('[data-codigo]');
    if (cod) {
      const u = datos.usuario(cod.dataset.codigo);
      cod.disabled = true;
      const r = await codigoNuevo(u.nombre, 'nuevo_codigo', { usuario_id: u.id });
      cod.disabled = false;
      if (r.ok) mostrarCodigo(u.nombre, r.codigo);
      else aviso(r.error ?? 'No se ha podido generar el código');
      return;
    }
    const ed = t.closest('[data-editar]');
    if (ed) {
      const u = datos.usuario(ed.dataset.editar);
      hojaPersona({
        titulo: `Editar a ${u.nombre}`,
        u,
        boton: 'Guardar',
        alGuardar: async (nombre, color) => {
          const r = await llamarAdmin('editar', { usuario_id: u.id, nombre, color });
          if (r.ok) { await datos.refrescar(); aviso('Guardado'); }
          return r;
        },
      });
      return;
    }
    const pedir = t.closest('[data-pedir]');
    if (pedir) { vista.confirmar = pedir.dataset.pedir; pintar(); return; }
    if (t.closest('[data-no]')) { vista.confirmar = null; pintar(); return; }
    const act = t.closest('[data-activo]');
    if (act) {
      const u = datos.usuario(act.dataset.activo);
      const activar = u.activo === false;
      act.disabled = true;
      const r = await llamarAdmin('activo', { usuario_id: u.id, activo: activar });
      vista.confirmar = null;
      if (r.ok) { await datos.refrescar(); aviso(activar ? `${u.nombre} reactivado` : `${u.nombre} desactivado`); }
      else aviso(r.error ?? 'No se ha podido cambiar');
      pintar();
    }
  });

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}
