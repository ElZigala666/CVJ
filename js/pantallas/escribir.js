// Editor de una entrada de columna (#escribir/{id} o #escribir/nueva[/juego|coleccion|saga/{id}]).
// A pantalla completa y pensado para textos muy largos en el móvil: título, subtítulo y
// cuerpo en Markdown ligero, con una barra de formato pegada encima del teclado y
// "Vista previa". El borrador se guarda solo: en el móvil al momento y en la base cada
// pocos segundos (si ya está publicada, en la base solo al pulsar "Actualizar").
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import { esc, portada, aviso } from '../ui.js';
import { volver, corregirRuta, reemplazarRuta } from '../navegacion.js';
import { markdown, palabras, textoLectura, imagenRedimensionada, logoColumna } from '../columnas-ui.js';

const MAX = 100000;
const CADA_BD_MS = 4000;
const clave = (id) => `cvj.borrador.${id}`;
const leerLocal = (id) => { try { return JSON.parse(localStorage.getItem(clave(id)) || 'null'); } catch { return null; } };
const guardarLocal = (id, x) => { try { localStorage.setItem(clave(id), JSON.stringify(x)); } catch { /* lleno o privado */ } };
const borrarLocal = (id) => { try { localStorage.removeItem(clave(id)); } catch { /* nada */ } };

export function render(el, { params }) {
  const yo = usuarioActual();
  const col = yo ? datos.columnaDe(yo.id) : null;
  if (!col) {
    el.innerHTML = `<div class="vacio"><h2 class="vacio-titulo">Solo para columnistas</h2><p class="vacio-texto">El admin da las columnas en Ajustes → Gestionar grupo.</p><a class="boton-secundario" href="#inicio">Volver</a></div>`;
    return;
  }
  // Entrada nueva (con su tema) o una que ya existe.
  const nueva = params[0] === 'nueva';
  const id = nueva ? crypto.randomUUID() : params[0];
  const previa = nueva ? null : datos.entrada(id);
  if (!nueva && (!previa || previa.usuario_id !== yo.id)) {
    el.innerHTML = `<div class="vacio"><h2 class="vacio-titulo">No se encuentra esa entrada</h2><a class="boton-secundario" href="#inicio">Volver</a></div>`;
    return;
  }
  const tema = previa
    ? { juego_id: previa.juego_id, coleccion_id: previa.coleccion_id, saga_id: previa.saga_id }
    : { juego_id: params[1] === 'juego' ? Number(params[2]) : null, coleccion_id: params[1] === 'coleccion' ? params[2] : null, saga_id: params[1] === 'saga' ? params[2] : null };
  const s = {
    titulo: previa?.titulo ?? '', subtitulo: previa?.subtitulo ?? '', cuerpo: '',
    estado: previa?.estado ?? 'borrador', vista: false, guardado: 'nuevo', enBD: !nueva, cargando: !nueva,
  };
  let relojBD = null;
  let guardando = false;

  const temaHtml = () => {
    if (tema.juego_id) { const j = datos.juegoConocido(tema.juego_id); return j ? `${portada(j, { clase: 'portada-mini' })}<span>Sobre <strong>${esc(j.nombre)}</strong></span>` : ''; }
    if (tema.coleccion_id) { const c = datos.coleccion(tema.coleccion_id); return c ? `${portada(datos.comoJuego(c), { clase: 'portada-mini' })}<span>Sobre la colección <strong>${esc(c.nombre)}</strong></span>` : ''; }
    if (tema.saga_id) { const g = datos.saga(tema.saga_id); return g ? `${icono('saga', { tam: 18, color: 'var(--acento)' })}<span>Sobre la saga <strong>${esc(g.nombre)}</strong></span>` : ''; }
    return '<span>Entrada general, sin juego</span>';
  };

  el.innerHTML = `
    <section class="editor">
      <header class="editor-barra">
        <button type="button" class="boton-cuadrado" data-accion="cerrar" aria-label="Cerrar">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
        <span class="editor-estado" data-ref="estado" aria-live="polite"></span>
        <button type="button" class="boton-secundario boton-pequeno" data-accion="vista" aria-pressed="false">Vista previa</button>
        <button type="button" class="boton-principal boton-pequeno" data-accion="publicar">${s.estado === 'publicada' ? 'Actualizar' : 'Publicar'}</button>
      </header>
      <div class="editor-columna">${logoColumna(col, 28)}<span>${esc(col.nombre)}</span></div>
      <div class="editor-tema">${temaHtml()}</div>
      <div data-ref="escribir">
        <textarea class="editor-titulo" data-ref="titulo" rows="1" maxlength="200" placeholder="Título"></textarea>
        <textarea class="editor-subtitulo" data-ref="subtitulo" rows="1" maxlength="300" placeholder="Subtítulo (opcional)"></textarea>
        <textarea class="editor-cuerpo" data-ref="cuerpo" maxlength="${MAX}" placeholder="Escribe aquí. Sin prisa: se guarda solo.&#10;&#10;**negrita**, *cursiva*, ## intertítulo, > cita, - lista"></textarea>
      </div>
      <article class="lectura-cuerpo editor-previa" data-ref="previa" hidden></article>
      <p class="editor-cuenta" data-ref="cuenta"></p>
      ${s.estado === 'publicada' || !nueva ? `
        <div class="editor-mas">
          ${s.estado === 'publicada' ? '<button type="button" class="enlace-discreto" data-accion="despublicar">Despublicar (vuelve a borrador)</button>' : ''}
          <button type="button" class="enlace-discreto peligro-texto" data-accion="pedir-borrar">Borrar esta entrada</button>
          <div data-ref="confirmar"></div>
        </div>` : ''}
      <div class="editor-formato" data-ref="formato" role="toolbar" aria-label="Formato">
        <button type="button" data-f="negrita" aria-label="Negrita"><b>B</b></button>
        <button type="button" data-f="cursiva" aria-label="Cursiva"><i>I</i></button>
        <button type="button" data-f="titulo" aria-label="Intertítulo">H</button>
        <button type="button" data-f="cita" aria-label="Cita">“ ”</button>
        <button type="button" data-f="lista" aria-label="Lista">•</button>
        <button type="button" data-f="numerada" aria-label="Lista numerada">1.</button>
        <label aria-label="Imagen">${icono('perfil', { tam: 18, color: 'currentColor' })}<input type="file" accept="image/*" data-ref="imagen" hidden></label>
      </div>
    </section>`;
  const $ = (r) => el.querySelector(`[data-ref="${r}"]`);
  const titulo = $('titulo');
  const subtitulo = $('subtitulo');
  const cuerpo = $('cuerpo');

  const crecer = (t) => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; };
  const pintarEstado = () => {
    const txt = { nuevo: '', escribiendo: 'Guardado en el móvil', guardando: 'Guardando…', guardado: s.estado === 'publicada' ? 'Cambios en el móvil · pulsa Actualizar' : 'Borrador guardado', error: 'Sin conexión: guardado en el móvil', publicada: 'Publicada' }[s.guardado] ?? '';
    $('estado').textContent = s.cargando ? 'Cargando…' : txt;
    const n = palabras(s.cuerpo);
    $('cuenta').textContent = `${n.toLocaleString('es-ES')} palabras · ${textoLectura(n)}`;
  };

  const local = () => guardarLocal(id, { titulo: s.titulo, subtitulo: s.subtitulo, cuerpo: s.cuerpo, ts: Date.now(), tema });

  const aBD = async (estadoNuevo = null) => {
    if (guardando) return false;
    guardando = true;
    s.guardado = 'guardando'; pintarEstado();
    try {
      await datos.guardarEntrada({
        id, columna_id: col.id, usuario_id: yo.id, ...tema,
        titulo: s.titulo, subtitulo: s.subtitulo, cuerpo: s.cuerpo, palabras: palabras(s.cuerpo),
        estado: estadoNuevo ?? s.estado,
      });
      if (estadoNuevo) s.estado = estadoNuevo;
      s.enBD = true;
      s.guardado = s.estado === 'publicada' && !estadoNuevo ? 'guardado' : 'guardado';
      if (nueva) corregirRuta(`#escribir/${id}`);
      return true;
    } catch (e) {
      console.warn('[columna]', e?.message || e);
      s.guardado = 'error';
      return false;
    } finally {
      guardando = false;
      pintarEstado();
    }
  };

  const alEscribir = () => {
    s.titulo = titulo.value; s.subtitulo = subtitulo.value; s.cuerpo = cuerpo.value;
    s.guardado = 'escribiendo';
    local();
    pintarEstado();
    clearTimeout(relojBD);
    // Si ya está publicada, la base solo cambia al pulsar "Actualizar".
    if (s.estado !== 'publicada' && (s.titulo.trim() || s.cuerpo.trim())) relojBD = setTimeout(() => aBD(), CADA_BD_MS);
  };
  for (const t of [titulo, subtitulo, cuerpo]) {
    t.addEventListener('input', () => { crecer(t); alEscribir(); });
  }
  // Intro en el título: al subtítulo / cuerpo (no hay saltos de línea en el título).
  titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); subtitulo.focus(); } });
  subtitulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); cuerpo.focus(); } });

  // ---- Formato: envolver la selección o poner un prefijo a las líneas ---------
  const envolver = (marca) => {
    const { selectionStart: a, selectionEnd: b, value: v } = cuerpo;
    const sel = v.slice(a, b) || 'texto';
    cuerpo.setRangeText(`${marca}${sel}${marca}`, a, b, 'end');
    if (a === b) cuerpo.setSelectionRange(a + marca.length, a + marca.length + sel.length);
  };
  const prefijo = (p, numerar = false) => {
    const v = cuerpo.value;
    let a = v.lastIndexOf('\n', cuerpo.selectionStart - 1) + 1;
    let b = v.indexOf('\n', cuerpo.selectionEnd);
    if (b < 0) b = v.length;
    const lineas = v.slice(a, b).split('\n').map((l, i) => {
      const limpia = l.replace(/^(#{1,3}\s+|>\s?|[-*•]\s+|\d+[.)]\s+)/, '');
      return (numerar ? `${i + 1}. ` : p) + limpia;
    });
    cuerpo.setRangeText(lineas.join('\n'), a, b, 'end');
  };
  $('formato').addEventListener('pointerdown', (e) => { if (e.target.closest('[data-f]')) e.preventDefault(); }); // no perder el foco (ni el teclado)
  $('formato').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    cuerpo.focus();
    const f = b.dataset.f;
    if (f === 'negrita') envolver('**');
    else if (f === 'cursiva') envolver('*');
    else if (f === 'titulo') prefijo('## ');
    else if (f === 'cita') prefijo('> ');
    else if (f === 'lista') prefijo('- ');
    else if (f === 'numerada') prefijo('', true);
    crecer(cuerpo);
    alEscribir();
  });
  $('imagen').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    aviso('Subiendo la imagen…');
    try {
      const blob = await imagenRedimensionada(f, 1600);
      const url = await datos.subirImagenColumna(`entradas/${id}/${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, blob);
      const pos = cuerpo.selectionStart ?? cuerpo.value.length;
      cuerpo.setRangeText(`\n\n![](${url})\n\n`, pos, pos, 'end');
      crecer(cuerpo);
      alEscribir();
      aviso('Imagen añadida (puedes escribir un pie entre los corchetes)');
    } catch (err) {
      console.warn('[imagen]', err?.message || err);
      aviso('No se ha podido subir la imagen');
    }
  });

  // La barra de formato, siempre encima del teclado (visualViewport).
  const vv = window.visualViewport;
  const colocarBarra = () => {
    if (!vv) return;
    const abajo = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    $('formato').style.transform = `translateY(${-abajo}px)`;
  };
  vv?.addEventListener('resize', colocarBarra);
  vv?.addEventListener('scroll', colocarBarra);

  // ---- Acciones -----------------------------------------------------------------
  const salir = async () => {
    clearTimeout(relojBD);
    if (s.estado !== 'publicada' && (s.titulo.trim() || s.cuerpo.trim()) && s.guardado !== 'guardado') await aBD();
    volver(col ? `#columna/${col.id}` : '#inicio');
  };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const a = b.dataset.accion;
    if (a === 'cerrar') salir();
    else if (a === 'vista') {
      s.vista = !s.vista;
      b.setAttribute('aria-pressed', String(s.vista));
      b.textContent = s.vista ? 'Seguir escribiendo' : 'Vista previa';
      $('escribir').hidden = s.vista;
      $('formato').hidden = s.vista;
      const p = $('previa');
      p.hidden = !s.vista;
      if (s.vista) p.innerHTML = `<h1 class="lectura-titulo">${esc(s.titulo || 'Sin título')}</h1>${s.subtitulo ? `<p class="lectura-subtitulo">${esc(s.subtitulo)}</p>` : ''}${markdown(s.cuerpo)}`;
    } else if (a === 'publicar') {
      if (!s.titulo.trim()) { aviso('Ponle un título antes de publicar'); titulo.focus(); return; }
      if (!s.cuerpo.trim()) { aviso('Todavía no has escrito nada'); cuerpo.focus(); return; }
      clearTimeout(relojBD);
      b.disabled = true;
      const ok = await aBD('publicada');
      b.disabled = false;
      if (!ok) { aviso('No se ha podido publicar. Lo tienes guardado en el móvil.'); return; }
      borrarLocal(id);
      aviso(previa?.estado === 'publicada' ? 'Actualizada' : `Publicada en ${col.nombre}`);
      reemplazarRuta(`#entrada/${id}`);
    } else if (a === 'despublicar') {
      await datos.despublicarEntrada(id, aviso);
      s.estado = 'borrador';
      el.querySelector('[data-accion="publicar"]').textContent = 'Publicar';
      b.remove();
      aviso('Despublicada: vuelve a ser un borrador');
    } else if (a === 'pedir-borrar') {
      $('confirmar').innerHTML = `
        <div class="psn-confirmar" role="group" aria-label="Confirmar">
          <p>¿Borrar la entrada? No se puede deshacer.</p>
          <div class="psn-confirmar-botones">
            <button type="button" class="boton-secundario neutro" data-accion="no-borrar">Cancelar</button>
            <button type="button" class="boton-secundario peligro" data-accion="borrar">Sí, borrar</button>
          </div>
        </div>`;
    } else if (a === 'no-borrar') $('confirmar').innerHTML = '';
    else if (a === 'borrar') {
      clearTimeout(relojBD);
      borrarLocal(id);
      await datos.borrarEntrada(id, aviso);
      aviso('Entrada borrada');
      volver(`#columna/${col.id}`);
    }
  });

  // ---- Cargar: la base y, si es más reciente, lo guardado en el móvil ----------
  const poner = () => {
    titulo.value = s.titulo; subtitulo.value = s.subtitulo; cuerpo.value = s.cuerpo;
    for (const t of [titulo, subtitulo, cuerpo]) crecer(t);
    pintarEstado();
  };
  const loc = leerLocal(id);
  if (nueva) {
    poner();
    setTimeout(() => titulo.focus(), 50);
  } else {
    pintarEstado();
    datos.cuerpoDe(id).then((txt) => {
      s.cuerpo = txt;
      s.cargando = false;
      const enBD = new Date(previa.actualizado_en).getTime();
      if (loc && loc.ts > enBD && (loc.cuerpo !== txt || loc.titulo !== s.titulo)) {
        Object.assign(s, { titulo: loc.titulo, subtitulo: loc.subtitulo ?? '', cuerpo: loc.cuerpo });
        s.guardado = 'escribiendo';
        aviso('Recuperado lo último que escribiste en este móvil');
      } else s.guardado = s.estado === 'publicada' ? 'publicada' : 'guardado';
      poner();
    }).catch(() => {
      s.cargando = false;
      if (loc) { Object.assign(s, { titulo: loc.titulo, subtitulo: loc.subtitulo ?? '', cuerpo: loc.cuerpo }); s.guardado = 'error'; }
      poner();
    });
  }

  return () => {
    clearTimeout(relojBD);
    vv?.removeEventListener('resize', colocarBarra);
    vv?.removeEventListener('scroll', colocarBarra);
  };
}
