// Apariencia de la app (diseño v2): se elige SOLO un fondo y cada fondo ya es claro u
// oscuro (no hay ajuste de tema aparte), o "Automático": una pareja de fondos, uno claro
// para el día y otro oscuro para la noche, según el sistema. Más el color de acento.
//
// Todo se resuelve aquí en variables CSS que se ponen en <html> (inline):
//   - el fondo: --f-base, --f-imagen, --f-velo, --f-desenfoque, --f-pos, --f-zoom
//     (css/app.css lo pinta en una capa fija detrás de todo);
//   - los neutros: --fondo, --superficie, --superficie-2, --superficie-solida, --texto,
//     --texto-2, --borde, y la sombra de los títulos si hace falta;
//   - el acento: botones y notas usan el color tal cual (--acento); los textos y enlaces
//     un tono ajustado que se lee sobre ESTE fondo (--acento-texto); y los tiers.
// Lo resuelto se guarda también en localStorage ("cvj.ap"): el <head> de index.html lo
// aplica antes de pintar nada (sin parpadeos). Lo elegido se guarda en la cuenta
// (usuarios.apariencia, { v: 2, ... }) y el acento en usuarios.acento.

const CLAVE = 'cvj.ap';
const sistemaOscuro = window.matchMedia?.('(prefers-color-scheme: dark)');

// ---------------------------------------------------------------------------
// Colores (sin depender de nada)
// ---------------------------------------------------------------------------
const hx = (h) => { const s = String(h || '#000').replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.substr(i, 2), 16) || 0); };
const aHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
export const mezcla = (a, b, t) => { const A = hx(a); const B = hx(b); return aHex(A.map((v, i) => v + (B[i] - v) * t)); };
export const rgba = (h, a) => { const c = hx(h); return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`; };
export function luz(h) {
  const c = hx(h).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const contraste = (la, lb) => (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
function hsl(h) {
  const [r, g, b] = hx(h).map((v) => v / 255);
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2; const d = mx - mn;
  let s = 0; let hh = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
    hh *= 60;
  }
  return [hh, s, l];
}
function desdeHsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return aHex([f(0), f(8), f(4)].map((x) => x * 255));
}
/** El acento girado en el círculo de color (y con otra luminosidad si se pide). */
export function girar(h, grados, l = null) { const x = hsl(h); return desdeHsl(x[0] + grados, Math.max(x[1], 0.45), l == null ? x[2] : l); }
const esHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const limitar = (n, a, b) => Math.min(b, Math.max(a, Number(n) || 0));

// ---------------------------------------------------------------------------
// Fondos y paleta (diseño v2, pantallas 08-11)
// ---------------------------------------------------------------------------
export const ACENTO_DEFECTO = '#7C3AED';
export const PALETA_ACENTO = ['#FFE600', '#FF6B3D', '#E11D48', '#DB2777', '#7C3AED', '#4F46E5', '#2563EB', '#22B8CF', '#16A34A', '#84CC16'];

export const FONDOS = {
  blanco: { nombre: 'Blanco', oscuro: false, base: '#FFFFFF', css: () => '#FFFFFF' },
  niebla: { nombre: 'Niebla', oscuro: false, base: '#F1F0F6', css: () => 'radial-gradient(120% 70% at 100% 0%, #E2DDF3 0%, #F1F0F6 60%)' },
  papel: { nombre: 'Papel', oscuro: false, base: '#F7F3EB', css: () => 'radial-gradient(120% 70% at 0% 0%, #EFE4CF 0%, #F7F3EB 60%)' },
  medianoche: { nombre: 'Medianoche', oscuro: true, base: '#0D1020', css: () => 'radial-gradient(120% 70% at 0% 0%, #1E2A5C 0%, #0D1020 60%)' },
  aurora: { nombre: 'Aurora', oscuro: true, base: '#140F1F', css: () => 'radial-gradient(110% 70% at 100% 0%, #4A2470 0%, #140F1F 62%)' },
  bosque: { nombre: 'Bosque', oscuro: true, base: '#0C1613', css: () => 'radial-gradient(120% 70% at 0% 100%, #174332 0%, #0C1613 62%)' },
  carbon: { nombre: 'Carbón', oscuro: true, base: '#121214', css: () => '#121214' },
  acento: { nombre: 'Tu color', oscuro: true, base: '#121016', css: (acc) => `radial-gradient(110% 70% at 100% 0%, ${mezcla(acc, '#121016', 0.5)} 0%, #121016 62%)` },
  imagen: { nombre: 'Tu imagen', oscuro: true, base: '#12263F', css: () => '#12263F' },
};
export const ORDEN_FONDOS = ['blanco', 'niebla', 'papel', 'medianoche', 'aurora', 'bosque', 'carbon', 'acento', 'imagen'];
export const FONDOS_DIA = ['blanco', 'niebla', 'papel'];
export const FONDOS_NOCHE = ['medianoche', 'aurora', 'bosque', 'carbon', 'acento'];

export const IMAGEN_DEFECTO = { desenfoque: 2, velo: 30, texto: 'claro', x: 50, y: 50, zoom: 1 };
const DEFECTO = { v: 2, modo: 'auto', fondo: 'blanco', dia: 'blanco', noche: 'carbon', imagen: null };

/** Lo guardado en la cuenta, completo y limpio (también lo de antes del diseño v2). */
export function normalizar(a) {
  if (!a || typeof a !== 'object' || a.v !== 2) return migrar(a);
  const im = a.imagen && typeof a.imagen === 'object' && /^https:\/\//.test(a.imagen.url ?? '') ? {
    url: a.imagen.url,
    desenfoque: limitar(a.imagen.desenfoque ?? IMAGEN_DEFECTO.desenfoque, 0, 20),
    velo: limitar(a.imagen.velo ?? IMAGEN_DEFECTO.velo, 0, 85),
    texto: a.imagen.texto === 'oscuro' ? 'oscuro' : 'claro',
    x: limitar(a.imagen.x ?? 50, 0, 100), y: limitar(a.imagen.y ?? 50, 0, 100), zoom: limitar(a.imagen.zoom ?? 1, 1, 3),
    base: esHex(a.imagen.base) ? a.imagen.base : null,
    medida: a.imagen.medida && typeof a.imagen.medida.media === 'number' ? { media: limitar(a.imagen.medida.media, 0, 1), max: limitar(a.imagen.medida.max, 0, 1) } : null,
  } : null;
  const ok = (id, lista) => (lista.includes(id) ? id : null);
  return {
    v: 2,
    modo: a.modo === 'auto' ? 'auto' : 'fijo',
    fondo: ok(a.fondo, ORDEN_FONDOS) === 'imagen' && !im ? 'carbon' : ok(a.fondo, ORDEN_FONDOS) ?? DEFECTO.fondo,
    dia: ok(a.dia, FONDOS_DIA) ?? DEFECTO.dia,
    noche: ok(a.noche, FONDOS_NOCHE) ?? DEFECTO.noche,
    imagen: im,
  };
}

/** De lo de antes (tema por dispositivo + fondo de la galería o imagen propia) a lo más parecido. */
const EQUIVALENTES = {
  medianoche: 'medianoche', aurora: 'aurora', nebulosa: 'aurora', brasas: 'carbon', bosque: 'bosque', grafito: 'carbon',
  'acento-oscuro': 'acento', papel: 'papel', niebla: 'niebla', melocoton: 'papel', menta: 'niebla', 'acento-claro': 'niebla',
};
export function migrar(a) {
  let tema = 'auto';
  try { tema = localStorage.getItem('cvj.tema') || 'auto'; } catch { /* nada */ }
  if (a && a.fondo === 'propia' && /^https:\/\//.test(a.imagen ?? '')) {
    const i = limitar(a.intensidad ?? 60, 0, 100) / 100;
    return normalizar({
      v: 2, modo: 'fijo', fondo: 'imagen',
      imagen: { url: a.imagen, desenfoque: Math.round(2 + 8 * i), velo: Math.round(28 + 32 * i), texto: a.modo === 'claro' ? 'oscuro' : 'claro', base: esHex(a.base) ? a.base : null },
    });
  }
  if (a && EQUIVALENTES[a.fondo]) return normalizar({ v: 2, modo: 'fijo', fondo: EQUIVALENTES[a.fondo] });
  if (tema === 'claro') return normalizar({ v: 2, modo: 'fijo', fondo: 'blanco' });
  if (tema === 'oscuro') return normalizar({ v: 2, modo: 'fijo', fondo: 'carbon' });
  return normalizar({ ...DEFECTO });
}

// ---------------------------------------------------------------------------
// Resolver: de lo elegido a las variables de un fondo concreto
// ---------------------------------------------------------------------------
/** ¿Se lee el texto sobre la imagen con este desenfoque y este velo? (peor caso medido) */
export function legibleImagen(im, texto = im?.texto) {
  const m = im?.medida ?? { media: 0.2, max: 0.62 };
  const oscuro = texto !== 'oscuro';
  const v = limitar(im?.velo ?? 30, 0, 85) / 100;
  const b = Math.min(limitar(im?.desenfoque ?? 2, 0, 20), 16) / 16 * 0.7; // el desenfoque reparte los brillos
  const mn = 0.02;
  const lo = m.media - (m.media - mn) * (1 - b);
  const peor = oscuro ? (m.media + (m.max - m.media) * (1 - b)) * (1 - v) : lo + (1 - lo) * v;
  return contraste(luz(oscuro ? '#F4F3F8' : '#16141B'), peor) >= 4.5;
}
/** El texto recomendado para una imagen: claro salvo que solo el oscuro se lea. */
export function textoRecomendado(im) {
  return legibleImagen(im, 'claro') || !legibleImagen(im, 'oscuro') ? 'claro' : 'oscuro';
}

/** El acento para los textos: el elegido, llevado hacia blanco o negro hasta leerse sobre el fondo. */
export function acentoTexto(acc, lumFondo, oscuro) {
  for (let i = 0; i <= 10; i++) {
    const c = mezcla(acc, oscuro ? '#FFFFFF' : '#000000', i / 10);
    if (contraste(luz(c), lumFondo) >= 4.5) return { color: c, ajustado: i > 0 };
  }
  return { color: oscuro ? '#FFFFFF' : '#000000', ajustado: true };
}

/**
 * → { id, oscuro, imagen, sombra, color, ajustado, legible, vars }
 * @param {string} id     fondo (de FONDOS)
 * @param {object} ap     apariencia normalizada (para la imagen)
 * @param {string} acc    acento (#RRGGBB) de botones, textos, tiers...
 * @param {string} [accFondo]  acento con el que se pinta el fondo "Tu color" (siempre el mío)
 */
export function resolverFondo(id, ap, acc, accFondo = acc) {
  acc = esHex(acc) ? acc.toUpperCase() : ACENTO_DEFECTO;
  accFondo = esHex(accFondo) ? accFondo.toUpperCase() : acc;
  const im = id === 'imagen' ? ap?.imagen : null;
  if (id === 'imagen' && !im) id = 'carbon';
  const F = FONDOS[id] ?? FONDOS.carbon;
  const oscuro = im ? im.texto !== 'oscuro' : F.oscuro;
  const vars = {};
  let legible = true;
  let base;
  let lumRef;
  if (im) {
    legible = legibleImagen(im);
    const v = im.velo / 100;
    base = im.base ?? (oscuro ? '#0E1420' : '#EEF1F6');
    // Si la imagen pide el texto contrario al de su color medio, la base sigue al texto.
    if (oscuro && luz(base) > 0.3) base = '#0E1420';
    if (!oscuro && luz(base) < 0.5) base = '#EEF1F6';
    Object.assign(vars, {
      '--f-imagen': `url("${im.url.replace(/["\\)]/g, '')}")`,
      '--f-velo': oscuro ? `rgba(8, 8, 14, ${v})` : `rgba(255, 255, 255, ${v})`,
      '--f-desenfoque': `${im.desenfoque}px`,
      '--f-pos': `${im.x}% ${im.y}%`,
      '--f-zoom': String(im.zoom),
      '--superficie': oscuro ? `rgba(14, 12, 20, ${legible ? 0.5 : 0.7})` : `rgba(255, 255, 255, ${legible ? 0.62 : 0.8})`,
      '--sup-desenfoque': 'blur(14px)',
    });
    lumRef = oscuro ? 0.02 : 0.85;
  } else {
    base = F.base;
    Object.assign(vars, {
      '--f-imagen': F.css(accFondo), '--f-velo': 'transparent', '--f-desenfoque': '0px', '--f-pos': '50% 50%', '--f-zoom': '1',
      '--superficie': oscuro ? 'rgba(255, 255, 255, 0.07)' : 'rgba(22, 20, 27, 0.05)',
      '--sup-desenfoque': 'none',
    });
    lumRef = luz(base);
  }
  const at = acentoTexto(acc, lumRef, oscuro);
  const sobre = luz(acc) > 0.4 ? '#141218' : '#FFFFFF';
  Object.assign(vars, {
    '--f-base': base,
    '--fondo': base,
    '--superficie-2': oscuro ? 'rgba(255, 255, 255, 0.12)' : 'rgba(22, 20, 27, 0.08)',
    '--superficie-solida': oscuro ? mezcla(base, '#FFFFFF', 0.08) : mezcla(base, '#16141B', 0.04),
    '--texto': oscuro ? '#F4F3F8' : '#16141B',
    '--texto-2': oscuro ? (im ? '#B4B1BF' : '#ABA8B6') : (im ? '#55525E' : '#5F5C68'),
    '--borde': oscuro ? 'rgba(255, 255, 255, 0.10)' : 'rgba(22, 20, 27, 0.10)',
    '--borde-fuerte': oscuro ? 'rgba(255, 255, 255, 0.22)' : 'rgba(22, 20, 27, 0.22)',
    '--sombra-titulo': legible ? 'none' : (oscuro ? '0 1px 10px rgba(0, 0, 0, .75)' : '0 1px 10px rgba(255, 255, 255, .85)'),
    '--acento-base': acc,
    '--acento': acc,
    '--sobre-acento': sobre,
    '--acento-texto': at.color,
    '--acento-suave': rgba(acc, oscuro ? 0.22 : 0.18),
    '--barra-fondo': oscuro ? 'rgba(12, 10, 18, 0.8)' : 'rgba(255, 255, 255, 0.85)',
  });
  // Tiers S-F: el acento hacia el fondo, con su texto encima.
  const pasos = [0, 0.25, 0.42, 0.56, 0.68, 0.78, 0.86];
  ['s', 'a', 'b', 'c', 'd', 'e', 'f'].forEach((l, i) => {
    const bg = mezcla(acc, oscuro ? '#2A2830' : '#FFFFFF', pasos[i]);
    vars[`--tier-${l}`] = bg;
    vars[`--tier-${l}-texto`] = luz(bg) > 0.4 ? '#141218' : '#FFFFFF';
  });
  return { id, oscuro, imagen: !!im, sombra: !legible, color: esHex(base) ? base : (oscuro ? '#121214' : '#FFFFFF'), ajustado: at.ajustado, legible, vars };
}

/** El fondo que toca ahora (en automático, según el sistema). */
export const fondoActivo = (ap) => (ap.modo === 'auto' ? (sistemaOscuro?.matches ? ap.noche : ap.dia) : ap.fondo);

// ---------------------------------------------------------------------------
// Aplicar
// ---------------------------------------------------------------------------
let ultimasVars = [];
/** Pone un fondo resuelto en <html> (sin guardar nada). */
export function pintar(r) {
  const raiz = document.documentElement;
  for (const v of ultimasVars) if (!(v in r.vars)) raiz.style.removeProperty(v);
  for (const [k, v] of Object.entries(r.vars)) raiz.style.setProperty(k, v);
  ultimasVars = Object.keys(r.vars);
  raiz.setAttribute('data-fondo', r.id);
  if (r.oscuro) raiz.setAttribute('data-tema', 'oscuro'); else raiz.removeAttribute('data-tema');
  raiz.toggleAttribute('data-img', r.imagen);
  raiz.toggleAttribute('data-sombra', r.sombra);
  raiz.removeAttribute('data-acento-libre');
  document.getElementById('color-tema')?.setAttribute('content', r.color);
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', r.oscuro ? 'black' : 'default');
}

// Lo que está puesto: lo de la cuenta (o lo que se está probando en Apariencia).
// acento: el mío. visita: el del perfil que estoy viendo (y lo que cuelga de él), o null.
// Es el único punto que decide qué acento se ve en toda la app.
const estado = { ap: null, acento: null, prueba: null, visita: null };

function guardarLocal(ap, acc) {
  // Lo ya resuelto para el <head>: los dos fondos del automático, o el fijo.
  const r = (id) => { const x = resolverFondo(id, ap, acc); return { id: x.id, oscuro: x.oscuro, imagen: x.imagen, sombra: x.sombra, color: x.color, vars: x.vars }; };
  const guardado = ap.modo === 'auto' ? { auto: true, claro: r(ap.dia), oscuro: r(ap.noche) } : { fija: r(ap.fondo) };
  try {
    localStorage.setItem(CLAVE, JSON.stringify(guardado));
    // Lo de antes del diseño v2 ya no se usa en este dispositivo.
    localStorage.removeItem('cvj.apariencia');
  } catch { /* modo privado */ }
}

// El acento que se está viendo ahora (para fundir el cambio con el de un perfil visitado).
let acentoVisto = null;
let animacion = 0;

function repintar(acentoForzado = null) {
  const ap = estado.prueba ?? estado.ap ?? normalizar(null);
  const mio = estado.acento ?? ACENTO_DEFECTO;
  // En Apariencia siempre el mío (se está eligiendo); si no, el del perfil visitado, si hay.
  const acc = acentoForzado ?? (!estado.prueba && estado.visita ? estado.visita : mio);
  pintar(resolverFondo(fondoActivo(ap), ap, acc, mio));
  if (!acentoForzado) { clearTimeout(animacion); acentoVisto = acc; }
}

/** Funde el acento visto con el nuevo en ~250 ms (todo lo que lo usa, a la vez). */
function fundirAcento() {
  const ap = estado.prueba ?? estado.ap;
  const destino = !estado.prueba && estado.visita ? estado.visita : estado.acento ?? ACENTO_DEFECTO;
  const desde = acentoVisto;
  clearTimeout(animacion);
  const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!ap || !desde || desde === destino || quieto) { repintar(); return; }
  const t0 = performance.now();
  // Con temporizador y no requestAnimationFrame: siempre termina (aunque no se pinte).
  const paso = () => {
    const k = Math.min(1, (performance.now() - t0) / 250);
    const e = 1 - (1 - k) ** 3; // sale rápido y frena al llegar
    if (k >= 1) { repintar(); return; }
    repintar(mezcla(desde, destino, e).toUpperCase());
    animacion = setTimeout(paso, 16);
  };
  paso();
}

/**
 * El acento del perfil que estoy viendo (otro usuario), o null para volver al mío. Solo
 * cambia el acento (con la misma legibilidad sobre MI fondo); el fondo no se toca. Es el
 * único punto por el que cambia el acento de visita (lo llama js/app.js según la ruta).
 */
export function acentoVisitado(hex) {
  const v = esHex(hex) ? hex.toUpperCase() : null;
  if (v === estado.visita) return;
  estado.visita = v;
  if (estado.ap || estado.prueba) fundirAcento();
}

/** Aplica lo de la cuenta (apariencia y acento) y lo recuerda en este dispositivo. */
export function aplicarApariencia(a, acento = estado.acento) {
  estado.ap = normalizar(a);
  if (acento !== undefined) estado.acento = esHex(acento) ? acento.toUpperCase() : ACENTO_DEFECTO;
  guardarLocal(estado.ap, estado.acento);
  repintar();
}
/** El acento (lo llama ui.aplicarAcento). */
export function aplicarAcento(hex) {
  estado.acento = esHex(hex) ? hex.toUpperCase() : ACENTO_DEFECTO;
  // Sin la apariencia de la cuenta todavía, se queda lo que puso el <head> (sin parpadeo).
  if (!estado.ap && !estado.prueba) return;
  if (estado.ap) guardarLocal(estado.ap, estado.acento);
  repintar();
}
/** Probar sin guardar (Apariencia, mientras se elige). null = volver a lo guardado. */
export function probarApariencia(ap, acento = null) {
  estado.prueba = ap ? normalizar(ap) : null;
  if (acento) estado.acento = acento.toUpperCase();
  repintar();
}
export const aparienciaActual = () => estado.ap ?? normalizar(null);
export const acentoActual = () => estado.acento ?? ACENTO_DEFECTO;

/** Al arrancar: lo que haya en este dispositivo; y el automático sigue al sistema. */
export function iniciarApariencia() {
  try {
    const s = JSON.parse(localStorage.getItem('cvj.sesion') || 'null');
    if (esHex(s?.usuario?.acento)) estado.acento = s.usuario.acento.toUpperCase();
  } catch { /* nada */ }
  sistemaOscuro?.addEventListener?.('change', () => { if ((estado.prueba ?? estado.ap)?.modo === 'auto') repintar(); });
}
/** Al cerrar sesión: fuera lo de este dispositivo. */
export function olvidarApariencia() {
  try { localStorage.removeItem(CLAVE); } catch { /* nada */ }
  estado.ap = null; estado.prueba = null; estado.acento = null; estado.visita = null;
  repintar();
}

// ---------------------------------------------------------------------------
// Imagen propia
// ---------------------------------------------------------------------------
/** Carga una imagen (con CORS para poder leerla en un canvas). */
export function cargarImagen(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('No se ha podido leer la imagen'));
    i.src = src;
  });
}

/**
 * Mide una imagen en pequeño (32×32): brillo medio, la zona más clara (percentil 92) y su
 * color medio. → { media, max, color }
 */
export function medir(img) {
  const n = 32;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, n, n);
  const px = ctx.getImageData(0, 0, n, n).data;
  const luces = [];
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < px.length; i += 4) {
    r += px[i]; g += px[i + 1]; b += px[i + 2];
    luces.push(luz(aHex([px[i], px[i + 1], px[i + 2]])));
  }
  const k = px.length / 4;
  luces.sort((x, y) => x - y);
  const media = luces.reduce((x, y) => x + y, 0) / luces.length;
  return { media: Math.round(media * 1000) / 1000, max: Math.round(luces[Math.floor(luces.length * 0.92)] * 1000) / 1000, color: aHex([r / k, g / k, b / k]) };
}

/** Color liso que acompaña a una imagen: su color medio, llevado casi a negro o casi a blanco. */
export function baseDe(color, oscuro) {
  return mezcla(color, oscuro ? '#0A0A0E' : '#FFFFFF', oscuro ? 0.84 : 0.86);
}

/** Reduce una imagen para la web (lado mayor ≤ max) → { blob, img } */
export async function reducir(archivo, max = 1920) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await cargarImagen(url);
    const e = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * e));
    c.height = Math.max(1, Math.round(img.naturalHeight * e));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.84));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
    return { blob, img: c };
  } finally {
    URL.revokeObjectURL(url);
  }
}
