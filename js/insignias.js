// Insignias de CVJ.
//  - Tres tipos: de GRUPO (solo las tiene quien va primero ahora mismo; se pierden), HITOS
//    personales (con bronce, plata y oro cuando tiene sentido; no se pierden) y SECRETAS
//    (no se ven hasta conseguirlas).
//  - Se calculan aquí con los datos que ya hay (también hacia atrás), una sola vez por cada
//    cambio de datos (memo por versión) y en segundo plano tras cada refresco del servidor.
//    Lo que cambia se guarda (tablas insignias e insignias_grupo, migración 032) para avisar
//    al dueño la próxima vez que abra la app y para la actividad.
//  - Medallas: forma por tipo (hexágono de grupo, medalla redonda, escudo secreto), color
//    por nivel y un dibujo propio relleno. Sin emojis.
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { usuarioActual } from './sesion.js';
import { esc, avatar, avatarPerfil, nombrePerfil, tiempoRelativo, aviso } from './ui.js';
import { abrirHoja } from './hoja.js';
import { icono } from './icons.js';

export const NIVELES = ['', 'bronce', 'plata', 'oro'];
const NOMBRE_NIVEL = ['', 'Bronce', 'Plata', 'Oro'];
export const MAX_DESTACADAS = 4;
const MIN_NOTAS_MEDIA = 15;     // para las de nota media
const MIN_JUEGOS_COMUNES = 10;  // para polémico, oráculo, almas gemelas y némesis
// Desde cuándo cuentan las fechas de las valoraciones: antes se importó todo de golpe.
const ESTRENO = new Date('2026-11-12T00:00:00Z').getTime();
const DIA = 86400000;
const ANIO = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Dibujos (24×24, rellenos; los huecos se recortan)
// ---------------------------------------------------------------------------
const GLIFOS = {
  mando: 'M7.5 6h9a5.5 5.5 0 0 1 5.4 6.5l-.8 4.3a2.6 2.6 0 0 1-4.5 1.3L14.4 16H9.6l-2.2 2.1a2.6 2.6 0 0 1-4.5-1.3l-.8-4.3A5.5 5.5 0 0 1 7.5 6zM7 9.3v1.5H5.5v1.6H7v1.5h1.6v-1.5h1.5v-1.6H8.6V9.3zM16 9.3a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM18 11.6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z',
  bajada: 'M3.5 4.5 12 10l8.5-5.5v4.2L12 14.2 3.5 8.7zM3.5 11.3 12 16.8l8.5-5.5v4.2L12 21 3.5 15.5z',
  corazon: 'M12 21 3.4 12.4A5.3 5.3 0 0 1 12 5.8a5.3 5.3 0 0 1 8.6 6.6z',
  estrella: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z',
  rayo: 'M13.5 2 4 13.5h6.5L9 22l11-12.5h-6.8z',
  ojo: 'M12 5c5.2 0 9 4.4 10 7-1 2.6-4.8 7-10 7S3 14.6 2 12c1-2.6 4.8-7 10-7zm0 3.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z',
  pila: 'M3 17h18v4H3zM4.5 11.5h15v4h-15zM6 6h12v4H6z',
  pluma: 'M21 2.5c-6.5.3-11.6 4-14 10.2l-1.6 4.4 1.5 1.5 2.4-2.4h3.3C18.2 15.2 21 9.4 21 2.5zM3 20.3h8.5V22H3z',
  creditos: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zM10.6 16.2 6.3 11.9l1.6-1.6 2.7 2.7 5.6-5.6 1.6 1.6z',
  reloj: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.2 4.5v6.4l4.9 2.9 1-1.7-3.9-2.3V6.5z',
  arena: 'M5 2h14v2.5h-1.6c0 3.4-2 5.4-3.9 7.5 1.9 2.1 3.9 4.1 3.9 7.5H19V22H5v-2.5h1.6c0-3.4 2-5.4 3.9-7.5-1.9-2.1-3.9-4.1-3.9-7.5H5z',
  trofeo: 'M6 3h12v5a6 6 0 0 1-5 5.9V17h3.5v2.5h-9V17H11v-3.1A6 6 0 0 1 6 8zM2.5 4.5H5V9a3 3 0 0 1-2.5-3zM19 4.5h2.5V6A3 3 0 0 1 19 9zM6 20.5h12V22H6z',
  uno: 'M13.8 2.5h-2.6L6.8 5.6v2.9l3.8-2.4V19H7v2.5h10V19h-3.2z',
  bocadillo: 'M4 2.5h16A2.5 2.5 0 0 1 22.5 5v10a2.5 2.5 0 0 1-2.5 2.5h-8.2L6 22v-4.5H4A2.5 2.5 0 0 1 1.5 15V5A2.5 2.5 0 0 1 4 2.5zM6.5 7v1.8h11V7zM6.5 10.8v1.8h7.5v-1.8z',
  salida: 'M4 2h11v4.5h-2.2V4.2H6.2v15.6h6.6v-2.3H15V22H4zM16 7l5.5 5-5.5 5v-3.4H9v-3.2h7z',
  vuelta: 'M12 3.5a8.5 8.5 0 0 1 7.9 5.4H22l-3.6 4.6-3.6-4.6h2.4A6 6 0 0 0 6.3 10.6L3.9 10A8.5 8.5 0 0 1 12 3.5zM2 15l3.6-4.6L9.2 15H6.8a6 6 0 0 0 10.9 1.6l2.4.6A8.5 8.5 0 0 1 4.1 15z',
  libros: 'M3 3h4v18H3zM8.5 3h4v18h-4zM14.2 4.6l3.9-1 4.4 17.3-3.9 1z',
  cartucho: 'M5 2h14v13l-2 2v5H7v-5l-2-2zM8 5v6h8V5z',
  estallido: 'M12 1.2 14.12 4.08 17.4 2.65 17.8 6.2 21.35 6.6 19.92 9.88 22.8 12 19.92 14.12 21.35 17.4 17.8 17.8 17.4 21.35 14.12 19.92 12 22.8 9.88 19.92 6.6 21.35 6.2 17.8 2.65 17.4 4.08 14.12 1.2 12 4.08 9.88 2.65 6.6 6.2 6.2 6.6 2.65 9.88 4.08zM10.9 6.5h2.2l-.4 7.2h-1.4zM10.9 15.3h2.2v2.2h-2.2z',
  charla: 'M3 2.5h11.5a2 2 0 0 1 2 2V11a2 2 0 0 1-2 2H8l-4 3.5V13H3a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2zM18.5 7.5h2A2.5 2.5 0 0 1 23 10v6.5a2 2 0 0 1-2 2v3l-3.5-3H12a2 2 0 0 1-2-2V15h4.5a4 4 0 0 0 4-4z',
  plumin: 'M12 1.5 18 9l-2 9H8L6 9zM12 7.4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 19.5h8V22H8z',
  libro: 'M2 4.5c3.5-.8 6.8-.3 9 1.7v15c-2.2-1.6-5.5-2-9-1.2zM22 4.5c-3.5-.8-6.8-.3-9 1.7v15c2.2-1.6 5.5-2 9-1.2z',
  formas: 'M3 13h7.5v7.5H3zM17.5 13a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5zM12 2.5l4.3 7.3H7.7z',
  bandera: 'M5 2.5h2V22H5zM8.5 3.5H20l-3 4.5 3 4.5H8.5z',
  roto: 'M12 21 3.4 12.4A5.3 5.3 0 0 1 12 5.8a5.3 5.3 0 0 1 8.6 6.6zM12.8 7.3l-2.3 4 2.6 1.4-2.2 4.6 4.3-5.4-2.6-1.4 1.6-3.2z',
  llama: 'M12 2c1 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.5 1.2-4 2.7-5.2.2 1.7 1 2.7 2 3.2C10.6 8 11 5 12 2z',
  luna: 'M14.5 2.5a9.5 9.5 0 1 0 7 15.6A8 8 0 0 1 14.5 2.5z',
  cajas: 'M3 13h8v8H3zM13 13h8v8h-8zM8 3.5h8v8H8z',
  bola: 'M12 2.5a8 8 0 0 1 5.6 13.7H6.4A8 8 0 0 1 12 2.5zM9 5.8l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8zM5 17.5h14l1.5 4.5h-17z',
  corazones: 'M9 21 2.5 14.5A4.2 4.2 0 0 1 9 9.3a4.2 4.2 0 0 1 6.5 5.2zM16.6 13.3l-1.3-1.3c1-1.9.8-4.2-.6-5.9A3.3 3.3 0 0 1 21.8 9z',
  espadas: 'M3 3h3l9 9-1.5 1.5L4.5 4.5zM21 3h-3l-9 9 1.5 1.5 9-9zM6.5 15.5l2 2-3 3-2-2zM17.5 15.5l-2 2 3 3 2-2z',
  caracol: 'M14 4a7 7 0 1 1 0 14H3.5a1.5 1.5 0 0 1 0-3H7.3A7 7 0 0 1 14 4zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 8.5h1.6l1.4 3.5H4.4z',
  megafono: 'M3 9h4l9-5v16l-9-5H3zM18 8.5a4 4 0 0 1 0 7v-2.2a1.8 1.8 0 0 0 0-2.6zM7 15.5h3l1 5H8z',
  onda: 'M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7.1 7.1l1.4 1.4a5 5 0 0 0 0 7l-1.4 1.4a7 7 0 0 1 0-9.8zM16.9 7.1a7 7 0 0 1 0 9.8l-1.4-1.4a5 5 0 0 0 0-7zM4.2 4.2l1.4 1.4a9 9 0 0 0 0 12.8l-1.4 1.4a11 11 0 0 1 0-15.6zM19.8 4.2a11 11 0 0 1 0 15.6l-1.4-1.4a9 9 0 0 0 0-12.8z',
  calavera: 'M12 2a9 9 0 0 1 9 9c0 3-1.4 4.8-3 6v3.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20.5V17c-1.6-1.2-3-3-3-6a9 9 0 0 1 9-9zM8.5 9.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM15.5 9.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
};

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------
/**
 * tipo: grupo | hito | secreta. umbrales: [bronce, plata, oro] (sin ellos, un solo nivel).
 * que: lo que se cuenta ("juegos completados"); desc: lo que significa tenerla;
 * pista: lo que se ve bloqueada. Las de grupo: mejor = 'max' | 'min' y min (valor mínimo).
 */
export const CATALOGO = [
  // --- De grupo: van cambiando de dueño y dependen de lo que hacen los demás --------
  { id: 'mayor-viciado', tipo: 'grupo', nombre: 'Mayor viciado', glifo: 'mando', desc: 'Más horas jugadas que nadie del grupo (sincronizadas de las plataformas).', unidad: 'h', mejor: 'max', min: 1 },
  { id: 'critico-implacable', tipo: 'grupo', nombre: 'Crítico implacable', glifo: 'bajada', desc: 'La nota media más baja del grupo en los juegos que también ha puntuado alguien más.', unidad: 'media', mejor: 'min', comparativa: true },
  { id: 'ojos-de-cordero', tipo: 'grupo', nombre: 'Ojos de cordero', glifo: 'corazon', desc: 'La nota media más alta del grupo en los juegos que también ha puntuado alguien más: todo le parece bien.', unidad: 'media', mejor: 'max', comparativa: true },
  { id: 'el-polemico', tipo: 'grupo', nombre: 'El polémico', glifo: 'rayo', desc: 'Sus notas son las que más se alejan de las del resto.', unidad: 'puntos', mejor: 'max', comparativa: true },
  { id: 'el-oraculo', tipo: 'grupo', nombre: 'El oráculo', glifo: 'ojo', desc: 'Sus notas son las que más se parecen a las del resto.', unidad: 'puntos', mejor: 'min', comparativa: true },
  { id: 'pluma-de-oro', tipo: 'grupo', nombre: 'Pluma de oro', glifo: 'pluma', desc: 'Sus reseñas son las que más «Buena reseña» y «Muy de acuerdo» reciben.', unidad: 'reacciones', mejor: 'max', min: 3 },
  { id: 'almas-gemelas', tipo: 'grupo', pareja: true, nombre: 'Almas gemelas', glifo: 'corazones', desc: 'La pareja del grupo que más se parece al poner notas.', unidad: 'puntos', mejor: 'min' },
  { id: 'nemesis', tipo: 'grupo', pareja: true, nombre: 'Némesis', glifo: 'espadas', desc: 'La pareja del grupo que menos se parece al poner notas.', unidad: 'puntos', mejor: 'max' },
  { id: 'el-ultimo-mono', tipo: 'grupo', nombre: 'El último mono', glifo: 'caracol', desc: 'Siempre llega tarde: el último en jugar a juegos que ya habían jugado al menos otros tres.', unidad: 'juegos', mejor: 'max', min: 2 },
  { id: 'influencer', tipo: 'grupo', nombre: 'Influencer', glifo: 'onda', desc: 'Juega algo y, en menos de un mes, otros del grupo se ponen con ello.', unidad: 'juegos', mejor: 'max', min: 2 },
  { id: 'la-voz-del-pueblo', tipo: 'grupo', nombre: 'La voz del pueblo', glifo: 'megafono', desc: 'Quien más reacciones ha recibido en el último mes.', unidad: 'reacciones', mejor: 'max', min: 5 },

  // --- Hitos personales ------------------------------------------------------------
  { id: 'hasta-los-creditos', tipo: 'hito', nombre: 'Hasta los créditos', glifo: 'creditos', umbrales: [10, 50, 100], que: 'juegos completados' },
  { id: 'monotematico', tipo: 'hito', nombre: 'Monotemático', glifo: 'reloj', umbrales: [100, 300, 1000], que: 'horas en un solo juego' },
  { id: 'toda-una-vida', tipo: 'hito', nombre: 'Toda una vida', glifo: 'arena', umbrales: [500, 2000, 5000], que: 'horas jugadas en total' },
  { id: 'cazatrofeos', tipo: 'hito', nombre: 'Cazatrofeos', glifo: 'trofeo', umbrales: [1, 5, 20], que: 'platinos conseguidos en PlayStation', que1: 'platino conseguido en PlayStation', recalcular: true },
  { id: 'opinologo', tipo: 'hito', nombre: 'Opinólogo', glifo: 'bocadillo', umbrales: [25, 75, 150], que: 'reseñas escritas' },
  { id: 'gatillo-facil', tipo: 'hito', nombre: 'Gatillo fácil', glifo: 'salida', umbrales: [10, 25, 50], que: 'juegos abandonados' },
  { id: 'otra-vuelta', tipo: 'hito', nombre: 'Otra vuelta', glifo: 'vuelta', umbrales: [1, 3, 10], que: 'juegos rejugados', que1: 'juego rejugado' },
  { id: 'saga-completa', tipo: 'hito', nombre: 'Saga completa', glifo: 'libros', umbrales: [1, 3, 6], que: 'sagas completadas enteras (de 3 juegos o más)', que1: 'saga completada entera (de 3 juegos o más)' },
  { id: 'arqueologo', tipo: 'hito', nombre: 'Arqueólogo', glifo: 'cartucho', umbrales: [1, 5, 15], que: 'juegos de antes del 2000 jugados', que1: 'juego de antes del 2000 jugado' },
  { id: 'lo-vi-primero', tipo: 'hito', nombre: 'Lo vi primero', glifo: 'uno', umbrales: [1, 5, 15], que: 'juegos que valoraste antes que nadie y después valoraron dos más', que1: 'juego que valoraste antes que nadie y después valoraron dos más' },
  { id: 'escandalo-publico', tipo: 'hito', nombre: 'Escándalo público', glifo: 'estallido', umbrales: [1, 5, 15], que: '«¿Qué cojones me estás contando?» recibidos', que1: '«¿Qué cojones me estás contando?» recibido' },
  { id: 'da-que-hablar', tipo: 'hito', nombre: 'Da que hablar', glifo: 'charla', umbrales: [5, 20, 50], que: 'respuestas de otros a tus reseñas y entradas' },
  { id: 'tinta-fresca', tipo: 'hito', nombre: 'Tinta fresca', glifo: 'plumin', umbrales: [1, 5, 15], que: 'entradas publicadas en tu columna', que1: 'entrada publicada en tu columna' },
  { id: 'lectura-obligada', tipo: 'hito', nombre: 'Lectura obligada', glifo: 'libro', desc: 'Una entrada de su columna la ha leído todo el grupo.', pista: 'Que todo el grupo lea una entrada de tu columna.' },
  { id: 'multiplataforma', tipo: 'hito', nombre: 'Multiplataforma', glifo: 'formas', desc: 'Juega en consola y en PC.', recalcular: true },

  // --- Secretas --------------------------------------------------------------------
  { id: 'me-rindo', tipo: 'secreta', nombre: 'Me rindo', glifo: 'bandera', desc: 'Abandonó un juego después de más de 50 horas.' },
  { id: 'sindrome-de-estocolmo', tipo: 'secreta', nombre: 'Síndrome de Estocolmo', glifo: 'roto', desc: 'Más de 100 horas en un juego al que le puso menos de un 5.' },
  { id: 'herejia', tipo: 'secreta', nombre: 'Herejía', glifo: 'llama', desc: 'Menos de un 6 a un juego que el resto del grupo tiene en S.' },
  { id: 'buho', tipo: 'secreta', nombre: 'Búho', glifo: 'luna', desc: 'Valoró un juego entre las 3 y las 6 de la madrugada.' },
  { id: 'sindrome-de-diogenes', tipo: 'secreta', nombre: 'Síndrome de Diógenes', glifo: 'cajas', desc: '25 juegos o más en pendientes a la vez.' },
  { id: 'profeta', tipo: 'secreta', nombre: 'Profeta', glifo: 'bola', desc: 'Valoró antes que nadie un juego que luego valoró todo el grupo.' },
  { id: 'sin-piedad', tipo: 'secreta', nombre: 'Sin piedad', glifo: 'calavera', desc: 'Puso una nota por debajo de 2.' },
];
const POR_ID = new Map(CATALOGO.map((d) => [d.id, d]));
export const definicion = (id) => POR_ID.get(id) ?? null;

const cantidad = (d, n) => `${n.toLocaleString('es-ES')} ${n === 1 ? d.que1 ?? d.que : d.que}.`;
/** Texto de una insignia con su nivel: lo que significa tenerla. */
export function descripcion(d, nivel = 1) {
  if (d.umbrales) return cantidad(d, d.umbrales[Math.max(0, nivel - 1)]);
  return d.desc;
}
/** Lo que se ve bloqueada (o lo que falta para el nivel siguiente). */
function pista(d, nivel) {
  if (d.umbrales) return nivel >= 3 ? descripcion(d, 3) : `${NOMBRE_NIVEL[nivel + 1]}: ${cantidad(d, d.umbrales[nivel])}`;
  return d.pista ?? d.desc;
}
const CONSOLA = /^(PS|Xbox|Switch|Wii|Nintendo|3DS|DS|Game ?Boy|GameCube|N64|SNES|NES|Mega ?Drive|Dreamcast|Saturn)/i;
const nivelDe = (umbrales, valor) => (umbrales ? umbrales.filter((u) => valor >= u).length : (valor ? 1 : 0));

// ---------------------------------------------------------------------------
// Medalla (SVG)
// ---------------------------------------------------------------------------
const COLORES = {
  bronce: ['#E3A06F', '#9A5B2E', '#FFFFFF'],
  plata: ['#F1F4F8', '#9DA8B5', '#3A4452'],
  oro: ['#FBE08A', '#C99419', '#4A3509'],
  unico: ['#7BD3B8', '#23876B', '#FFFFFF'],
  secreta: ['#4A4159', '#1C1824', '#F2D27A'],
};
const FORMAS = {
  grupo: 'M24 2 43.5 13.25v21.5L24 46 4.5 34.75v-21.5z',
  hito: 'M24 2a22 22 0 1 1 0 44 22 22 0 0 1 0-44z',
  secreta: 'M24 2.5 42 8.8v13.4C42 33.4 34.4 41.6 24 46 13.6 41.6 6 33.4 6 22.2V8.8z',
};
const ANILLO = {
  grupo: 'M24 6.5 39.6 15.5v17L24 41.5 8.4 32.5v-17z',
  hito: 'M24 6a18 18 0 1 1 0 36 18 18 0 0 1 0-36z',
  secreta: 'M24 6.8 38.2 11.8v10.5C38.2 31.4 32.2 38 24 41.8 15.8 38 9.8 31.4 9.8 22.3V11.8z',
};

/**
 * @param {object} d definición
 * @param {{ nivel?: number, tam?: number, bloqueada?: boolean }} op
 */
export function medalla(d, { nivel = 1, tam = 48, bloqueada = false } = {}) {
  const forma = d.tipo;
  const gid = `ins-${bloqueada ? 'b' : ''}${forma}-${d.umbrales ? NIVELES[nivel] : forma === 'hito' ? 'unico' : forma}`;
  let c1;
  let c2;
  let glifo;
  if (bloqueada) [c1, c2, glifo] = ['var(--superficie-2)', 'var(--superficie-2)', 'var(--texto-2)'];
  else if (forma === 'grupo') [c1, c2, glifo] = ['color-mix(in srgb, var(--acento) 70%, #fff)', 'var(--acento)', '#FFFFFF'];
  else [c1, c2, glifo] = COLORES[forma === 'secreta' ? 'secreta' : d.umbrales ? NIVELES[nivel] : 'unico'];
  const secretaOculta = bloqueada && d.tipo === 'secreta';
  return `
    <svg class="medalla${bloqueada ? ' bloqueada' : ''}" width="${tam}" height="${tam}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
        <linearGradient id="ins-brillo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <path d="${FORMAS[forma]}" fill="url(#${gid})"/>
      <path d="${ANILLO[forma]}" fill="none" stroke="${bloqueada ? 'var(--borde)' : 'rgba(255,255,255,.38)'}" stroke-width="1.2"/>
      ${bloqueada ? '' : `<path d="${FORMAS[forma]}" fill="url(#ins-brillo)"/>`}
      ${secretaOculta
        ? `<text x="24" y="31" text-anchor="middle" font-family="var(--fuente-titulos)" font-weight="700" font-size="20" fill="${glifo}" opacity=".7">?</text>`
        : `<g transform="translate(13 13) scale(.9167)" opacity="${bloqueada ? '.45' : '1'}"><path d="${GLIFOS[d.glifo] ?? ''}" fill="${glifo}" fill-rule="evenodd"/></g>`}
    </svg>`;
}

// ---------------------------------------------------------------------------
// Cálculo (todo el grupo de una vez; memo por versión de datos)
// ---------------------------------------------------------------------------
let memo = { version: -1, r: null };
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const horaLocal = (f) => new Date(f).getHours();

/** → { personal: Map(uid → Map(id → { nivel, valor })), grupo: Map(id → { uid, valor, valores: Map(uid → valor) }) } */
export function calcular() {
  const v = datos.versionDatos();
  if (memo.version === v && memo.r) return memo.r;
  const usuarios = datos.estado.usuarios ?? [];
  const activos = usuarios.filter((u) => u.activo !== false);
  const vals = datos.valoracionesEfectivas().filter((x) => datos.usuario(x.usuario_id));
  const jugada = (x) => x.estado && x.estado !== 'pendiente';
  const conNota = (x) => x.nota != null && metricas.cuentaEnRanking(x);

  // Índices por juego y por usuario.
  const porJuego = new Map();
  const porUsuario = new Map(usuarios.map((u) => [u.id, []]));
  for (const x of vals) {
    const id = Number(x.juego_id);
    if (!porJuego.has(id)) porJuego.set(id, []);
    porJuego.get(id).push(x);
    porUsuario.get(x.usuario_id)?.push(x);
  }

  // Reacciones y respuestas recibidas: autor de cada reseña o entrada.
  const autorDe = new Map();
  for (const x of datos.estado.valoraciones ?? []) autorDe.set(`valoracion:${x.id}`, x.usuario_id);
  for (const x of datos.estado.valColecciones ?? []) autorDe.set(`valoracion_coleccion:${x.id}`, x.usuario_id);
  for (const x of datos.estado.entradas ?? []) autorDe.set(`entrada:${x.id}`, x.usuario_id);
  const recibidas = new Map(usuarios.map((u) => [u.id, { wtf: 0, buenas: 0, respuestas: 0, mes: 0, mesDe: new Set() }]));
  const haceUnMes = Date.now() - 30 * DIA;
  for (const r of datos.estado.reacciones ?? []) {
    const a = autorDe.get(`${r.objetivo}:${r.objetivo_id}`);
    if (!a || a === r.usuario_id || !recibidas.has(a)) continue;
    if (r.tipo === 'wtf') recibidas.get(a).wtf += 1;
    if (new Date(r.creado_en).getTime() >= haceUnMes) { recibidas.get(a).mes += 1; recibidas.get(a).mesDe.add(r.usuario_id); }
    if (r.objetivo !== 'entrada' && (r.tipo === 'buena' || r.tipo === 'acuerdo')) recibidas.get(a).buenas += 1;
  }
  for (const c of datos.estado.comentarios ?? []) {
    const a = autorDe.get(`${c.objetivo}:${c.objetivo_id}`);
    if (a && a !== c.usuario_id && recibidas.has(a)) recibidas.get(a).respuestas += 1;
  }

  // Primero en valorar (jugado) cada juego, y quién vino después.
  const primero = new Map(usuarios.map((u) => [u.id, { despuesDos: 0, profeta: 0 }]));
  for (const lista of porJuego.values()) {
    const js = lista.filter(jugada).sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));
    if (js.length < 3) continue;
    const p = js[0].usuario_id;
    const despues = new Set(js.slice(1).map((x) => x.usuario_id));
    despues.delete(p);
    if (despues.size >= 2) primero.get(p).despuesDos += 1;
    const resto = activos.filter((u) => u.id !== p);
    if (resto.length >= 3 && resto.every((u) => despues.has(u.id))) primero.get(p).profeta += 1;
  }

  // Lecturas de cada entrada publicada (sin su autor).
  const lectoresDe = new Map();
  for (const l of datos.estado.lecturas ?? []) {
    if (!lectoresDe.has(l.entrada_id)) lectoresDe.set(l.entrada_id, new Set());
    lectoresDe.get(l.entrada_id).add(l.usuario_id);
  }

  const personal = new Map();
  const grupoValores = new Map(CATALOGO.filter((d) => d.tipo === 'grupo').map((d) => [d.id, new Map()]));
  for (const u of usuarios) {
    const mias = porUsuario.get(u.id) ?? [];
    const jugadas = mias.filter(jugada);
    const notas = mias.filter(conNota);
    const completadas = mias.filter((x) => x.estado === 'completado');
    const completadasIds = new Set(completadas.map((x) => Number(x.juego_id)));
    // Horas reales (sin las estimadas): por juego y en total.
    const t = metricas.tiempo(u.id);
    const totalReal = Math.max(0, (t.total ?? 0) - (t.estimadas ?? 0));
    const reales = new Map();
    for (const [id, h] of t.juegos) reales.set(id, Math.max(0, h - metricas.estimadasDe(u.id, id)));
    const maxJuego = Math.max(0, ...reales.values());
    const realDe = (id) => reales.get(Number(id)) ?? 0;
    // Biblioteca: platinos de PlayStation y dónde juega (consola y PC).
    const platinos = new Set();
    let consola = false;
    let pc = false;
    let horasSinc = 0;
    for (const f of datos.estado.biblioteca ?? []) {
      if (f.usuario_id !== u.id || f.oculto) continue;
      const fuente = f.fuente ?? 'psn';
      if (fuente === 'steam' || fuente === 'epic' || (fuente === 'xbox' && (f.plataforma === 'PC' || f.detectado))) pc = true;
      else consola = true;
      const id = datos.igdbDeBiblioteca(f);
      if (fuente === 'psn' && id != null && Number(f.trofeos?.platinum) > 0) platinos.add(datos.canonico(id));
    }
    for (const x of mias) {
      for (const pl of datos.plataformasDe(x)) {
        if (pl === 'PC') pc = true;
        else if (CONSOLA.test(pl)) consola = true;
      }
    }
    for (const x of metricas.biblioteca(u.id).juegos ?? []) horasSinc += Number(x.horasSinc) || 0;
    // Sagas completadas: todos sus juegos ya salidos (3 o más) completados.
    let sagas = 0;
    for (const sg of datos.sagas()) {
      const ids = datos.juegosDeSaga(sg.id).filter((id) => { const j = datos.juegoConocido(id); return j?.anio && j.anio <= ANIO; });
      if (ids.length >= 3 && ids.every((id) => completadasIds.has(Number(id)))) sagas += 1;
    }
    // Herejía: menos de un 6 a un juego que el resto tiene de media en S.
    const herejia = notas.some((x) => {
      if (Number(x.nota) >= 6) return false;
      const otras = (porJuego.get(Number(x.juego_id)) ?? []).filter((y) => y.usuario_id !== u.id && conNota(y)).map((y) => Number(y.nota));
      return otras.length >= 2 && media(otras) >= 9;
    });
    // Diferencia con el resto en los juegos con nota de alguien más.
    const difs = notas.map((x) => {
      const otras = (porJuego.get(Number(x.juego_id)) ?? []).filter((y) => y.usuario_id !== u.id && conNota(y)).map((y) => Number(y.nota));
      return otras.length ? Math.abs(Number(x.nota) - media(otras)) : null;
    }).filter((d) => d != null);
    const columna = datos.columnaDe(u.id);
    const publicadas = columna ? datos.entradasPublicadas(columna.id) : [];
    const otrosActivos = activos.filter((x) => x.id !== u.id);
    const leidaPorTodos = publicadas.some((e) => otrosActivos.length >= 2 && otrosActivos.every((x) => lectoresDe.get(e.id)?.has(x.id)));
    const rec = recibidas.get(u.id);
    // Notas en juegos que también ha puntuado alguien más (las medias no se inflan a solas).
    const compartidas = notas.filter((x) => (porJuego.get(Number(x.juego_id)) ?? []).some((y) => y.usuario_id !== u.id && conNota(y)));
    // El último mono: el último en jugar a un juego que ya habían jugado al menos otros tres.
    const ultimo = jugadas.filter((x) => {
      const otros = (porJuego.get(Number(x.juego_id)) ?? []).filter((y) => y.usuario_id !== u.id && jugada(y) && datos.usuario(y.usuario_id)?.activo !== false);
      const t0 = new Date(x.creado_en).getTime();
      return otros.length >= 3 && otros.every((y) => new Date(y.creado_en).getTime() < t0);
    }).length;
    // Influencer: lo juega y, en 30 días, otro del grupo se pone con ello (desde el estreno).
    const influye = jugadas.filter((x) => {
      const t0 = new Date(x.creado_en).getTime();
      return (porJuego.get(Number(x.juego_id)) ?? []).some((y) => {
        if (y.usuario_id === u.id || !jugada(y)) return false;
        const t = new Date(y.creado_en).getTime();
        return t >= ESTRENO && t > t0 + 3600000 && t <= t0 + 30 * DIA;
      });
    }).length;

    const valores = {
      'hasta-los-creditos': completadas.length,
      monotematico: Math.floor(maxJuego),
      'toda-una-vida': Math.floor(totalReal),
      cazatrofeos: platinos.size,
      opinologo: mias.filter((x) => x.resena?.trim()).length,
      'gatillo-facil': mias.filter((x) => x.estado === 'abandonado').length,
      'otra-vuelta': mias.filter((x) => Number(x.vueltas) > 1 || x.rejugando).length,
      'saga-completa': sagas,
      arqueologo: jugadas.filter((x) => { const j = datos.juegoConocido(x.juego_id); return j?.anio && j.anio < 2000; }).length,
      'lo-vi-primero': primero.get(u.id).despuesDos,
      'escandalo-publico': rec.wtf,
      'da-que-hablar': rec.respuestas,
      'tinta-fresca': publicadas.length,
      'lectura-obligada': leidaPorTodos ? 1 : 0,
      multiplataforma: consola && pc ? 1 : 0,
      'me-rindo': mias.some((x) => x.estado === 'abandonado' && realDe(x.juego_id) > 50) ? 1 : 0,
      'sindrome-de-estocolmo': notas.some((x) => Number(x.nota) < 5 && realDe(x.juego_id) > 100) ? 1 : 0,
      herejia: herejia ? 1 : 0,
      buho: mias.some((x) => x.estado !== 'pendiente' && x.creado_en && horaLocal(x.creado_en) >= 3 && horaLocal(x.creado_en) < 6) ? 1 : 0,
      'sindrome-de-diogenes': mias.filter((x) => x.estado === 'pendiente').length >= 25 ? 1 : 0,
      profeta: primero.get(u.id).profeta > 0 ? 1 : 0,
      'sin-piedad': notas.some((x) => Number(x.nota) < 2) ? 1 : 0,
    };
    const m = new Map();
    for (const d of CATALOGO) {
      if (d.tipo === 'grupo') continue;
      const valor = valores[d.id] ?? 0;
      m.set(d.id, { nivel: nivelDe(d.umbrales, valor), valor });
    }
    personal.set(u.id, m);

    if (u.activo === false) continue; // las de grupo, solo entre los activos
    const g = (id, valor, ok = true) => { if (ok && valor != null) grupoValores.get(id).set(u.id, valor); };
    g('mayor-viciado', Math.round(horasSinc));
    g('critico-implacable', Math.round(media(compartidas.map((x) => Number(x.nota))) * 100) / 100, compartidas.length >= MIN_NOTAS_MEDIA);
    g('ojos-de-cordero', Math.round(media(compartidas.map((x) => Number(x.nota))) * 100) / 100, compartidas.length >= MIN_NOTAS_MEDIA);
    g('el-polemico', Math.round(media(difs) * 100) / 100, difs.length >= MIN_JUEGOS_COMUNES);
    g('el-oraculo', Math.round(media(difs) * 100) / 100, difs.length >= MIN_JUEGOS_COMUNES);
    g('pluma-de-oro', rec.buenas);
    g('el-ultimo-mono', ultimo);
    g('influencer', influye);
    if (rec.mesDe.size >= 2) g('la-voz-del-pueblo', rec.mes);
  }

  // Dueño de cada una de grupo: el primero, sin empates (si hay empate arriba, la conserva
  // quien ya la tenía; si no la tenía ninguno de los empatados, se queda sin dueño).
  const guardadas = new Map((datos.estado.insigniasGrupo ?? []).map((x) => [x.insignia, x]));
  const grupo = new Map();
  for (const d of CATALOGO.filter((x) => x.tipo === 'grupo' && !x.pareja)) {
    const vs = [...grupoValores.get(d.id)].filter(([, x]) => d.min == null || (d.mejor === 'max' ? x >= d.min : true));
    let uid = null;
    let valor = null;
    // Las comparativas (medias, parecido con el resto) necesitan al menos a dos.
    if (vs.length >= (d.comparativa ? 2 : 1)) {
      const mejor = d.mejor === 'max' ? Math.max(...vs.map(([, x]) => x)) : Math.min(...vs.map(([, x]) => x));
      const top = vs.filter(([, x]) => x === mejor).map(([id]) => id);
      const actual = guardadas.get(d.id)?.usuario_id ?? null;
      uid = top.length === 1 ? top[0] : (top.includes(actual) ? actual : null);
      valor = mejor;
    }
    grupo.set(d.id, { uid, uid2: null, valor, valores: new Map(vs) });
  }
  // Parejas: la diferencia media de notas en los juegos que tienen en común (como en Comparar).
  const parejas = [];
  for (let a = 0; a < activos.length; a++) {
    for (let b = a + 1; b < activos.length; b++) {
      const [x, y] = [activos[a].id, activos[b].id].sort();
      const c = metricas.comparar(x, y);
      if (c.comunes >= MIN_JUEGOS_COMUNES && c.diferenciaExacta != null) parejas.push({ x, y, dif: Math.round(c.diferenciaExacta * 1000) / 1000 });
    }
  }
  for (const d of CATALOGO.filter((z) => z.pareja)) {
    let par = null;
    let valor = null;
    if (parejas.length >= 2) {
      valor = d.mejor === 'max' ? Math.max(...parejas.map((z) => z.dif)) : Math.min(...parejas.map((z) => z.dif));
      const top = parejas.filter((z) => z.dif === valor);
      const g = guardadas.get(d.id);
      par = top.length === 1 ? top[0] : top.find((z) => z.x === g?.usuario_id && z.y === g?.otro_id) ?? null;
    }
    const valores = new Map();
    for (const z of parejas) { valores.set(`${z.x}:${z.y}`, z.dif); }
    grupo.set(d.id, { uid: par?.x ?? null, uid2: par?.y ?? null, valor, valores });
  }
  memo = { version: v, r: { personal, grupo } };
  return memo.r;
}

/** Lo que tiene alguien (calculado y guardado: nunca baja de nivel lo personal). */
export function deUsuario(uid) {
  const c = calcular();
  const guardadas = new Map((datos.estado.insignias ?? []).filter((x) => x.usuario_id === uid).map((x) => [x.insignia, x]));
  const grupoG = new Map((datos.estado.insigniasGrupo ?? []).map((x) => [x.insignia, x]));
  return CATALOGO.map((d) => {
    if (d.tipo === 'grupo') {
      const g = c.grupo.get(d.id);
      const tiene = g?.uid === uid || (!!g?.uid2 && g.uid2 === uid);
      const pareja = d.pareja && tiene ? (g.uid === uid ? g.uid2 : g.uid) : null;
      const valor = d.pareja ? (tiene ? g.valor : null) : g?.valores.get(uid) ?? null;
      return { d, uid, nivel: tiene ? 1 : 0, valor, pareja, desde: tiene ? grupoG.get(d.id)?.desde ?? null : null };
    }
    const x = c.personal.get(uid)?.get(d.id) ?? { nivel: 0, valor: 0 };
    const gu = guardadas.get(d.id);
    // Las que se recalcularon con reglas nuevas mandan como salen ahora (pueden bajar).
    const nivel = d.recalcular ? x.nivel : Math.max(x.nivel, gu?.nivel ?? 0);
    return { d, nivel, valor: x.valor, desde: gu?.conseguida_en ?? null };
  });
}

// ---------------------------------------------------------------------------
// Guardar lo que cambia (tras cada refresco del servidor, en segundo plano)
// ---------------------------------------------------------------------------
let sincronizando = false;
export async function sincronizar() {
  if (sincronizando || !datos.datosFrescos() || !datos.hayInsignias()) return;
  sincronizando = true;
  try {
    const c = calcular();
    const estreno = !(datos.estado.insignias ?? []).length && !(datos.estado.insigniasGrupo ?? []).length;
    const guardadas = new Map((datos.estado.insignias ?? []).map((x) => [`${x.usuario_id}:${x.insignia}`, x]));
    const yaTenia = new Set((datos.estado.insignias ?? []).map((x) => x.usuario_id));
    const personales = [];
    const bajar = [];
    for (const [uid, m] of c.personal) {
      for (const [id, { nivel }] of m) {
        const g = guardadas.get(`${uid}:${id}`);
        // Reglas cambiadas (Cazatrofeos, Multiplataforma): baja o se va, sin avisos.
        if (g && g.nivel > nivel && definicion(id)?.recalcular) { bajar.push({ usuario_id: uid, insignia: id, nivel }); continue; }
        if (!nivel) continue;
        // La primera vez de cada persona, todo es "inicial" (lo que ya tenía de antes).
        if (!g || g.nivel < nivel) personales.push({ usuario_id: uid, insignia: id, nivel, inicial: estreno || !yaTenia.has(uid) });
      }
    }
    const gg = new Map((datos.estado.insigniasGrupo ?? []).map((x) => [x.insignia, x]));
    const grupo = [];
    for (const [id, { uid, uid2, valor }] of c.grupo) {
      const g = gg.get(id);
      if ((g?.usuario_id ?? null) === uid && (g?.otro_id ?? null) === (uid2 ?? null)) continue;
      if (!g && !uid) continue;
      grupo.push({ insignia: id, usuario_id: uid, otro_id: uid2 ?? null, anterior_id: g?.usuario_id ?? null, otro_anterior_id: g?.otro_id ?? null, valor, inicial: estreno || !g });
    }
    await datos.guardarInsignias({ personales, grupo, bajar });
  } catch (e) {
    console.warn('[insignias]', e?.message || e);
  } finally {
    sincronizando = false;
  }
}

// ---------------------------------------------------------------------------
// Avisos: al conseguir una (o subir de nivel) y al perder una de grupo
// ---------------------------------------------------------------------------
/** Lo nuevo para mí desde la última vez que lo vi. */
export function avisosPendientes(uid) {
  const u = datos.usuario(uid);
  if (!u) return [];
  const visto = u.insignias_visto_en ? new Date(u.insignias_visto_en).getTime() : 0;
  const nuevo = (f) => f && new Date(f).getTime() > visto;
  const lista = [];
  for (const x of datos.estado.insignias ?? []) {
    const d = definicion(x.insignia);
    if (d && x.usuario_id === uid && nuevo(x.conseguida_en)) lista.push({ tipo: 'gana', d, nivel: x.nivel, fecha: x.conseguida_en, inicial: x.inicial });
  }
  const esMia = (x) => x.usuario_id === uid || x.otro_id === uid;
  for (const x of datos.estado.insigniasGrupo ?? []) {
    const d = definicion(x.insignia);
    if (!d || !nuevo(x.desde)) continue;
    if (esMia(x)) lista.push({ tipo: 'gana', d, nivel: 1, fecha: x.desde, inicial: x.inicial, quitada: d.pareja ? null : x.anterior_id, pareja: d.pareja ? (x.usuario_id === uid ? x.otro_id : x.usuario_id) : null });
    else if (x.anterior_id === uid || x.otro_anterior_id === uid) lista.push({ tipo: 'pierde', d, fecha: x.desde, quien: x.usuario_id, quien2: x.otro_id });
  }
  // Las de grupo que tenía la última vez (en este móvil): si ahora no son mías y la fila ya
  // no lo dice (ha cambiado de manos dos veces), también es una pérdida.
  for (const id of leerMias(uid)) {
    const g = (datos.estado.insigniasGrupo ?? []).find((x) => x.insignia === id);
    const d = definicion(id);
    if (!d || !g || esMia(g) || lista.some((x) => x.d.id === id)) continue;
    lista.push({ tipo: 'pierde', d, fecha: g.desde, quien: g.usuario_id, quien2: g.otro_id });
  }
  return lista.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'gana' ? -1 : 1) || new Date(a.fecha) - new Date(b.fecha));
}
const claveMias = (uid) => `cvj.insignias.grupo.${uid}`;
function leerMias(uid) { try { return JSON.parse(localStorage.getItem(claveMias(uid)) || '[]'); } catch { return []; } }
function guardarMias(uid) {
  const mias = (datos.estado.insigniasGrupo ?? []).filter((x) => x.usuario_id === uid || x.otro_id === uid).map((x) => x.insignia);
  try { localStorage.setItem(claveMias(uid), JSON.stringify(mias)); } catch { /* nada */ }
}

let mostrando = false;
export function revisarAvisos() {
  const yo = usuarioActual();
  if (!yo || mostrando) return;
  if (document.body.classList.contains('hoja-abierta') || document.body.classList.contains('celebrando') || document.querySelector('.celebra')) {
    setTimeout(revisarAvisos, 4000);
    return;
  }
  const lista = avisosPendientes(yo.id);
  guardarMias(yo.id);
  if (!lista.length) return;
  mostrando = true;
  datos.marcarInsigniasVistas(yo.id); // vistas desde ya: no se repiten
  try { mostrarAvisos(lista); } catch (e) { console.warn('[insignias]', e); mostrando = false; document.body.classList.remove('celebrando'); }
}

function mostrarAvisos(lista) {
  // El estreno (muchas de golpe): una sola tarjeta con todas.
  const iniciales = lista.filter((x) => x.inicial && x.tipo === 'gana');
  const pasos = [];
  if (iniciales.length > 2) {
    pasos.push(`
      <div class="ins-aviso-mosaico">${iniciales.slice(0, 12).map((x, i) => `<span style="--i:${i}">${medalla(x.d, { nivel: x.nivel, tam: 64 })}</span>`).join('')}</div>
      <div class="ins-aviso-texto">
        <span class="ins-aviso-ante">Estrenas las insignias de CVJ</span>
        <strong class="ins-aviso-nombre">${iniciales.length} insignias con lo que ya habías hecho</strong>
        <span class="ins-aviso-desc">Míralas en tu perfil y elige las que quieres lucir.</span>
      </div>`);
  }
  for (const x of lista.filter((y) => !(iniciales.length > 2 && y.inicial && y.tipo === 'gana'))) {
    if (x.tipo === 'gana') {
      const ante = x.d.tipo === 'grupo'
        ? (x.pareja ? `Con ${esc(datos.usuario(x.pareja)?.nombre ?? '')}` : x.quitada && datos.usuario(x.quitada) ? `Se la has quitado a ${esc(datos.usuario(x.quitada).nombre)}` : 'Ahora es tuya')
        : x.d.tipo === 'secreta' ? 'Insignia secreta' : x.nivel > 1 ? `Sube a ${NOMBRE_NIVEL[x.nivel].toLowerCase()}` : 'Nueva insignia';
      pasos.push(`
        <div class="ins-aviso-medalla nivel-${NIVELES[x.nivel] || 'unico'}"><span class="ins-aviso-halo" aria-hidden="true"></span>${medalla(x.d, { nivel: x.nivel, tam: 150 })}</div>
        <div class="ins-aviso-texto">
          <span class="ins-aviso-ante">${ante}</span>
          <strong class="ins-aviso-nombre">${esc(x.d.nombre)}${x.d.umbrales ? ` <span class="ins-nivel ${NIVELES[x.nivel]}">${NOMBRE_NIVEL[x.nivel]}</span>` : ''}</strong>
          <span class="ins-aviso-desc">${esc(descripcion(x.d, x.nivel))}</span>
        </div>`);
    } else {
      const quien = datos.usuario(x.quien);
      pasos.push(`
        <div class="ins-aviso-medalla perdida">${medalla(x.d, { tam: 130, bloqueada: true })}${quien ? `<span class="ins-aviso-ladron">${avatar(quien, 52)}</span>` : ''}</div>
        <div class="ins-aviso-texto">
          <span class="ins-aviso-ante">Insignia perdida</span>
          <strong class="ins-aviso-nombre">${x.d.pareja ? `Ya no sois «${esc(x.d.nombre)}»` : quien ? `${esc(quien.nombre)} te ha quitado «${esc(x.d.nombre)}»` : `Ya no tienes «${esc(x.d.nombre)}»`}</strong>
          <span class="ins-aviso-desc">${x.d.pareja && quien ? `Ahora lo son ${esc(quien.nombre)} y ${esc(datos.usuario(x.quien2)?.nombre ?? '')}.` : esc(x.d.desc)}</span>
        </div>`);
    }
  }

  const capa = document.createElement('div');
  capa.className = 'celebra ins-aviso';
  capa.setAttribute('role', 'status');
  capa.innerHTML = `<div class="celebra-fondo"></div><div class="celebra-escena"></div>${pasos.length > 1 ? `<div class="celebra-puntos">${pasos.map(() => '<i></i>').join('')}</div>` : ''}<span class="celebra-pista">Toca para seguir</span>`;
  document.body.appendChild(capa);
  document.body.classList.add('celebrando');
  const escena = capa.querySelector('.celebra-escena');
  let i = -1;
  let reloj = null;
  const cerrar = () => {
    clearTimeout(reloj);
    capa.classList.add('saliendo');
    document.body.classList.remove('celebrando');
    document.removeEventListener('keydown', alTeclado);
    setTimeout(() => { capa.remove(); mostrando = false; }, 220);
  };
  const siguiente = () => {
    clearTimeout(reloj);
    i += 1;
    if (i >= pasos.length) { cerrar(); return; }
    escena.innerHTML = `<div class="celebra-paso ins-paso">${pasos[i]}</div>`;
    capa.querySelectorAll('.celebra-puntos i').forEach((p, k) => p.classList.toggle('activo', k === i));
    reloj = setTimeout(siguiente, 4200);
  };
  const alTeclado = (e) => { if (e.key === 'Escape') cerrar(); else if (e.key === 'Enter' || e.key === ' ') siguiente(); };
  capa.addEventListener('click', siguiente);
  document.addEventListener('keydown', alTeclado);
  requestAnimationFrame(() => { capa.classList.add('visible'); siguiente(); });
}

/** Tras cada refresco del servidor: guardar lo que cambie y avisar (en calma). */
let iniciado = false;
export function iniciarInsignias() {
  if (iniciado) return;
  iniciado = true;
  const enCalma = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 800));
  const tras = () => enCalma(async () => { await sincronizar(); revisarAvisos(); });
  datos.cuandoFrescos(tras);
  if (datos.datosFrescos()) tras();
}

// ---------------------------------------------------------------------------
// Perfil: vitrina (destacadas) y colección completa
// ---------------------------------------------------------------------------
const conseguidas = (lista) => lista.filter((x) => x.nivel > 0);
const PESO = { grupo: 3, secreta: 2, hito: 1 };

/** Las destacadas: las que eligió (si aún las tiene) o, si no eligió, las mejores. */
function destacadas(u, lista) {
  const tengo = new Map(conseguidas(lista).map((x) => [x.d.id, x]));
  const elegidas = (Array.isArray(u?.perfil_datos?.insignias) ? u.perfil_datos.insignias : []).map((id) => tengo.get(id)).filter(Boolean);
  if (elegidas.length) return elegidas.slice(0, MAX_DESTACADAS);
  // Sin elegir: variadas. Como mucho dos de grupo y, después, los niveles más altos.
  const todas = [...tengo.values()];
  const deGrupo = todas.filter((x) => x.d.tipo === 'grupo').slice(0, 2);
  const resto = todas.filter((x) => x.d.tipo !== 'grupo')
    .sort((a, b) => b.nivel - a.nivel || PESO[b.d.tipo] - PESO[a.d.tipo] || new Date(b.desde ?? 0) - new Date(a.desde ?? 0));
  return [...deGrupo, ...resto, ...todas.filter((x) => x.d.tipo === 'grupo').slice(2)].slice(0, MAX_DESTACADAS);
}

/**
 * El hueco de insignias del perfil. Catálogo oculto: cada uno solo ve las suyas y las que
 * los demás tienen en su vitrina; nada de bloqueadas, pistas, "???" ni "X de 30".
 */
export function vitrinaHtml(u, esMio) {
  const vacio = '<div class="perfil-insignias" data-ref="insignias" hidden></div>';
  if (!u || !Array.isArray(datos.estado.insignias)) return vacio;
  const lista = deUsuario(u.id);
  const total = conseguidas(lista).length;
  const top = destacadas(u, lista);
  if (!esMio && !top.length) return vacio;
  return `
    <section class="perfil-insignias" data-ref="insignias">
      <div class="seccion-cab">
        <h2 class="seccion-titulo">Insignias</h2>
        ${top.length ? `<button type="button" class="enlace-discreto" data-accion="insignias">${esMio ? `Ver todas · ${total}` : 'Ver todas'}</button>` : ''}
      </div>
      ${top.length ? `
        <button type="button" class="ins-vitrina" data-accion="insignias" aria-label="Ver las insignias">
          ${top.map((x) => `
            <span class="ins-vitrina-item">
              ${medalla(x.d, { nivel: x.nivel, tam: 56 })}
              <span class="ins-vitrina-nombre">${esc(x.d.nombre)}</span>
              ${x.d.umbrales ? `<span class="ins-nivel ${NIVELES[x.nivel]}">${NOMBRE_NIVEL[x.nivel]}</span>` : x.d.tipo === 'grupo' ? '<span class="ins-nivel grupo">Ahora</span>' : ''}
            </span>`).join('')}
        </button>`
        : '<p class="ins-vacia">Todavía ninguna. Van llegando solas.</p>'}
    </section>`;
}

/** "7.034 h", "media 6,51", "0,84 puntos de diferencia", "12 juegos". */
function textoValor(d, v) {
  if (v == null) return '';
  const n = Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 });
  if (d.unidad === 'h') return `${n} h`;
  if (d.unidad === 'media') return `media ${n}`;
  if (d.unidad === 'puntos') return `${n} puntos de diferencia de media`;
  return `${n} ${d.unidad}`;
}

/** Una insignia conseguida (las bloqueadas no se enseñan nunca). */
function itemColeccion(x, esMio, elegidas, editando) {
  const d = x.d;
  let detalle = esc(d.umbrales ? descripcion(d, x.nivel) : d.desc);
  if (d.pareja && x.pareja) detalle += `<span class="ins-falta">Con ${esc(datos.usuario(x.pareja)?.nombre ?? '')} · ${esc(textoValor(d, x.valor))}</span>`;
  else if (d.tipo === 'grupo' && x.valor != null) detalle += `<span class="ins-falta">${esMio ? 'Llevas' : 'Lleva'} ${esc(textoValor(d, x.valor))}</span>`;
  // Hacia el nivel siguiente, solo en las que ya tiene.
  const progreso = esMio && d.umbrales && x.nivel < 3 ? Math.min(1, x.valor / d.umbrales[x.nivel]) : null;
  if (progreso != null) detalle += ` <span class="ins-falta">${esc(pista(d, x.nivel))}</span>`;
  const marcada = editando && elegidas.includes(d.id);
  return `
    <${editando ? 'button type="button"' : 'div'} class="ins-item${marcada ? ' elegida' : ''}" ${editando ? `data-elegir="${esc(d.id)}" aria-pressed="${marcada}"` : ''}>
      ${medalla(d, { nivel: Math.max(1, x.nivel), tam: 52 })}
      <span class="ins-item-texto">
        <strong>${esc(d.nombre)}${d.umbrales ? ` <span class="ins-nivel ${NIVELES[x.nivel]}">${NOMBRE_NIVEL[x.nivel]}</span>` : ''}</strong>
        <small>${detalle}</small>
        ${progreso != null ? `<span class="ins-barra" aria-label="${x.valor} de ${d.umbrales[x.nivel]}"><i style="width:${Math.round(progreso * 100)}%"></i></span><small class="ins-cuenta">${Math.floor(x.valor).toLocaleString('es-ES')} / ${d.umbrales[x.nivel].toLocaleString('es-ES')}</small>` : ''}
        ${x.desde ? `<small class="ins-fecha">${d.tipo === 'grupo' ? 'Desde' : 'Conseguida'}: ${tiempoRelativo(x.desde).toLowerCase()}</small>` : ''}
      </span>
      ${editando ? `<span class="ins-marca" aria-hidden="true">${icono(marcada ? 'completado' : 'valorar', { tam: 22, color: marcada ? 'var(--acento)' : 'var(--borde)', trazo: 'var(--fondo)' })}</span>` : ''}
    </${editando ? 'button' : 'div'}>`;
}

/** Mis insignias (todas las conseguidas; elegir destacadas) o la vitrina de otro. */
export function abrirColeccion(uid) {
  const u = datos.usuario(uid);
  const yo = usuarioActual();
  if (!u) return;
  const esMio = yo?.id === uid;
  let editando = false;
  let elegidas = destacadas(u, deUsuario(uid)).map((x) => x.d.id);
  const pintar = (cuerpo) => {
    const lista = conseguidas(deUsuario(uid));
    if (!esMio) {
      cuerpo.innerHTML = `<div class="ins-lista">${destacadas(u, deUsuario(uid)).map((x) => itemColeccion(x, false, [], false)).join('')}</div>`;
      return;
    }
    const grupos = [
      ['grupo', 'De grupo', 'Dependen del resto del grupo y se pueden perder.'],
      ['hito', 'Hitos', 'Para siempre. Las que tienen niveles suben de bronce a plata y a oro.'],
      ['secreta', 'Secretas', 'Las que nadie sabe cómo se consiguen.'],
    ];
    cuerpo.innerHTML = `
      <div class="ins-editar">
        <span>${editando ? `Elige hasta ${MAX_DESTACADAS} para lucir en tu perfil.` : 'Las destacadas salen arriba en tu perfil y son las que ven los demás.'}</span>
        <button type="button" class="boton-secundario boton-pequeno" data-ins-editar>${editando ? 'Listo' : 'Elegir destacadas'}</button>
      </div>
      ${grupos.map(([tipo, titulo, sub]) => {
        const xs = lista.filter((x) => x.d.tipo === tipo);
        if (!xs.length) return '';
        return `
          <section class="ins-grupo">
            <div class="ins-grupo-cab"><h3>${titulo}</h3><span>${xs.length}</span></div>
            <p class="ins-grupo-sub">${sub}</p>
            <div class="ins-lista">${xs.map((x) => itemColeccion(x, true, elegidas, editando)).join('')}</div>
          </section>`;
      }).join('') || '<p class="ins-vacia">Todavía ninguna. Van llegando solas.</p>'}`;
  };
  abrirHoja({
    titulo: esMio ? 'Mis insignias' : `Vitrina de ${u.nombre}`,
    antetitulo: esMio ? `${conseguidas(deUsuario(uid)).length} conseguidas` : '',
    html: '',
    alMontar: (cuerpo) => {
      pintar(cuerpo);
      cuerpo.addEventListener('click', async (e) => {
        if (!esMio) return;
        if (e.target.closest('[data-ins-editar]')) {
          if (editando) {
            const perfil = { ...(datos.usuario(uid)?.perfil_datos ?? {}), insignias: elegidas };
            await datos.actualizarUsuario(uid, { perfil_datos: perfil }, aviso, 'No se han podido guardar las destacadas.');
          }
          editando = !editando;
          pintar(cuerpo);
          return;
        }
        const b = e.target.closest('[data-elegir]');
        if (!b) return;
        const id = b.dataset.elegir;
        if (elegidas.includes(id)) elegidas = elegidas.filter((x) => x !== id);
        else if (elegidas.length >= MAX_DESTACADAS) { aviso(`Como mucho ${MAX_DESTACADAS}: quita alguna antes`); return; }
        else elegidas = [...elegidas, id];
        pintar(cuerpo);
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Actividad (discreta): nuevas, subidas de nivel y cambios de dueño
// ---------------------------------------------------------------------------
export function eventosActividad() {
  const lista = [];
  for (const x of datos.estado.insignias ?? []) {
    const d = definicion(x.insignia);
    if (!d || x.inicial || !datos.usuario(x.usuario_id)) continue;
    lista.push({ insignia: true, d, nivel: x.nivel, quien: x.usuario_id, fecha: x.conseguida_en, creado_en: x.conseguida_en });
  }
  for (const x of datos.estado.insigniasGrupo ?? []) {
    const d = definicion(x.insignia);
    if (!d || x.inicial || !x.usuario_id || !datos.usuario(x.usuario_id)) continue;
    lista.push({ insignia: true, d, nivel: 1, quien: x.usuario_id, quien2: x.otro_id, anterior: d.pareja ? null : x.anterior_id, fecha: x.desde, creado_en: x.desde });
  }
  return lista;
}

export function filaActividad(ev, yoId, ahora = new Date()) {
  const u = datos.usuario(ev.quien);
  const ant = ev.anterior ? datos.usuario(ev.anterior) : null;
  const nombre = `<strong>«${esc(ev.d.nombre)}»</strong>${ev.d.umbrales ? ` de ${NOMBRE_NIVEL[ev.nivel].toLowerCase()}` : ''}`;
  const otro = ev.quien2 ? datos.usuario(ev.quien2) : null;
  const frase = ev.d.pareja
    ? (ev.quien2 === yoId ? `y tú sois ahora ${nombre}` : `y ${esc(otro?.nombre ?? '')} son ahora ${nombre}`)
    : ev.d.tipo === 'grupo'
    ? (ant ? (ev.anterior === yoId ? `te ha quitado ${nombre}` : `le ha quitado ${nombre} a ${esc(ant.nombre)}`) : `se ha hecho con ${nombre}`)
    : `ha conseguido ${ev.d.tipo === 'secreta' ? 'la insignia secreta ' : ''}${nombre}`;
  return `
    <a class="actividad-fila actividad-insignia" href="#perfil/${esc(ev.quien)}">
      ${avatarPerfil(u, 36)}
      <div class="actividad-texto">
        <span class="actividad-frase">${nombrePerfil(u, 'strong')} ${frase}</span>
        <span class="actividad-tiempo" data-fecha="${esc(ev.fecha)}">${tiempoRelativo(ev.fecha, ahora)}</span>
      </div>
      ${medalla(ev.d, { nivel: ev.nivel, tam: 40 })}
    </a>`;
}
