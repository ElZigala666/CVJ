// Editor de una entrada de columna (#escribir/{id} o #escribir/nueva[/juego|coleccion|saga/{id}]).
// A pantalla completa y pensado para textos muy largos en el móvil: título, subtítulo y
// cuerpo en Markdown ligero, con una barra de formato pegada encima del teclado y
// "Vista previa" idéntica a la lectura final.
//  - El cursor siempre queda a la vista, con margen, por encima del teclado y de la barra
//    (visualViewport: Android Chrome e iPhone Safari).
//  - El borrador se guarda solo: en el móvil al momento y en la base cada pocos segundos,
//    al salir (también con el gesto de atrás) y al cerrar o cambiar de app. Si ya está
//    publicada, en la base solo al pulsar "Actualizar".
//  - Formato, pegar e imágenes pasan por el historial del navegador: "Deshacer" funciona.
//  - "Insertar" (spoiler, juego, mención, capturas, cita destacada, veredicto, encuesta,
//    portada) y los atajos "#" (juego) y "@" (persona): js/columnas-insertar.js. Todo acaba en
//    texto; la vista previa usa el mismo markdown() que la lectura.
//  - #escribir/nueva/replica/{id}: réplica a la entrada de otro columnista.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import { esc, portada, aviso, avatar } from '../ui.js';
import { volver, corregirRuta, reemplazarRuta } from '../navegacion.js';
import { markdown, palabras, textoLectura, imagenRedimensionada, logoColumna, limpiarTexto, MAX_LINEAS_EN_BLANCO, nombreColumna } from '../columnas-ui.js';
import * as ins from '../columnas-insertar.js';
import { tamLetra, cabeceraEntrada, clicContenido } from './lectura.js';

const MAX = 100000;
const CADA_BD_MS = 4000;
const CADA_LOCAL_MS = 400;
const clave = (id) => `cvj.borrador.${id}`;
const leerLocal = (id) => { try { return JSON.parse(localStorage.getItem(clave(id)) || 'null'); } catch { return null; } };
const guardarLocal = (id, x) => { try { localStorage.setItem(clave(id), JSON.stringify(x)); } catch { /* lleno o privado */ } };
const borrarLocal = (id) => { try { localStorage.removeItem(clave(id)); } catch { /* nada */ } };
const conFieldSizing = !!window.CSS?.supports?.('field-sizing', 'content');
const esSalto = (e) => e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph' || (e.inputType === 'insertText' && e.data === '\n');

// Estilos que deciden dónde se corta cada línea (para saber dónde está el cursor).
const ESTILOS_ESPEJO = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
  'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'fontKerning',
  'fontFeatureSettings', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent', 'tabSize', 'wordBreak', 'overflowWrap'];

/**
 * Si se abre (o se recarga) el editor antes de que lleguen los datos, se espera a ellos
 * en vez de decir "Solo para columnistas" o "No se encuentra esa entrada".
 */
export function render(el, ctx) {
  const yo = usuarioActual();
  const falta = () => {
    if (!yo || !datos.columnaDe(yo.id)) return true;
    const p = ctx.params[0];
    return p !== 'nueva' && !datos.entrada(p) && !leerLocal(p);
  };
  if (!falta() || datos.datosFrescos()) return editor(el, ctx);
  el.innerHTML = '<div class="vacio"><p class="vacio-texto">Cargando…</p></div>';
  let hecho = false;
  let limpiar = null;
  const probar = () => {
    if (hecho || (falta() && !datos.datosFrescos())) return;
    hecho = true;
    quitar();
    clearInterval(reloj);
    limpiar = editor(el, ctx) ?? null;
  };
  const quitar = datos.suscribir(probar);
  const reloj = setInterval(probar, 400);
  return () => { hecho = true; quitar(); clearInterval(reloj); limpiar?.(); };
}

/** "Réplica a «título», de Fulano" (texto con HTML escapado). */
function textoReplica(origId) {
  const o = datos.entrada(origId);
  if (!o) return 'Réplica a otra entrada';
  return `Réplica a <strong>«${esc(o.titulo || 'Sin título')}»</strong>, de ${esc(datos.usuario(o.usuario_id)?.nombre ?? '')}`;
}

function editor(el, { params }) {
  const yo = usuarioActual();
  const col = yo ? datos.columnaDe(yo.id) : null;
  if (!col) {
    el.innerHTML = `<div class="vacio"><h2 class="vacio-titulo">Solo para columnistas</h2><p class="vacio-texto">El admin da las columnas en Ajustes → Gestionar grupo.</p><a class="boton-secundario" href="#inicio">Volver</a></div>`;
    return;
  }
  // Entrada nueva (con su tema), una que ya existe o una nueva que solo está en este móvil
  // (se empezó, y se volvió a ella antes de que llegara a la base).
  const nueva = params[0] === 'nueva';
  const id = nueva ? crypto.randomUUID() : params[0];
  const previa = nueva ? null : datos.entrada(id);
  const loc = nueva ? null : leerLocal(id);
  const soloLocal = !nueva && !previa && loc?.usuario_id === yo.id;
  if (!nueva && !soloLocal && (!previa || previa.usuario_id !== yo.id)) {
    el.innerHTML = `<div class="vacio"><h2 class="vacio-titulo">No se encuentra esa entrada</h2><a class="boton-secundario" href="#inicio">Volver</a></div>`;
    return;
  }
  // Réplica: a la entrada de otro columnista (mismo tema que la original).
  const original = nueva && params[1] === 'replica' ? datos.entrada(params[2]) : null;
  const tema = previa
    ? { juego_id: previa.juego_id, coleccion_id: previa.coleccion_id, saga_id: previa.saga_id }
    : soloLocal ? { juego_id: null, coleccion_id: null, saga_id: null, ...loc.tema }
      : original ? { juego_id: original.juego_id, coleccion_id: original.coleccion_id, saga_id: original.saga_id }
        : { juego_id: params[1] === 'juego' ? Number(params[2]) : null, coleccion_id: params[1] === 'coleccion' ? params[2] : null, saga_id: params[1] === 'saga' ? params[2] : null };
  const replicaDe = previa?.replica_de ?? (soloLocal ? loc.replica_de : null) ?? original?.id ?? null;
  const s = {
    titulo: previa?.titulo ?? '', subtitulo: previa?.subtitulo ?? '', cuerpo: '',
    portada: previa?.portada ?? (soloLocal ? loc.portada : null) ?? null,
    estado: previa?.estado ?? 'borrador', vista: false, guardado: 'nuevo', cargando: !!previa, fallo: false,
  };
  const spoilersPrevia = new Set();
  // Versiones: cada cambio suma uno; se sabe qué hay ya en el móvil y qué en la base.
  let cambios = 0;
  let enLocal = 0;
  let enBase = 0;
  let guardandoP = null;   // guardado en la base en marcha
  let terminado = false;   // borrada o publicada: al salir no se vuelve a guardar
  let rutaFijada = !nueva;
  let relojBD = null;
  let relojLocal = null;

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
      ${replicaDe ? `<div class="editor-tema editor-replica">${icono('comentario', { tam: 18, color: 'var(--acento)', trazo: 'var(--fondo)' })}<span>${textoReplica(replicaDe)}</span></div>` : ''}
      <div class="editor-portada" data-ref="portada"></div>
      <div data-ref="escribir">
        <textarea class="editor-titulo" data-ref="titulo" rows="1" maxlength="200" placeholder="Título" enterkeyhint="next"></textarea>
        <textarea class="editor-subtitulo" data-ref="subtitulo" rows="1" maxlength="300" placeholder="Subtítulo (opcional)" enterkeyhint="next"></textarea>
        <textarea class="editor-cuerpo" data-ref="cuerpo" maxlength="${MAX}" autocapitalize="sentences" spellcheck="true" placeholder="Escribe aquí. Sin prisa: se guarda solo.&#10;&#10;**negrita**, *cursiva*, ## intertítulo, > cita, - lista"></textarea>
      </div>
      <div class="editor-previa" data-ref="vista-previa" style="${col.color ? `--col:${esc(col.color)}` : ''}" hidden></div>
      <div data-ref="oferta"></div>
      <p class="editor-cuenta" data-ref="cuenta"></p>
      ${s.estado === 'publicada' || !nueva ? `
        <div class="editor-mas">
          ${s.estado === 'publicada' ? '<button type="button" class="enlace-discreto" data-accion="despublicar">Despublicar (vuelve a borrador)</button>' : ''}
          <button type="button" class="enlace-discreto peligro-texto" data-accion="pedir-borrar">Borrar esta entrada</button>
          <div data-ref="confirmar"></div>
        </div>` : ''}
      <div class="editor-formato" data-ref="formato" role="toolbar" aria-label="Formato">
        <button type="button" data-f="deshacer" aria-label="Deshacer">${icono('deshacer', { tam: 20 })}</button>
        <button type="button" data-f="rehacer" aria-label="Rehacer">${icono('rehacer', { tam: 20 })}</button>
        <span class="editor-formato-sep" aria-hidden="true"></span>
        <button type="button" class="editor-insertar" data-f="insertar" aria-label="Insertar">${icono('mas', { tam: 18 })}<span>Insertar</span></button>
        <button type="button" data-f="negrita" aria-label="Negrita"><b>B</b></button>
        <button type="button" data-f="cursiva" aria-label="Cursiva"><i>I</i></button>
        <button type="button" data-f="titulo" aria-label="Intertítulo">H</button>
        <button type="button" data-f="cita" aria-label="Cita">“ ”</button>
        <button type="button" data-f="lista" aria-label="Lista">•</button>
        <button type="button" data-f="numerada" aria-label="Lista numerada">1.</button>
        <label aria-label="Imagen">${icono('imagen', { tam: 20, trazo: 'var(--superficie)' })}<input type="file" accept="image/*" data-ref="imagen" hidden></label>
        <div class="editor-sug" data-ref="sug" role="listbox" aria-label="Sugerencias" hidden></div>
      </div>
    </section>`;
  const $ = (r) => el.querySelector(`[data-ref="${r}"]`);
  const seccion = el.querySelector('.editor');
  const cabecera = el.querySelector('.editor-barra');
  const barra = $('formato');
  const titulo = $('titulo');
  const subtitulo = $('subtitulo');
  const cuerpo = $('cuerpo');
  const campos = [titulo, subtitulo, cuerpo];
  const hayTexto = () => !!(s.titulo.trim() || s.cuerpo.trim());

  // Altura según el texto. Sin field-sizing se mide con height:auto, y la página no
  // puede encoger mientras tanto: el navegador recortaría el scroll y el texto saltaría.
  const caja = $('escribir');
  const crecer = (t) => {
    if (conFieldSizing) return;
    caja.style.minHeight = `${caja.offsetHeight}px`;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
    caja.style.minHeight = '';
  };

  const pintarEstado = () => {
    const txt = s.cargando ? 'Cargando…' : s.fallo ? 'No se ha podido cargar' : {
      nuevo: '',
      escribiendo: s.estado === 'publicada' ? 'Sin publicar: pulsa Actualizar' : 'Guardado en el móvil',
      guardando: 'Guardando…',
      guardado: 'Borrador guardado',
      publicada: 'Publicada',
      error: 'Sin red: guardado en el móvil',
    }[s.guardado] ?? '';
    $('estado').textContent = txt;
    pintarOferta();
    const n = palabras(s.cuerpo);
    $('cuenta').innerHTML = s.fallo
      ? 'Revisa la conexión. <button type="button" class="enlace-discreto" data-accion="reintentar">Reintentar</button>'
      : `${n.toLocaleString('es-ES')} palabras · ${textoLectura(n)}`;
  };

  // ---- Guardar --------------------------------------------------------------------
  const guardarYa = () => {
    clearTimeout(relojLocal);
    if (cambios !== enLocal && !terminado) {
      guardarLocal(id, { titulo: s.titulo, subtitulo: s.subtitulo, cuerpo: s.cuerpo, portada: s.portada, replica_de: replicaDe, ts: Date.now(), tema, usuario_id: yo.id });
      enLocal = cambios;
    }
    pintarEstado();
  };

  const aBD = (estadoNuevo = null) => {
    if (guardandoP) return guardandoP.then(() => aBD(estadoNuevo)); // después del que va
    const version = cambios;
    s.guardado = 'guardando'; pintarEstado();
    guardandoP = datos.guardarEntrada({
      id, columna_id: col.id, usuario_id: yo.id, ...tema, replica_de: replicaDe, portada: s.portada,
      titulo: limpiarTexto(s.titulo, { unaLinea: true }), subtitulo: limpiarTexto(s.subtitulo, { unaLinea: true }),
      cuerpo: limpiarTexto(s.cuerpo), palabras: palabras(s.cuerpo),
      estado: estadoNuevo ?? s.estado,
    }).then(() => {
      if (estadoNuevo) s.estado = estadoNuevo;
      enBase = Math.max(enBase, version);
      if (!rutaFijada) { corregirRuta(`#escribir/${id}`); rutaFijada = true; }
      s.guardado = cambios !== version ? 'escribiendo' : s.estado === 'publicada' ? 'publicada' : 'guardado';
      return true;
    }).catch((e) => {
      console.warn('[columna]', e?.message || e);
      s.guardado = 'error';
      return false;
    }).finally(() => { guardandoP = null; pintarEstado(); });
    return guardandoP;
  };
  const pendienteEnBase = () => !terminado && !s.cargando && !s.fallo && s.estado !== 'publicada' && hayTexto() && cambios !== enBase;

  const alEscribir = () => {
    s.titulo = titulo.value; s.subtitulo = subtitulo.value; s.cuerpo = cuerpo.value;
    cambios += 1;
    s.guardado = 'escribiendo';
    // Nueva: la ruta pasa a ser la de esta entrada (recargar o volver a ella la recupera).
    if (!rutaFijada) { rutaFijada = true; corregirRuta(`#escribir/${id}`); guardarYa(); }
    clearTimeout(relojLocal);
    relojLocal = setTimeout(guardarYa, CADA_LOCAL_MS);
    clearTimeout(relojBD);
    // Si ya está publicada, la base solo cambia al pulsar "Actualizar".
    if (pendienteEnBase()) relojBD = setTimeout(() => aBD(), CADA_BD_MS);
  };

  // ---- El cursor siempre a la vista -------------------------------------------------
  const espejo = document.createElement('div');
  espejo.setAttribute('aria-hidden', 'true');
  /** Posición del cursor en pantalla (coordenadas de la ventana). */
  const cursorEn = (t) => {
    const cs = getComputedStyle(t);
    for (const k of ESTILOS_ESPEJO) espejo.style[k] = cs[k];
    Object.assign(espejo.style, { position: 'absolute', top: '0', left: '-9999px', visibility: 'hidden', whiteSpace: 'pre-wrap', height: 'auto', overflow: 'hidden' });
    espejo.textContent = t.value.slice(0, t.selectionEnd);
    const marca = document.createElement('span');
    marca.textContent = '\u200b';
    espejo.appendChild(marca);
    document.body.appendChild(espejo);
    const y = t.getBoundingClientRect().top + t.clientTop + marca.offsetTop - t.scrollTop;
    const alto = marca.offsetHeight || parseFloat(cs.lineHeight) || 32;
    espejo.remove();
    return { arriba: y, abajo: y + alto, alto };
  };
  const vv = window.visualViewport;
  let pedidoVer = 0;
  const verCursor = () => {
    cancelAnimationFrame(pedidoVer);
    pedidoVer = requestAnimationFrame(() => {
      const t = document.activeElement;
      if (s.vista || !campos.includes(t) || t.selectionStart !== t.selectionEnd) return; // seleccionando: no se mueve
      const c = cursorEn(t);
      const vTop = vv ? vv.offsetTop : 0;
      const vFin = vTop + (vv ? vv.height : window.innerHeight);
      const tope = Math.max(vTop, cabecera.getBoundingClientRect().bottom) + 12;
      const suelo = Math.min(vFin, barra.hidden ? vFin : barra.getBoundingClientRect().top) - Math.round(c.alto * 1.2);
      let d = 0;
      if (c.abajo > suelo) d = c.abajo - suelo;
      else if (c.arriba < tope) d = c.arriba - tope;
      if (Math.abs(d) > 1) window.scrollBy(0, d);
    });
  };

  // La barra de formato, encima del teclado; con el teclado abierto la página tiene sitio
  // de sobra abajo para poder subir hasta la última línea.
  let teclado = 0;
  const colocarBarra = () => {
    if (!vv) return;
    teclado = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    barra.style.transform = teclado ? `translateY(${-teclado}px)` : '';
    barra.classList.toggle('con-teclado', teclado > 80);
    seccion.style.paddingBottom = teclado > 80 ? `${teclado + 160}px` : '';
  };
  let altoAntes = vv?.height ?? window.innerHeight;
  let relojVer = null;
  const alCambiarVista = () => {
    colocarBarra();
    // Se abre el teclado (o rota la pantalla): el cursor, a la vista. No con la barra
    // del navegador que se esconde al bajar (unos 60 px): se respeta lo que lee el usuario.
    const alto = vv.height;
    const encoge = altoAntes - alto > 120;
    altoAntes = alto;
    if (encoge) { verCursor(); clearTimeout(relojVer); relojVer = setTimeout(verCursor, 350); }
  };
  const alSeleccionar = () => { if (campos.includes(document.activeElement)) verCursor(); };
  vv?.addEventListener('resize', alCambiarVista);
  vv?.addEventListener('scroll', colocarBarra);
  document.addEventListener('selectionchange', alSeleccionar);
  colocarBarra();

  // ---- Escribir ---------------------------------------------------------------------
  for (const t of campos) {
    t.addEventListener('input', () => { crecer(t); alEscribir(); verCursor(); });
    // Pegar desde otra app: solo texto, sin espacios raros ni caracteres invisibles.
    t.addEventListener('paste', (e) => {
      const txt = e.clipboardData?.getData('text/plain');
      if (!txt) return;
      const limpio = limpiarTexto(txt, { unaLinea: t !== cuerpo });
      if (limpio === txt) return; // nada que limpiar: el pegado normal
      e.preventDefault();
      insertar(t, limpio, t.selectionStart, t.selectionEnd);
    });
  }
  // Intro en el título y el subtítulo: al campo siguiente (no hay saltos de línea en ellos).
  const siguiente = new Map([[titulo, subtitulo], [subtitulo, cuerpo]]);
  for (const [t, sig] of siguiente) {
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sig.focus(); } });
    t.addEventListener('beforeinput', (e) => { if (esSalto(e)) { e.preventDefault(); sig.focus(); } });
  }
  // Líneas en blanco seguidas: como mucho MAX_LINEAS_EN_BLANCO.
  cuerpo.addEventListener('beforeinput', (e) => {
    if (!esSalto(e)) return;
    const { value: v, selectionStart: a, selectionEnd: b } = cuerpo;
    const antes = /\n*$/.exec(v.slice(Math.max(0, a - 12), a))[0].length;
    const despues = /^\n*/.exec(v.slice(b, b + 12))[0].length;
    if (antes + despues >= MAX_LINEAS_EN_BLANCO + 1) e.preventDefault();
  });

  /** Escribe texto como si se tecleara (queda en el historial de deshacer). */
  const insertar = (t, texto, a, b) => {
    if (document.activeElement !== t) t.focus({ preventScroll: true });
    t.setSelectionRange(a, b);
    let ok = false;
    try { ok = document.execCommand('insertText', false, texto); } catch { ok = false; }
    if (!ok) {
      t.setRangeText(texto, a, b, 'end');
      t.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  // ---- Formato: envolver la selección o poner (o quitar) un prefijo a las líneas ------
  const envolver = (marca) => {
    const { selectionStart: a, selectionEnd: b, value: v } = cuerpo;
    const sel = v.slice(a, b);
    const otra = (i) => v[i] === '*' || v[i] === '_';
    // Ya tiene esa marca: se quita.
    if (sel && v.slice(a - marca.length, a) === marca && v.slice(b, b + marca.length) === marca
      && !otra(a - marca.length - 1) && !otra(b + marca.length)) {
      insertar(cuerpo, sel, a - marca.length, b + marca.length);
      cuerpo.setSelectionRange(a - marca.length, b - marca.length);
      return;
    }
    if (!sel) {
      insertar(cuerpo, `${marca}texto${marca}`, a, b);
      cuerpo.setSelectionRange(a + marca.length, a + marca.length + 5);
      return;
    }
    // Cada línea por separado y sin los espacios de los bordes (si no, no se lee como formato).
    const texto = sel.split('\n').map((l) => {
      const m = l.match(/^(\s*)(.*?)(\s*)$/);
      return m[2] ? `${m[1]}${marca}${m[2]}${marca}${m[3]}` : l;
    }).join('\n');
    insertar(cuerpo, texto, a, b);
    cuerpo.setSelectionRange(a, a + texto.length);
  };
  const PREFIJOS = {
    titulo: { p: '## ', ya: /^#{1,3}\s+/ },
    cita: { p: '> ', ya: /^>\s?/ },
    lista: { p: '- ', ya: /^[-*•]\s+/ },
    numerada: { p: null, ya: /^\d{1,3}[.)]\s+/ },
  };
  const CUALQUIERA = /^(#{1,3}\s+|>\s?|[-*•]\s+|\d{1,3}[.)]\s+)/;
  const prefijo = (tipo) => {
    const { p, ya } = PREFIJOS[tipo];
    const v = cuerpo.value;
    const a = v.lastIndexOf('\n', cuerpo.selectionStart - 1) + 1;
    let b = v.indexOf('\n', cuerpo.selectionEnd);
    if (b < 0) b = v.length;
    const lineas = v.slice(a, b).split('\n');
    const llenas = lineas.filter((l) => l.trim());
    const quitar = llenas.length > 0 && llenas.every((l) => ya.test(l)); // pulsar otra vez lo quita
    let n = 0;
    const texto = lineas.map((l) => {
      if (!l.trim() && lineas.length > 1) return l;
      const limpia = l.replace(CUALQUIERA, '');
      if (quitar) return limpia;
      n += 1;
      return (p ?? `${n}. `) + limpia;
    }).join('\n');
    insertar(cuerpo, texto, a, b);
    cuerpo.setSelectionRange(a + texto.length, a + texto.length);
  };
  let ultimoCampo = cuerpo;
  for (const t of campos) t.addEventListener('focus', () => { ultimoCampo = t; });
  barra.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-f]')) e.preventDefault(); }); // no perder el foco (ni el teclado)
  barra.addEventListener('mousedown', (e) => { if (e.target.closest('[data-f]')) e.preventDefault(); });
  barra.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b || cuerpo.readOnly) return;
    const f = b.dataset.f;
    if (f === 'deshacer' || f === 'rehacer') {
      if (document.activeElement !== ultimoCampo) ultimoCampo.focus({ preventScroll: true });
      try { document.execCommand(f === 'deshacer' ? 'undo' : 'redo'); } catch { /* sin historial */ }
      verCursor();
      return;
    }
    if (f === 'insertar') { abrirInsertar(); return; }
    if (document.activeElement !== cuerpo) cuerpo.focus({ preventScroll: true });
    if (f === 'negrita') envolver('**');
    else if (f === 'cursiva') envolver('*');
    else prefijo(f);
    verCursor();
  });
  // ---- Insertar ---------------------------------------------------------------------
  // Dónde estaba el cursor al abrir una hoja (se pierde el foco al abrirla).
  let marca = { a: 0, b: 0 };
  const recordar = () => { marca = { a: cuerpo.selectionStart ?? cuerpo.value.length, b: cuerpo.selectionEnd ?? cuerpo.value.length }; };
  /** Un bloque en sus propias líneas, separado por una línea en blanco (sin huecos de más). */
  const insertarBloque = (texto, a = marca.a, b = marca.b, { seleccionar = null } = {}) => {
    let v = cuerpo.value;
    // Los bloques ::: no se anidan: si el cursor está dentro de uno, va justo después.
    if (texto.startsWith(':::')) {
      const lineas = v.slice(0, a).split('
');
      let abierto = false;
      for (const l of lineas) { if (/^:::\S/.test(l.trim())) abierto = true; else if (/^:::\s*$/.test(l)) abierto = false; }
      if (abierto) {
        const cierre = v.slice(a).search(/^:::\s*$/m);
        a = b = cierre < 0 ? v.length : a + cierre + v.slice(a + cierre).indexOf(':::') + 3;
      }
    }
    v = cuerpo.value;
    const antes = /\n*$/.exec(v.slice(0, a))[0].length;
    const despues = /^\n*/.exec(v.slice(b))[0].length;
    const pre = a > 0 ? '\n'.repeat(Math.max(0, 2 - antes)) : '';
    const post = '\n'.repeat(Math.max(0, 2 - despues));
    insertar(cuerpo, `${pre}${texto}${post}`, a, b);
    if (seleccionar) {
      const i = a + pre.length + texto.indexOf(seleccionar);
      cuerpo.setSelectionRange(i, i + seleccionar.length);
    }
    verCursor();
  };
  const alFinal = (texto) => insertarBloque(texto, cuerpo.value.length, cuerpo.value.length);
  const notaMia = () => (tema.juego_id ? datos.miValoracion(yo.id, tema.juego_id)?.nota ?? null : null);
  const abrirVeredicto = () => ins.hojaVeredicto({ notaInicial: notaMia(), alHecho: alFinal });
  const abrirInsertar = () => {
    recordar();
    document.activeElement?.blur?.();
    ins.menuInsertar((tipo) => {
      const v = cuerpo.value;
      const sel = v.slice(marca.a, marca.b);
      if (tipo === 'spoiler') {
        const dentro = sel.trim() || 'Lo que pasa al final';
        insertarBloque(`:::spoiler\n${dentro}\n:::`, marca.a, marca.b, { seleccionar: sel.trim() ? null : dentro });
      } else if (tipo === 'destacada') {
        const frase = sel.trim().replace(/\s*\n\s*/g, ' ') || 'Una frase que se quede';
        insertarBloque(`>> ${frase}`, marca.a, marca.b, { seleccionar: sel.trim() ? null : frase });
      } else if (tipo === 'juego') ins.elegirJuego({ alElegir: (j) => insertarBloque(`[[juego:${j.igdb_id}]]`) });
      else if (tipo === 'capturas') ins.elegirImagenJuego({ juegoId: tema.juego_id, alElegir: (url) => insertarBloque(`![](${url})`) });
      else if (tipo === 'mencion') ins.elegirPersona({ sinId: yo.id, alElegir: (u) => { if (u) { insertar(cuerpo, `@${u.nombre} `, marca.a, marca.b); verCursor(); } } });
      else if (tipo === 'veredicto') abrirVeredicto();
      else if (tipo === 'encuesta') {
        if (/^:::encuesta\s*$/m.test(cuerpo.value)) { aviso('Ya hay una encuesta: solo se vota una por entrada'); return; }
        ins.hojaEncuesta({ alHecho: alFinal });
      } else if (tipo === 'portada') abrirPortada();
    });
  };

  // ---- Portada de la entrada --------------------------------------------------------
  const pintarPortada = () => {
    $('portada').innerHTML = s.portada
      ? `<button type="button" class="editor-portada-img" data-accion="portada"><img src="${esc(s.portada)}" alt=""><span>Cambiar portada</span></button>`
      : `<button type="button" class="enlace-discreto editor-portada-poner" data-accion="portada">${icono('cabecera', { tam: 18, color: 'currentColor', trazo: 'var(--fondo)' })}<span>Añadir portada</span></button>`;
  };
  const abrirPortada = () => ins.hojaPortada({
    juegoId: tema.juego_id, entradaId: id, actual: s.portada,
    alElegir: (url) => { s.portada = url; pintarPortada(); alEscribir(); },
  });

  // ---- Veredicto: si la entrada va de un juego, se ofrece al final ---------------------
  const pintarOferta = () => {
    const o = $('oferta');
    if (!o) return;
    const ver = tema.juego_id && !s.vista && palabras(s.cuerpo) >= 40 && !/^:::veredicto\s*$/m.test(s.cuerpo);
    const html = ver ? `
      <div class="editor-oferta">
        ${icono('trofeo', { tam: 20, color: 'var(--acento)', trazo: 'var(--fondo)' })}
        <span><strong>¿Le pones veredicto?</strong><small>Nota, lo bueno, lo malo y una frase, al final.</small></span>
        <button type="button" class="boton-secundario boton-pequeno" data-accion="veredicto">Añadir</button>
      </div>` : '';
    if (o.__html !== html) { o.innerHTML = html; o.__html = html; }
  };

  // ---- "#" busca un juego y "@" a alguien del grupo -----------------------------------
  const sug = $('sug');
  let ficha = null; // { tipo: '#'|'@', a, b, items }
  let relojSug = null;
  let controlSug = null;
  const cerrarSug = () => { ficha = null; sug.hidden = true; sug.innerHTML = ''; clearTimeout(relojSug); controlSug?.abort(); };
  const pintarSug = () => {
    if (!ficha?.items.length) { sug.hidden = true; return; }
    sug.hidden = false;
    sug.innerHTML = ficha.items.map((x, i) => (ficha.tipo === '#'
      ? `<button type="button" class="editor-sug-item" data-sug="${i}">${portada(x, { clase: 'portada-mini' })}<span>${esc(x.nombre)}${x.anio ? ` <small>${x.anio}</small>` : ''}</span></button>`
      : `<button type="button" class="editor-sug-item" data-sug="${i}">${avatar(x, 22)}<span>${esc(x.nombre)}</span></button>`)).join('');
  };
  const revisarSug = () => {
    const pos = cuerpo.selectionStart;
    if (pos !== cuerpo.selectionEnd || s.vista) { cerrarSug(); return; }
    const antes = cuerpo.value.slice(Math.max(0, pos - 40), pos);
    const m = antes.match(/(^|[\s(«"])([#@])([^\s#@]{1,30})$/u);
    if (!m) { cerrarSug(); return; }
    const tipo = m[2];
    const q = m[3];
    const a = pos - q.length - 1;
    if (tipo === '@') {
      const items = ins.personas(q, yo.id);
      ficha = { tipo, a, b: pos, items };
      pintarSug();
      return;
    }
    if (q.length < 2) { cerrarSug(); return; }
    ficha = { tipo, a, b: pos, items: ins.juegosLocales(q, 5) };
    pintarSug();
    clearTimeout(relojSug);
    controlSug?.abort();
    relojSug = setTimeout(async () => {
      controlSug = new AbortController();
      try {
        const { buscarJuegos } = await import('../igdb.js');
        const fuera = await buscarJuegos(q, controlSug.signal);
        if (!ficha || ficha.a !== a) return;
        const ya = new Set(ficha.items.map((j) => Number(j.igdb_id)));
        ficha.items = [...ficha.items, ...fuera.filter((j) => !ya.has(Number(j.igdb_id)) && !ya.has(datos.canonico(j.igdb_id)))].slice(0, 6);
        pintarSug();
      } catch { /* sin red: lo de aquí */ }
    }, 450);
  };
  sug.addEventListener('pointerdown', (e) => e.preventDefault()); // no perder el foco (ni el teclado)
  sug.addEventListener('mousedown', (e) => e.preventDefault());
  sug.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sug]');
    if (!b || !ficha) return;
    const { tipo, a, b: fin, items } = ficha;
    const x = items[Number(b.dataset.sug)];
    cerrarSug();
    if (tipo === '@') { insertar(cuerpo, `@${x.nombre} `, a, fin); verCursor(); return; }
    await ins.asegurarJuego(x);
    insertarBloque(`[[juego:${x.igdb_id}]]`, a, fin);
  });
  cuerpo.addEventListener('input', revisarSug);
  cuerpo.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== cuerpo) cerrarSug(); }, 150));

  $('imagen').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const pos = cuerpo.selectionStart ?? cuerpo.value.length;
    aviso('Subiendo la imagen…');
    try {
      const blob = await imagenRedimensionada(f, 1600);
      const url = await datos.subirImagenColumna(`entradas/${id}/${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, blob);
      // En su propia línea, separada por una línea en blanco (sin sumar huecos de más).
      const v = cuerpo.value;
      const antes = /\n*$/.exec(v.slice(0, pos))[0].length;
      const despues = /^\n*/.exec(v.slice(pos))[0].length;
      const texto = `${pos > 0 ? '\n'.repeat(Math.max(0, 2 - antes)) : ''}![](${url})${'\n'.repeat(Math.max(0, 2 - despues))}`;
      insertar(cuerpo, texto, pos, pos);
      aviso('Imagen añadida (puedes escribir un pie entre los corchetes)');
    } catch (err) {
      console.warn('[imagen]', err?.message || err);
      aviso('No se ha podido subir la imagen');
    }
  });

  // ---- Vista previa: exactamente como se leerá ---------------------------------------
  let scrollEscribiendo = 0;
  const htmlPrevia = () => {
    const e = {
      id, usuario_id: yo.id, ...tema, replica_de: replicaDe, portada: s.portada, estado: 'previa',
      titulo: limpiarTexto(s.titulo, { unaLinea: true }), subtitulo: limpiarTexto(s.subtitulo.trim(), { unaLinea: true }) || null,
      palabras: palabras(s.cuerpo), publicada_en: null, actualizado_en: new Date().toISOString(),
    };
    return `
      <article class="lectura-articulo tam-${tamLetra()}">
        <p class="lectura-borrador">Vista previa</p>
        ${cabeceraEntrada(e)}
        <div class="lectura-cuerpo">${markdown(limpiarTexto(s.cuerpo), { autorId: yo.id, previa: true, spoilers: spoilersPrevia })}</div>
      </article>`;
  };
  const cambiarVista = (ver) => {
    s.vista = ver;
    const b = el.querySelector('[data-accion="vista"]');
    b.setAttribute('aria-pressed', String(ver));
    b.textContent = ver ? 'Seguir escribiendo' : 'Vista previa';
    if (ver) { scrollEscribiendo = window.scrollY; document.activeElement?.blur?.(); cerrarSug(); }
    $('escribir').hidden = ver;
    barra.hidden = ver;
    $('cuenta').hidden = ver;
    const p = $('vista-previa');
    p.hidden = !ver;
    p.innerHTML = ver ? htmlPrevia() : '';
    if (!ver) for (const t of campos) crecer(t);
    pintarOferta();
    window.scrollTo(0, ver ? 0 : scrollEscribiendo);
  };

  // ---- Acciones -----------------------------------------------------------------
  const salir = async () => {
    guardarYa();
    clearTimeout(relojBD);
    if (pendienteEnBase()) await aBD();
    terminado = true;
    volver(col ? `#columna/${col.id}` : '#inicio');
  };
  el.addEventListener('click', async (e) => {
    if (s.vista && clicContenido(e, $('vista-previa'), { spoilers: spoilersPrevia })) return;
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const a = b.dataset.accion;
    if (a === 'portada') { recordar(); abrirPortada(); return; }
    if (a === 'veredicto') { abrirVeredicto(); return; }
    if (a === 'cerrar') salir();
    else if (a === 'vista') cambiarVista(!s.vista);
    else if (a === 'reintentar') cargar();
    else if (a === 'publicar') {
      if (s.cargando || s.fallo) return;
      if (!s.titulo.trim()) { if (s.vista) cambiarVista(false); aviso('Ponle un título antes de publicar'); titulo.focus(); return; }
      if (!s.cuerpo.trim()) { if (s.vista) cambiarVista(false); aviso('Todavía no has escrito nada'); cuerpo.focus(); return; }
      guardarYa();
      clearTimeout(relojBD);
      b.disabled = true;
      const ok = await aBD('publicada');
      b.disabled = false;
      if (!ok) { aviso('No se ha podido publicar. Lo tienes guardado en el móvil.'); return; }
      terminado = true;
      borrarLocal(id);
      aviso(previa?.estado === 'publicada' ? 'Actualizada' : `Publicada en ${col.nombre}`);
      reemplazarRuta(`#entrada/${id}`);
    } else if (a === 'despublicar') {
      await datos.despublicarEntrada(id, aviso);
      s.estado = 'borrador';
      el.querySelector('[data-accion="publicar"]').textContent = 'Publicar';
      b.remove();
      if (pendienteEnBase()) aBD();
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
      clearTimeout(relojLocal);
      terminado = true;
      if (guardandoP) await guardandoP; // que un guardado en marcha no la vuelva a crear
      borrarLocal(id);
      await datos.borrarEntrada(id, aviso);
      aviso('Entrada borrada');
      volver(`#columna/${col.id}`);
    }
  });

  // Cerrar la app, cambiar de app o apagar la pantalla: a salvo en el móvil y en la base.
  const alOcultar = () => {
    if (document.visibilityState !== 'hidden') return;
    guardarYa();
    if (pendienteEnBase()) { clearTimeout(relojBD); aBD(); }
  };
  document.addEventListener('visibilitychange', alOcultar);
  window.addEventListener('pagehide', guardarYa);

  // ---- Cargar: la base y, si es más reciente, lo guardado en el móvil ----------
  const poner = () => {
    titulo.value = s.titulo; subtitulo.value = s.subtitulo; cuerpo.value = s.cuerpo;
    pintarPortada();
    for (const t of campos) { t.readOnly = s.cargando || s.fallo; crecer(t); }
    pintarEstado();
  };
  const usarLocal = (l) => {
    Object.assign(s, { titulo: l.titulo ?? '', subtitulo: l.subtitulo ?? '', cuerpo: l.cuerpo ?? '' });
    if ('portada' in l) s.portada = l.portada ?? null;
    cambios = enLocal = 1; // pendiente de llegar a la base
    s.guardado = 'escribiendo';
  };
  const cargar = () => {
    s.cargando = true; s.fallo = false;
    poner();
    datos.cuerpoDe(id).then((txt) => {
      s.cuerpo = txt;
      s.cargando = false;
      const enBD = new Date(previa.actualizado_en).getTime();
      if (loc && loc.ts > enBD && (loc.cuerpo !== txt || loc.titulo !== s.titulo || (loc.subtitulo ?? '') !== (s.subtitulo ?? ''))) {
        usarLocal(loc);
        aviso('Recuperado lo último que escribiste en este móvil');
      } else s.guardado = s.estado === 'publicada' ? 'publicada' : 'guardado';
      poner();
      if (pendienteEnBase()) relojBD = setTimeout(() => aBD(), CADA_BD_MS);
    }).catch(() => {
      s.cargando = false;
      // Sin conexión: solo se edita lo del móvil si es igual o más reciente que la base;
      // si no, se esperaría a poder cargar (nunca se guarda encima un texto viejo o vacío).
      if (loc && loc.ts >= new Date(previa.actualizado_en).getTime()) { usarLocal(loc); s.guardado = 'error'; } else s.fallo = true;
      poner();
    });
  };
  if (nueva) {
    poner();
    setTimeout(() => titulo.focus(), 50);
  } else if (soloLocal) {
    usarLocal(loc);
    poner();
    if (pendienteEnBase()) relojBD = setTimeout(() => aBD(), CADA_BD_MS);
  } else cargar();

  return () => {
    // Salir de cualquier forma (atrás del sistema, otra pestaña...): nada se pierde.
    guardarYa();
    clearTimeout(relojBD);
    if (pendienteEnBase()) aBD();
    terminado = true;
    cancelAnimationFrame(pedidoVer);
    clearTimeout(relojVer);
    vv?.removeEventListener('resize', alCambiarVista);
    vv?.removeEventListener('scroll', colocarBarra);
    document.removeEventListener('selectionchange', alSeleccionar);
    document.removeEventListener('visibilitychange', alOcultar);
    window.removeEventListener('pagehide', guardarYa);
    espejo.remove();
  };
}
