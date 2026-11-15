// Ajustes → Fondo de la app: galería, imagen propia e intensidad, con vista previa en vivo.
// Al tocar un fondo se ve al momento en toda la app (y en la muestra de arriba), pero no se
// guarda hasta pulsar "Aplicar". Si se cierra Ajustes sin aplicar, vuelve el que había.
import { icono } from './icons.js';
import { esc, aviso } from './ui.js';
import { cliente } from './supabase.js';
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';
import { FONDOS, resolver, pintarFondo, aplicarApariencia, prepararImagen, baseDe } from './apariencia.js';

const BUCKET = 'avatares';
const rutaDeUrl = (url) => { const m = String(url ?? '').match(/\/storage\/v1\/object\/public\/avatares\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; };
const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Monta el bloque en cont. Devuelve la función que hay que llamar al cerrar Ajustes. */
export function montarFondo(cont) {
  const yo = usuarioActual();
  const guardada = () => datos.usuario(yo?.id)?.apariencia ?? null;
  if (!yo || !('apariencia' in (datos.usuario(yo.id) ?? {}))) { cont.innerHTML = ''; return () => {}; }
  let previa = guardada();   // lo que se está viendo
  let archivo = null;        // imagen nueva aún sin subir: { blob, url }
  let guardando = false;

  const miniatura = (f) => `
    <button type="button" class="fondo-opcion${previa?.fondo === f.id ? ' activa' : ''}" data-fondo-id="${f.id}" aria-pressed="${previa?.fondo === f.id}">
      <span class="fondo-mini" style="--m-base:${esc(f.base)};--m-img:${esc(f.imagen)};--m-velo:${esc(f.velo ?? 'transparent')}" data-modo="${f.modo}"><i></i><i></i></span>
      <span>${esc(f.nombre)}</span>
    </button>`;

  const pintar = () => {
    const propia = previa?.fondo === 'propia';
    const cambiado = !igual(previa, guardada()) || !!archivo;
    cont.innerHTML = `
      <section class="ajustes-bloque ajustes-fondo">
        <span class="campo-titulo">Fondo de la app</span>
        <div class="fondo-previa" aria-hidden="true">
          <div class="fondo-previa-capa"></div>
          <div class="fondo-previa-dentro">
            <strong>Así se ve</strong>
            <div class="fondo-previa-tarjeta"><span class="fondo-previa-portada"></span><span class="fondo-previa-lineas"><b></b><b></b></span><span class="fondo-previa-nota">8.5</span></div>
            <span class="fondo-previa-boton">Valorar</span>
          </div>
        </div>
        <div class="fondo-galeria">
          <button type="button" class="fondo-opcion${!previa ? ' activa' : ''}" data-fondo-id="" aria-pressed="${!previa}">
            <span class="fondo-mini fondo-mini-sin"><i></i><i></i></span><span>Sin fondo</span>
          </button>
          <button type="button" class="fondo-opcion${propia ? ' activa' : ''}" data-fondo-subir aria-pressed="${propia}">
            <span class="fondo-mini fondo-mini-propia"${propia ? ` style="--m-img:url('${esc(previa.imagen)}')"` : ''}>${propia ? '' : icono('mas', { tam: 22, color: 'var(--texto-2)' })}</span><span>Tu imagen</span>
          </button>
          ${FONDOS.map(miniatura).join('')}
        </div>
        <input type="file" accept="image/*" data-ref="archivo" hidden>
        ${propia ? `
          <div class="fondo-controles">
            <label class="fondo-intensidad"><span>Intensidad</span><input type="range" min="0" max="100" step="5" value="${Number(previa.intensidad ?? 60)}" data-ref="intensidad" aria-label="Cuánto se desenfoca y se vela la imagen"></label>
            <div class="segmentado" role="radiogroup" aria-label="Texto sobre la imagen">
              <button type="button" role="radio" data-fondo-modo="oscuro" class="${previa.modo !== 'claro' ? 'activo' : ''}" aria-checked="${previa.modo !== 'claro'}">Oscurecer</button>
              <button type="button" role="radio" data-fondo-modo="claro" class="${previa.modo === 'claro' ? 'activo' : ''}" aria-checked="${previa.modo === 'claro'}">Aclarar</button>
            </div>
          </div>
          <p class="ajustes-nota">La imagen se desenfoca y se vela sola para que todo se lea. Con más intensidad se nota menos.</p>` : ''}
        ${previa ? '<p class="ajustes-nota">Con un fondo puesto, él decide si la app va en claro o en oscuro.</p>' : ''}
        ${cambiado ? `
          <div class="fondo-aplicar">
            <span>Vista previa</span>
            <button type="button" class="boton-secundario neutro boton-pequeno" data-fondo-accion="descartar">Descartar</button>
            <button type="button" class="boton-principal boton-pequeno" data-fondo-accion="aplicar"${guardando ? ' disabled' : ''}>${guardando ? 'Guardando…' : 'Aplicar'}</button>
          </div>` : ''}
      </section>`;
  };
  const ver = () => { pintarFondo(resolver(previa)); pintar(); };

  const borrarArchivo = async (url) => {
    const ruta = rutaDeUrl(url);
    if (ruta) { try { await (await cliente()).storage.from(BUCKET).remove([ruta]); } catch { /* da igual */ } }
  };

  async function aplicar() {
    if (guardando) return;
    guardando = true; pintar();
    const antes = guardada();
    try {
      let nueva = previa;
      if (archivo && previa?.fondo === 'propia') {
        const sb = await cliente();
        const ext = archivo.blob.type === 'image/webp' ? 'webp' : 'jpg';
        const ruta = `${yo.id}/fondo-${Date.now()}.${ext}`;
        const r = await sb.storage.from(BUCKET).upload(ruta, archivo.blob, { contentType: archivo.blob.type, cacheControl: '31536000', upsert: false });
        if (r.error) throw r.error;
        nueva = { ...previa, imagen: sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl };
      }
      const ok = await datos.actualizarUsuario(yo.id, { apariencia: nueva }, null);
      if (!ok) { if (nueva !== previa) borrarArchivo(nueva.imagen); throw new Error('usuarios'); }
      if (archivo) URL.revokeObjectURL(archivo.url);
      archivo = null;
      previa = nueva;
      aplicarApariencia(nueva);
      // La imagen anterior ya no se usa.
      if (antes?.fondo === 'propia' && antes.imagen !== nueva?.imagen) borrarArchivo(antes.imagen);
      aviso(nueva ? 'Fondo guardado en tu cuenta' : 'Fondo quitado');
    } catch (e) {
      console.warn('[fondo]', e?.message || e);
      aviso('No se ha podido guardar el fondo. Revisa la conexión.', 5000);
    }
    guardando = false;
    pintar();
  }

  const alClic = (e) => {
    const op = e.target.closest('[data-fondo-id]');
    if (op) {
      previa = op.dataset.fondoId ? { fondo: op.dataset.fondoId } : null;
      ver();
      return;
    }
    if (e.target.closest('[data-fondo-subir]')) {
      // Ya hay una imagen (la guardada o la recién elegida): se vuelve a ella; otro toque, a cambiarla.
      const mia = archivo ? null : guardada();
      if (previa?.fondo !== 'propia' && mia?.fondo === 'propia') { previa = mia; ver(); return; }
      cont.querySelector('[data-ref="archivo"]').click();
      return;
    }
    const modo = e.target.closest('[data-fondo-modo]');
    if (modo && previa?.fondo === 'propia') {
      const m = modo.dataset.fondoModo;
      previa = { ...previa, modo: m, ...(Array.isArray(previa.media) ? { base: baseDe(previa.media, m) } : { base: undefined }) };
      ver();
      return;
    }
    const acc = e.target.closest('[data-fondo-accion]');
    if (acc?.dataset.fondoAccion === 'aplicar') aplicar();
    if (acc?.dataset.fondoAccion === 'descartar') {
      if (archivo) URL.revokeObjectURL(archivo.url);
      archivo = null;
      previa = guardada();
      ver();
    }
  };
  const alCambiar = async (e) => {
    if (!e.target.matches('[data-ref="archivo"]')) return;
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const p = await prepararImagen(f);
      if (archivo) URL.revokeObjectURL(archivo.url);
      archivo = { blob: p.blob, url: URL.createObjectURL(p.blob) };
      previa = { fondo: 'propia', imagen: archivo.url, modo: p.modo, intensidad: 60, base: p.base, media: p.media };
      ver();
    } catch { aviso('No se ha podido abrir esa imagen.'); }
  };
  const alDeslizar = (e) => {
    if (!e.target.matches('[data-ref="intensidad"]') || previa?.fondo !== 'propia') return;
    previa = { ...previa, intensidad: Number(e.target.value) };
    pintarFondo(resolver(previa)); // sin repintar el bloque: el dedo sigue en el control
    if (e.type === 'change') pintar();
  };
  cont.addEventListener('click', alClic);
  cont.addEventListener('change', alCambiar);
  cont.addEventListener('input', alDeslizar);
  cont.addEventListener('change', alDeslizar);
  pintar();

  // Al cerrar Ajustes sin aplicar: vuelve lo guardado.
  return () => {
    if (archivo) URL.revokeObjectURL(archivo.url);
    if (!igual(previa, guardada()) || archivo) pintarFondo(resolver(guardada()));
  };
}
