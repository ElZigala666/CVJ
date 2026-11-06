// Iconos propios del diseño (rellenos). Sacados de cvj-diseno/pantallas/*.html.
// Cada icono tiene una forma rellena (d) y, si hace falta, un trazo interior (t)
// que se dibuja en el color "sobre acento" (blanco en claro, casi negro en oscuro).
// Uso: icono('buscar', { tam: 20 })  → string con el <svg>.
// El color del relleno es currentColor salvo que se pase { color }.

const ICONOS = {
  inicio: { d: 'M12 2.5 21 10v11a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10z' },
  buscar: { d: 'M10.5 2a8.5 8.5 0 0 1 6.72 13.7l4.54 4.54-2.12 2.12-4.54-4.54A8.5 8.5 0 1 1 10.5 2zm0 3.2a5.3 5.3 0 1 0 0 10.6 5.3 5.3 0 0 0 0-10.6z' },
  valorar: { d: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z', t: 'M12 7.5v9M7.5 12h9' },
  rankings: { d: 'M3 12.5a1 1 0 0 1 1-1h4V22H4a1 1 0 0 1-1-1zM9.5 4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v18h-5zM16 8.5h4a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1h-4z' },
  perfil: { d: 'M12 2.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM3 21c0-4.4 4-7 9-7s9 2.6 9 7v1H3z' },
  recomendado: { d: 'M12 1.8 21 7v10l-9 5.2L3 17V7z', t: 'M8 13.5l4-4 4 4' },
  'no-recomendado': { d: 'M12 1.8 21 7v10l-9 5.2L3 17V7z', t: 'M8 10.5l4 4 4-4' },
  jugando: { d: 'M7.5 6h9a5.5 5.5 0 0 1 5.4 6.5l-.8 4.3a2.6 2.6 0 0 1-4.5 1.3L14.4 16H9.6l-2.2 2.1a2.6 2.6 0 0 1-4.5-1.3l-.8-4.3A5.5 5.5 0 0 1 7.5 6z', t: 'M8 9.5v4M6 11.5h4' },
  completado: { d: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z', t: 'M7.5 12.3l3 3 6-6.3' },
  abandonado: { d: 'M5 2.5h2V22H5zM8.5 3.5H20l-3 4.5 3 4.5H8.5z' },
  pendiente: { d: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z', t: 'M12 7v5.2l3.3 2' },
  ajustes: { d: 'M3 6h10v2H3zM17 6h4v2h-4zM13 4h4v6h-4zM3 16h4v2H3zM11 16h10v2H11zM7 14h4v6H7z' },
  atras: { d: 'M14.6 3.4 16 4.8 8.8 12l7.2 7.2-1.4 1.4L6 12z' },
  adelante: { d: 'M9.4 3.4 8 4.8l7.2 7.2L8 19.2l1.4 1.4L18 12z' },
  desplegable: { d: 'M4 8h16l-8 9z' },
  // Instalar la app (flecha hacia una bandeja) y los dos pasos de iPhone
  instalar: { d: 'M10.5 2.5h3v8.2H17l-5 5.6-5-5.6h3.5zM3 18.5h18V22H3z' },
  compartir: { d: 'M12 1.5l5 5h-3.5v8.5h-3V6.5H7zM4 10h5v2.5H6.5v7h11v-7H15V10h5v12H4z' },
  'anadir-inicio': { d: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z', t: 'M12 8v8M8 12h8' },
  // PlayStation: abrir fuera, pegar el código y "no se guarda"
  externo: { d: 'M13.5 3H21v7.5h-2.6V7.4l-7.5 7.5-1.8-1.8 7.5-7.5h-3.1zM3 7a2 2 0 0 1 2-2h6v2.6H5.6v10.8h10.8V13H19v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  pegar: { d: 'M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1z', t: 'M8.5 11h7M8.5 15h5' },
  candado: { d: 'M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm0 2.6A2.4 2.4 0 0 0 9.6 7v3h4.8V7A2.4 2.4 0 0 0 12 4.6z', t: 'M12 14.2v2.8' },
  // Menú de opciones (tres puntos)
  opciones: { d: 'M12 3.5a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zm0 6.3a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4zm0 6.3a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z' },
  // Iconos de solo trazo (en el diseño van con trazo grueso redondeado)
  cerrar: { s: 'M6 6l12 12M18 6 6 18' },
  mas: { s: 'M12 5v14M5 12h14' },
  // Logo: hexágono con el chevron
  logo: { d: 'M12 1.8 21 7v10l-9 5.2L3 17V7z', t: 'M8 13.5l4-4 4 4', grosor: 2.4 },
};

/**
 * Devuelve el SVG de un icono.
 * @param {string} nombre
 * @param {{tam?:number, color?:string, trazo?:string, grosor?:number, clase?:string, etiqueta?:string, contorno?:string}} [op]
 */
export function icono(nombre, op = {}) {
  const ic = ICONOS[nombre];
  if (!ic) return '';
  const tam = op.tam ?? 24;
  const color = op.color ?? 'currentColor';
  const trazo = op.trazo ?? 'var(--sobre-acento)';
  const accesible = op.etiqueta
    ? `role="img" aria-label="${op.etiqueta}"`
    : 'aria-hidden="true" focusable="false"';
  const clase = op.clase ? ` class="${op.clase}"` : '';
  let dentro = '';
  // contorno: borde del color del fondo alrededor de la forma (insignias sobre avatares)
  const contorno = op.contorno ? ` stroke="${op.contorno}" stroke-width="3"` : '';
  if (ic.d) dentro += `<path d="${ic.d}" fill="${color}" fill-rule="evenodd"${contorno}/>`;
  if (ic.t) dentro += `<path d="${ic.t}" stroke="${trazo}" stroke-width="${op.grosor ?? ic.grosor ?? 2.2}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  if (ic.s) dentro += `<path d="${ic.s}" stroke="${color}" stroke-width="${op.grosor ?? 2.6}" stroke-linecap="round" fill="none"/>`;
  return `<svg${clase} width="${tam}" height="${tam}" viewBox="0 0 24 24" ${accesible}>${dentro}</svg>`;
}

export const NOMBRES_ICONOS = Object.keys(ICONOS);
