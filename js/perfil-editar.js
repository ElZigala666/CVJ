// "Editar perfil": una hoja con todo lo personalizable del perfil (js/perfil-personal.js).
// Los cambios se ven en la hoja al momento y se guardan en la cuenta al pulsar "Guardar".
// Elegir juegos abre el buscador en otra hoja; al cerrarla se vuelve aquí sin perder nada.
import { abrirHoja } from './hoja.js';
import { icono } from './icons.js';
import { esc, aviso, portada } from './ui.js';
import { cliente } from './supabase.js';
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { PALETA } from './acento.js';
import { elegirJuegos } from './colecciones-ui.js';
import { perfilDe, MAX_BIO, MAX_ESTADO, MAX_VITRINA, PLATAFORMAS_PERFIL } from './perfil-personal.js';

const BUCKET = 'avatares';
const rutaDeUrl = (url) => { const m = String(url ?? '').match(/\/storage\/v1\/object\/public\/avatares\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; };

/** Recorta al centro en 3:1 y reduce a 1200×400. → Blob */
async function prepararBanner(archivo) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(archivo); });
  const lienzo = document.createElement('canvas');
  lienzo.width = 1200; lienzo.height = 400;
  const escala = Math.max(1200 / img.naturalWidth, 400 / img.naturalHeight);
  const w = 1200 / escala, h = 400 / escala;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (img.naturalWidth - w) / 2, (img.naturalHeight - h) / 2, w, h, 0, 0, 1200, 400);
  URL.revokeObjectURL(img.src);
  const blob = await new Promise((r) => lienzo.toBlob(r, 'image/webp', 0.84));
  return blob && blob.type === 'image/webp' ? blob : new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.86));
}

/**
 * @param {string} uid  el usuario con sesión
 * @param {object} [s]  estado a medias (al volver del buscador de juegos)
 */
export function abrirEditarPerfil(uid, s = null) {
  const u = datos.usuario(uid);
  if (!u) return;
  s ??= { ...perfilDe(u), archivo: null };
  // Mis juegos, los mejor valorados primero: lo normal es elegir entre ellos.
  const mios = metricas.valoracionesDe(uid).slice().sort((a, b) => (Number(b.nota) || 0) - (Number(a.nota) || 0)).map((v) => Number(v.juego_id));
  const jugando = metricas.valoracionesDe(uid).filter((v) => v.estado === 'jugando' || (v.estado === 'completado' && v.rejugando)).map((v) => datos.juegoConocido(v.juego_id)?.nombre).filter(Boolean).slice(0, 3);
  let guardando = false;
  let volver = false; // se ha abierto el buscador: al cerrarlo se vuelve aquí

  const bannerActual = () => s.banner?.tipo ?? 'ninguno';
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
        <span class="campo-titulo">Cabecera</span>
        <div class="editar-banner-previa perfil-banner-${s.banner?.tipo === 'imagen' ? 'imagen' : s.banner?.tipo === 'juego' && datos.juegoConocido(s.favorito ?? s.vitrina[0])?.cover_id ? 'juego' : s.banner ? 'color' : 'nada'}" style="${estiloPrevia()}"></div>
        <div class="chips-plataforma">
          ${[['ninguno', 'Ninguna'], ['color', 'Color'], ['juego', 'Mi juego favorito'], ['imagen', 'Imagen']].map(([id, n]) => `<button type="button" class="chip${bannerActual() === id ? ' activo' : ''}" data-banner="${id}">${n}</button>`).join('')}
        </div>
        ${bannerActual() === 'color' ? `
          <div class="paleta">
            ${[u.color, ...PALETA.map((p) => p.hex)].filter((c, i, l) => c && l.indexOf(c) === i).map((c) => `<button type="button" class="muestra${String(s.banner.valor).toUpperCase() === String(c).toUpperCase() ? ' activa' : ''}" style="--muestra:${esc(c)}" data-banner-color="${esc(c)}" aria-label="Color ${esc(c)}"></button>`).join('')}
          </div>` : ''}
        ${bannerActual() === 'juego' && !(s.favorito ?? s.vitrina[0]) ? '<p class="ajustes-nota">Elige abajo tu juego favorito y su portada hará de cabecera.</p>' : ''}
        <input type="file" accept="image/*" data-ref="archivo" hidden>
      </div>

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

  function estiloPrevia() {
    const b = s.banner;
    if (!b) return '';
    if (b.tipo === 'color') return `--b-color:${esc(b.valor)}`;
    if (b.tipo === 'imagen') return `--b-img:url('${esc(s.archivo?.url ?? b.valor)}')`;
    const j = datos.juegoConocido(s.favorito ?? s.vitrina[0]);
    return j?.cover_id ? `--b-img:url('https://images.igdb.com/igdb/image/upload/t_cover_big/${esc(j.cover_id)}.jpg');--b-color:${esc(j.color_dominante || '#222')}` : `--b-color:${esc(u.color || 'var(--acento-base)')}`;
  }

  abrirHoja({
    titulo: 'Editar perfil',
    html: '<div data-ref="editar"></div>',
    alCerrar: () => { if (!volver && s.archivo) URL.revokeObjectURL(s.archivo.url); },
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

      cont.addEventListener('input', (e) => {
        if (e.target.id === 'editar-bio') cont.querySelector('[data-ref="cuenta-bio"]').textContent = `${e.target.value.length} / ${MAX_BIO}`;
      });
      cont.addEventListener('change', async (e) => {
        if (!e.target.matches('[data-ref="archivo"]')) return;
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          const blob = await prepararBanner(f);
          if (s.archivo) URL.revokeObjectURL(s.archivo.url);
          s.archivo = { blob, url: URL.createObjectURL(blob) };
          s.banner = { tipo: 'imagen', valor: s.banner?.tipo === 'imagen' ? s.banner.valor : null };
          leer(); pintar();
        } catch { aviso('No se ha podido abrir esa imagen.'); }
      });
      cont.addEventListener('click', async (e) => {
        const t = e.target;
        const b = t.closest('[data-banner]');
        if (b) {
          leer();
          const tipo = b.dataset.banner;
          if (tipo === 'ninguno') s.banner = null;
          else if (tipo === 'color') s.banner = { tipo: 'color', valor: s.banner?.tipo === 'color' ? s.banner.valor : (u.color || PALETA[0].hex) };
          else if (tipo === 'juego') s.banner = { tipo: 'juego', valor: null };
          else { cont.querySelector('[data-ref="archivo"]').click(); return; }
          pintar();
          return;
        }
        const c = t.closest('[data-banner-color]');
        if (c) { leer(); s.banner = { tipo: 'color', valor: c.dataset.bannerColor }; pintar(); return; }
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
        const antes = perfilDe(u);
        try {
          let banner = s.banner;
          if (banner?.tipo === 'imagen' && s.archivo) {
            const sb = await cliente();
            const ext = s.archivo.blob.type === 'image/webp' ? 'webp' : 'jpg';
            const ruta = `${uid}/banner-${Date.now()}.${ext}`;
            const r = await sb.storage.from(BUCKET).upload(ruta, s.archivo.blob, { contentType: s.archivo.blob.type, cacheControl: '31536000', upsert: false });
            if (r.error) throw r.error;
            banner = { tipo: 'imagen', valor: sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl };
          }
          if (banner?.tipo === 'imagen' && !banner.valor) banner = null;
          // Solo lo rellenado (lo vacío no se guarda).
          const limpio = Object.fromEntries(Object.entries({
            bio: s.bio.trim(), estado: s.estado.trim(), plataforma: s.plataforma, favorito: s.favorito, vitrina: s.vitrina, banner,
          }).filter(([, v]) => (Array.isArray(v) ? v.length : v)));
          const ok = await datos.actualizarUsuario(uid, { perfil_datos: Object.keys(limpio).length ? limpio : null }, null);
          if (!ok) throw new Error('usuarios');
          // La imagen de cabecera anterior ya no se usa.
          if (antes.banner?.tipo === 'imagen' && antes.banner.valor !== banner?.valor) {
            const ruta = rutaDeUrl(antes.banner.valor);
            if (ruta) cliente().then((sb) => sb.storage.from(BUCKET).remove([ruta])).catch(() => {});
          }
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
