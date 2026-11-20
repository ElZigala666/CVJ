// Compartir una tier list como imagen (la mía, la de otros y la del grupo): pantalla con vista
// previa en vivo y opciones (formato 9:16 / 1:1 / completo, máximo por rango con "+N", quitar
// juegos tocándolos en la vista previa, ocultar rangos vacíos, nota y horas, título y fondo).
// La imagen se dibuja aquí, en un canvas a 2x, con las portadas reales (CORS) y las mismas
// letras y colores de rango que la app. "Compartir" (Web Share con el archivo) y "Descargar".
import * as datos from './datos.js';
import { LETRAS, rangoTier, formatearNota } from './notas.js';
import { esc, aviso } from './ui.js';
import { urlPortada } from './portadas.js';
import { abrirHoja } from './hoja.js';
import { icono } from './icons.js';
import { datosTiers } from './vistas-perfil.js';
import * as metricas from './metricas.js';

const ANCHO = 540;         // ancho lógico; la imagen sale a ESCALA (1080 px)
const ESCALA = 2;
const FORMATOS = { historia: 960, cuadrado: 540, completo: null }; // alto lógico (null = el que haga falta)
const MAXIMOS = [5, 8, 12, 0]; // 0 = todos
const ASPECTO = 374 / 264;     // portada de IGDB

const rangoCorto = (l) => rangoTier(l).replace(/^(\d+)\.0–/, '$1–');

// ---------------------------------------------------------------------------
// Colores de la app (variables CSS resueltas a colores que entiende el canvas)
// ---------------------------------------------------------------------------
function colores(fondo) {
  const prueba = document.createElement('span');
  prueba.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  document.body.appendChild(prueba);
  const c = (v) => { prueba.style.color = ''; prueba.style.color = v; return getComputedStyle(prueba).color; };
  const r = {
    fondo: c('var(--fondo)'), texto: c('var(--texto)'), texto2: c('var(--texto-2)'),
    superficie: c('var(--superficie)'), superficie2: c('var(--superficie-2)'),
    acento: c('var(--acento)'), sobreAcento: c('var(--sobre-acento)'),
    tier: Object.fromEntries(LETRAS.map((l) => [l, { fondo: c(`var(--tier-${l.toLowerCase()})`), texto: c(`var(--tier-${l.toLowerCase()}-texto)`) }])),
  };
  prueba.remove();
  if (fondo === 'acento') {
    // Liso con el acento: el texto encima del acento y las cajas, un velo.
    Object.assign(r, { fondo: r.acento, texto: r.sobreAcento, texto2: r.sobreAcento, superficie: 'rgba(255,255,255,.14)', superficie2: 'rgba(0,0,0,.18)' });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Imágenes (portadas y avatar), con CORS; las que fallan, un bloque de color
// ---------------------------------------------------------------------------
const cacheImg = new Map();
function cargar(url) {
  if (!url) return Promise.resolve(null);
  if (!cacheImg.has(url)) {
    cacheImg.set(url, new Promise((ok) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = url;
    }));
  }
  return cacheImg.get(url);
}

function redondo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function textoAjustado(ctx, texto, max) {
  if (ctx.measureText(texto).width <= max) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
/** Imagen que cubre un hueco (como object-fit: cover). */
function cubrir(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

// ---------------------------------------------------------------------------
// Composición
// ---------------------------------------------------------------------------
const PAD = 26;
const CAB = 92;      // cabecera (avatar y título)
const PIE = 30;      // firma
const LETRA = 62;    // columna de la letra
const HUECO = 6;     // entre portadas
const DENTRO = 8;    // margen dentro de la fila
const ENTRE = 8;     // entre filas

/** Las filas que salen, con sus juegos (sin los quitados) y el "+N". */
function filasDe(t, op) {
  return LETRAS.map((l) => {
    const todos = t.filas[l].filter((x) => !op.quitados.has(x.clave));
    const max = op.max || Infinity;
    // Si no caben todos, el "+N" ocupa uno de los huecos (la fila no crece por él).
    const vis = todos.length > max ? todos.slice(0, max - 1) : todos;
    return { l, vis, resto: todos.length - vis.length };
  }).filter((f) => !op.ocultarVacios || f.vis.length);
}

/** Alto de las filas para un ancho de portada w. */
function medir(filas, w) {
  const h = w * ASPECTO;
  const zona = ANCHO - PAD * 2 - LETRA - HUECO - DENTRO * 2;
  const porLinea = Math.max(1, Math.floor((zona + HUECO) / (w + HUECO)));
  let total = 0;
  const altos = filas.map((f) => {
    const n = f.vis.length + (f.resto > 0 ? 1 : 0);
    const lineas = Math.max(1, Math.ceil(n / porLinea));
    const alto = Math.max(LETRA, lineas * (h + HUECO) - HUECO + DENTRO * 2);
    total += alto;
    return alto;
  });
  return { total: total + ENTRE * Math.max(0, filas.length - 1), altos, porLinea, h };
}

async function dibujar(canvas, t, op, autor) {
  const filas = filasDe(t, op);
  const altoFijo = FORMATOS[op.formato];
  const disponible = altoFijo ? altoFijo - PAD * 2 - CAB - PIE : Infinity;
  // Formatos fijos: la portada más grande que quepa. Completo: tamaño cómodo.
  let w = altoFijo ? 104 : 74;
  let m = medir(filas, w);
  while (altoFijo && m.total > disponible && w > 20) { w -= 1; m = medir(filas, w); }
  const alto = altoFijo ?? PAD * 2 + CAB + PIE + m.total;

  canvas.width = ANCHO * ESCALA;
  canvas.height = alto * ESCALA;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ESCALA, 0, 0, ESCALA, 0, 0);
  const col = colores(op.fondo);
  const titulos = 'Space Grotesk, system-ui, sans-serif';
  const texto = 'Inter, system-ui, sans-serif';
  try { await Promise.all([document.fonts?.load(`700 26px "Space Grotesk"`), document.fonts?.load('600 12px Inter')]); } catch { /* las del sistema */ }

  // Portadas (en paralelo) antes de pintar nada: el dibujo sale de una vez.
  const imgs = new Map();
  await Promise.all(filas.flatMap((f) => f.vis).map(async (x) => {
    imgs.set(x.clave, await cargar(urlPortada(x.juego.cover_id, 'cover_big')));
  }));
  const fotoAutor = autor?.foto_url ? await cargar(autor.foto_url) : null;

  // Fondo
  ctx.fillStyle = col.fondo;
  ctx.fillRect(0, 0, ANCHO, alto);

  // Cabecera: avatar (o el del grupo), título y cuántos juegos
  const ax = PAD;
  const ay = PAD + 4;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + 26, ay + 26, 26, 0, Math.PI * 2);
  ctx.closePath();
  // (El del grupo, sobre el fondo de acento, al revés: si no, no se vería.)
  const alReves = !autor && op.fondo === 'acento';
  ctx.fillStyle = autor ? (autor.color || col.acento) : alReves ? col.texto : col.acento;
  ctx.fill();
  ctx.clip();
  if (fotoAutor) cubrir(ctx, fotoAutor, ax, ay, 52, 52);
  else {
    ctx.fillStyle = alReves ? col.fondo : '#FFFFFF';
    ctx.font = `700 24px ${titulos}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(autor ? (autor.inicial || autor.nombre?.[0] || '?') : 'G', ax + 26, ay + 27);
  }
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = col.texto;
  let tam = 26;
  ctx.font = `700 ${tam}px ${titulos}`;
  const maxTitulo = ANCHO - PAD * 2 - 66;
  while (tam > 16 && ctx.measureText(op.titulo).width > maxTitulo) { tam -= 1; ctx.font = `700 ${tam}px ${titulos}`; }
  ctx.fillText(textoAjustado(ctx, op.titulo || 'Tier list', maxTitulo), ax + 66, ay + 24);
  ctx.fillStyle = col.texto2;
  ctx.font = `500 13px ${texto}`;
  const n = filas.reduce((a, f) => a + f.vis.length + f.resto, 0);
  ctx.fillText(`${n} ${n === 1 ? 'juego' : 'juegos'}`, ax + 66, ay + 46);

  // Filas (en los formatos fijos, centradas en el hueco que queda)
  const zonaArriba = PAD + CAB;
  let y = altoFijo ? zonaArriba + Math.max(0, (disponible - m.total) / 2) : zonaArriba;
  const cajas = [];
  const zx = PAD + LETRA + HUECO;
  const zw = ANCHO - PAD - zx;
  filas.forEach((f, i) => {
    const altoF = m.altos[i];
    // La letra
    const tc = col.tier[f.l];
    redondo(ctx, PAD, y, LETRA, altoF, 12);
    ctx.fillStyle = tc.fondo;
    ctx.fill();
    if (op.fondo === 'acento') {
      // Sobre el acento, el rango S (que es del mismo color) se perdería: un borde.
      ctx.strokeStyle = col.texto;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = tc.texto;
    ctx.textAlign = 'center';
    ctx.font = `700 30px ${titulos}`;
    ctx.fillText(f.l, PAD + LETRA / 2, y + altoF / 2 + 6);
    ctx.font = `600 10px ${texto}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(rangoCorto(f.l), PAD + LETRA / 2, y + altoF / 2 + 22);
    ctx.globalAlpha = 1;
    // La zona de portadas
    redondo(ctx, zx, y, zw, altoF, 12);
    ctx.fillStyle = col.superficie;
    ctx.fill();
    const lista = [...f.vis.map((x) => ({ x })), ...(f.resto > 0 ? [{ mas: f.resto }] : [])];
    lista.forEach((e, k) => {
      const fil = Math.floor(k / m.porLinea);
      const c = k % m.porLinea;
      const px = zx + DENTRO + c * (w + HUECO);
      const py = y + DENTRO + fil * (m.h + HUECO);
      if (e.mas) {
        redondo(ctx, px, py, w, m.h, 7);
        ctx.fillStyle = col.superficie2;
        ctx.fill();
        ctx.fillStyle = col.texto;
        ctx.textAlign = 'center';
        ctx.font = `700 ${Math.max(12, Math.round(w / 4))}px ${titulos}`;
        ctx.fillText(`+${e.mas}`, px + w / 2, py + m.h / 2 + 6);
        return;
      }
      const x = e.x;
      ctx.save();
      redondo(ctx, px, py, w, m.h, Math.min(7, w / 8));
      ctx.clip();
      const img = imgs.get(x.clave);
      if (img) cubrir(ctx, img, px, py, w, m.h);
      else {
        ctx.fillStyle = col.superficie2;
        ctx.fillRect(px, py, w, m.h);
        ctx.fillStyle = col.texto;
        ctx.textAlign = 'left';
        ctx.font = `700 ${Math.max(7, Math.round(w / 9))}px ${titulos}`;
        ctx.fillText(textoAjustado(ctx, x.juego.nombre, w - 8), px + 4, py + 14);
      }
      // Nota (y horas) abajo a la derecha
      const lineas = [op.nota && x.nota != null ? formatearNota(x.nota) : null, op.horas && x.horas ? metricas.textoAprox(x.horas, x.estimadas) : null].filter(Boolean);
      if (lineas.length && w >= 30) {
        const fs = Math.max(8, Math.min(13, Math.round(w / 6.5)));
        ctx.font = `700 ${fs}px ${titulos}`;
        const anchoT = Math.max(...lineas.map((t2) => ctx.measureText(t2).width)) + 8;
        const altoT = lineas.length * (fs + 2) + 4;
        redondo(ctx, px + w - anchoT - 3, py + m.h - altoT - 3, anchoT, altoT, 4);
        ctx.fillStyle = 'rgba(0,0,0,.65)';
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        lineas.forEach((t2, j) => {
          if (j) ctx.font = `600 ${Math.max(7, fs - 3)}px ${texto}`;
          ctx.fillText(t2, px + w - 7, py + m.h - altoT - 3 + (j + 1) * (fs + 2));
        });
      }
      ctx.restore();
      cajas.push({ clave: x.clave, x: px, y: py, w, h: m.h });
    });
    y += altoF + ENTRE;
  });

  // Firma discreta
  ctx.textAlign = 'right';
  ctx.font = `700 13px ${titulos}`;
  ctx.fillStyle = col.texto2;
  ctx.globalAlpha = 0.7;
  ctx.fillText('CVJ', ANCHO - PAD, alto - PAD + 8);
  ctx.globalAlpha = 1;
  return { cajas, alto };
}

// ---------------------------------------------------------------------------
// La pantalla
// ---------------------------------------------------------------------------
const puedeCompartirArchivos = () => {
  try {
    return !!navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' })] });
  } catch { return false; }
};
const esEscritorio = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

export function abrirExportar(lista) {
  const t = datosTiers(lista);
  const autor = lista === 'grupo' ? null : datos.usuario(lista.slice(2));
  const op = {
    formato: 'historia', max: 8, ocultarVacios: true, nota: true, horas: false, fondo: 'tema',
    titulo: autor ? `Tier list de ${autor.nombre}` : 'Tier list del grupo', quitados: new Set(),
  };
  const compartir = puedeCompartirArchivos();
  const seg = (nombre, valores, actual) => `
    <div class="segmentado segmentado-peq exp-seg" role="radiogroup" data-exp="${nombre}">
      ${valores.map(([v, n]) => `<button type="button" role="radio" data-valor="${v}" class="${String(actual) === String(v) ? 'activo' : ''}" aria-checked="${String(actual) === String(v)}">${n}</button>`).join('')}
    </div>`;
  abrirHoja({
    titulo: 'Compartir como imagen',
    html: `
      <div class="exp">
        <div class="exp-previa" data-ref="previa"><canvas data-ref="lienzo" aria-label="Vista previa de la imagen"></canvas><span class="exp-cargando" data-ref="cargando">Preparando…</span></div>
        <p class="ajustes-nota exp-nota" data-ref="nota">Toca un juego en la vista previa para quitarlo de la imagen (la tier list no cambia).</p>
        <span class="campo-titulo">Formato</span>
        ${seg('formato', [['historia', 'Historia 9:16'], ['cuadrado', 'Cuadrado'], ['completo', 'Completo']], op.formato)}
        <span class="campo-titulo">Juegos por rango</span>
        ${seg('max', MAXIMOS.map((x) => [x, x || 'Todos']), op.max)}
        <label class="campo-titulo" for="exp-titulo">Título</label>
        <input id="exp-titulo" class="psn-input" data-ref="titulo" maxlength="60" value="${esc(op.titulo)}">
        <span class="campo-titulo">Fondo</span>
        ${seg('fondo', [['tema', 'Mi tema'], ['acento', 'Color de acento']], op.fondo)}
        <div class="exp-interruptores">
          <label class="interruptor mini"><input type="checkbox" data-exp-op="nota" checked><span>Nota en cada portada</span></label>
          <label class="interruptor mini"><input type="checkbox" data-exp-op="horas"><span>Horas en cada portada</span></label>
          <label class="interruptor mini"><input type="checkbox" data-exp-op="ocultarVacios" checked><span>Ocultar rangos vacíos</span></label>
        </div>
        <div class="fila-botones exp-botones">
          ${compartir ? `<button type="button" class="boton-principal con-icono" data-ref="compartir">${icono('compartir', { tam: 18, color: 'currentColor' })}<span>Compartir</span></button>` : ''}
          ${!compartir || esEscritorio() ? `<button type="button" class="${compartir ? 'boton-secundario' : 'boton-principal'} con-icono" data-ref="descargar">${icono('instalar', { tam: 18, color: 'currentColor' })}<span>Descargar</span></button>` : ''}
        </div>
      </div>`,
    alMontar(cuerpo) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      const lienzo = $('lienzo');
      let cajas = [];
      let turno = 0;
      let reloj = 0;
      const pintar = async () => {
        const mio = ++turno;
        $('cargando').hidden = false;
        // Se dibuja en uno aparte y se pasa cuando está (sin parpadeos).
        const aparte = document.createElement('canvas');
        const r = await dibujar(aparte, t, op, autor);
        if (mio !== turno) return;
        lienzo.width = aparte.width;
        lienzo.height = aparte.height;
        lienzo.getContext('2d').drawImage(aparte, 0, 0);
        lienzo.classList.toggle('alto', op.formato === 'completo');
        cajas = r.cajas;
        $('cargando').hidden = true;
        $('nota').innerHTML = op.quitados.size
          ? `${op.quitados.size} ${op.quitados.size === 1 ? 'juego quitado' : 'juegos quitados'} de la imagen. <button type="button" class="enlace-discreto" data-ref="recuperar">Volver a ponerlos</button>`
          : 'Toca un juego en la vista previa para quitarlo de la imagen (la tier list no cambia).';
      };
      const luego = () => { clearTimeout(reloj); reloj = setTimeout(pintar, 120); };
      pintar();

      cuerpo.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-exp] [data-valor]');
        if (b) {
          const grupo = b.closest('[data-exp]');
          const k = grupo.dataset.exp;
          op[k] = k === 'max' ? Number(b.dataset.valor) : b.dataset.valor;
          for (const x of grupo.querySelectorAll('[data-valor]')) { const on = x === b; x.classList.toggle('activo', on); x.setAttribute('aria-checked', String(on)); }
          luego();
          return;
        }
        if (e.target.closest('[data-ref="recuperar"]')) { op.quitados.clear(); luego(); return; }
        if (e.target === lienzo) {
          const r = lienzo.getBoundingClientRect();
          const x = (e.clientX - r.left) * (ANCHO / r.width);
          const y = (e.clientY - r.top) * (ANCHO / r.width);
          const c = cajas.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
          if (c) { op.quitados.add(c.clave); luego(); }
          return;
        }
        if (e.target.closest('[data-ref="compartir"], [data-ref="descargar"]')) {
          const boton = e.target.closest('button');
          boton.disabled = true;
          try {
            const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/png'));
            const nombre = `${(op.titulo || 'tier-list').toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'tier-list'}.png`;
            const archivo = new File([blob], nombre, { type: 'image/png' });
            if (boton.dataset.ref === 'compartir') {
              try { await navigator.share({ files: [archivo], title: op.titulo }); } catch (err) { if (err?.name !== 'AbortError') aviso('No se ha podido compartir'); }
            } else {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = nombre;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 4000);
              aviso('Imagen descargada');
            }
          } catch (err) {
            console.warn('[tier imagen]', err);
            aviso('No se ha podido crear la imagen');
          } finally { boton.disabled = false; }
        }
      });
      cuerpo.addEventListener('change', (e) => {
        const c = e.target.closest('[data-exp-op]');
        if (c) { op[c.dataset.expOp] = c.checked; luego(); }
      });
      $('titulo').addEventListener('input', (e) => { op.titulo = e.target.value; luego(); });
    },
  });
}
