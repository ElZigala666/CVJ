// Herramientas del editor de columnas (js/pantallas/escribir.js): el menú "Insertar" y sus
// hojas (juego, capturas de IGDB, mención, veredicto, encuesta, portada) y la búsqueda rápida
// de juegos y personas para "#" y "@". Todo acaba en texto (los bloques de markdown() de
// js/columnas-ui.js): lo que se inserta se puede retocar a mano y se ve igual en la lectura.
import { icono } from './icons.js';
import * as datos from './datos.js';
import { esc, portada, avatar, aviso, chipLetra } from './ui.js';
import { abrirHoja } from './hoja.js';
import { buscarJuegos, fichaJuego, artesDeJuego } from './igdb.js';
import { LETRAS, letraANota, notaALetra, formatearNota } from './notas.js';
import { imagenRedimensionada } from './columnas-ui.js';

const normal = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
export const urlArteIgdb = (id, tam = 't_1080p') => `https://images.igdb.com/igdb/image/upload/${tam}/${id}.jpg`;

// ---------------------------------------------------------------------------
// Búsquedas rápidas ("#" y "@")
// ---------------------------------------------------------------------------
/** Juegos ya conocidos cuyo nombre encaja (al instante, sin red). */
export function juegosLocales(texto, max = 6) {
  const q = normal(texto);
  if (q.length < 2) return [];
  const empieza = [];
  const contiene = [];
  for (const j of datos.estado.juegos ?? []) {
    if (datos.canonico(j.igdb_id) !== Number(j.igdb_id)) continue; // versiones fusionadas: el principal
    const n = normal(j.nombre);
    if (n.startsWith(q) || n.split(' ').some((p) => p.startsWith(q))) empieza.push(j);
    else if (n.includes(q)) contiene.push(j);
  }
  const valorados = (j) => datos.statsJuego(j.igdb_id).votos ?? 0;
  return [...empieza.sort((a, b) => valorados(b) - valorados(a)), ...contiene.sort((a, b) => valorados(b) - valorados(a))].slice(0, max);
}
/** Personas del grupo (activas) cuyo nombre empieza así. */
export function personas(texto, sinId = null) {
  const q = normal(texto);
  return (datos.estado.usuarios ?? []).filter((u) => u.activo !== false && u.id !== sinId && normal(u.nombre).startsWith(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).slice(0, 6);
}
/** Un juego elegido de IGDB que aún no está en la tabla: se guarda (para que la tarjeta se vea a todos). */
export async function asegurarJuego(j) {
  if (datos.juego(j.igdb_id)) return j;
  datos.recordarParciales([j]);
  try { await fichaJuego(j.igdb_id); } catch { /* se queda en memoria; la ficha lo guardará al abrirse */ }
  return j;
}

// ---------------------------------------------------------------------------
// Menú Insertar
// ---------------------------------------------------------------------------
const OPCIONES = [
  { id: 'juego', ic: 'ficha', nombre: 'Juego', texto: 'Su tarjeta, con tu nota y la del grupo. Atajo: # y el nombre.' },
  { id: 'capturas', ic: 'imagen', nombre: 'Capturas del juego', texto: 'El arte y las capturas de IGDB, sin subir nada.' },
  { id: 'spoiler', ic: 'candado', nombre: 'Spoiler', texto: 'Sale tapado hasta que el lector lo toca.' },
  { id: 'destacada', ic: 'comentario', nombre: 'Cita destacada', texto: 'Una frase grande, de revista.' },
  { id: 'mencion', ic: 'perfil', nombre: 'Mención', texto: 'Le llega un aviso al publicar. Atajo: @ y el nombre.' },
  { id: 'veredicto', ic: 'trofeo', nombre: 'Veredicto final', texto: 'Nota, lo bueno, lo malo y una frase final.' },
  { id: 'encuesta', ic: 'urna', nombre: 'Encuesta', texto: 'Una pregunta y de 2 a 4 opciones, al final.' },
  { id: 'portada', ic: 'cabecera', nombre: 'Portada de la entrada', texto: 'Una imagen arriba del todo.' },
];
export function menuInsertar(alElegir) {
  abrirHoja({
    titulo: 'Insertar',
    html: `<div class="ins-menu">${OPCIONES.map((o) => `
      <button type="button" class="ins-opcion" data-ins="${o.id}">
        <span class="ins-ic">${icono(o.ic, { tam: 22, color: 'currentColor', trazo: 'var(--superficie)' })}</span>
        <span class="ins-texto"><strong>${o.nombre}</strong><small>${o.texto}</small></span>
      </button>`).join('')}</div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ins]');
        if (!b) return;
        cerrar();
        setTimeout(() => alElegir(b.dataset.ins), 220); // la siguiente hoja, cuando se ha ido esta
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Elegir un juego (local al instante + IGDB)
// ---------------------------------------------------------------------------
export function elegirJuego({ titulo = 'Elegir un juego', alElegir }) {
  abrirHoja({
    titulo,
    html: `
      <div class="ins-buscar">
        <input type="search" class="psn-input" data-ref="q" placeholder="Nombre del juego" autocomplete="off" enterkeyhint="search">
        <div class="ins-resultados" data-ref="res"><p class="ajustes-nota">Escribe al menos dos letras.</p></div>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const q = cuerpo.querySelector('[data-ref="q"]');
      const res = cuerpo.querySelector('[data-ref="res"]');
      let lista = [];
      let control = null;
      let reloj = null;
      const pintar = (buscando) => {
        res.innerHTML = lista.length ? lista.map((j, i) => `
          <button type="button" class="ins-juego" data-i="${i}">
            ${portada(j, { clase: 'portada-hoja' })}
            <span><strong>${esc(j.nombre)}</strong><small>${esc([j.anio, (j.plataformas ?? []).slice(0, 3).join(', ')].filter(Boolean).join(' · '))}</small></span>
          </button>`).join('') + (buscando ? '<p class="ajustes-nota">Buscando en IGDB…</p>' : '')
          : `<p class="ajustes-nota">${buscando ? 'Buscando…' : q.value.trim().length < 2 ? 'Escribe al menos dos letras.' : 'No hay resultados.'}</p>`;
      };
      q.addEventListener('input', () => {
        const t = q.value.trim();
        lista = juegosLocales(t, 6);
        clearTimeout(reloj);
        control?.abort();
        if (t.length < 2) { pintar(false); return; }
        pintar(true);
        reloj = setTimeout(async () => {
          control = new AbortController();
          try {
            const fuera = await buscarJuegos(t, control.signal);
            const ya = new Set(lista.map((j) => Number(j.igdb_id)));
            lista = [...lista, ...fuera.filter((j) => !ya.has(Number(j.igdb_id)) && !ya.has(datos.canonico(j.igdb_id)))].slice(0, 12);
            pintar(false);
          } catch (e) { if (e.name !== 'AbortError') pintar(false); }
        }, 350);
      });
      res.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        const j = lista[Number(b.dataset.i)];
        b.disabled = true;
        await asegurarJuego(j);
        cerrar();
        alElegir(j);
      });
      setTimeout(() => q.focus(), 60);
    },
  });
}

// ---------------------------------------------------------------------------
// Arte y capturas de IGDB de un juego
// ---------------------------------------------------------------------------
export function elegirImagenJuego({ juegoId = null, titulo = 'Capturas del juego', alElegir }) {
  if (!juegoId) { elegirJuego({ titulo: 'Capturas de qué juego', alElegir: (j) => elegirImagenJuego({ juegoId: j.igdb_id, titulo, alElegir }) }); return; }
  const j = datos.juegoConocido(juegoId);
  abrirHoja({
    titulo,
    antetitulo: j?.nombre ?? '',
    html: `
      <div class="ins-capturas">
        <div class="ins-rejilla" data-ref="rejilla"><p class="ajustes-nota">Cargando el arte de IGDB…</p></div>
        <button type="button" class="enlace-discreto" data-ref="otro">Otro juego</button>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const rej = cuerpo.querySelector('[data-ref="rejilla"]');
      cuerpo.querySelector('[data-ref="otro"]').addEventListener('click', () => {
        cerrar();
        setTimeout(() => elegirImagenJuego({ juegoId: null, titulo, alElegir }), 220);
      });
      artesDeJuego(juegoId).then((artes) => {
        if (!rej.isConnected) return;
        rej.innerHTML = artes.length
          ? artes.map((a) => `<button type="button" class="ins-captura" data-id="${esc(a.id)}"><img src="${esc(urlArteIgdb(a.id, 't_screenshot_med'))}" alt="" loading="lazy"><small>${a.tipo === 'artwork' ? 'Arte' : 'Captura'}</small></button>`).join('')
          : '<p class="ajustes-nota">Este juego no tiene arte ni capturas en IGDB.</p>';
      }).catch(() => { if (rej.isConnected) rej.innerHTML = '<p class="ajustes-nota">No se ha podido cargar. Revisa la conexión.</p>'; });
      rej.addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (!b) return;
        cerrar();
        alElegir(urlArteIgdb(b.dataset.id));
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Mención
// ---------------------------------------------------------------------------
export function elegirPersona({ sinId, alElegir }) {
  const lista = personas('', sinId);
  abrirHoja({
    titulo: 'Mencionar a…',
    html: `<div class="ins-personas">${lista.map((u) => `<button type="button" class="ins-persona" data-id="${esc(u.id)}">${avatar(u, 36)}<strong>${esc(u.nombre)}</strong></button>`).join('')}</div>
      <p class="ajustes-nota">Le llegará un aviso cuando publiques.</p>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (!b) return;
        cerrar();
        alElegir(datos.usuario(b.dataset.id));
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Veredicto final
// ---------------------------------------------------------------------------
export function hojaVeredicto({ notaInicial = null, alHecho }) {
  let nota = notaInicial;
  const fila = (cl, ph) => `<input type="text" class="psn-input" data-${cl} maxlength="90" placeholder="${ph}">`;
  abrirHoja({
    titulo: 'Veredicto final',
    html: `
      <div class="ins-form">
        <span class="campo-titulo">Nota</span>
        <div class="ins-letras" role="radiogroup" aria-label="Nota">
          ${LETRAS.map((l) => `<button type="button" role="radio" class="ins-letra" data-letra="${l}" aria-checked="false">${chipLetra(l, 'md')}</button>`).join('')}
        </div>
        <label class="ins-nota-fina"><span>Afinar</span><input type="range" class="deslizador" min="0" max="10" step="0.1" data-ref="nota"><b data-ref="nota-txt"></b></label>
        <span class="campo-titulo">Lo bueno</span>
        ${fila('bueno', 'Un acierto')}${fila('bueno', 'Otro (opcional)')}${fila('bueno', 'Otro (opcional)')}
        <span class="campo-titulo">Lo malo</span>
        ${fila('malo', 'Un fallo')}${fila('malo', 'Otro (opcional)')}${fila('malo', 'Otro (opcional)')}
        <label class="campo-titulo" for="ver-frase">En una frase</label>
        <input type="text" class="psn-input" id="ver-frase" data-ref="frase" maxlength="160" placeholder="Para quien solo lea esto">
        <button type="button" class="boton-principal" data-ref="hecho">Añadir el veredicto</button>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      const pintarNota = () => {
        $('nota').value = nota ?? 7.5;
        $('nota-txt').textContent = nota == null ? '—' : formatearNota(nota);
        const l = nota == null ? null : notaALetra(nota);
        for (const b of cuerpo.querySelectorAll('[data-letra]')) { const on = b.dataset.letra === l; b.classList.toggle('activo', on); b.setAttribute('aria-checked', String(on)); }
      };
      pintarNota();
      cuerpo.querySelector('.ins-letras').addEventListener('click', (e) => {
        const b = e.target.closest('[data-letra]');
        if (b) { nota = letraANota(b.dataset.letra); pintarNota(); }
      });
      $('nota').addEventListener('input', (e) => { nota = Number(e.target.value); pintarNota(); });
      $('hecho').addEventListener('click', () => {
        const val = (sel) => [...cuerpo.querySelectorAll(sel)].map((i) => i.value.trim().replace(/\s+/g, ' ')).filter(Boolean);
        const lineas = [
          ':::veredicto',
          ...(nota != null ? [`nota: ${formatearNota(nota)}`] : []),
          ...val('[data-bueno]').map((x) => `+ ${x}`),
          ...val('[data-malo]').map((x) => `- ${x}`),
          ...($('frase').value.trim() ? [`= ${$('frase').value.trim()}`] : []),
          ':::',
        ];
        if (lineas.length <= 2) { aviso('Ponle al menos una nota o una frase'); return; }
        cerrar();
        alHecho(lineas.join('\n'));
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Encuesta
// ---------------------------------------------------------------------------
export function hojaEncuesta({ alHecho }) {
  abrirHoja({
    titulo: 'Encuesta',
    html: `
      <div class="ins-form">
        <label class="campo-titulo" for="enc-pregunta">Pregunta</label>
        <input type="text" class="psn-input" id="enc-pregunta" data-ref="pregunta" maxlength="140" placeholder="¿Mejor que el original?">
        <span class="campo-titulo">Opciones (de 2 a 4)</span>
        ${[1, 2, 3, 4].map((n) => `<input type="text" class="psn-input" data-opcion maxlength="60" placeholder="Opción ${n}${n > 2 ? ' (opcional)' : ''}">`).join('')}
        <p class="ajustes-nota">Va al final de la entrada. Cada uno vota una vez y ve los resultados después de votar.</p>
        <button type="button" class="boton-principal" data-ref="hecho">Añadir la encuesta</button>
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.querySelector('[data-ref="hecho"]').addEventListener('click', () => {
        const p = cuerpo.querySelector('[data-ref="pregunta"]').value.trim().replace(/\s+/g, ' ');
        const ops = [...cuerpo.querySelectorAll('[data-opcion]')].map((i) => i.value.trim().replace(/\s+/g, ' ')).filter(Boolean);
        if (!p) { aviso('Falta la pregunta'); return; }
        if (ops.length < 2) { aviso('Hacen falta al menos dos opciones'); return; }
        cerrar();
        alHecho([':::encuesta', p, ...ops.map((o) => `- ${o}`), ':::'].join('\n'));
      });
      setTimeout(() => cuerpo.querySelector('[data-ref="pregunta"]').focus(), 60);
    },
  });
}

// ---------------------------------------------------------------------------
// Portada de la entrada
// ---------------------------------------------------------------------------
export function hojaPortada({ juegoId, entradaId, actual, alElegir }) {
  abrirHoja({
    titulo: 'Portada de la entrada',
    html: `
      <div class="ins-form">
        ${actual ? `<img class="ins-portada-actual" src="${esc(actual)}" alt="">` : ''}
        <label class="boton-secundario con-icono ins-subir">${icono('imagen', { tam: 18, color: 'currentColor', trazo: 'var(--superficie)' })}<span>Subir una imagen</span><input type="file" accept="image/*" data-ref="archivo" hidden></label>
        <button type="button" class="boton-secundario con-icono" data-ref="arte">${icono('ficha', { tam: 18, color: 'currentColor', trazo: 'var(--superficie)' })}<span>Arte de un juego</span></button>
        ${actual ? '<button type="button" class="enlace-discreto peligro-texto" data-ref="quitar">Quitar la portada</button>' : ''}
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.querySelector('[data-ref="arte"]').addEventListener('click', () => {
        cerrar();
        setTimeout(() => elegirImagenJuego({ juegoId, titulo: 'Portada: arte del juego', alElegir }), 220);
      });
      cuerpo.querySelector('[data-ref="quitar"]')?.addEventListener('click', () => { cerrar(); alElegir(null); });
      cuerpo.querySelector('[data-ref="archivo"]').addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        aviso('Subiendo la portada…');
        try {
          const blob = await imagenRedimensionada(f, 1800);
          const url = await datos.subirImagenColumna(`entradas/${entradaId}/portada-${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, blob);
          cerrar();
          alElegir(url);
        } catch (err) {
          console.warn('[portada]', err?.message || err);
          aviso('No se ha podido subir la imagen');
        }
      });
    },
  });
}
