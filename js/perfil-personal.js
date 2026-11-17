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

// ---------------------------------------------------------------------------
// Cabecera del perfil (diseño v2): arte del juego favorito, imagen propia, degradado del
// color de acento (el tipo por defecto) o patrón de hexágonos. Ocupa todo el ancho, se
// oscurece arriba para que se vean los botones y se desvanece por abajo con una máscara:
// se funde con el fondo real de la app (tema, galería o imagen), sin cortes.
// ---------------------------------------------------------------------------
export const TIPOS_CABECERA = [
  { id: 'juego', nombre: 'Juego fav.' },
  { id: 'imagen', nombre: 'Tu imagen' },
  { id: 'degradado', nombre: 'Degradado' },
  { id: 'patron', nombre: 'Patrón' },
];
const URL_ARTE = (id) => `https://images.igdb.com/igdb/image/upload/t_1080p/${id}.jpg`;
export const urlArte = URL_ARTE;
const lim = (n, a, b) => Math.min(b, Math.max(a, Number(n) || 0));

/** Lo elegido (también desde la cabecera de antes, perfil_datos.banner). */
export function cabeceraDe(u) {
  const d = u?.perfil_datos && typeof u.perfil_datos === 'object' ? u.perfil_datos : {};
  let c = d.cabecera && typeof d.cabecera === 'object' ? d.cabecera : null;
  if (!c) {
    const b = d.banner;
    c = b?.tipo === 'imagen' && /^https:\/\//.test(b.valor ?? '') ? { tipo: 'imagen', imagen: b.valor }
      : b?.tipo === 'juego' ? { tipo: 'juego' } : { tipo: 'degradado' };
  }
  return {
    tipo: TIPOS_CABECERA.some((t) => t.id === c.tipo) ? c.tipo : 'degradado',
    arte: typeof c.arte === 'string' && /^[a-z0-9]+$/i.test(c.arte) ? c.arte : null,
    imagen: typeof c.imagen === 'string' && /^https:\/\//.test(c.imagen) ? c.imagen : null,
    x: lim(c.x ?? 50, 0, 100), y: lim(c.y ?? 50, 0, 100), zoom: lim(c.zoom ?? 1, 1, 3),
    intensidad: lim(c.intensidad ?? 50, 0, 100),
  };
}

/** Lo que se pinta de verdad: si falta algo (sin favorito, sin arte, sin imagen), el degradado. */
export function cabeceraEfectiva(u, c = cabeceraDe(u)) {
  if (c.tipo === 'juego') {
    const fav = datos.juegoConocido(perfilDe(u).favorito);
    const arte = c.arte ?? fav?.arte_id ?? null;
    if (fav && arte) return { ...c, juego: fav, arte };
    return { ...c, tipo: 'degradado' };
  }
  if (c.tipo === 'imagen' && !c.imagen) return { ...c, tipo: 'degradado' };
  return c;
}

// Colores (como en el diseño): el acento girado en el círculo de color.
const hx = (h) => { const s = String(h || '#7C3AED').replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.substr(i, 2), 16) || 0); };
const rgbaDe = (h, a) => { const c = hx(h); return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`; };
function girar(h, d, l = null) {
  const [r, g, b] = hx(h).map((v) => v / 255);
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const ll = (mx + mn) / 2; const dd = mx - mn;
  let s = 0; let hh = 0;
  if (dd) { s = ll > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); hh = (mx === r ? ((g - b) / dd + (g < b ? 6 : 0)) : mx === g ? ((b - r) / dd + 2) : ((r - g) / dd + 4)) * 60; }
  const H = (((hh + d) % 360) + 360) % 360; const S = Math.max(s, 0.45); const L = l == null ? ll : l;
  const k = (n) => (n + H / 30) % 12; const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
}
const oscuroAhora = () => document.documentElement.getAttribute('data-tema') === 'oscuro';

/** Degradado del color de acento con textura fina. */
export function cssDegradado(acc, oscuro = oscuroAhora()) {
  return `repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 1px, transparent 1px 10px), radial-gradient(70% 120% at 8% 0%, ${rgbaDe(acc, 0.9)} 0%, transparent 60%), radial-gradient(60% 110% at 92% 6%, ${rgbaDe(girar(acc, 45), 0.75)} 0%, transparent 62%), radial-gradient(90% 120% at 55% 100%, ${rgbaDe(girar(acc, -55), 0.6)} 0%, transparent 66%), ${girar(acc, 0, oscuro ? 0.22 : 0.78)}`;
}
/** Patrón de hexágonos de la marca en tonos del acento (intensidad 0-100). */
export function htmlPatron(acc, intensidad = 50, oscuro = oscuroAhora(), id = 'hexpat') {
  const f = 0.3 + 1.4 * (intensidad / 100);
  const base = `radial-gradient(80% 120% at 85% 0%, ${rgbaDe(acc, 0.55)} 0%, transparent 65%), ${girar(acc, -20, oscuro ? 0.16 : 0.86)}`;
  return `
    <div class="cab-fondo" style="background:${base}"></div>
    <svg class="cab-patron" width="100%" height="100%" aria-hidden="true">
      <defs><pattern id="${id}" width="34" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
        <path d="M17 3 29 10v14l-12 7-12-7V10z" fill="${rgbaDe(acc, Math.min(0.9, 0.22 * f))}"/>
        <path d="M17 23 22 26v6l-5 3-5-3v-6z" fill="${rgbaDe(girar(acc, 40), Math.min(0.95, 0.35 * f))}" transform="translate(17 0)"/>
      </pattern></defs>
      <rect width="100%" height="100%" fill="url(#${id})"/>
    </svg>`;
}

/** Las capas de una cabecera (sin botones): para el perfil y para la vista previa. */
export function capasCabecera(c, acc, id = 'hexpat') {
  let fondo;
  if (c.tipo === 'juego') fondo = `<div class="cab-fondo" style="background-image:url('${esc(URL_ARTE(c.arte))}');background-size:cover;background-position:center 30%"></div>`;
  else if (c.tipo === 'imagen') fondo = `<div class="cab-fondo" style="background-image:url('${esc(c.imagen)}');background-size:cover;background-position:${c.x}% ${c.y}%;transform:scale(${c.zoom});transform-origin:${c.x}% ${c.y}%"></div>`;
  else if (c.tipo === 'patron') fondo = htmlPatron(acc, c.intensidad, undefined, id);
  else fondo = `<div class="cab-fondo" style="background:${cssDegradado(acc)}"></div>`;
  return `<div class="cab-capa">${fondo}<div class="cab-sombra"></div></div>`;
}
