// Foto de perfil: elegir imagen, recortarla en cuadrado (arrastrar y zoom),
// reducirla a 256 px en WebP (o JPEG si el navegador no sabe hacer WebP) y
// subirla al bucket público "avatares" de Supabase Storage.
import { abrirHoja } from './hoja.js';
import { cliente } from './supabase.js';
import * as datos from './datos.js';
import { esc, aviso, avatar } from './ui.js';

const LADO_SALIDA = 256;
const BUCKET = 'avatares';

/** Ruta del archivo dentro del bucket a partir de su URL pública (o null). */
function rutaDeUrl(url) {
  const m = String(url ?? '').match(/\/storage\/v1\/object\/public\/avatares\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function lienzoABlob(lienzo, tipo, calidad) {
  return new Promise((r) => lienzo.toBlob(r, tipo, calidad));
}

/**
 * Abre la hoja para poner o cambiar la foto de un usuario.
 * @param {object} usuario  (yo, o cualquiera si soy admin)
 */
export function abrirEditorFoto(usuario) {
  const u = datos.usuario(usuario.id) ?? usuario;
  const s = { img: null, url: null, zoom: 1, x: 0, y: 0, base: 1, subiendo: false };

  abrirHoja({
    titulo: 'Foto de perfil',
    antetitulo: u.nombre,
    html: `
      <div class="foto-editor">
        <div class="foto-marco" data-ref="marco">
          <div class="foto-vacia" data-ref="vacia">${avatar(u, 120)}<span>Elige una foto para empezar</span></div>
          <img data-ref="img" alt="" hidden draggable="false">
        </div>
        <label class="foto-zoom" data-ref="zoom-fila" hidden>
          <span>Zoom</span>
          <input type="range" min="1" max="4" step="0.01" value="1" data-ref="zoom" class="deslizador" aria-label="Zoom">
        </label>
        <p class="ajustes-nota" data-ref="nota">Arrastra la foto para encuadrarla.</p>
        <label class="boton-secundario neutro foto-elegir">
          <input type="file" accept="image/*" data-ref="archivo" hidden>
          <span>${u.foto_url ? 'Elegir otra foto' : 'Elegir foto'}</span>
        </label>
        <button type="button" class="boton-principal" data-accion="guardar-foto" disabled>Guardar foto</button>
        ${u.foto_url ? '<button type="button" class="enlace-discreto peligro foto-quitar" data-accion="quitar-foto">Quitar la foto</button>' : ''}
      </div>`,
    alMontar(cuerpo, cerrar) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      const marco = $('marco');
      const img = $('img');

      // ----- Encuadre -----------------------------------------------------
      const lado = () => marco.clientWidth;
      const limitar = () => {
        // La imagen siempre cubre el cuadro entero.
        const esc = s.base * s.zoom;
        const maxX = Math.max(0, (s.img.naturalWidth * esc - lado()) / 2);
        const maxY = Math.max(0, (s.img.naturalHeight * esc - lado()) / 2);
        s.x = Math.min(maxX, Math.max(-maxX, s.x));
        s.y = Math.min(maxY, Math.max(-maxY, s.y));
      };
      const pintar = () => {
        if (!s.img) return;
        limitar();
        const esc = s.base * s.zoom;
        img.style.width = `${s.img.naturalWidth * esc}px`;
        img.style.height = `${s.img.naturalHeight * esc}px`;
        img.style.transform = `translate(calc(-50% + ${s.x}px), calc(-50% + ${s.y}px))`;
      };

      $('archivo').addEventListener('change', () => {
        const f = $('archivo').files?.[0];
        if (!f) return;
        if (s.url) URL.revokeObjectURL(s.url);
        s.url = URL.createObjectURL(f);
        const nueva = new Image();
        nueva.onload = () => {
          s.img = nueva;
          s.zoom = 1; s.x = 0; s.y = 0;
          s.base = lado() / Math.min(nueva.naturalWidth, nueva.naturalHeight);
          img.src = s.url;
          img.hidden = false;
          $('vacia').hidden = true;
          $('zoom-fila').hidden = false;
          $('zoom').value = '1';
          cuerpo.querySelector('[data-accion="guardar-foto"]').disabled = false;
          pintar();
        };
        nueva.onerror = () => aviso('No se ha podido abrir esa imagen');
        nueva.src = s.url;
      });

      $('zoom').addEventListener('input', () => { s.zoom = Number($('zoom').value); pintar(); });

      let arrastre = null;
      marco.addEventListener('pointerdown', (e) => {
        if (!s.img) return;
        arrastre = { x: e.clientX, y: e.clientY, x0: s.x, y0: s.y };
        marco.setPointerCapture(e.pointerId);
      });
      marco.addEventListener('pointermove', (e) => {
        if (!arrastre) return;
        s.x = arrastre.x0 + (e.clientX - arrastre.x);
        s.y = arrastre.y0 + (e.clientY - arrastre.y);
        pintar();
      });
      const soltar = () => { arrastre = null; };
      marco.addEventListener('pointerup', soltar);
      marco.addEventListener('pointercancel', soltar);
      // Rueda del ratón en el ordenador: zoom.
      marco.addEventListener('wheel', (e) => {
        if (!s.img) return;
        e.preventDefault();
        s.zoom = Math.min(4, Math.max(1, s.zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
        $('zoom').value = String(s.zoom);
        pintar();
      }, { passive: false });

      // ----- Guardar y quitar ---------------------------------------------
      const recortar = async () => {
        const esc = s.base * s.zoom;
        const l = lado();
        // Parte de la imagen original que se ve en el cuadro.
        const ancho = l / esc;
        const sx = s.img.naturalWidth / 2 - (l / 2 + s.x) / esc;
        const sy = s.img.naturalHeight / 2 - (l / 2 + s.y) / esc;
        const lienzo = document.createElement('canvas');
        lienzo.width = LADO_SALIDA;
        lienzo.height = LADO_SALIDA;
        const ctx = lienzo.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(s.img, sx, sy, ancho, ancho, 0, 0, LADO_SALIDA, LADO_SALIDA);
        let blob = await lienzoABlob(lienzo, 'image/webp', 0.85);
        // Safari antiguo no sabe hacer WebP y devuelve PNG: entonces JPEG.
        if (!blob || blob.type !== 'image/webp') blob = await lienzoABlob(lienzo, 'image/jpeg', 0.88);
        return blob;
      };

      const borrarArchivo = async (url) => {
        const ruta = rutaDeUrl(url);
        if (!ruta) return;
        try { await (await cliente()).storage.from(BUCKET).remove([ruta]); } catch { /* da igual */ }
      };

      cuerpo.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-accion]');
        if (!b || s.subiendo) return;
        if (b.dataset.accion === 'guardar-foto' && s.img) {
          s.subiendo = true;
          b.disabled = true;
          b.textContent = 'Guardando…';
          try {
            const blob = await recortar();
            const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
            const sb = await cliente();
            const ruta = `${u.id}/${Date.now()}.${ext}`;
            const r = await sb.storage.from(BUCKET).upload(ruta, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
            if (r.error) throw r.error;
            const url = sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
            const anterior = datos.usuario(u.id)?.foto_url;
            const ok = await datos.actualizarUsuario(u.id, { foto_url: url }, aviso, 'No se ha podido guardar la foto.');
            if (!ok) { borrarArchivo(url); throw new Error('usuarios'); }
            if (anterior) borrarArchivo(anterior);
            aviso('Foto guardada');
            cerrar();
          } catch (err) {
            console.warn('[foto]', err?.message || err);
            aviso('No se ha podido subir la foto. Prueba otra vez.');
            s.subiendo = false;
            b.disabled = false;
            b.textContent = 'Guardar foto';
          }
          return;
        }
        if (b.dataset.accion === 'quitar-foto') {
          const anterior = datos.usuario(u.id)?.foto_url;
          const ok = await datos.actualizarUsuario(u.id, { foto_url: null }, aviso, 'No se ha podido quitar la foto.');
          if (ok) { borrarArchivo(anterior); aviso('Foto quitada'); cerrar(); }
        }
      });
    },
  });
}

/** Botón "Cambiar foto" (Ajustes y perfil ajeno si soy admin). */
export function botonFoto(usuario, texto) {
  return `<button type="button" class="boton-secundario boton-pequeno" data-foto="${esc(usuario.id)}">${esc(texto ?? (usuario.foto_url ? 'Cambiar foto' : 'Poner foto'))}</button>`;
}
