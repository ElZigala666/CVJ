// Perfil personalizable: lo que cada uno pone en su perfil (usuarios.perfil_datos) y cómo se
// pinta. Todo es opcional: lo que no se rellena no ocupa sitio.
//   bio, estado ("Ahora mismo…"), plataforma principal, juego favorito, vitrina (top 3)
//   y cabecera (banner): un color, la portada del juego favorito o una imagen propia.
import { icono } from './icons.js';
import { esc, portada, chipLetra } from './ui.js';
import * as datos from './datos.js';
import { urlPortada } from './ui.js';
import { formatearNota, notaALetra } from './notas.js';

export const MAX_BIO = 160;
export const MAX_ESTADO = 60;
export const MAX_VITRINA = 3;
export const PLATAFORMAS_PERFIL = ['PS5', 'PS4', 'Xbox Series', 'Xbox One', 'PC', 'Steam Deck', 'Switch 2', 'Switch', 'Móvil'];

const esHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Los datos del perfil de un usuario, ya limpios (nunca null). */
export function perfilDe(u) {
  const d = u?.perfil_datos && typeof u.perfil_datos === 'object' ? u.perfil_datos : {};
  const juego = (id) => (id != null && datos.juegoConocido(datos.canonico(id)) ? datos.canonico(id) : null);
  const b = d.banner && typeof d.banner === 'object' ? d.banner : null;
  return {
    bio: typeof d.bio === 'string' ? d.bio.trim().slice(0, MAX_BIO) : '',
    estado: typeof d.estado === 'string' ? d.estado.trim().slice(0, MAX_ESTADO) : '',
    plataforma: typeof d.plataforma === 'string' ? d.plataforma.slice(0, 20) : '',
    favorito: juego(d.favorito),
    vitrina: [...new Set((Array.isArray(d.vitrina) ? d.vitrina : []).map(juego).filter((x) => x != null))].slice(0, MAX_VITRINA),
    banner: b && ((b.tipo === 'color' && esHex(b.valor)) || (b.tipo === 'imagen' && /^https:\/\//.test(b.valor ?? '')) || b.tipo === 'juego') ? { tipo: b.tipo, valor: b.valor ?? null } : null,
  };
}

/** Estilo del banner (o '' si no hay). El de "juego" usa la portada del favorito, desenfocada. */
function estiloBanner(p, u) {
  const b = p.banner;
  if (!b) return null;
  if (b.tipo === 'color') return { clase: 'color', estilo: `--b-color:${b.valor}` };
  if (b.tipo === 'imagen') return { clase: 'imagen', estilo: `--b-img:url('${esc(b.valor)}')` };
  const j = datos.juegoConocido(p.favorito ?? p.vitrina[0]);
  if (!j?.cover_id) return { clase: 'color', estilo: `--b-color:${esc(u.color || 'var(--acento-base)')}` };
  return { clase: 'juego', estilo: `--b-img:url('${esc(urlPortada(j.cover_id, 'cover_big'))}');--b-color:${esc(j.color_dominante || '#222')}` };
}

export function htmlBanner(u) {
  const e = estiloBanner(perfilDe(u), u);
  return e ? `<div class="perfil-banner perfil-banner-${e.clase}" style="${e.estilo}" aria-hidden="true"></div>` : '';
}
export const tieneBanner = (u) => !!perfilDe(u).banner;

/** Bio y estado, bajo el nombre. */
export function htmlBio(u) {
  const p = perfilDe(u);
  return `
    ${p.bio ? `<p class="perfil-bio">${esc(p.bio)}</p>` : ''}
    ${p.estado ? `<span class="perfil-estado"><i aria-hidden="true"></i>${esc(p.estado)}</span>` : ''}`;
}

/** Vitrina: juego favorito (grande) y top 3. '' si no ha puesto nada. */
export function htmlVitrina(u, esMio) {
  const p = perfilDe(u);
  const fav = datos.juegoConocido(p.favorito);
  const top = p.vitrina.map((id) => datos.juegoConocido(id)).filter(Boolean);
  if (!fav && !top.length) return '';
  const v = fav ? datos.miValoracion(u.id, fav.igdb_id) : null;
  return `
    <section class="perfil-vitrina">
      ${fav ? `
        <a class="vitrina-favorito" href="#juego/${fav.igdb_id}" data-precarga="${esc(fav.cover_id ?? '')}" style="--tinte:${esc(fav.color_dominante || 'var(--acento-base)')}">
          ${portada(fav, { clase: 'portada-destacado', prioridad: true })}
          <span class="vitrina-favorito-texto">
            <small>${esMio ? 'Mi juego favorito' : 'Su juego favorito'}</small>
            <strong>${esc(fav.nombre)}</strong>
            <span class="vitrina-favorito-meta">${[fav.anio, fav.desarrolladora].filter(Boolean).map(esc).join(' · ')}</span>
            ${v?.nota != null ? `<span class="vitrina-favorito-nota">${formatearNota(v.nota)}${chipLetra(notaALetra(v.nota), 'mini')}</span>` : ''}
          </span>
        </a>` : ''}
      ${top.length ? `
        <div class="vitrina-top">
          <span class="campo-titulo">${esMio ? 'Mi' : 'Su'} top ${top.length}</span>
          <div class="vitrina-top-fila">
            ${top.map((j, i) => `
              <a class="vitrina-top-item" href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}" aria-label="${i + 1}. ${esc(j.nombre)}">
                ${portada(j, { clase: 'portada-jugando', titulo: 'arriba' })}
                <span class="vitrina-pos">${i + 1}</span>
              </a>`).join('')}
          </div>
        </div>` : ''}
    </section>`;
}

/** Botón "Editar perfil" (solo en el mío). Si aún no ha puesto nada, invita a hacerlo. */
export function botonEditar(u) {
  const p = perfilDe(u);
  const vacio = !p.bio && !p.estado && !p.favorito && !p.vitrina.length && !p.banner && !p.plataforma;
  return `<button type="button" class="boton-secundario neutro boton-pequeno perfil-editar" data-accion="editar-perfil">${icono('ajustes', { tam: 15, color: 'currentColor' })}<span>${vacio ? 'Personalizar mi perfil' : 'Editar perfil'}</span></button>`;
}
