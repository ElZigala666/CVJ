// "Editar cabecera" del perfil (diseño v2, pantalla 05): vista previa arriba, los cuatro
// tipos (arte del juego favorito, imagen propia, degradado y patrón) y sus opciones:
//  - Juego favorito: las imágenes horizontales de IGDB (arte y capturas) para elegir.
//    Si no tiene ninguna, se ofrece el degradado.
//  - Tu imagen: elegirla (se reduce para la web y se sube a Storage) y encuadrarla.
//  - Degradado: sale del color de acento.
//  - Patrón: hexágonos de la marca, con intensidad.
// Se guarda en usuarios.perfil_datos.cabecera (sin tocar lo demás del perfil).
import { abrirHoja } from './hoja.js';
import { esc, aviso, avatar } from './ui.js';
import { cliente } from './supabase.js';
import * as datos from './datos.js';
import { artesDeJuego } from './igdb.js';
import { abrirEncuadreDoble } from './encuadre.js';
import { reducir } from './apariencia.js';
import { elegirJuegos } from './colecciones-ui.js';
import * as metricas from './metricas.js';
import { TIPOS_CABECERA, cabeceraDe, capasCabecera, cssDegradado, perfilDe, urlArte, ASPECTO_CAB } from './perfil-personal.js';

const BUCKET = 'avatares';
const rutaDeUrl = (url) => { const m = String(url ?? '').match(/\/storage\/v1\/object\/public\/avatares\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; };
const miniArte = (id) => `https://images.igdb.com/igdb/image/upload/t_screenshot_med/${id}.jpg`;
/** Encuadre por defecto (centrado) en los dos formatos. */
const centrado = (y = 50) => ({ x: 50, y, zoom: 1, esc: { x: 50, y, zoom: 1 } });

/**
 * @param {string} uid  el usuario con sesión
 * @param {object} [s]  estado a medias (al volver de elegir el juego favorito)
 */
export function abrirEditarCabecera(uid, s = null) {
  const u = datos.usuario(uid);
  if (!u) return;
  const acc = String(u.acento || '#7C3AED');
  s ??= { c: cabeceraDe(u), favorito: perfilDe(u).favorito, archivo: null, artes: null, cargando: false, guardando: false };
  let volver = false;

  const fav = () => datos.juegoConocido(s.favorito);
  /** La cabecera tal como se vería con lo elegido aquí. */
  const efectiva = () => {
    const c = { ...s.c };
    if (c.tipo === 'juego') {
      const arte = c.arte ?? s.artes?.[0]?.id ?? fav()?.arte_id;
      return fav() && arte ? { ...c, arte } : { ...c, tipo: 'degradado' };
    }
    if (c.tipo === 'imagen') return s.archivo || c.imagen ? { ...c, imagen: s.archivo?.url ?? c.imagen } : { ...c, tipo: 'degradado' };
    return c;
  };

  const miniTipo = (t) => {
    let fondo = '';
    if (t === 'juego') fondo = fav()?.arte_id ? `url('${esc(miniArte(fav().arte_id))}') center / cover` : '#5A3A4A';
    else if (t === 'imagen') fondo = s.archivo?.url || s.c.imagen ? `url('${esc(s.archivo?.url ?? s.c.imagen)}') center / cover` : '#2F5A8A';
    else if (t === 'degradado') fondo = cssDegradado(acc);
    else fondo = '#6B4A12';
    return `<span class="cabed-mini" style="background:${esc(fondo)}"></span>`;
  };

  const opciones = () => {
    const c = s.c;
    if (c.tipo === 'juego') {
      const j = fav();
      if (!j) return `<p class="ajustes-nota">Elige antes tu juego favorito: su arte hará de cabecera.</p>
        <button type="button" class="boton-secundario neutro boton-pequeno" data-cabed="favorito">Elegir juego favorito</button>`;
      if (s.cargando) return `<b class="cabed-sub">Imágenes de ${esc(j.nombre)}</b><p class="ajustes-nota">Buscando imágenes…</p>`;
      if (s.artes && !s.artes.length) return `<b class="cabed-sub">Imágenes de ${esc(j.nombre)}</b>
        <p class="ajustes-nota">Este juego no tiene imágenes horizontales en el catálogo.</p>
        <button type="button" class="boton-secundario neutro boton-pequeno" data-tipo-cab="degradado">Usar el degradado</button>`;
      let n = 0;
      const elegida = c.arte ?? s.artes?.[0]?.id;
      return `
        <b class="cabed-sub">Imágenes de ${esc(j.nombre)}</b>
        <div class="cabed-artes">
          ${(s.artes ?? []).map((a) => `
            <button type="button" class="cabed-arte${a.id === elegida ? ' activo' : ''}" data-arte="${esc(a.id)}" style="background-image:url('${esc(miniArte(a.id))}')">
              <span>${a.tipo === 'artwork' ? 'Arte' : `Captura ${++n}`}</span>
            </button>`).join('')}
        </div>
        ${elegida ? '<button type="button" class="boton-secundario neutro boton-pequeno" data-cabed="encuadrar">Encuadrar (móvil y escritorio)</button>' : ''}
        <p class="ajustes-nota">Arte y capturas en horizontal del catálogo. Se cambia solo si cambias de juego favorito.</p>`;
    }
    if (c.tipo === 'imagen') {
      return `
        <div class="cabed-botones">
          <label class="boton-secundario neutro boton-pequeno">${s.archivo || c.imagen ? 'Cambiar imagen' : 'Elegir imagen'}<input type="file" accept="image/*" data-ref="archivo" hidden></label>
          ${s.archivo || c.imagen ? '<button type="button" class="boton-secundario neutro boton-pequeno" data-cabed="encuadrar">Encuadrar (móvil y escritorio)</button>' : ''}
        </div>
        <p class="ajustes-nota">Se reduce para la web y solo la ve el grupo.</p>`;
    }
    if (c.tipo === 'patron') {
      return `
        <label class="ap-deslizador">
          <span><b>Intensidad</b><small data-ref="int-val">${c.intensidad} %</small></span>
          <input type="range" class="deslizador" min="0" max="100" step="1" value="${c.intensidad}" data-ref="intensidad" aria-label="Intensidad">
        </label>
        <p class="ajustes-nota">Hexágonos de CVJ en los tonos de tu color.</p>`;
    }
    return '<p class="ajustes-nota">Sale de tu color de acento; si lo cambias, cambia con él.</p>';
  };

  const html = () => `
    <div class="cabed">
      <div class="cabed-previa perfil-cabecera">
        ${capasCabecera(efectiva(), acc, 'hexpat-ed')}
        <div class="cabed-quien">${avatar(u, 64)}<strong>${esc(u.nombre)}</strong></div>
      </div>
      <div class="cabed-tipos" role="radiogroup" aria-label="Tipo de cabecera">
        ${TIPOS_CABECERA.map((t) => `
          <button type="button" role="radio" class="cabed-tipo${s.c.tipo === t.id ? ' activo' : ''}" aria-checked="${s.c.tipo === t.id}" data-tipo-cab="${t.id}">
            ${miniTipo(t.id)}<span>${t.nombre}</span>
          </button>`).join('')}
      </div>
      <div class="cabed-opciones">${opciones()}</div>
      <button type="button" class="boton-principal" data-cabed="guardar"${s.guardando ? ' disabled' : ''}>${s.guardando ? 'Guardando…' : 'Guardar cabecera'}</button>
    </div>`;

  abrirHoja({
    titulo: 'Cabecera del perfil',
    html: '<div data-ref="cabed"></div>',
    alCerrar: () => { if (!volver && s.archivo) URL.revokeObjectURL(s.archivo.url); },
    alMontar(cuerpo, cerrar) {
      const cont = cuerpo.querySelector('[data-ref="cabed"]');
      const pintar = () => { cont.innerHTML = html(); };
      const pedirArtes = () => {
        const j = fav();
        if (!j || s.artes || s.cargando) return;
        s.cargando = true; pintar();
        artesDeJuego(j.igdb_id).then((l) => { s.artes = l; }).catch(() => { s.artes = j.arte_id ? [{ id: j.arte_id, tipo: 'artwork' }] : []; })
          .finally(() => { s.cargando = false; if (cont.isConnected) pintar(); });
      };
      pintar();
      if (s.c.tipo === 'juego') pedirArtes();

      cont.addEventListener('input', (e) => {
        if (!e.target.matches('[data-ref="intensidad"]')) return;
        s.c.intensidad = Number(e.target.value) || 0;
        cont.querySelector('[data-ref="int-val"]').textContent = `${s.c.intensidad} %`;
        cont.querySelector('.cabed-previa .cab-capa').outerHTML = capasCabecera(efectiva(), acc, 'hexpat-ed');
      });
      cont.addEventListener('change', async (e) => {
        if (!e.target.matches('[data-ref="archivo"]')) return;
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try {
          const { blob } = await reducir(f, 1920);
          if (s.archivo) URL.revokeObjectURL(s.archivo.url);
          s.archivo = { blob, url: URL.createObjectURL(blob) };
          Object.assign(s.c, centrado());
          pintar();
        } catch { aviso('No se ha podido abrir esa imagen.'); }
      });
      cont.addEventListener('click', async (e) => {
        const t = e.target;
        const tipo = t.closest('[data-tipo-cab]');
        if (tipo) {
          s.c.tipo = tipo.dataset.tipoCab;
          pintar();
          if (s.c.tipo === 'juego') pedirArtes();
          if (s.c.tipo === 'imagen' && !s.archivo && !s.c.imagen) cont.querySelector('[data-ref="archivo"]')?.click();
          return;
        }
        const arte = t.closest('[data-arte]');
        if (arte) { s.c.arte = arte.dataset.arte; Object.assign(s.c, centrado(30)); pintar(); return; }
        const acc2 = t.closest('[data-cabed]')?.dataset.cabed;
        if (acc2 === 'encuadrar') {
          volver = true;
          const ef = efectiva();
          const url = ef.tipo === 'juego' ? urlArte(ef.arte) : (s.archivo?.url ?? s.c.imagen);
          abrirEncuadreDoble({
            url, aspectos: ASPECTO_CAB, movil: s.c, escritorio: s.c.esc, titulo: 'Encuadrar la cabecera',
            alGuardar: ({ movil, escritorio }) => { Object.assign(s.c, movil, { esc: escritorio }); },
            alCerrar: () => abrirEditarCabecera(uid, s),
          });
          return;
        }
        if (acc2 === 'favorito') {
          volver = true;
          const mios = metricas.valoracionesDe(uid).slice().sort((a, b) => (Number(b.nota) || 0) - (Number(a.nota) || 0)).map((v) => Number(v.juego_id));
          elegirJuegos({
            titulo: 'Tu juego favorito', primero: mios,
            alElegir: ([id]) => { s.favorito = datos.canonico(id); s.artes = null; s.c.arte = null; },
            alCerrar: () => abrirEditarCabecera(uid, s),
          });
          return;
        }
        if (acc2 !== 'guardar' || s.guardando) return;
        s.guardando = true; pintar();
        const antes = cabeceraDe(u);
        try {
          const c = { tipo: s.c.tipo };
          // Los dos encuadres (móvil: x, y, zoom; escritorio: esc), para el arte y para la imagen.
          const encuadre = { x: s.c.x, y: s.c.y, zoom: s.c.zoom, esc: s.c.esc };
          if (c.tipo === 'juego') Object.assign(c, { arte: s.c.arte ?? s.artes?.[0]?.id ?? fav()?.arte_id ?? null }, encuadre);
          if (c.tipo === 'imagen') {
            let url = s.c.imagen;
            if (s.archivo) {
              const sb = await cliente();
              const ruta = `${uid}/cabecera-${Date.now()}.${s.archivo.blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
              const r = await sb.storage.from(BUCKET).upload(ruta, s.archivo.blob, { contentType: s.archivo.blob.type, cacheControl: '31536000', upsert: false });
              if (r.error) throw r.error;
              url = sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
            }
            if (!url) { c.tipo = 'degradado'; } else Object.assign(c, { imagen: url }, encuadre);
          }
          if (c.tipo === 'patron') c.intensidad = s.c.intensidad;
          // Lo demás del perfil se queda como está (la cabecera de antes, "banner", ya no se usa).
          const { banner: _b, ...resto } = datos.usuario(uid)?.perfil_datos ?? {};
          const pd = { ...resto, cabecera: c };
          if (s.favorito) pd.favorito = s.favorito;
          const ok = await datos.actualizarUsuario(uid, { perfil_datos: pd }, null);
          if (!ok) throw new Error('usuarios');
          if (antes.imagen && antes.imagen !== c.imagen) {
            const ruta = rutaDeUrl(antes.imagen);
            if (ruta) cliente().then((sb) => sb.storage.from(BUCKET).remove([ruta])).catch(() => {});
          }
          aviso('Cabecera guardada');
          cerrar();
        } catch (err) {
          console.warn('[cabecera]', err?.message || err);
          s.guardando = false; pintar();
          aviso('No se ha podido guardar la cabecera. Revisa la conexión.', 5000);
        }
      });
    },
  });
}

export { urlArte };
