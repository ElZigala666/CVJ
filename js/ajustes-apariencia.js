// Apariencia (diseño v2, pantallas 08-11): sustituye a "Tema" y "Fondo".
// Pantalla completa sobre el fondo real de la app: vista previa en vivo arriba (en
// escritorio, a la izquierda), el fondo (uno, o una pareja día/noche en "Automático"),
// "Tu imagen" (cambiar, encuadrar, desenfoque, oscurecer o aclarar y texto claro u oscuro,
// con el recomendado marcado) y el color de acento (paleta y personalizado), con la
// muestra de cómo se lee sobre el fondo elegido.
// Todo se ve al momento en toda la app y se guarda solo en la cuenta.
import { icono } from './icons.js';
import { esc, aviso } from './ui.js';
import { cliente } from './supabase.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';
import { abrirSelectorColor } from './selector-color.js';
import { abrirEncuadre } from './encuadre.js';
import {
  FONDOS, ORDEN_FONDOS, FONDOS_DIA, FONDOS_NOCHE, PALETA_ACENTO, ACENTO_DEFECTO, IMAGEN_DEFECTO,
  normalizar, resolverFondo, legibleImagen, textoRecomendado, probarApariencia, reducir, medir, baseDe, cargarImagen,
} from './apariencia.js';

const BUCKET = 'avatares';
const rutaDeUrl = (url) => { const m = String(url ?? '').match(/\/storage\/v1\/object\/public\/avatares\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; };
let abierta = null;

/** Abre Apariencia. */
export function abrirApariencia() {
  if (abierta) return;
  const yo = usuarioActual();
  const u = datos.usuario(yo?.id);
  if (!u) return;
  let ap = normalizar(u.apariencia);
  let acc = String(u.acento || ACENTO_DEFECTO).toUpperCase();
  let ver = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'noche' : 'dia';
  let subiendo = false;
  let relojGuardar = null;
  let apGuardada = JSON.stringify(ap);
  let accGuardado = acc;

  const capa = document.createElement('div');
  capa.className = 'ap-pagina';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-label', 'Apariencia');
  document.body.appendChild(capa);
  document.body.classList.add('apariencia-abierta');
  abierta = capa;

  /** Lo que se está viendo: en automático, el de día o el de noche. */
  const enVista = () => (ap.modo === 'auto' ? (ver === 'dia' ? ap.dia : ap.noche) : ap.fondo);
  const aplicar = () => probarApariencia({ ...ap, modo: 'fijo', fondo: enVista() }, acc);

  const guardar = (ya = false) => {
    clearTimeout(relojGuardar);
    const hacer = async () => {
      const ahora = JSON.stringify(ap);
      if (ahora !== apGuardada) {
        apGuardada = ahora;
        await datos.actualizarUsuario(yo.id, { apariencia: JSON.parse(ahora) }, aviso, 'No se ha podido guardar la apariencia.');
      }
      if (acc !== accGuardado) {
        accGuardado = acc;
        await datos.actualizarUsuario(yo.id, { acento: acc }, aviso, 'No se ha podido guardar el color.');
      }
    };
    if (ya) return hacer();
    relojGuardar = setTimeout(hacer, 600);
    return null;
  };

  // ---- Piezas -------------------------------------------------------------------
  const previa = () => `
    <div class="ap-previa" aria-hidden="true">
      <div class="ap-previa-cab">
        <span class="ap-logo">${icono('logo', { tam: 24, color: 'var(--acento)' })}<b>CVJ</b></span>
        <span class="ap-avatar"></span>
      </div>
      <strong class="ap-previa-titulo">Destacado del grupo</strong>
      <div class="ap-tarjeta">
        <span class="ap-portada"><small>CLAIR OBSCUR</small></span>
        <span class="ap-tarjeta-texto">
          <b>Clair Obscur: Expedition 33</b>
          <small>2025 · PS5</small>
          <span class="ap-puntua"><b>8.4</b><i style="background:var(--tier-a);color:var(--tier-a-texto)">A</i><span class="ap-puntos"><i style="background:#C2410C"></i><i style="background:#15803D"></i><i style="background:#0E7490"></i><i style="background:#BE185D"></i></span></span>
          <small>Lo recomiendan 3 de 4</small>
        </span>
      </div>
      <div class="ap-botones"><span class="ap-boton">Valorar</span><span class="ap-boton dos">Pendiente</span></div>
      <span class="ap-enlace">Ver ficha completa</span>
      <div class="ap-lista">
        <span><i style="background:#C2410C">D</i><b>Dani</b> valoró Astro Bot<em style="background:var(--tier-s);color:var(--tier-s-texto)">9.6</em></span>
        <span><i style="background:#0E7490">Á</i><b>Álex</b> valoró Death Stranding 2<em style="background:var(--tier-e);color:var(--tier-e-texto)">4.5</em></span>
      </div>
      <div class="ap-nav">
        <span class="activa">${icono('inicio', { tam: 18 })}Inicio</span>
        <span>${icono('buscar', { tam: 18 })}Buscar</span>
        <span class="ap-fab">${icono('mas', { tam: 18 })}</span>
        <span>${icono('rankings', { tam: 18 })}Rankings</span>
        <span>${icono('perfil', { tam: 18 })}Perfil</span>
      </div>
    </div>`;

  const leyenda = () => {
    const r = resolverFondo(enVista(), ap, acc);
    const img = enVista() === 'imagen';
    const ok = !img || r.legible;
    const texto = !img ? `El tema ${r.oscuro ? 'oscuro' : 'claro'} sale de este fondo. Todo cumple el contraste mínimo.`
      : ok ? 'La imagen se ve y todo se lee bien.'
        : 'Hay zonas muy claras en la imagen: la app refuerza el velo de las tarjetas y pone sombra a los títulos.';
    return `<p class="ap-leyenda${ok ? '' : ' aviso'}" data-ref="leyenda">${icono(ok ? 'completado' : 'alerta', { tam: 20, color: ok ? 'var(--acento)' : '#F59E0B', trazo: 'var(--fondo)' })}<span>${texto}</span></p>`;
  };

  const azulejo = (id, elegido, attr) => {
    const F = FONDOS[id];
    const img = id === 'imagen';
    const fondo = img ? (ap.imagen ? `url('${esc(ap.imagen.url)}') center / cover` : 'linear-gradient(135deg, #1B2A44, #3A2A4A)') : F.css(acc);
    const oscuro = img ? true : F.oscuro;
    return `
      <button type="button" class="ap-fondo${elegido ? ' activo' : ''}${oscuro ? ' oscuro' : ''}" ${attr}="${id}" aria-pressed="${elegido}" style="--m:${esc(fondo)}">
        <i></i><i></i>
        <span><b>${esc(F.nombre)}</b><small>${img ? 'Tú eliges el texto' : oscuro ? 'Oscuro' : 'Claro'}</small></span>
      </button>`;
  };

  const bloqueImagen = () => {
    const im = ap.imagen;
    if (!im) return '';
    const rec = textoRecomendado(im);
    const sub = (t) => (t === rec ? 'Recomendado' : t === 'claro' ? 'Velo oscuro' : 'Velo claro');
    return `
      <section class="ap-imagen">
        <div class="ap-imagen-cab">
          <h3>Tu imagen</h3>
          <label class="ap-mini">Cambiar<input type="file" accept="image/*" data-ref="archivo" hidden></label>
          <button type="button" class="ap-mini" data-accion="encuadrar">Encuadrar</button>
        </div>
        <label class="ap-deslizador">
          <span><b>Desenfoque</b><small data-ref="blur-val">${im.desenfoque ? `${im.desenfoque} px` : 'Nítida'}</small></span>
          <input type="range" class="deslizador" min="0" max="20" step="1" value="${im.desenfoque}" data-ref="blur" aria-label="Desenfoque">
        </label>
        <label class="ap-deslizador">
          <span><b>${im.texto === 'claro' ? 'Oscurecer' : 'Aclarar'}</b><small data-ref="velo-val">${im.velo} %</small></span>
          <input type="range" class="deslizador" min="0" max="85" step="1" value="${im.velo}" data-ref="velo" aria-label="${im.texto === 'claro' ? 'Oscurecer' : 'Aclarar'}">
        </label>
        <b class="ap-subtitulo">Texto</b>
        <div class="ap-textos">
          ${['claro', 'oscuro'].map((t) => `
            <button type="button" class="ap-texto ${t}${im.texto === t ? ' activo' : ''}" data-texto="${t}" aria-pressed="${im.texto === t}">
              <b>Texto ${t}</b><small>${sub(t)}</small>
            </button>`).join('')}
        </div>
      </section>`;
  };

  const bloqueAcento = () => {
    const r = resolverFondo(enVista(), ap, acc);
    const libre = !PALETA_ACENTO.includes(acc);
    return `
      <section class="ap-seccion">
        <h2 class="ap-h2">Color de acento</h2>
        <div class="ap-muestras">
          ${PALETA_ACENTO.map((c) => `<button type="button" class="ap-muestra${c === acc ? ' activa' : ''}" style="--c:${c}" data-acento="${c}" aria-label="Color ${c}" aria-pressed="${c === acc}"></button>`).join('')}
          <button type="button" class="ap-personalizado${libre ? ' activo' : ''}" data-libre><i style="--c:${libre ? acc : 'conic-gradient(#e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)'}"></i>Personalizado</button>
        </div>
        <div class="ap-ejemplo">
          <div class="ap-ejemplo-fila">
            <span class="ap-boton">Botón</span>
            <span class="ap-enlace">Enlace o texto</span>
            <span class="ap-chip" style="background:var(--tier-s);color:var(--tier-s-texto)">9.5 S</span>
          </div>
          <p>${r.ajustado
            ? 'Este color se lee mal en textos finos sobre este fondo. Los botones y las notas mantienen tu color; en textos y enlaces se usa un tono ajustado (el de la muestra).'
            : 'Tu color se lee bien sobre este fondo, tanto en botones como en textos.'}</p>
        </div>
      </section>`;
  };

  const pintar = () => {
    const auto = ap.modo === 'auto';
    capa.innerHTML = `
      <div class="ap-dentro">
        <header class="ap-cab">
          <h1 class="cabecera-titulo">Apariencia</h1>
          <button type="button" class="boton-cuadrado" data-accion="cerrar" aria-label="Cerrar">${icono('cerrar', { tam: 18, color: 'var(--texto)' })}</button>
        </header>
        <div class="ap-cols">
          <div class="ap-izq">
            <span class="ap-etiqueta">Vista previa</span>
            ${previa()}
            ${leyenda()}
          </div>
          <div class="ap-der">
            <section class="ap-seccion">
              <h2 class="ap-h2">Fondo</h2>
              <div class="ap-segmento" role="tablist">
                <button type="button" role="tab" class="${auto ? '' : 'activo'}" aria-selected="${!auto}" data-modo="fijo">Un fondo</button>
                <button type="button" role="tab" class="${auto ? 'activo' : ''}" aria-selected="${auto}" data-modo="auto">Automático</button>
              </div>
              <p class="ap-nota">${auto ? 'Un fondo claro de día y uno oscuro de noche, según el modo del móvil o del ordenador.' : 'Cada fondo ya es claro u oscuro: el tema sale de ahí, sin ajuste aparte.'}</p>
              ${auto ? `
                <div class="ap-segmento pequeno">
                  <button type="button" class="${ver === 'dia' ? 'activo' : ''}" data-ver="dia">Ver de día</button>
                  <button type="button" class="${ver === 'noche' ? 'activo' : ''}" data-ver="noche">Ver de noche</button>
                </div>
                <b class="ap-subtitulo">De día (fondos claros)</b>
                <div class="ap-fondos">${FONDOS_DIA.map((id) => azulejo(id, ap.dia === id, 'data-dia')).join('')}</div>
                <b class="ap-subtitulo">De noche (fondos oscuros)</b>
                <div class="ap-fondos">${FONDOS_NOCHE.map((id) => azulejo(id, ap.noche === id, 'data-noche')).join('')}</div>`
                : `<div class="ap-fondos">${ORDEN_FONDOS.map((id) => azulejo(id, ap.fondo === id, 'data-fondo')).join('')}</div>
                   <input type="file" accept="image/*" data-ref="archivo-nuevo" hidden>`}
            </section>
            ${!auto && ap.fondo === 'imagen' ? bloqueImagen() : ''}
            ${subiendo ? '<p class="ap-nota">Subiendo la imagen…</p>' : ''}
            ${bloqueAcento()}
          </div>
        </div>
      </div>`;
  };

  /** Solo lo que depende de los deslizadores (sin repintar todo mientras se arrastra). */
  const pintarLigero = () => {
    const l = capa.querySelector('[data-ref="leyenda"]');
    if (l) l.outerHTML = leyenda();
    const im = ap.imagen;
    if (!im) return;
    const bv = capa.querySelector('[data-ref="blur-val"]');
    if (bv) bv.textContent = im.desenfoque ? `${im.desenfoque} px` : 'Nítida';
    const vv = capa.querySelector('[data-ref="velo-val"]');
    if (vv) vv.textContent = `${im.velo} %`;
  };

  // ---- Imagen propia ---------------------------------------------------------------
  const subirImagen = async (archivo) => {
    if (!archivo || subiendo) return;
    subiendo = true; pintar();
    try {
      const { blob, img } = await reducir(archivo, 1920);
      const m = medir(img);
      const sb = await cliente();
      const ruta = `${yo.id}/fondo-${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
      const r = await sb.storage.from(BUCKET).upload(ruta, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
      if (r.error) throw r.error;
      const url = sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
      const anterior = ap.imagen?.url;
      const im = { ...IMAGEN_DEFECTO, url, medida: { media: m.media, max: m.max } };
      im.texto = textoRecomendado(im);
      im.base = baseDe(m.color, im.texto === 'claro');
      ap = normalizar({ ...ap, modo: 'fijo', fondo: 'imagen', imagen: im });
      aplicar();
      await guardar(true);
      const vieja = rutaDeUrl(anterior);
      if (vieja && anterior !== url) cliente().then((s) => s.storage.from(BUCKET).remove([vieja])).catch(() => {});
    } catch (e) {
      console.warn('[apariencia]', e?.message || e);
      aviso('No se ha podido subir la imagen. Revisa la conexión.', 4000);
    } finally {
      subiendo = false; pintar();
    }
  };
  // Imagen de antes (sin medir): se mide al abrir para saber si hace falta ayuda.
  if (ap.imagen && !ap.imagen.medida) {
    cargarImagen(ap.imagen.url).then((img) => {
      const m = medir(img);
      ap.imagen = { ...ap.imagen, medida: { media: m.media, max: m.max }, base: ap.imagen.base ?? baseDe(m.color, ap.imagen.texto === 'claro') };
      aplicar(); pintar(); guardar();
    }).catch(() => {});
  }

  // ---- Toques ---------------------------------------------------------------------
  const cerrar = async () => {
    await guardar(true);
    probarApariencia(null);
    document.body.classList.remove('apariencia-abierta');
    document.removeEventListener('keydown', tecla);
    capa.remove();
    abierta = null;
  };
  const tecla = (e) => { if (e.key === 'Escape' && !document.body.classList.contains('hoja-abierta')) cerrar(); };
  document.addEventListener('keydown', tecla);

  capa.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-accion="cerrar"]')) { cerrar(); return; }
    const m = t.closest('[data-modo]');
    if (m) {
      ap.modo = m.dataset.modo;
      if (ap.modo === 'auto') ver = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'noche' : 'dia';
      aplicar(); pintar(); guardar(); return;
    }
    const vd = t.closest('[data-ver]');
    if (vd) { ver = vd.dataset.ver; aplicar(); pintar(); return; }
    const f = t.closest('button[data-fondo]');
    if (f) {
      if (f.dataset.fondo === 'imagen' && !ap.imagen) { capa.querySelector('[data-ref="archivo-nuevo"]')?.click(); return; }
      ap.fondo = f.dataset.fondo; aplicar(); pintar(); guardar(); return;
    }
    const d = t.closest('[data-dia]');
    if (d) { ap.dia = d.dataset.dia; ver = 'dia'; aplicar(); pintar(); guardar(); return; }
    const n = t.closest('[data-noche]');
    if (n) { ap.noche = n.dataset.noche; ver = 'noche'; aplicar(); pintar(); guardar(); return; }
    const tx = t.closest('[data-texto]');
    if (tx && ap.imagen) {
      ap.imagen.texto = tx.dataset.texto;
      if (ap.imagen.medida) ap.imagen.base = null; // se recalcula con el nuevo texto
      aplicar(); pintar(); guardar(); return;
    }
    if (t.closest('[data-accion="encuadrar"]') && ap.imagen) {
      abrirEncuadre({
        url: ap.imagen.url, aspecto: window.innerWidth / window.innerHeight, valor: ap.imagen, titulo: 'Encuadrar el fondo',
        alGuardar: (v) => { Object.assign(ap.imagen, v); aplicar(); guardar(); },
      });
      return;
    }
    const a = t.closest('[data-acento]');
    if (a) { acc = a.dataset.acento; aplicar(); pintar(); guardar(); return; }
    if (t.closest('[data-libre]')) {
      abrirSelectorColor({ inicial: acc, alAplicar: (hex) => { acc = String(hex).toUpperCase(); aplicar(); pintar(); guardar(); } });
    }
  });
  capa.addEventListener('input', (e) => {
    const im = ap.imagen;
    if (!im) return;
    if (e.target.matches('[data-ref="blur"]')) im.desenfoque = Number(e.target.value) || 0;
    else if (e.target.matches('[data-ref="velo"]')) im.velo = Number(e.target.value) || 0;
    else return;
    aplicar(); pintarLigero();
  });
  capa.addEventListener('change', (e) => {
    if (e.target.matches('[data-ref="blur"], [data-ref="velo"]')) { pintar(); guardar(); return; }
    if (e.target.matches('[data-ref="archivo"], [data-ref="archivo-nuevo"]')) {
      const f = e.target.files?.[0];
      e.target.value = '';
      subirImagen(f);
    }
  });

  aplicar();
  pintar();
}

// La base de la imagen se recalcula con su color medio si se cambia el texto (claro/oscuro).
export { legibleImagen };
