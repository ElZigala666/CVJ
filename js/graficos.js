// Gráficos hechos a mano en SVG (sin librerías): radar, anillo, barras con portadas y mapa
// de calor. Solo devuelven HTML; los colores salen del acento (variables --s0..--s7 de
// .graf en css/app.css) y se animan al entrar en pantalla (observarGraficos).
// Lo que se puede tocar lleva data-graf="{dimensión}" data-tag="{etiqueta}" (lo abre
// js/vistas-perfil.js con los juegos que lo forman).
import { esc, portada } from './ui.js';

const r1 = (n) => Math.round(n * 10) / 10;
const pct = (n) => `${Math.round(n * 100)}%`;

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------
/**
 * ejes: nombres; base: { valores (0-1), nombre }; otras: [{ id, valores, nombre }] (una
 * visible: activa); max: el valor que llega al borde. dim: lo que abre tocar un eje.
 */
export function radar({ ejes, base, otras = [], activa = null, max = 1, dim = 'generos', uid = '' }) {
  const W = 400, H = 310, cx = W / 2, cy = H / 2 + 2, R = 112;
  const n = ejes.length;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const punto = (i, v) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];
  const puntos = (valores) => valores.map((v, i) => punto(i, Math.min(1, v / max)).map(r1).join(',')).join(' ');
  const anillos = [0.25, 0.5, 0.75, 1].map((f) => `<polygon class="radar-anillo" points="${ejes.map((_, i) => punto(i, f).map(r1).join(',')).join(' ')}"/>`).join('');
  const radios = ejes.map((_, i) => { const [x, y] = punto(i, 1); return `<line class="radar-radio" x1="${cx}" y1="${cy}" x2="${r1(x)}" y2="${r1(y)}"/>`; }).join('');
  const etiquetas = ejes.map((t, i) => {
    const [x, y] = punto(i, 1.13);
    const c = Math.cos(ang(i));
    const ancla = Math.abs(c) < 0.25 ? 'middle' : c > 0 ? 'start' : 'end';
    const dy = Math.sin(ang(i)) > 0.5 ? 10 : Math.sin(ang(i)) < -0.5 ? -2 : 4;
    return `<g class="radar-eje" data-graf="${dim}" data-tag="${esc(t)}" data-uid="${esc(uid)}" role="button" tabindex="0" aria-label="${esc(t)}">
      <circle cx="${r1(x)}" cy="${r1(y)}" r="20" class="graf-tocar"/>
      <text x="${r1(x)}" y="${r1(y + dy)}" text-anchor="${ancla}">${esc(t)}</text>
    </g>`;
  }).join('');
  const otrasSvg = otras.map((o) => `
    <g class="radar-otra" data-serie="${esc(o.id)}"${o.id === activa ? '' : ' style="display:none"'}>
      <polygon class="radar-poligono-otra graf-anim" points="${puntos(o.valores)}"/>
    </g>`).join('');
  const vertices = base.valores.map((v, i) => { const [x, y] = punto(i, Math.min(1, v / max)); return `<circle class="radar-vertice graf-anim" cx="${r1(x)}" cy="${r1(y)}" r="3.2"/>`; }).join('');
  return `
    <svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="Radar de géneros de ${esc(base.nombre)}" style="--cx:${cx}px;--cy:${cy}px">
      ${anillos}${radios}
      ${otrasSvg}
      <polygon class="radar-poligono graf-anim" points="${puntos(base.valores)}"/>
      ${vertices}
      ${etiquetas}
    </svg>`;
}

// ---------------------------------------------------------------------------
// Anillo
// ---------------------------------------------------------------------------
/** La etiqueta del centro del anillo, entera: en dos líneas por palabras si no cabe en una (12 letras). */
function lineasCentro(t) {
  if (t.length <= 12) return [t];
  const palabras = t.split(' ');
  const lineas = [''];
  for (const w of palabras) {
    const l = lineas.length - 1;
    if (!lineas[l] || (lineas[l] + ' ' + w).length <= 12 || l === 1) lineas[l] = lineas[l] ? `${lineas[l]} ${w}` : w;
    else lineas.push(w);
  }
  return lineas.map((l) => (l.length > 13 ? `${l.slice(0, 12)}…` : l));
}

/**
 * partes: [{ tag, peso, n }] (ordenadas); se enseñan las 5 primeras y el resto junto en
 * "Otros". centro: { valor, texto }.
 */
export function anillo({ partes, dim, uid = '', titulo, maxPartes = 5 }) {
  const total = partes.reduce((a, p) => a + p.peso, 0);
  if (!total) return '';
  // Por peso; "Otros" (si existe como etiqueta) siempre al final.
  let lista = partes.filter((p) => p.peso > 0).sort((a, b) => /^Otr[oa]s$/.test(a.tag) - /^Otr[oa]s$/.test(b.tag) || b.peso - a.peso);
  // Si sobra solo una, se enseña con su nombre (no tiene sentido un "Otros" de una).
  const corte = lista.length === maxPartes + 1 ? maxPartes + 1 : maxPartes;
  const sobrante = lista.slice(corte);
  lista = lista.slice(0, corte);
  const restos = sobrante.reduce((a, p) => a + p.peso, 0);
  const otrosIdx = lista.findIndex((p) => /^Otr[oa]s$/.test(p.tag));
  if (restos > 0) {
    if (otrosIdx >= 0) lista[otrosIdx] = { ...lista[otrosIdx], peso: lista[otrosIdx].peso + restos, junto: true };
    else lista.push({ tag: 'Otros', peso: restos, junto: true });
  }
  const r = 44, C = 2 * Math.PI * r, hueco = lista.length > 1 ? 2 : 0;
  let acum = 0;
  const arcos = lista.map((p, i) => {
    const largo = Math.max(0.5, (p.peso / total) * C - hueco);
    const s = `<circle class="anillo-arco graf-anim" cx="60" cy="60" r="${r}" style="--c:${r1(C)};--serie:var(--s${i});stroke-dasharray:${r1(largo)} ${r1(C - largo)};stroke-dashoffset:${r1(-acum)}"${p.junto ? '' : ` data-graf="${dim}" data-tag="${esc(p.tag)}" data-uid="${esc(uid)}"`}/>`;
    acum += (p.peso / total) * C;
    return s;
  }).join('');
  const prin = lista[0];
  const sub = lineasCentro(prin.tag);
  return `
    <div class="anillo">
      <svg class="anillo-svg" viewBox="0 0 120 120" role="img" aria-label="${esc(titulo)}">
        <circle class="anillo-pista" cx="60" cy="60" r="${r}"/>
        <g transform="rotate(-90 60 60)">${arcos}</g>
        <text class="anillo-centro" x="60" y="${sub.length > 1 ? 57 : 62}">${pct(prin.peso / total)}</text>
        <text class="anillo-centro-sub" x="60" y="${sub.length > 1 ? 70 : 76}">${sub.map((l, i) => `<tspan x="60" dy="${i ? 11 : 0}">${esc(l)}</tspan>`).join('')}</text>
      </svg>
      <ul class="anillo-leyenda">
        ${lista.map((p, i) => `
          <li>
            ${p.junto
              ? `<span class="anillo-item"><i style="--serie:var(--s${i})"></i><span>${esc(p.tag)}</span><b>${pct(p.peso / total)}</b></span>`
              : `<button type="button" class="anillo-item" data-graf="${dim}" data-tag="${esc(p.tag)}" data-uid="${esc(uid)}"><i style="--serie:var(--s${i})"></i><span>${esc(p.tag)}</span><b>${pct(p.peso / total)}</b></button>`}
          </li>`).join('')}
      </ul>
    </div>`;
}

// ---------------------------------------------------------------------------
// Barras horizontales con portadas pequeñas
// ---------------------------------------------------------------------------
/** filas: [{ tag, valor, texto, juegos: [juego] }]; escala: el valor de la barra entera. */
export function barras({ filas, dim, uid = '', escala = null }) {
  const max = escala ?? Math.max(1e-9, ...filas.map((f) => f.valor));
  return `
    <div class="barras-graf">
      ${filas.map((f, i) => `
        <button type="button" class="barra-graf" data-graf="${dim}" data-tag="${esc(f.tag)}" data-uid="${esc(uid)}">
          <span class="barra-graf-nombre">${esc(f.tag)}</span>
          <span class="barra-graf-pista"><span class="barra-graf-relleno graf-anim" style="width:${Math.max(3, Math.round((f.valor / max) * 100))}%;--i:${i}"></span></span>
          <span class="barra-graf-valor">${esc(f.texto)}</span>
          <span class="barra-graf-portadas" aria-hidden="true">${(f.juegos ?? []).slice(0, 3).map((j) => portada(j, { clase: 'portada-mini' })).join('')}</span>
        </button>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------------------
// Mapa de calor (un año, por días; columnas = semanas de lunes a domingo)
// ---------------------------------------------------------------------------
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const claveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** porDia: Map('aaaa-mm-dd' → n). Niveles 1-4 en escala logarítmica (un día enorme no apaga los demás). */
export function mapaCalor(porDia, { semanas = 53, cargas = new Set() } = {}) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diaSemana = (hoy.getDay() + 6) % 7; // lunes = 0
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() - diaSemana - (semanas - 1) * 7);
  const max = Math.max(1, ...porDia.values());
  const nivel = (n) => (n ? Math.max(1, Math.min(4, Math.ceil((4 * Math.log1p(n)) / Math.log1p(max)))) : 0);
  const T = 11, G = 3, arriba = 16, izq = 22;
  let celdas = '', meses = '';
  let mesAnterior = -1;
  for (let s = 0; s < semanas; s++) {
    for (let d = 0; d < 7; d++) {
      const f = new Date(inicio);
      f.setDate(inicio.getDate() + s * 7 + d);
      if (f > hoy) continue;
      if (d === 0 && f.getMonth() !== mesAnterior) {
        if (s < semanas - 2) meses += `<text class="calor-mes" x="${izq + s * (T + G)}" y="10">${MESES[f.getMonth()]}</text>`;
        mesAnterior = f.getMonth();
      }
      const k = claveDia(f);
      const n = porDia.get(k) ?? 0;
      const carga = cargas.has(k);
      const o = carga ? 0.75 : 0;
      celdas += `<rect class="calor-celda nv${nivel(n)}${carga ? ' carga' : ''} graf-anim" x="${izq + s * (T + G) + o}" y="${arriba + d * (T + G) + o}" width="${T - 2 * o}" height="${T - 2 * o}" rx="2.5" style="--i:${s}" data-dia="${k}"${n || carga ? ' role="button"' : ''} aria-label="${f.getDate()} ${MESES[f.getMonth()]}: ${n || 'nada'}${carga ? ', puesta al día' : ''}"></rect>`;
    }
  }
  const dias = ['L', '', 'X', '', 'V', '', ''].map((t, d) => (t ? `<text class="calor-dia" x="0" y="${arriba + d * (T + G) + 9}">${t}</text>` : '')).join('');
  const W = izq + semanas * (T + G), H = arriba + 7 * (T + G);
  return `<svg class="calor" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Actividad del último año">${meses}${dias}${celdas}</svg>`;
}
