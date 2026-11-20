// Lo que se ve dentro del perfil (pestañas Tier list, Estadísticas y Columna) y también en
// Rankings (Tier list y Estadísticas, con la fila de personas y "Grupo"): el HTML del
// contenido, sin cabecera. La columna suelta (#columna/{id}) usa htmlColumna.
import { icono } from './icons.js';
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { LETRAS, rangoTier, formatearNota, notaALetra } from './notas.js';
import { esc, avatar, portada, chipLetra, aviso, miles } from './ui.js';
import { usuarioActual } from './sesion.js';
import { modoTiers, guardarPreferencia } from './preferencias.js';
import { abrirHoja } from './hoja.js';
import * as clas from './clasificacion.js';
import * as grafico from './graficos.js';
import { textoLectura, logoColumna, nombreColumna, esLegado } from './columnas-ui.js';
import { temaDe } from './pantallas/lectura.js';
import { cuentasHtml } from './social.js';

const rangoCorto = (l) => rangoTier(l).replace(/^(\d+)\.0–/, '$1–');

// ---------------------------------------------------------------------------
// Fila de personas (y "Grupo") para cambiar sin salir
// ---------------------------------------------------------------------------
export function chipsUsuarios(activo, { grupo = false } = {}) {
  const todos = metricas.usuariosActivos();
  return `
    <div class="chips-usuarios" role="tablist" aria-label="Persona" data-scroll="usuarios">
      ${grupo ? `
        <button type="button" role="tab" class="chip-usuario chip-grupo${activo === 'grupo' ? ' activo' : ''}" aria-selected="${activo === 'grupo'}" data-usuario="grupo">
          <span class="chip-grupo-icono">${icono('rankings', { tam: 18, color: 'currentColor' })}</span><span>Grupo</span>
        </button>` : ''}
      ${todos.map((x) => `
        <button type="button" role="tab" class="chip-usuario${x.id === activo ? ' activo' : ''}" aria-selected="${x.id === activo}" data-usuario="${esc(x.id)}">
          ${avatar(x, 30)}<span>${esc(x.nombre)}</span>
        </button>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------------------
// Tier list (de alguien o del grupo). Dos vistas (Ajustes y la propia tier list; en la cuenta,
// js/preferencias.js): "completa" (filas que crecen hacia abajo) y "compacta" (cada rango en una
// fila con scroll horizontal, portadas más grandes y "+N"; tocar la letra o el "+N" lo
// despliega entero). En la del grupo, por defecto solo juegos con 2 notas o más.
// En MI tier list, el modo "Ordenar": arrastrar dentro de cada rango (usuarios.tiers_orden,
// migración 050) y "Ordenar por…" (nota, nombre, salida, cuándo lo jugué, horas). Al final de
// cualquiera, "Compartir como imagen" (js/tier-imagen.js).
// ---------------------------------------------------------------------------
const EN_FILA = 12; // compacta: portadas en la fila antes del "+N"
const desplegados = new Set(); // `${lista}:${letra}`, mientras la app está abierta
const CLAVE_SOLOS = 'cvj.tiers.solos';
const conSolos = () => { try { return localStorage.getItem(CLAVE_SOLOS) === '1'; } catch { return false; } };
let ordenando = false; // modo Ordenar de mi tier list
window.addEventListener('hashchange', () => { ordenando = false; quitarTip(); }); // salir de la pantalla lo cierra

/**
 * Los datos de una tier list, rango a rango y ya en su orden (el manual de su dueño, si lo
 * tiene; detrás, por nota). lista = 'u:{id}' o 'grupo'.
 * → { total, solos, filas: { S: [{ clave, juego, esColeccion, nota, horas, estimadas, votos, v }] } }
 */
export function datosTiers(lista) {
  if (lista === 'grupo') {
    const t = metricas.tierListGrupo(conSolos() ? 1 : 2);
    const filas = Object.fromEntries(LETRAS.map((l) => [l, t.filas[l].map((x) => ({
      clave: x.coleccion ? `c:${x.coleccion.id}` : `j:${x.juego.igdb_id}`, juego: x.juego, esColeccion: !!x.coleccion,
      nota: x.media, horas: x.horas, estimadas: x.horasEstimadas, votos: x.votos,
    }))]));
    return { total: t.total, solos: t.solos, filas };
  }
  const id = lista.slice(2);
  const t = metricas.tierList(id);
  const orden = datos.usuario(id)?.tiers_orden ?? {};
  const filas = {};
  for (const l of LETRAS) {
    const items = t.filas[l].map((v, i) => {
      const j = v.esColeccion ? datos.comoJuego(datos.coleccion(v.coleccion_id)) : datos.juegoConocido(v.juego_id);
      if (!j) return null;
      const hc = v.esColeccion ? metricas.horasColeccion(id, v.coleccion_id) : null;
      return {
        clave: v.esColeccion ? `c:${v.coleccion_id}` : `j:${v.juego_id}`, juego: j, esColeccion: !!v.esColeccion, v, i,
        nota: v.nota, horas: hc ? hc.total : metricas.horasDe(id, v.juego_id), estimadas: hc ? hc.estimadas : metricas.estimadasDe(id, v.juego_id),
      };
    }).filter(Boolean);
    // Orden manual: los que tienen posición, por ella; los demás detrás, por nota.
    const pos = (x) => (Number.isFinite(orden[x.clave]) ? orden[x.clave] : Infinity);
    filas[l] = items.sort((a, b) => pos(a) - pos(b) || a.i - b.i);
  }
  return { total: t.total, solos: 0, filas };
}

/** Compacta / Completa, Ordenar (la mía) y, en la del grupo, el interruptor de los juegos de una persona. */
function barraTiers(lista, t) {
  const modo = modoTiers();
  const mia = lista === `u:${usuarioActual()?.id}`;
  if (mia && ordenando) {
    return `
      <div class="tiers-opciones ordenando">
        <span class="tiers-ordenando-texto">${icono('arrastrar', { tam: 18, color: 'currentColor' })}Arrastra para ordenar cada rango</span>
        <div class="tiers-ordenar-botones">
          <button type="button" class="boton-secundario boton-pequeno" data-tiers-ordenar-por>Ordenar por…</button>
          <button type="button" class="boton-principal boton-pequeno" data-tiers-ordenar="no">Listo</button>
        </div>
      </div>`;
  }
  return `
    <div class="tiers-opciones">
      <div class="segmentado segmentado-peq" role="tablist" aria-label="Vista de la tier list">
        ${[['compacta', 'Compacta'], ['completa', 'Completa']].map(([m, n]) => `<button type="button" role="tab" data-tiers-modo="${m}" class="${modo === m ? 'activo' : ''}" aria-selected="${modo === m}">${n}</button>`).join('')}
      </div>
      ${mia ? `<button type="button" class="enlace-discreto tiers-ordenar" data-tiers-ordenar="si">${icono('arrastrar', { tam: 16, color: 'currentColor' })}Ordenar</button>` : ''}
      ${lista === 'grupo' ? `
        <label class="interruptor mini tiers-solos">
          <input type="checkbox" data-tiers-solos${conSolos() ? ' checked' : ''}>
          <span>Incluir juegos de una sola persona${!conSolos() && t.solos ? ` (${t.solos})` : ''}</span>
        </label>` : ''}
    </div>`;
}

const botonImagen = (lista) => `
  <div class="tiers-compartir">
    <button type="button" class="boton-secundario neutro con-icono" data-tiers-imagen="${esc(lista)}">${icono('compartir', { tam: 18, color: 'currentColor' })}<span>Compartir como imagen</span></button>
  </div>`;

export function htmlTiers(id) {
  const lista = `u:${id}`;
  const t = datosTiers(lista);
  let n = 0;
  if (!t.total) return `<p class="historial-tab-vacia">Todavía no hay notas que cuenten en la tier list.</p>`;
  const orden = ordenando && id === usuarioActual()?.id;
  const modo = orden ? 'completa' : modoTiers();
  return `
    <p class="tiers-sub">${t.total} ${t.total === 1 ? 'juego' : 'juegos'}, según sus notas${datos.usuario(id)?.tiers_orden ? ' y su orden' : ''}</p>
    ${barraTiers(lista, t)}
    <div class="tiers ${modo}${orden ? ' ordenando' : ''}"${orden ? '' : ' data-lista'}>
      ${LETRAS.map((l) => fila(l, lista, modo, t.filas[l].map((x) => item(x.juego, x.esColeccion, formatearNota(x.nota),
        x.horas ? metricas.textoAprox(x.horas, x.estimadas) : '', n++ < 12, !orden, orden ? x.clave : null)))).join('')}
    </div>
    ${orden ? '' : botonImagen(lista)}`;
}

/** La del grupo: cada juego con la nota media de todos los que lo han valorado (2 notas o más, salvo que se pida). */
export function htmlTiersGrupo() {
  const t = datosTiers('grupo');
  let n = 0;
  const modo = modoTiers();
  if (!t.total) return `${barraTiers('grupo', t)}<p class="historial-tab-vacia">Todavía no hay juegos con notas de ${conSolos() ? 'nadie' : 'dos personas'}.</p>`;
  return `
    <p class="tiers-sub">${t.total} ${t.total === 1 ? 'juego' : 'juegos'}, con la nota media de todos${conSolos() ? '' : ' (con 2 notas o más)'}</p>
    ${barraTiers('grupo', t)}
    <div class="tiers ${modo}">
      ${LETRAS.map((l) => fila(l, 'grupo', modo, t.filas[l].map((x) => item(x.juego, x.esColeccion, formatearNota(x.nota), `${x.votos} ${x.votos === 1 ? 'nota' : 'notas'}`, n++ < 12, false)))).join('')}
    </div>
    ${botonImagen('grupo')}`;
}

function fila(l, lista, modo, items) {
  const llenos = items.filter(Boolean);
  const abierto = modo === 'completa' || desplegados.has(`${lista}:${l}`);
  const visibles = abierto ? llenos : llenos.slice(0, EN_FILA);
  const resto = llenos.length - visibles.length;
  const letra = `
    <span class="tier-letra-l">${l}</span>
    <span class="tier-rango">${rangoCorto(l)}</span>`;
  return `
  <div class="tier-fila${modo === 'compacta' ? ` compacta${abierto ? ' abierta' : ''}` : ''}">
    ${modo === 'compacta' && llenos.length
      ? `<button type="button" class="tier-letra" data-tier="${l}" data-tier-abrir="${esc(lista)}:${l}" aria-expanded="${abierto}" aria-label="${l}: ${abierto ? 'plegar' : 'ver entero'}">${letra}</button>`
      : `<div class="tier-letra" data-tier="${l}">${letra}</div>`}
    <div class="tier-juegos" data-rango="${l}">
      ${llenos.length ? visibles.join('') : '<span class="tier-vacio">Ningún juego en este tier</span>'}
      ${resto > 0 ? `<button type="button" class="tier-mas" data-tier-abrir="${esc(lista)}:${l}">+${resto}</button>` : ''}
    </div>
  </div>`;
}

/** Clics de la tier list (vista, ordenar, imagen, desplegar un rango). true si era suyo. */
export function clicTiers(e) {
  // En el modo Ordenar las portadas no abren la ficha (se arrastran).
  if (ordenando && e.target.closest('.tiers.ordenando .tier-item')) { e.preventDefault(); return true; }
  const m = e.target.closest('[data-tiers-modo]');
  if (m) {
    if (m.dataset.tiersModo !== modoTiers()) { guardarPreferencia('tiers', m.dataset.tiersModo); datos.repintar(); }
    return true;
  }
  const o = e.target.closest('[data-tiers-ordenar]');
  if (o) { ordenando = o.dataset.tiersOrdenar === 'si'; datos.repintar(); return true; }
  if (e.target.closest('[data-tiers-ordenar-por]')) { abrirOrdenarPor(); return true; }
  const img = e.target.closest('[data-tiers-imagen]');
  if (img) {
    const lista = img.dataset.tiersImagen;
    import('./tier-imagen.js').then((mod) => mod.abrirExportar(lista));
    return true;
  }
  const a = e.target.closest('[data-tier-abrir]');
  if (a) {
    const k = a.dataset.tierAbrir;
    if (desplegados.has(k)) desplegados.delete(k); else desplegados.add(k);
    datos.repintar();
    return true;
  }
  return false;
}
/** El interruptor "Incluir juegos de una sola persona" (evento change). true si era suyo. */
export function cambioTiers(e) {
  const c = e.target.closest?.('[data-tiers-solos]');
  if (!c) return false;
  try { localStorage.setItem(CLAVE_SOLOS, c.checked ? '1' : '0'); } catch { /* nada */ }
  datos.repintar();
  return true;
}

function item(j, esColeccion, nota, pie, prioridad, seleccionable = true, clave = null) {
  return `
    <a class="tier-item${esColeccion ? ' es-coleccion' : ''}"${esColeccion || !seleccionable ? '' : ` data-sel="${j.igdb_id}"`}${clave ? ` data-orden="${esc(clave)}"` : ''} href="${metricas.rutaDe(j)}" data-precarga="${esc(j.cover_id ?? '')}" aria-label="${esc(j.nombre)}${esColeccion ? ' (colección)' : ''}, ${nota}" draggable="false">
      ${portada(j, { clase: 'portada-tier', titulo: 'arriba', prioridad, ancho: modoTiers() === 'compacta' && !clave ? 72 : undefined })}
      ${esColeccion ? '<span class="sello-coleccion mini">Colección</span>' : ''}
      <span class="tier-nota">${nota}${pie ? `<small class="tier-horas">${esc(pie)}</small>` : ''}</span>
    </a>`;
}

// ---- Modo Ordenar: arrastrar dentro de un rango ------------------------------------
/** Guarda el orden de unos rangos de MI tier list: claves en orden, por rango. */
function guardarOrden(porRango) {
  const yo = usuarioActual();
  if (!yo) return;
  const orden = { ...(datos.usuario(yo.id)?.tiers_orden ?? {}) };
  for (const claves of Object.values(porRango)) claves.forEach((k, i) => { orden[k] = i; });
  datos.actualizarUsuario(yo.id, { tiers_orden: orden }, aviso, 'No se ha podido guardar el orden. Se ha deshecho el cambio.');
}

let arrastre = null;
document.addEventListener('pointerdown', (e) => {
  const it = ordenando && e.target.closest?.('.tiers.ordenando .tier-item[data-orden]');
  if (!it || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault();
  const r = it.getBoundingClientRect();
  arrastre = { it, caja: it.parentElement, dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, movido: false };
  it.classList.add('arrastrando');
  try { it.setPointerCapture(e.pointerId); } catch { /* nada */ }
  try { navigator.vibrate?.(10); } catch { /* nada */ }
});
document.addEventListener('pointermove', (e) => {
  if (!arrastre || e.pointerId !== arrastre.id) return;
  const { it, caja } = arrastre;
  // ¿Sobre qué hermano está el dedo? (solo dentro de su rango)
  const hermanos = [...caja.querySelectorAll(':scope > .tier-item')].filter((x) => x !== it);
  let destino = null;
  let antes = true;
  for (const h of hermanos) {
    const r = h.getBoundingClientRect();
    if (e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6 && e.clientX >= r.left - 6 && e.clientX <= r.right + 6) {
      destino = h;
      antes = e.clientX < r.left + r.width / 2;
      break;
    }
  }
  if (destino) {
    const ya = antes ? destino.previousElementSibling === it : destino.nextElementSibling === it;
    if (!ya) { if (antes) destino.before(it); else destino.after(it); arrastre.movido = true; }
  }
  // La portada sigue al dedo (desde donde está ahora en la fila).
  it.style.transform = '';
  const r = it.getBoundingClientRect();
  it.style.transform = `translate(${e.clientX - r.left - arrastre.dx}px, ${e.clientY - r.top - arrastre.dy}px)`;
});
const soltarArrastre = (e) => {
  if (!arrastre || (e && e.pointerId !== arrastre.id)) return;
  const { it, caja, movido } = arrastre;
  arrastre = null;
  it.classList.remove('arrastrando');
  it.style.transform = '';
  if (movido) guardarOrden({ [caja.dataset.rango]: [...caja.querySelectorAll(':scope > .tier-item[data-orden]')].map((x) => x.dataset.orden) });
};
document.addEventListener('pointerup', soltarArrastre);
document.addEventListener('pointercancel', soltarArrastre);

// ---- Ordenar por… (con confirmación) ------------------------------------------------
const CRITERIOS = [
  ['nota', 'Nota', 'De más a menos'],
  ['nombre', 'Nombre', 'De la A a la Z'],
  ['salida', 'Fecha de salida', 'Del más antiguo al más nuevo'],
  ['jugado', 'Cuándo lo jugué', 'Lo más reciente primero'],
  ['horas', 'Horas jugadas', 'De más a menos'],
];

/** Cuándo jugué algo: completado (actividad), si no mi valoración, si no mi última partida. */
function cuandoJugado(x, uid) {
  const ids = x.esColeccion ? datos.juegosDeColeccion(x.clave.slice(2)).map((g) => datos.canonico(g)) : [datos.canonico(x.v?.juego_id)];
  const acts = datos.actividadAnual(uid).filas;
  const completado = acts.filter((a) => a.usuario_id === uid || !a.usuario_id).filter((a) => a.tipo === 'completo'
    && (x.esColeccion ? a.coleccion_id === x.clave.slice(2) || ids.includes(datos.canonico(a.juego_id)) : ids.includes(datos.canonico(a.juego_id))))
    .map((a) => new Date(a.creado_en).getTime());
  if (completado.length) return Math.max(...completado);
  const val = x.v ? new Date(x.v.creado_en || x.v.actualizado_en || 0).getTime() : 0;
  if (val) return val;
  const partidas = datos.bibliotecaDe(uid).filter((f) => ids.includes(datos.canonico(datos.igdbDeBiblioteca(f)))).map((f) => new Date(f.ultima_vez || 0).getTime());
  return partidas.length ? Math.max(...partidas) : 0;
}
function anioDe(x) {
  if (!x.esColeccion) return x.juego.anio ?? 9999;
  const anios = datos.juegosDeColeccion(x.clave.slice(2)).map((g) => datos.juegoConocido(g)?.anio).filter(Boolean);
  return anios.length ? Math.min(...anios) : 9999;
}
function ordenarItems(items, criterio, uid) {
  const nombre = (a, b) => a.juego.nombre.localeCompare(b.juego.nombre, 'es');
  const f = {
    nota: (a, b) => (b.nota ?? -1) - (a.nota ?? -1) || nombre(a, b),
    nombre,
    salida: (a, b) => anioDe(a) - anioDe(b) || nombre(a, b),
    jugado: (a, b) => cuandoJugado(b, uid) - cuandoJugado(a, uid) || nombre(a, b),
    horas: (a, b) => (b.horas ?? 0) - (a.horas ?? 0) || nombre(a, b),
  }[criterio];
  return [...items].sort(f);
}

function abrirOrdenarPor() {
  const yo = usuarioActual();
  if (!yo) return;
  datos.actividadAnual(yo.id); // para "Cuándo lo jugué" (se pide si aún no está)
  const t = datosTiers(`u:${yo.id}`);
  const conJuegos = LETRAS.filter((l) => t.filas[l].length);
  let criterio = 'nota';
  let alcance = 'todos';
  abrirHoja({
    titulo: 'Ordenar por…',
    html: `
      <div class="ordenar-por" data-ref="caja">
        <div class="ordenar-criterios" role="radiogroup" aria-label="Criterio">
          ${CRITERIOS.map(([id, n, d]) => `
            <label class="ordenar-opcion"><input type="radio" name="ord-criterio" value="${id}"${id === criterio ? ' checked' : ''}><span><strong>${n}</strong><small>${d}</small></span></label>`).join('')}
        </div>
        <label class="campo-titulo" for="ord-alcance">Dónde</label>
        <select id="ord-alcance" class="psn-input" data-ref="alcance">
          <option value="todos">Todos los rangos</option>
          ${conJuegos.map((l) => `<option value="${l}">Solo el rango ${l}</option>`).join('')}
        </select>
        <div data-ref="paso">
          <button type="button" class="boton-principal" data-ref="ordenar">Ordenar</button>
        </div>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const $ = (r) => cuerpo.querySelector(`[data-ref="${r}"]`);
      cuerpo.addEventListener('change', (e) => {
        if (e.target.name === 'ord-criterio') criterio = e.target.value;
        if (e.target === $('alcance')) alcance = e.target.value;
        $('paso').innerHTML = '<button type="button" class="boton-principal" data-ref="ordenar">Ordenar</button>';
      });
      cuerpo.addEventListener('click', (e) => {
        if (e.target.closest('[data-ref="ordenar"]')) {
          $('paso').innerHTML = `
            <div class="psn-confirmar" role="group" aria-label="Confirmar">
              <p>Esto sustituye tu orden manual en ${alcance === 'todos' ? 'todos los rangos' : `el rango ${alcance}`}. Después puedes seguir retocándolo a mano.</p>
              <div class="psn-confirmar-botones">
                <button type="button" class="boton-secundario neutro" data-ref="cancelar">Cancelar</button>
                <button type="button" class="boton-principal" data-ref="confirmar">Sí, ordenar</button>
              </div>
            </div>`;
          return;
        }
        if (e.target.closest('[data-ref="cancelar"]')) { $('paso').innerHTML = '<button type="button" class="boton-principal" data-ref="ordenar">Ordenar</button>'; return; }
        if (e.target.closest('[data-ref="confirmar"]')) {
          const fresco = datosTiers(`u:${yo.id}`);
          const rangos = alcance === 'todos' ? conJuegos : [alcance];
          const porRango = Object.fromEntries(rangos.map((l) => [l, ordenarItems(fresco.filas[l], criterio, yo.id).map((x) => x.clave)]));
          guardarOrden(porRango);
          cerrar();
          aviso(`Ordenado por ${CRITERIOS.find((c) => c[0] === criterio)[1].toLowerCase()}`);
        }
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Estadísticas (de alguien o del grupo): resumen compacto, revelaciones, ADN de jugador
// (radar), géneros favoritos, temas / modos / perspectiva (anillos), mi año (mapa de calor)
// y plataformas y horas. Con pocos datos, menos secciones (nunca gráficos vacíos).
// Los gráficos: js/graficos.js; los datos: js/clasificacion.js.
// ---------------------------------------------------------------------------
// Lo elegido en los selectores se recuerda mientras la app está abierta.
let modoGeneros = 'juegos';
let superpuesta = 'grupo';
const MODOS_GENEROS = [['juegos', 'Por juegos'], ['horas', 'Por horas'], ['nota', 'Por nota']];
const ANILLOS = [['temas', 'Temas'], ['modos', 'Modos de juego'], ['perspectivas', 'Perspectiva']];
const MIN_ANILLO = 5; // grupo: veces jugado
const MIN_JUEGOS = 5; // alguien: juegos jugados con ese dato

const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const deN = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
/** 12 345 (espacio fino de miles: no se confunde con el punto de las notas). */

export function htmlEstadisticas(id) {
  const u = datos.usuario(id);
  if (!u) return '';
  const tu = id === usuarioActual()?.id;
  const s = metricas.estadisticas(id);
  const bib = metricas.biblioteca(id);
  const t = metricas.tiempo(id);
  const r = clas.radar();
  const serie = r.series.get(id);
  const rev = clas.revelaciones(id, tu);
  const gen = clas.dimension(id, 'generos');
  const anillos = ANILLOS.map(([dim, nombre]) => ({ dim, nombre, partes: clas.dimension(id, dim) }))
    .filter((a) => clas.cuantosCon(id, a.dim) >= MIN_JUEGOS && a.partes.length >= 2);
  const hayGeneros = clas.cuantosCon(id, 'generos') >= MIN_JUEGOS && gen.filter((g) => g.n).length >= 3;
  const poco = !serie && !hayGeneros && !rev.length;

  return `
    <div class="stats graf" data-uid="${esc(id)}">
      ${resumen(s, t, bib, u)}
      ${poco ? `
        <div class="caja-punteada stats-poco">
          ${icono('rankings', { tam: 18, color: 'var(--texto-2)' })}
          <span>${tu ? 'Valora unos cuantos juegos más y aquí saldrá tu ADN de jugador: tus géneros, temas y manías.' : `Cuando ${esc(u.nombre)} valore unos cuantos juegos más, aquí saldrá su ADN de jugador.`}</span>
        </div>` : ''}
      ${rev.length ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">${tu ? 'Lo que dicen tus datos' : 'Lo que dicen sus datos'}</h2>
          <div class="revelaciones" data-scroll="revelaciones">${rev.map((x) => revelacion(x, id)).join('')}</div>
        </section>` : ''}
      ${serie ? seccionRadar(id, serie, r, tu ? 'Tu ADN de jugador' : `ADN de jugador de ${esc(u.nombre)}`) : ''}
      ${hayGeneros ? `
        <section class="stats-seccion">
          <div class="stats-cab">
            <h2 class="stats-titulo">Géneros favoritos</h2>
            ${selectorGeneros()}
          </div>
          <div data-ref="generos-lista">${listaGeneros(id, modoGeneros)}</div>
        </section>` : ''}
      ${anillos.length ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">${tu ? 'Cómo juegas' : 'Cómo juega'}</h2>
          <div class="anillos">${anillos.map((a) => `
            <div class="anillo-bloque">
              <h3 class="anillo-titulo">${a.nombre}</h3>
              ${grafico.anillo({ partes: a.partes, dim: a.dim, uid: id, titulo: a.nombre })}
            </div>`).join('')}
          </div>
        </section>` : ''}
      ${miAnio(id, tu)}
      ${plataformasYHoras(u, s, bib, t)}
    </div>`;
}

/** Las del grupo (Rankings → Estadísticas → Grupo). */
export function htmlEstadisticasGrupo() {
  const g = clas.estadisticasGrupo();
  const r = clas.radar();
  const serie = r.series.get('grupo');
  const gen = clas.dimensionGrupo('generos');
  const anillos = ANILLOS.map(([dim, nombre]) => ({ dim, nombre, partes: clas.dimensionGrupo(dim) }))
    .filter((a) => a.partes.reduce((x, p) => x + p.n, 0) >= MIN_ANILLO && a.partes.length >= 2);
  const une = g.une;
  const curiosidades = [
    g.olvidado ? {
      titulo: 'El género que nadie toca', dato: g.olvidado.tag, dim: 'generos', tag: g.olvidado.tag, largo: true,
      frase: g.olvidado.n ? `Solo ${deN(g.olvidado.n, 'juego', 'juegos')} en todo el grupo.` : 'Nadie del grupo ha jugado nunca a uno.',
    } : null,
    g.decada ? {
      titulo: 'La década del grupo', dato: clas.nombreDecada(g.decada.d).replace('los ', ''), dim: 'decadas', tag: String(g.decada.d),
      frase: `${deN(g.decada.n, 'juego', 'juegos')} de ${clas.nombreDecada(g.decada.d)} jugados en el grupo${g.decada.media != null ? `, con un ${fmt1(g.decada.media)} de media` : ''}.`,
    } : null,
  ].filter(Boolean);
  return `
    <div class="stats graf" data-uid="grupo">
      <section class="stats-resumen">
        <div class="resumen-cifras">
          ${cifra(g.distintos, 'Juegos distintos')}
          ${cifra(g.notas, 'Notas')}
          ${cifra(g.media != null ? `${formatearNota(g.media)}${chipLetra(notaALetra(g.media), 'sm')}` : '—', 'Nota media', true)}
          ${cifra(g.horas ? `${miles(g.horas)}<small> h</small>` : '—', 'Jugadas', true)}
        </div>
      </section>
      ${une ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">El juego que más une</h2>
          <a class="juego-une" href="${metricas.rutaDe(une.juego)}">
            ${portada(une.juego, { clase: 'portada-lista' })}
            <span class="juego-une-texto">
              <strong>${esc(une.juego.nombre)}</strong>
              <span>${deN(une.buenas.length, 'persona le ha', 'personas le han')} puesto buena nota · ${formatearNota(une.media)} de media</span>
              <span class="juego-une-caras">${une.buenas.map((uid) => datos.usuario(uid)).filter(Boolean).map((x) => avatar(x, 24)).join('')}</span>
            </span>
          </a>
        </section>` : ''}
      ${serie ? seccionRadar('grupo', serie, r, 'El ADN del grupo') : ''}
      ${gen.filter((x) => x.n).length >= 3 ? `
        <section class="stats-seccion">
          <div class="stats-cab">
            <h2 class="stats-titulo">Géneros del grupo</h2>
            ${selectorGeneros()}
          </div>
          <div data-ref="generos-lista">${listaGeneros('grupo', modoGeneros)}</div>
        </section>` : ''}
      ${g.especialistas.length ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">Los especialistas</h2>
          <span class="stats-nota">A quién le tira más cada género: el que más parte de lo suyo le dedica</span>
          <div class="especialistas">
            ${g.especialistas.map((e) => { const x = datos.usuario(e.uid); return x ? `
              <button type="button" class="especialista" data-graf="generos" data-tag="${esc(e.tag)}" data-uid="${esc(e.uid)}">
                <span class="especialista-genero">${esc(e.tag)}</span>
                ${avatar(x, 26)}
                <span class="especialista-nombre">${esc(x.nombre)}</span>
                <span class="especialista-dato">${Math.round(e.parte * 100)}% · ${deN(e.n, 'juego', 'juegos')}</span>
              </button>` : ''; }).join('')}
          </div>
        </section>` : ''}
      ${curiosidades.length ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">Curiosidades</h2>
          <div class="revelaciones">${curiosidades.map((x) => revelacion(x, 'grupo')).join('')}</div>
        </section>` : ''}
      ${anillos.length ? `
        <section class="stats-seccion">
          <h2 class="stats-titulo">Cómo juega el grupo</h2>
          <div class="anillos">${anillos.map((a) => `
            <div class="anillo-bloque">
              <h3 class="anillo-titulo">${a.nombre}</h3>
              ${grafico.anillo({ partes: a.partes, dim: a.dim, uid: 'grupo', titulo: a.nombre })}
            </div>`).join('')}
          </div>
        </section>` : ''}
    </div>`;
}

// ----- Piezas -----------------------------------------------------------------
function cifra(valor, etiqueta, html = false) {
  return `
    <div class="resumen-cifra">
      <span class="resumen-num${valor === null || valor === '—' ? ' apagado' : ''}">${valor === null ? '—' : html ? valor : esc(String(valor))}</span>
      <span class="resumen-etq">${etiqueta}</span>
    </div>`;
}

/** Lo de siempre, compacto: cifras, una línea de estados y el reparto por tier en una tira. */
function resumen(s, t, bib, u) {
  const totalTier = Object.values(s.reparto).reduce((a, b) => a + b, 0);
  const vs = s.vsGrupo === null ? '' : `${s.vsGrupo > 0 ? '+' : s.vsGrupo < 0 ? '−' : '±'}${fmt1(Math.abs(s.vsGrupo))} vs grupo`;
  const estados = [
    [s.jugando, 'jugando'], [s.abandonados, s.abandonados === 1 ? 'abandonado' : 'abandonados'], [s.pendientes, s.pendientes === 1 ? 'pendiente' : 'pendientes'],
    ...(s.recomendacion.total ? [[`${s.recomendacion.si}/${s.recomendacion.total}`, 'recomendados']] : []),
    ...(bib.total ? [[bib.total, 'en biblioteca']] : []),
  ];
  return `
    <section class="stats-resumen">
      <div class="resumen-cifras">
        ${cifra(s.jugados, 'Jugados')}
        ${cifra(s.completados, 'Completados')}
        ${cifra(s.media !== null ? `${formatearNota(s.media)}${chipLetra(s.letra, 'sm')}` : '—', vs ? `Nota media · ${vs}` : 'Nota media', true)}
        ${cifra(t.total ? `${miles(t.total)}<small> h</small>` : (datos.cuentasDe(u.id).length ? '0' : '—'), t.estimadas ? `Jugadas · ≈${miles(t.estimadas)} h estimadas` : 'Jugadas', true)}
      </div>
      <p class="resumen-estados">${estados.map(([n, e]) => `<span><b>${n}</b> ${e}</span>`).join('')}</p>
      ${totalTier ? `
        <div class="resumen-tiers" role="img" aria-label="Reparto por tier">
          ${LETRAS.filter((l) => s.reparto[l]).map((l) => `
            <span class="resumen-tier graf-anim" data-tier="${l}" style="flex:${s.reparto[l]}"><b>${l}</b><small>${s.reparto[l]}</small></span>`).join('')}
        </div>` : ''}
    </section>`;
}

function revelacion(x, uid) {
  return `
    <button type="button" class="revelacion graf-anim" data-graf="${esc(x.dim)}" data-tag="${esc(x.etiqueta ?? x.tag)}" data-uid="${esc(uid)}">
      <span class="revelacion-titulo">${esc(x.titulo)}</span>
      <span class="revelacion-dato${x.largo ? ' largo' : ''}">${esc(x.dato)}</span>
      <span class="revelacion-frase">${esc(x.frase)}</span>
    </button>`;
}

/** Radar con el selector "Comparar con" (la media del grupo o cualquiera con datos). */
function seccionRadar(id, serie, r, titulo) {
  const otras = [...r.series.values()].filter((x) => x.id !== id);
  let activa = superpuesta;
  if (activa === id || (activa !== 'nadie' && !r.series.has(activa))) activa = id === 'grupo' ? (usuarioActual()?.id ?? 'nadie') : 'grupo';
  if (!r.series.has(activa)) activa = 'nadie';
  const nombreDe = (x) => (x.id === 'grupo' ? 'Grupo' : x.nombre);
  return `
    <section class="stats-seccion">
      <h2 class="stats-titulo">${titulo}</h2>
      <span class="stats-nota">Reparto de ${id === 'grupo' ? 'lo que juega el grupo' : 'lo jugado'} entre los géneros más jugados del grupo. Toca uno para ver sus juegos.</span>
      ${otras.length ? `
        <div class="radar-selector" role="tablist" aria-label="Comparar con" data-scroll="radar">
          <span class="radar-selector-etq">Comparar con</span>
          ${[{ id: 'nadie', nombre: 'Nadie' }, ...otras].map((x) => `
            <button type="button" role="tab" class="chip-radar${x.id === activa ? ' activo' : ''}" aria-selected="${x.id === activa}" data-radar="${esc(x.id)}">${esc(x.id === 'nadie' ? 'Nadie' : nombreDe(x))}</button>`).join('')}
        </div>` : ''}
      <div class="radar-caja">
        ${grafico.radar({ ejes: r.ejes, base: serie, otras, activa, max: r.max, uid: id })}
      </div>
      <div class="radar-leyenda">
        <span><i class="radar-muestra base"></i>${esc(id === 'grupo' ? 'Media del grupo' : serie.nombre)}</span>
        ${otras.map((x) => `<span class="radar-leyenda-otra" data-serie-leyenda="${esc(x.id)}"${x.id === activa ? '' : ' hidden'}><i class="radar-muestra otra"></i>${esc(x.id === 'grupo' ? 'Media del grupo' : x.nombre)}</span>`).join('')}
      </div>
    </section>`;
}

const selectorGeneros = () => `
  <div class="segmentado segmentado-peq" role="tablist" aria-label="Ordenar géneros">
    ${MODOS_GENEROS.map(([m, n]) => `<button type="button" role="tab" data-modo-generos="${m}" class="${modoGeneros === m ? 'activo' : ''}" aria-selected="${modoGeneros === m}">${n}</button>`).join('')}
  </div>`;

/** Las barras de géneros en un modo (juegos, horas o nota), con las portadas que más pesan. */
function listaGeneros(uid, modo) {
  const grupo = uid === 'grupo';
  const gen = grupo ? clas.dimensionGrupo('generos') : clas.dimension(uid, 'generos');
  const juegosDe = (lista, orden) => [...new Map([...lista].sort(orden).map((x) => [x.clave, x.juego])).values()];
  let filas;
  if (modo === 'horas') {
    filas = gen.filter((g) => g.horas > 0).sort((a, b) => b.horas - a.horas).slice(0, 8)
      .map((g) => ({ tag: g.tag, valor: g.horas, texto: `${g.horas} h`, juegos: juegosDe(g.conHoras, (a, b) => b.horas - a.horas) }));
  } else if (modo === 'nota') {
    filas = gen.filter((g) => g.media != null).sort((a, b) => b.media - a.media || b.notas.length - a.notas.length).slice(0, 8)
      .map((g) => ({ tag: g.tag, valor: g.media, texto: formatearNota(g.media), juegos: juegosDe(g.conNota, (a, b) => b.nota - a.nota) }));
  } else {
    filas = gen.filter((g) => g.n > 0).slice(0, 8)
      .map((g) => ({ tag: g.tag, valor: g.n, texto: String(g.n), juegos: juegosDe(g.items, (a, b) => (b.nota ?? -1) - (a.nota ?? -1) || b.horas - a.horas) }));
  }
  const nota = modo === 'horas' ? (grupo ? 'Horas de todos en juegos de cada género' : 'Horas en juegos de cada género (un juego cuenta en todos los suyos)')
    : modo === 'nota' ? (grupo ? 'Nota media de todas las notas (con 3 o más)' : 'Nota media (con 2 notas o más; solo las que cuentan en la tier list)')
      : (grupo ? 'Veces que alguien del grupo ha jugado uno' : 'Juegos valorados de cada género (sin pendientes)');
  if (!filas.length) return `<p class="stats-vacio">${modo === 'horas' ? 'Todavía no hay horas.' : 'Todavía no hay notas suficientes.'}</p>`;
  return `<span class="stats-nota">${nota}</span>${grafico.barras({ filas, dim: 'generos', uid, escala: modo === 'nota' ? 10 : null })}`;
}

/**
 * La actividad del año de alguien, separada en lo de cada día y las "puestas al día": ráfagas en
 * las que se apuntan muchos juegos de golpe (al estrenar la cuenta, al pasar el historial): 6 o
 * más en 10 minutos. Esas no cuentan para el color ni para el resumen; el día sale marcado aparte.
 */
const RAFAGA_N = 6, RAFAGA_MS = 10 * 60000;
function actividadPorDia(uid) {
  const { estado, filas } = datos.actividadAnual(uid);
  const t = filas.map((a) => ({ a, ms: new Date(a.creado_en).getTime() })).sort((x, y) => x.ms - y.ms);
  const golpe = new Set();
  for (let i = 0, j = 0; i < t.length; i++) {
    while (t[i].ms - t[j].ms > RAFAGA_MS) j++;
    if (i - j + 1 >= RAFAGA_N) for (let k = j; k <= i; k++) golpe.add(t[k].a);
  }
  const dias = new Map(); // clave → { normal: [], golpe: [] }
  for (const { a } of t) {
    const k = grafico.claveDia(new Date(a.creado_en));
    if (!dias.has(k)) dias.set(k, { normal: [], golpe: [] });
    dias.get(k)[golpe.has(a) ? 'golpe' : 'normal'].push(a);
  }
  return { estado, dias, nGolpe: golpe.size };
}

/** Mapa de calor de la actividad del último año: se pinta ya con lo que haya (se pide al verla). */
function miAnio(id, tu) {
  const { estado, dias, nGolpe } = actividadPorDia(id);
  const porDia = new Map();
  const cargas = new Set();
  let valorados = 0, completados = 0;
  for (const [k, d] of dias) {
    if (d.normal.length) porDia.set(k, d.normal.length);
    if (d.golpe.length) cargas.add(k);
    valorados += d.normal.filter((a) => a.tipo === 'valoro').length;
    completados += d.normal.filter((a) => a.tipo === 'completo').length;
  }
  // Racha más larga de días seguidos con algo.
  const claves = [...dias.keys()].sort();
  let racha = 1, mejor = claves.length ? 1 : 0;
  for (let i = 1; i < claves.length; i++) {
    const seguido = Math.round((new Date(claves[i]) - new Date(claves[i - 1])) / 86400000) === 1;
    racha = seguido ? racha + 1 : 1;
    mejor = Math.max(mejor, racha);
  }
  const aviso = estado === 'cargando'
    ? `<p class="calor-estado">Cargando el año entero…</p>`
    : estado === 'error'
      ? `<p class="calor-estado">No se ha podido cargar todo el año${dias.size ? '; esto es lo más reciente' : ''}. <button type="button" class="enlace-discreto" data-calor-reintentar="${esc(id)}">Reintentar</button></p>`
      : !dias.size ? `<p class="calor-estado">Aún no hay actividad este año: cada juego que ${tu ? 'valores, empieces o completes' : 'valore, empiece o complete'} aparecerá aquí.</p>` : '';
  return `
    <section class="stats-seccion">
      <h2 class="stats-titulo">${tu ? 'Tu año en juegos' : 'Su año en juegos'}</h2>
      ${dias.size ? `
        <p class="resumen-estados">
          <span><b>${dias.size}</b> ${dias.size === 1 ? 'día' : 'días'} con actividad</span>
          <span><b>${completados}</b> completados</span>
          <span><b>${valorados}</b> valorados</span>
          ${mejor > 1 ? `<span>racha de <b>${mejor}</b> días</span>` : ''}
          ${nGolpe ? `<span><b>${nGolpe}</b> de golpe (puesta al día)</span>` : ''}
        </p>` : ''}
      <div class="calor-scroll" data-calor-uid="${esc(id)}">${grafico.mapaCalor(porDia, { cargas })}</div>
      <div class="calor-leyenda">
        ${cargas.size ? '<span class="calor-leyenda-carga"><i class="carga"></i>Puesta al día</span>' : ''}
        <span>Menos</span>${[0, 1, 2, 3, 4].map((n) => `<i class="nv${n}"></i>`).join('')}<span>Más</span>
      </div>
      ${aviso}
    </section>`;
}

/** Nombre corto y claro de una plataforma para las etiquetas de las barras ("Meta Quest 2" → "Quest 2"). */
const platCorta = (n) => String(n ?? '').replace(/^Meta\s+/i, '').replace(/^PlayStation\s*/i, 'PS').replace(/^Nintendo\s+/i, '');

/** Plataformas (según lo valorado) y horas (las totales, los más jugados): compacto. */
function plataformasYHoras(u, s, bib, t) {
  // Los más jugados, con las colecciones como un juego (regla única).
  const top = clas.itemsUsuario(u.id).filter((x) => x.horas > 0).sort((a, b) => b.horas - a.horas).slice(0, 5)
    .map((x) => ({ nombre: x.juego.nombre, horas: x.horas, estimadas: x.coleccionId ? metricas.horasColeccion(u.id, x.coleccionId).estimadas : metricas.estimadasDe(u.id, x.ids[0]) }));
  const maxPlat = Math.max(1, ...s.plataformas.map((x) => x.n));
  const maxH = Math.max(1, ...top.map((x) => x.horas));
  if (!s.plataformas.length && !top.length) return '';
  return `
    <section class="stats-seccion">
      <h2 class="stats-titulo">Plataformas y horas</h2>
      <div class="stats-dos">
        ${s.plataformas.length ? `
          <div>
            <span class="stats-nota">Plataformas de lo valorado</span>
            <div class="barras-plataforma">${s.plataformas.slice(0, 6).map((x) => `
              <div class="barra-plataforma">
                <span class="barra-plataforma-nombre" title="${esc(x.nombre)}">${esc(platCorta(x.nombre))}</span>
                <div class="barra-plataforma-pista"><div class="graf-anim" style="width:${Math.max(4, Math.round((x.n / maxPlat) * 100))}%"></div></div>
                <span class="barra-plataforma-n">${x.n}</span>
              </div>`).join('')}</div>
          </div>` : ''}
        ${top.length ? `
          <div>
            <span class="stats-nota">Los más jugados</span>
            <div class="barras-plataforma barras-horas">${top.map((x) => `
              <div class="barra-plataforma">
                <span class="barra-plataforma-nombre largo" title="${esc(x.nombre)}">${esc(x.nombre)}</span>
                <div class="barra-plataforma-pista"><div class="graf-anim" style="width:${Math.max(4, Math.round((x.horas / maxH) * 100))}%"></div></div>
                <span class="barra-plataforma-n ancho">${esc(metricas.textoAprox(x.horas, x.estimadas))}</span>
              </div>`).join('')}</div>
          </div>` : ''}
      </div>
      ${bib.plataformas.length > 1 ? `<p class="resumen-estados">${bib.plataformas.map((x) => `<span><b>${x.juegos}</b> en ${esc(x.nombre)}${x.horas ? ` · ${x.horas} h` : ''}</span>`).join('')}</p>` : ''}
    </section>`;
}

// ----- Interacción ---------------------------------------------------------------
/**
 * Clics de las estadísticas (lo llaman el perfil y Rankings desde su propio oyente):
 * selector del radar, modo de los géneros, tocar un trozo de un gráfico o un día.
 * Devuelve true si era suyo.
 */
export function clicEstadisticas(e) {
  const caja = e.target.closest('.stats');
  if (!caja) return false;
  const chip = e.target.closest('[data-radar]');
  if (chip) {
    superpuesta = chip.dataset.radar;
    for (const b of caja.querySelectorAll('[data-radar]')) { const on = b === chip; b.classList.toggle('activo', on); b.setAttribute('aria-selected', String(on)); }
    for (const g of caja.querySelectorAll('.radar-otra')) g.style.display = g.dataset.serie === superpuesta ? '' : 'none';
    for (const l of caja.querySelectorAll('[data-serie-leyenda]')) l.hidden = l.dataset.serieLeyenda !== superpuesta;
    return true;
  }
  const modo = e.target.closest('[data-modo-generos]');
  if (modo) {
    modoGeneros = modo.dataset.modoGeneros;
    for (const b of caja.querySelectorAll('[data-modo-generos]')) { const on = b === modo; b.classList.toggle('activo', on); b.setAttribute('aria-selected', String(on)); }
    const lista = caja.querySelector('[data-ref="generos-lista"]');
    if (lista) lista.innerHTML = listaGeneros(caja.dataset.uid, modoGeneros);
    return true;
  }
  const re = e.target.closest('[data-calor-reintentar]');
  if (re) { datos.reintentarActividadAnual(re.dataset.calorReintentar); return true; }
  const dia = e.target.closest('[data-dia]');
  if (dia) { abrirDia(dia.closest('[data-calor-uid]')?.dataset.calorUid ?? caja.dataset.uid, dia.dataset.dia); return true; }
  const trozo = e.target.closest('[data-graf]');
  if (trozo) { abrirJuegos(trozo.dataset.uid || caja.dataset.uid, trozo.dataset.graf, trozo.dataset.tag); return true; }
  return false;
}

const NOMBRE_DIM = { generos: 'Género', temas: 'Tema', modos: 'Modo de juego', perspectivas: 'Perspectiva', estudios: 'Estudio', franquicias: 'Saga', decadas: 'Década' };

function abrirJuegos(uid, dim, tag) {
  const lista = clas.juegosDe(uid, dim, tag);
  const quien = uid === 'grupo' ? 'Grupo' : datos.usuario(uid)?.nombre ?? '';
  const titulo = dim === 'decadas' ? `Juegos de ${clas.nombreDecada(Number(tag))}` : tag;
  abrirHoja({
    antetitulo: `${NOMBRE_DIM[dim] ?? ''} · ${quien}`,
    titulo,
    html: lista.length ? `
      <p class="hoja-texto">${uid === 'grupo' ? deN(lista.length, 'juego', 'juegos')
        : [deN(lista.filter((x) => x.jugado).length, 'valorado', 'valorados'), lista.some((x) => !x.jugado) ? `${lista.filter((x) => !x.jugado).length} más solo con horas` : ''].filter(Boolean).join(' · ')}</p>
      <div class="graf-juegos">
        ${lista.slice(0, 60).map((x) => {
          const sub = uid === 'grupo'
            ? [deN(x.n, 'persona', 'personas'), x.media != null ? `${formatearNota(x.media)} de media` : '', x.horas ? `${x.horas} h` : ''].filter(Boolean).join(' · ')
            : [x.nota != null ? formatearNota(x.nota) : (x.jugado ? 'Sin nota' : 'Sin valorar'), x.horas ? metricas.textoHoras(x.horas) : ''].filter(Boolean).join(' · ');
          const nota = uid === 'grupo' ? x.media : x.nota;
          return `
            <a class="graf-juego" href="${metricas.rutaDe(x.juego)}">
              ${portada(x.juego, { clase: 'portada-hoja' })}
              <span class="graf-juego-texto"><strong>${esc(x.juego.nombre)}</strong><small>${esc(sub)}</small></span>
              ${nota != null ? chipLetra(notaALetra(nota), 'sm') : ''}
            </a>`;
        }).join('')}
      </div>` : '<p class="hoja-texto">No hay juegos.</p>',
  });
}

const TEXTO_TIPO = { valoro: 'Valoró', completo: 'Completó', empezo: 'Empezó', abandono: 'Abandonó', pendiente: 'Apuntó como pendiente', rejuega: 'Volvió a jugar' };
const FECHA_DIA = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Lo de un día: cada juego una vez (con todo lo que pasó) y la puesta al día aparte. */
function resumenDia(uid, dia) {
  const d = actividadPorDia(uid).dias.get(dia) ?? { normal: [], golpe: [] };
  const juntar = (filas) => {
    const m = new Map();
    for (const f of filas) {
      const j = f.coleccion_id ? datos.comoJuego(datos.coleccion(f.coleccion_id)) : datos.juegoConocido(f.juego_id);
      if (!j) continue;
      const k = f.coleccion_id ? `c:${f.coleccion_id}` : `j:${datos.canonico(f.juego_id)}`;
      if (!m.has(k)) m.set(k, { juego: j, tipos: [] });
      const tipo = TEXTO_TIPO[f.tipo] ?? f.tipo;
      if (!m.get(k).tipos.includes(tipo)) m.get(k).tipos.push(tipo);
    }
    return [...m.values()];
  };
  return { normal: juntar(d.normal), golpe: juntar(d.golpe) };
}
const fechaDia = (dia) => { const [a, m, d] = dia.split('-').map(Number); return new Date(a, m - 1, d); };

function abrirDia(uid, dia) {
  const { normal, golpe } = resumenDia(uid, dia);
  if (!normal.length && !golpe.length) return;
  quitarTip();
  const lista = (xs) => `
    <div class="graf-juegos">
      ${xs.map((x) => `
        <a class="graf-juego" href="${metricas.rutaDe(x.juego)}">
          ${portada(x.juego, { clase: 'portada-hoja' })}
          <span class="graf-juego-texto"><strong>${esc(x.juego.nombre)}</strong><small>${esc(x.tipos.join(' · '))}</small></span>
        </a>`).join('')}
    </div>`;
  abrirHoja({
    antetitulo: datos.usuario(uid)?.nombre ?? '',
    titulo: FECHA_DIA.format(fechaDia(dia)),
    html: `
      ${normal.length ? lista(normal) : ''}
      ${golpe.length ? `
        <p class="calor-hoja-carga"><strong>Puesta al día · ${golpe.length} ${golpe.length === 1 ? 'juego' : 'juegos'} de golpe</strong>
        Apuntados en una ráfaga (el historial de antes): no cuentan para el color del mapa.</p>
        ${lista(golpe)}` : ''}`,
  });
}

/** Con ratón: al pasar por un día, qué se hizo (sin abrir nada). */
const FECHA_TIP = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" });
let tipCalor = null;
function tipDia(celda, uid) {
  const dia = celda.dataset.dia;
  const { normal, golpe } = resumenDia(uid, dia);
  tipCalor ??= Object.assign(document.createElement('div'), { className: 'calor-tip' });
  if (!tipCalor.isConnected) document.body.append(tipCalor);
  const lineas = normal.slice(0, 4).map((x) => `<li><b>${esc(x.juego.nombre)}</b> · ${esc(x.tipos.join(', ').toLowerCase())}</li>`);
  if (normal.length > 4) lineas.push(`<li class="calor-tip-mas">y ${normal.length - 4} más</li>`);
  if (golpe.length) lineas.push(`<li class="calor-tip-mas">Puesta al día: ${golpe.length} ${golpe.length === 1 ? 'juego' : 'juegos'} de golpe</li>`);
  tipCalor.innerHTML = `<strong>${esc(FECHA_TIP.format(fechaDia(dia)))}</strong>${lineas.length ? `<ul>${lineas.join('')}</ul>` : '<span>Sin actividad</span>'}`;
  tipCalor.hidden = false;
  const r = celda.getBoundingClientRect();
  const w = tipCalor.offsetWidth, h = tipCalor.offsetHeight;
  const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  const y = r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8;
  tipCalor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
function quitarTip() { if (tipCalor) tipCalor.hidden = true; }

/**
 * Animar los gráficos cuando entran en pantalla (y no antes) y llevar el mapa de calor a
 * hoy. Se llama después de pintar.
 */
let observador = null;
export function observarGraficos(raiz) {
  for (const c of raiz.querySelectorAll('.calor-scroll')) {
    if (!c.__alFinal) { c.scrollLeft = c.scrollWidth; c.__alFinal = true; }
    if (!c.__tip) {
      c.__tip = true;
      c.addEventListener('pointerover', (e) => {
        if (e.pointerType !== 'mouse') return;
        const celda = e.target.closest?.('[data-dia]');
        if (celda) tipDia(celda, c.dataset.calorUid); else quitarTip();
      });
      c.addEventListener('pointerleave', quitarTip);
      c.addEventListener('scroll', quitarTip, { passive: true });
    }
  }
  if (!('IntersectionObserver' in window)) return;
  observador ??= new IntersectionObserver((entradas) => {
    for (const en of entradas) {
      if (!en.isIntersecting) continue;
      en.target.removeAttribute('data-espera');
      en.target.__visto = true;
      observador.unobserve(en.target);
    }
  }, { rootMargin: '0px 0px -40px 0px' });
  for (const s of raiz.querySelectorAll('.stats .stats-seccion, .stats .stats-resumen')) {
    if (s.__visto || s.__observado) continue;
    s.__observado = true;
    s.setAttribute('data-espera', '');
    observador.observe(s);
  }
}

// ---------------------------------------------------------------------------
// Columna (la página suelta y la pestaña del perfil)
// ---------------------------------------------------------------------------
const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const FECHA_CORTA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

/** embebida: dentro del perfil (sin botón de volver ni "por {autor}"). */
export function htmlColumna(col, yo, { embebida = false } = {}) {
  const autor = datos.usuario(col.usuario_id);
  const legado = esLegado(col);
  const mia = col.usuario_id === yo?.id && !legado; // un difunto no publica
  const ents = datos.entradasPublicadas(col.id);
  const borradores = mia ? datos.borradoresDe(yo.id).filter((e) => e.columna_id === col.id) : [];
  const [primera, ...resto] = ents;
  const tarjeta = (e, grande = false) => {
    const t = temaDe(e);
    return `
      <a class="col-entrada${grande ? ' destacada' : ''}" href="#entrada/${esc(e.id)}">
        ${grande && e.portada ? `<img class="col-entrada-portada" src="${esc(e.portada)}" alt="" loading="lazy" decoding="async">` : t?.juego ? portada(t.juego, { clase: grande ? 'portada-col-grande' : 'portada-lista' }) : ''}
        <span class="col-entrada-texto">
          ${t ? `<small class="col-entrada-tema">${esc(t.nombre)}</small>` : ''}
          <strong>${esc(e.titulo || 'Sin título')}</strong>
          ${grande && e.subtitulo ? `<span class="col-entrada-sub">${esc(e.subtitulo)}</span>` : ''}
          <small>${esc((grande ? FECHA : FECHA_CORTA).format(new Date(e.publicada_en ?? e.actualizado_en)))} · ${esc(textoLectura(e.palabras))}</small>
          ${cuentasHtml('entrada', e.id)}
        </span>
      </a>`;
  };
  return `
    <section class="columna${embebida ? ' embebida' : ''}" style="${col.color ? `--col:${esc(col.color)}` : ''}">
      <header class="columna-portada">
        ${embebida ? '' : `<button type="button" class="boton-cuadrado columna-volver" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>`}
        ${logoColumna(col, embebida ? 72 : 96)}
        <h1 class="columna-nombre">${esc(nombreColumna(col))}</h1>
        ${legado ? `<p class="columna-legado">Antes «${esc(col.nombre)}». Su autor descansa en el <a href="#cementerio">cementerio</a> y ya no publicará nada más.</p>` : ''}
        <p class="columna-autor">${embebida ? '' : `por <a href="#perfil/${esc(col.usuario_id)}">${esc(autor?.nombre ?? '')}</a> · `}${ents.length} ${ents.length === 1 ? 'entrada' : 'entradas'}</p>
        ${mia ? '<a class="boton-principal enlace" href="#escribir/nueva">Escribir una entrada</a>' : ''}
      </header>
      ${borradores.length ? `
        <section class="columna-seccion">
          <h2 class="columna-seccion-titulo">Tus borradores</h2>
          ${borradores.map((e) => `<a class="col-borrador" href="#escribir/${esc(e.id)}"><strong>${esc(e.titulo || 'Sin título')}</strong><small>${esc(textoLectura(e.palabras))} · guardado ${esc(FECHA_CORTA.format(new Date(e.actualizado_en)))}</small></a>`).join('')}
        </section>` : ''}
      ${primera ? `
        <section class="columna-seccion">
          ${tarjeta(primera, true)}
          ${resto.length ? `<div class="columna-lista">${resto.map((e) => tarjeta(e)).join('')}</div>` : ''}
        </section>`
        : `<p class="columna-vacia">${mia ? 'Tu columna está esperando su primer texto.' : `${esc(autor?.nombre ?? 'Su autor')} todavía no ha publicado nada.`}</p>`}
    </section>`;
}
