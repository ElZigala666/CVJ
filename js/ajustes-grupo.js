// "Gestionar grupo" en Ajustes (solo admin): lista de personas, añadir, código nuevo,
// editar nombre y color, foto y el cementerio: expulsar (con la causa de la muerte),
// exorcizar (expulsión permanente), levantar el exorcismo y devolver a la vida.
// El código personal se genera aquí, se enseña UNA vez y solo se guarda su hash
// (SHA-256 del código normalizado, igual que el login) a través de la función "admin".
import { abrirHoja } from './hoja.js';
import { icono } from './icons.js';
import { esc, aviso, avatar, botonCopiar, seleccionarTexto } from './ui.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';
import { PALETA } from './acento.js';
import { codigoAleatorio, hashCodigo } from './codigo.js';
import { botonFoto } from './foto-perfil.js';
import { logoColumna, logoCuadrado } from './columnas-ui.js';
import { llamarAdmin } from './admin-api.js';
import { historia } from './cementerio.js';
import { textoPadrino } from './propuestas.js';
import { bloqueGrupo, clicApelaciones, vecesApelado } from './apelaciones.js';

const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

// Lo que se puede hacer con alguien en el cementerio (cada cosa, con su confirmación).
const ACCIONES = {
  expulsar: {
    pregunta: (n) => `¿Expulsar a ${n}? No podrá entrar ni saldrá en las listas, pero sus valoraciones siguen contando. Irá al cementerio y cualquiera podrá intentar reanimarlo.`,
    causa: 'Causa de la muerte', ejemplo: 'Por ejemplo: ponerle un 10 al FIFA', boton: 'Sí, expulsar', peligro: true, hecho: (n) => `${n} descansa en paz`,
  },
  exorcizar: {
    pregunta: (n) => `¿Exorcizar a ${n}? Es la expulsión permanente: nadie podrá reanimarlo hasta que levantes el exorcismo.`,
    causa: 'Motivo', ejemplo: 'Por ejemplo: reincidente', boton: 'Sí, exorcizar', peligro: true, hecho: (n) => `${n} exorcizado. No volverá.`,
  },
  levantar: {
    pregunta: (n) => `¿Levantar el exorcismo de ${n}? Sigue muerto, pero se le podrá volver a intentar reanimar.`,
    boton: 'Sí, levantarlo', hecho: (n) => `Exorcismo levantado. ${n} sigue bajo tierra.`,
  },
  readmitir: {
    pregunta: (n) => `¿Devolver a ${n} a la vida ahora? Podrá volver a entrar con su código.`,
    boton: 'Sí, que vuelva', hecho: (n) => `${n} ha vuelto de entre los muertos`,
  },
};

/** Código nuevo que no tenga nadie del grupo (se reintenta si coincidiera). */
export async function codigoNuevo(paraQuien, accion, extra) {
  for (let i = 0; i < 3; i++) {
    const codigo = codigoAleatorio(6);
    const r = await llamarAdmin(accion, { ...extra, codigo_hash: await hashCodigo(codigo) });
    if (r.ok) return { ...r, codigo };
    if (r.codigo !== 'repetido') return r;
  }
  return { ok: false, error: 'No se ha podido generar un código. Prueba otra vez.' };
}

/** Enseña el código UNA vez, en grande, con Copiar y Compartir. */
export function mostrarCodigo(nombre, codigo) {
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
        <p class="ajustes-nota">Mensaje listo para mandar: «<span class="texto-seleccionable" data-ref="mensaje">${esc(texto)}</span>»</p>
      </div>`,
    alMontar(cuerpo) {
      // Si no se puede copiar, el mensaje queda seleccionado para copiarlo a mano.
      botonCopiar(cuerpo.querySelector('[data-ref="copiar"]'), texto, {
        alFallar: () => seleccionarTexto(cuerpo.querySelector('[data-ref="mensaje"]')),
      });
      cuerpo.querySelector('[data-ref="compartir"]')?.addEventListener('click', () => {
        navigator.share({ title: 'CVJ', text: texto }).catch(() => {});
      });
    },
  });
}

/** Formulario de nombre y color (para añadir o editar). */
function hojaPersona({ titulo, u = null, nombre: nombreInicial = '', antes = '', boton, alGuardar }) {
  let color = u?.color ?? PALETA[0].hex;
  abrirHoja({
    titulo,
    html: `
      <div class="elegir-juegos">
        ${antes}
        <label class="campo-titulo" for="grupo-nombre">Nombre</label>
        <input id="grupo-nombre" class="psn-input" maxlength="30" autocomplete="off" value="${esc(u?.nombre ?? nombreInicial)}" placeholder="Cómo se llama">
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

/**
 * "Añadir persona": nombre y color, y luego su código (una vez). Desde una propuesta
 * (Invitar), con el nombre ya puesto y la persona enlazada a ella (queda aceptada).
 */
export function anadirPersona({ nombre = '', propuesta = null, alCrear = null } = {}) {
  const padrino = propuesta ? datos.usuario(propuesta.autor_id) : null;
  hojaPersona({
    titulo: propuesta ? `Invitar a ${propuesta.nombre}` : 'Añadir persona',
    nombre,
    antes: propuesta ? `<p class="ajustes-nota">Entrará por la propuesta de ${esc(padrino?.nombre ?? 'alguien')}. Pon el nombre como quieras que salga en el grupo.</p>` : '',
    boton: 'Crear y ver su código',
    alGuardar: async (n, color) => {
      const r = await codigoNuevo(n, 'crear', { nombre: n, color, ...(propuesta ? { propuesta_id: propuesta.id } : {}) });
      if (r.ok) {
        await datos.refrescar();
        alCrear?.(r.usuario);
        if (r.aviso) aviso(r.aviso);
        return { ok: true, despues: () => mostrarCodigo(n, r.codigo) };
      }
      return r;
    },
  });
}

/** Monta la sección en Ajustes (no pinta nada si no soy admin). Devuelve la función para desmontar. */
export function montarGrupo(cont) {
  const yo = usuarioActual();
  const vista = { abierto: null, confirmar: null, whatsapp: null };
  // El WhatsApp del Dictador (privado: solo sale en las páginas de enlace de reanimar y proponer).
  if (datos.usuario(yo?.id)?.es_admin) llamarAdmin('whatsapp', {}).then((r) => { if (r.ok) { vista.whatsapp = r.numero ?? ''; pintar(); } });

  const pintar = () => {
    const soy = datos.usuario(yo?.id);
    if (!soy?.es_admin) { cont.innerHTML = ''; return; }
    // Lo que estaba escribiendo (la causa de la muerte) no se pierde si llegan datos nuevos.
    const wa = cont.querySelector('#grupo-whatsapp');
    if (wa && !wa.disabled) vista.whatsapp = wa.value;
    const causa = cont.querySelector('[data-causa]');
    const escrito = causa ? { valor: causa.value, foco: document.activeElement === causa } : null;
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
                    <small>${inactivo ? (u.exorcizado ? 'Exorcizado · ' : 'Expulsado · ') : ''}${u.creado_en ? `Desde el ${esc(FECHA.format(new Date(u.creado_en)))}` : ''}${historia(u.id).muertes > 1 ? ` · Muertes: ${historia(u.id).muertes}` : ''}${textoPadrino(u.id) ? ` · ${esc(textoPadrino(u.id))}` : ''}</small>
                  </span>
                  ${icono('desplegable', { tam: 12, color: 'var(--texto-2)', clase: abierto ? 'girar-180' : '' })}
                </button>
                ${abierto ? `
                  <div class="grupo-persona-acciones">
                    <button type="button" class="boton-secundario boton-pequeno" data-codigo="${esc(u.id)}">Generar código nuevo</button>
                    <button type="button" class="boton-secundario neutro boton-pequeno" data-editar="${esc(u.id)}">Editar nombre y color</button>
                    ${'foto_url' in u ? botonFoto(u) : ''}
                    ${vecesApelado(u.id) ? `<button type="button" class="boton-secundario neutro boton-pequeno" data-apelaciones="${esc(u.id)}">Apelaciones (${vecesApelado(u.id)})</button>` : ''}
                    ${Array.isArray(datos.estado.columnas) ? (datos.columnaDe(u.id)
                      ? `<button type="button" class="boton-secundario neutro boton-pequeno con-icono" data-columna="${esc(u.id)}">${logoColumna(datos.columnaDe(u.id), 20)}<span>Columna: ${esc(datos.columnaDe(u.id).nombre)}</span></button>`
                      : `<button type="button" class="boton-secundario neutro boton-pequeno" data-columna="${esc(u.id)}">Hacer columnista</button>`) : ''}
                    ${u.id === yo.id ? '' : vista.confirmar?.id === u.id ? confirmar(u, vista.confirmar.accion) : `
                      <div class="grupo-cementerio">
                        ${!inactivo ? `<button type="button" class="enlace-discreto peligro-texto" data-pedir="expulsar" data-u="${esc(u.id)}">Expulsar</button>` : ''}
                        ${inactivo && !u.exorcizado ? `<button type="button" class="enlace-discreto" data-pedir="readmitir" data-u="${esc(u.id)}">Devolver a la vida</button>` : ''}
                        ${u.exorcizado ? `<button type="button" class="enlace-discreto" data-pedir="levantar" data-u="${esc(u.id)}">Levantar el exorcismo</button>`
                          : `<button type="button" class="enlace-discreto peligro-texto" data-pedir="exorcizar" data-u="${esc(u.id)}">Exorcizar</button>`}
                      </div>`}
                  </div>` : ''}
              </div>`;
          }).join('')}
        </div>
        ${bloqueGrupo()}
        <button type="button" class="boton-secundario con-icono" data-anadir>${icono('mas', { tam: 18, color: 'currentColor' })}<span>Añadir persona</span></button>
        <label class="campo-titulo" for="grupo-whatsapp">Tu WhatsApp</label>
        <div class="grupo-whatsapp">
          <input id="grupo-whatsapp" class="psn-input" inputmode="tel" autocomplete="off" maxlength="20" placeholder="${vista.whatsapp === null ? 'Cargando…' : '34 600 000 000'}" value="${esc(vista.whatsapp ?? '')}" ${vista.whatsapp === null ? 'disabled' : ''}>
          <button type="button" class="boton-secundario boton-pequeno" data-whatsapp>Guardar</button>
        </div>
        <p class="ajustes-nota">Con el prefijo del país. Solo se ve en las páginas de los enlaces de reanimar y proponer, para que te pidan su código.</p>
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
      </section>
      ${bloqueEventos()}`;
    const nueva = escrito && cont.querySelector('[data-causa]');
    if (nueva) { nueva.value = escrito.valor; if (escrito.foco) nueva.focus(); }
  };

  cont.addEventListener('click', async (e) => {
    const t = e.target;
    if (clicApelaciones(e)) return;
    const waB = t.closest('[data-whatsapp]');
    if (waB) {
      const v = cont.querySelector('#grupo-whatsapp').value;
      waB.disabled = true;
      const r = await llamarAdmin('whatsapp', { numero: v });
      waB.disabled = false;
      if (!r.ok) { aviso(r.error ?? 'No se ha podido guardar'); return; }
      vista.whatsapp = r.numero;
      pintar();
      aviso(r.numero ? 'WhatsApp guardado' : 'WhatsApp quitado');
      return;
    }
    const colu = t.closest('[data-columna]');
    if (colu) { hojaColumna(datos.usuario(colu.dataset.columna)); return; }
    const ms = t.closest('[data-mostrar-saga]');
    if (ms) { datos.editarSaga(ms.dataset.mostrarSaga, { oculta: false }, aviso); aviso('La saga vuelve a verse'); return; }
    const abrir = t.closest('[data-abrir]');
    if (abrir) { vista.abierto = vista.abierto === abrir.dataset.abrir ? null : abrir.dataset.abrir; vista.confirmar = null; pintar(); return; }
    if (t.closest('[data-anadir]')) {
      anadirPersona({ alCrear: (u) => { vista.abierto = u?.id ?? null; } });
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
    if (pedir) {
      vista.confirmar = { id: pedir.dataset.u, accion: pedir.dataset.pedir };
      pintar();
      cont.querySelector('[data-causa]')?.focus();
      return;
    }
    if (t.closest('[data-no]')) { vista.confirmar = null; pintar(); return; }
    const hacer = t.closest('[data-hacer]');
    if (hacer && vista.confirmar) {
      const { id, accion } = vista.confirmar;
      const u = datos.usuario(id);
      const causa = cont.querySelector('[data-causa]')?.value.trim() || null;
      hacer.disabled = true;
      const r = await llamarAdmin(accion, { usuario_id: id, ...(causa ? { causa } : {}) });
      vista.confirmar = null;
      if (r.ok) { await datos.refrescar(); aviso(ACCIONES[accion].hecho(u.nombre)); }
      else aviso(r.error ?? 'No se ha podido');
      pintar();
    }
  });

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}

/** Confirmación de expulsar, exorcizar, levantar o devolver a la vida (con la causa, si la lleva). */
function confirmar(u, accion) {
  const a = ACCIONES[accion];
  return `
    <div class="psn-confirmar" role="group" aria-label="Confirmar">
      <p>${esc(a.pregunta(u.nombre))}</p>
      ${a.causa ? `
        <label class="campo-titulo" for="grupo-causa">${esc(a.causa)} <span class="campo-opcional">(opcional)</span></label>
        <input id="grupo-causa" class="psn-input" data-causa maxlength="140" autocomplete="off" placeholder="${esc(a.ejemplo)}">` : ''}
      <div class="psn-confirmar-botones">
        <button type="button" class="boton-secundario neutro" data-no>Cancelar</button>
        <button type="button" class="boton-secundario${a.peligro ? ' peligro' : ''}" data-hacer>${esc(a.boton)}</button>
      </div>
    </div>`;
}

/**
 * Columna de opinión de alguien (solo admin): nombre ("El Diario de {nombre}" por
 * defecto), logo (subido, recortado a cuadrado; sin él, monograma con las iniciales)
 * y color propio opcional. "Quitar columna" la desactiva (sus entradas no se borran).
 */
function hojaColumna(u) {
  if (!u) return;
  const actual = (datos.estado.columnas ?? []).find((c) => c.usuario_id === u.id) ?? null;
  const c = { id: actual?.id ?? null, usuario_id: u.id, nombre: actual?.nombre ?? `El Diario de ${u.nombre}`, logo_url: actual?.logo_url ?? null, color: actual?.color ?? null, activa: true };
  let logoNuevo = null; // blob recortado, pendiente de subir
  abrirHoja({
    titulo: actual?.activa !== false && actual ? 'Columna de opinión' : `${u.nombre}, columnista`,
    html: `
      <div class="elegir-juegos columna-ajustes">
        <div class="columna-vista" data-ref="vista"></div>
        <label class="campo-titulo" for="col-nombre">Nombre de la columna</label>
        <input id="col-nombre" class="psn-input" maxlength="60" value="${esc(c.nombre)}" autocomplete="off">
        <span class="campo-titulo">Logo</span>
        <div class="columna-logo-fila">
          <label class="boton-secundario boton-pequeno">Subir imagen<input type="file" accept="image/*" data-ref="archivo" hidden></label>
          <button type="button" class="enlace-discreto" data-ref="sin-logo">Usar las iniciales</button>
        </div>
        <span class="campo-titulo">Color <span class="campo-opcional">(opcional)</span></span>
        <div class="paleta" data-ref="paleta">
          <button type="button" class="muestra-libre" data-color="">Ninguno</button>
          ${PALETA.map((p) => `<button type="button" class="muestra" style="--muestra:${p.hex}" data-color="${p.hex}" aria-label="${esc(p.nombre)}"></button>`).join('')}
        </div>
        <p class="psn-mensaje error" data-ref="error" hidden></p>
        <button type="button" class="boton-principal" data-ref="guardar">${actual && actual.activa !== false ? 'Guardar' : 'Crear columna'}</button>
        ${actual && actual.activa !== false ? '<button type="button" class="enlace-discreto peligro-texto" data-ref="quitar">Quitar la columna (sus textos no se borran)</button>' : ''}
      </div>`,
    alMontar(cuerpo, cerrar) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      let previa = null;
      const pintar = () => {
        const vista = { ...c, nombre: $('nombre')?.value ?? cuerpo.querySelector('#col-nombre').value, logo_url: previa ?? c.logo_url };
        $('vista').innerHTML = `${logoColumna(vista, 72)}<strong class="columna-vista-nombre">${esc(vista.nombre || '…')}</strong>`;
        for (const b of cuerpo.querySelectorAll('[data-color]')) b.classList.toggle('activa', (b.dataset.color || null) === c.color);
      };
      cuerpo.querySelector('#col-nombre').addEventListener('input', pintar);
      $('archivo').addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          logoNuevo = await logoCuadrado(f, 512);
          if (previa) URL.revokeObjectURL(previa);
          previa = URL.createObjectURL(logoNuevo);
          pintar();
        } catch { aviso('No se ha podido leer la imagen'); }
      });
      $('sin-logo').addEventListener('click', () => { logoNuevo = null; previa = null; c.logo_url = null; pintar(); });
      $('paleta').addEventListener('click', (e) => {
        const b = e.target.closest('[data-color]');
        if (!b) return;
        c.color = b.dataset.color || null;
        pintar();
      });
      $('guardar').addEventListener('click', async () => {
        const nombre = cuerpo.querySelector('#col-nombre').value.trim();
        const err = $('error');
        if (!nombre) { err.textContent = 'Escribe un nombre.'; err.hidden = false; return; }
        $('guardar').disabled = true;
        try {
          if (logoNuevo) {
            const ext = logoNuevo.type === 'image/webp' ? 'webp' : 'png';
            c.logo_url = await datos.subirImagenColumna(`logos/${u.id}-${Date.now()}.${ext}`, logoNuevo);
          }
          const id = await datos.guardarColumna({ ...c, nombre, activa: true, ...(c.id ? {} : { creado_en: new Date().toISOString() }) }, aviso);
          if (id) { aviso(actual ? 'Columna guardada' : `${u.nombre} ya es columnista`); cerrar(); }
        } catch (e2) {
          err.textContent = 'No se ha podido subir el logo. Prueba otra vez.';
          err.hidden = false;
          console.warn('[columna]', e2?.message || e2);
        }
        $('guardar').disabled = false;
      });
      $('quitar')?.addEventListener('click', async () => {
        await datos.guardarColumna({ ...actual, activa: false }, aviso);
        aviso('Columna quitada');
        cerrar();
      });
      pintar();
    },
  });
}

/** Eventos destacados (solo admin): la lista y "Nuevo evento" (el editor es una pantalla). */
function bloqueEventos() {
  const lista = [...datos.eventos()].sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
  const ahora = Date.now();
  const estado = (e) => (ahora < new Date(e.inicio).getTime() ? 'Programado' : ahora >= new Date(e.fin).getTime() ? 'Terminado' : 'Activo');
  return `
    <section class="ajustes-bloque">
      <span class="campo-titulo">Eventos</span>
      ${lista.length ? `<div class="grupo-lista">${lista.map((e) => `
        <a class="grupo-persona grupo-evento" href="#evento/${esc(e.id)}/editar">
          <span class="grupo-evento-color" style="background:${esc(e.color || '#6D28D9')}"></span>
          <span class="grupo-persona-texto"><strong>${esc(e.titulo)}</strong><small>${estado(e)}${datos.categoriasDe(e.id).length ? ` · ${datos.categoriasDe(e.id).length} categorías` : ''}</small></span>
          ${icono('adelante', { tam: 16, color: 'var(--texto-2)' })}
        </a>`).join('')}</div>` : '<p class="ajustes-nota">Galas y presentaciones (The Game Awards, Summer Game Fest, Directs...): salen arriba en Inicio con cuenta atrás.</p>'}
      <a class="boton-secundario con-icono" href="#evento/nuevo">${icono('mas', { tam: 18, color: 'currentColor' })}<span>Nuevo evento</span></a>
    </section>`;
}
