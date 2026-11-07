// Pantallas 07a (Ranking del grupo) y 07b (Comparar).
//   #rankings
//   #rankings/comparar/{idA}/{idB}
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as metricas from '../metricas.js';
import { usuarioActual } from '../sesion.js';
import { formatearNota, notaALetra } from '../notas.js';
import { esc, avatar, avatarInsignia, portada, notaConLetra, estadoVacio } from '../ui.js';
import { reemplazarRuta } from '../navegacion.js';
import { abrirHoja } from '../hoja.js';

let orden = 'nota'; // se recuerda mientras la app está abierta
const MIN_COMUNES = 3;

export function render(el, { params }) {
  const modo = params[0] === 'comparar' ? 'comparar' : 'grupo';

  const pintar = () => {
    el.innerHTML = `
      <section class="rankings">
        <div class="rankings-cab">
          <h1 class="titulo-pantalla">Rankings</h1>
          <div class="segmentado" role="tablist" aria-label="Rankings">
            <button type="button" role="tab" data-modo="grupo" class="${modo === 'grupo' ? 'activo' : ''}" aria-selected="${modo === 'grupo'}">Ranking del grupo</button>
            <button type="button" role="tab" data-modo="comparar" class="${modo === 'comparar' ? 'activo' : ''}" aria-selected="${modo === 'comparar'}">Comparar</button>
          </div>
        </div>
        <div data-ref="contenido">${modo === 'grupo' ? grupo() : comparar(params)}</div>
      </section>`;
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-modo], [data-orden], [data-lado]');
    if (!b) return;
    if (b.dataset.modo && b.dataset.modo !== modo) {
      reemplazarRuta(b.dataset.modo === 'grupo' ? '#rankings' : '#rankings/comparar');
    } else if (b.dataset.orden && b.dataset.orden !== orden) {
      orden = b.dataset.orden;
      el.querySelector('[data-ref="contenido"]').innerHTML = grupo();
    } else if (b.dataset.lado) {
      elegirUsuario(b.dataset.lado, params);
    }
  });

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}

// ---------------------------------------------------------------------------
// Ranking del grupo
// ---------------------------------------------------------------------------
const VACIOS = {
  nota: 'Cuando al menos dos personas pongan nota a un mismo juego, aparecerá aquí.',
  recomendados: 'Cuando al menos dos personas digan si recomiendan un mismo juego, aparecerá aquí.',
  jugados: 'Todavía nadie ha empezado, completado ni abandonado ningún juego.',
  polemicos: 'Cuando al menos dos personas pongan nota a un mismo juego, aquí saldrán los que más dividen al grupo.',
  horas: 'Cuando alguien sincronice su biblioteca o apunte horas en un juego valorado, aparecerá aquí.',
  online: 'Aquí saldrán los juegos sin final (Fortnite, Rocket League...) en cuanto alguien les ponga nota.',
};
const PIES = {
  nota: 'Solo entran juegos con al menos 2 notas del grupo que cuenten en los rankings (cada uno lo elige al valorar). Con una sola, el juego sale en su ficha como «Solo lo ha valorado…».',
  polemicos: 'Solo entran juegos con al menos 2 notas del grupo, ordenados por lo mucho que se separan sus notas.',
  recomendados: 'Solo entran juegos en los que al menos 2 personas han dicho si lo recomiendan.',
  jugados: 'Cuenta a quien lo está jugando, lo ha completado o lo ha abandonado (no los pendientes).',
  horas: 'Horas de todo el grupo: las sincronizadas de cada plataforma y cuenta más las horas extra apuntadas a mano.',
  online: 'Juegos sin final (online, competitivos...) con todas sus notas. En Nota media y Más polémicos solo entran las notas que cada uno decide contar al valorar.',
};

function grupo() {
  const lista = metricas.ranking(orden);
  const chips = `
    <div class="chips" role="group" aria-label="Ordenar por">
      ${metricas.ORDENES.map((o) => `<button type="button" class="chip${o.id === orden ? ' activo' : ''}" aria-pressed="${o.id === orden}" data-orden="${o.id}">${o.nombre}</button>`).join('')}
    </div>`;
  if (!lista.length) {
    return `${chips}<p class="seccion-vacia rankings-vacio">${icono('rankings', { tam: 20, color: 'var(--texto-2)' })}<span>${VACIOS[orden]}</span></p>`;
  }
  return `
    ${chips}
    <ol class="ranking-lista" data-lista>
      ${lista.map((x, i) => filaRanking(x, i)).join('')}
    </ol>
    <p class="ranking-pie">${PIES[orden]}</p>`;
}

function filaRanking(x, i) {
  const j = x.juego;
  const opinan = x.vals
    .filter((v) => typeof v.recomendado === 'boolean' && datos.usuario(v.usuario_id))
    .sort((a, b) => Number(b.recomendado) - Number(a.recomendado));
  let extra = x.rec.total ? `${x.rec.si} de ${x.rec.total}` : '';
  if (orden === 'jugados') extra = `${x.jugadores} ${x.jugadores === 1 ? 'jugador' : 'jugadores'}`;
  if (orden === 'recomendados') extra = `${x.rec.si} de ${x.rec.total} · ${x.rec.porcentaje}%`;
  if (orden === 'horas') extra = `${metricas.textoHoras(x.horas)} entre todos`;
  if (orden === 'polemicos') extra = `${x.votos} notas · se separan ${x.desviacion.toFixed(1)}`;
  if (orden === 'online') extra = `${x.votos} ${x.votos === 1 ? 'nota' : 'notas'}${x.rec.total ? ` · ${x.rec.si} de ${x.rec.total}` : ''}`;
  return `
    <li>
      <a class="ranking-fila" href="${metricas.rutaDe(j)}" data-precarga="${esc(j.cover_id ?? '')}">
        <span class="ranking-pos${i < 3 ? ' top' : ''}">${i + 1}</span>
        ${portada(j, { clase: 'portada-ranking', prioridad: i < 8 })}
        <div class="ranking-info">
          <span class="ranking-nombre">${esc(j.nombre)}</span>
          <div class="ranking-meta">
            ${opinan.length ? `<span class="pila-avatares mini">${opinan.map((v) => avatarInsignia(datos.usuario(v.usuario_id), v.recomendado, 18)).join('')}</span>` : ''}
            ${extra ? `<span class="ranking-extra">${extra}</span>` : ''}
          </div>
        </div>
        ${x.media !== null ? `<span class="ranking-nota">${notaConLetra(x.media, 'rk')}</span>` : ''}
      </a>
    </li>`;
}

// ---------------------------------------------------------------------------
// Comparar
// ---------------------------------------------------------------------------
function lados(params) {
  const yo = usuarioActual();
  let a = params[1] && datos.usuario(params[1]) ? params[1] : yo?.id;
  let b = params[2] && datos.usuario(params[2]) ? params[2] : null;
  if (!b || b === a) b = metricas.masAfin(a)?.id ?? null;
  return { a, b };
}

function comparar(params) {
  const { a, b } = lados(params);
  const ua = datos.usuario(a) ?? usuarioActual();
  const ub = b ? datos.usuario(b) : null;
  if (!ub) {
    return estadoVacio({ icono: 'perfil', titulo: 'Aún no hay con quién comparar', texto: 'Cuando haya alguien más en el grupo, aquí veréis en qué coincidís y en qué no.' });
  }
  const c = metricas.comparar(a, b);
  const pocos = c.comunes < MIN_COMUNES;

  const lado = (u, l) => `
    <button type="button" class="comparar-lado" data-lado="${l}" aria-label="Cambiar a ${esc(u.nombre)}">
      ${avatar(u, 60)}
      <span class="comparar-nombre">${esc(u.nombre)} ${icono('desplegable', { tam: 12, color: 'var(--texto-2)' })}</span>
    </button>`;

  const cabecera = `
    <section class="comparar-tarjeta">
      <div class="comparar-cara">
        ${lado(ua, 'a')}
        <div class="comparar-afinidad">
          <span class="comparar-pct">${pocos ? '—' : `${c.afinidad}%`}</span>
          <span class="comparar-pct-etq">${pocos ? `${c.comunes} ${c.comunes === 1 ? 'juego' : 'juegos'} en común` : `afinidad en ${c.comunes} juegos`}</span>
        </div>
        ${lado(ub, 'b')}
      </div>
      ${pocos ? '' : `
        <div class="tarjetas-3 blancas">
          <div class="tarjeta-dato"><span class="dato-num medio">${c.comunes}</span><span class="dato-etq">juegos en común</span></div>
          <div class="tarjeta-dato"><span class="dato-num medio">${c.diferenciaMedia.toFixed(1)}</span><span class="dato-etq">diferencia media</span></div>
          <div class="tarjeta-dato"><span class="dato-num medio">${c.recTotal ? `${c.recCoinciden}<span class="dato-de">/${c.recTotal}</span>` : '—'}</span><span class="dato-etq">coinciden en recomendar</span></div>
        </div>`}
    </section>`;

  if (pocos) {
    return `${cabecera}
      ${estadoVacio({
        icono: 'rankings',
        titulo: 'Necesitáis más juegos en común',
        texto: `Para comparar hacen falta al menos ${MIN_COMUNES} juegos que hayáis puntuado los dos. Valorad más juegos y volved por aquí.`,
        extra: '<a class="boton-secundario" href="#valorar">Valorar un juego</a>',
        clase: 'comparar-vacio',
      })}`;
  }

  const discrepan = c.discrepan.filter((x) => x.dif > 0);
  return `${cabecera}
    ${discrepan.length ? `
      <section class="comparar-seccion">
        <h2 class="seccion-titulo">Donde más discrepáis</h2>
        ${discrepan.map((x) => filaDiscrepa(x, ua, ub)).join('')}
      </section>` : ''}
    <section class="comparar-seccion">
      <h2 class="seccion-titulo">Donde coincidís</h2>
      ${c.coinciden.map((x) => filaCoincide(x)).join('')}
    </section>`;
}

const pct = (n) => `${Math.min(100, Math.max(0, Number(n) * 10))}%`;

function filaDiscrepa(x, ua, ub) {
  const j = x.juego;
  const na = Number(x.a.nota);
  const nb = Number(x.b.nota);
  return `
    <a class="discrepa" href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}">
      ${portada(j, { clase: 'portada-discrepan' })}
      <div class="discrepa-info">
        <div class="discrepa-cab">
          <span class="discrepa-nombre">${esc(j.nombre)}</span>
          <span class="discrepa-dif">±${x.dif.toFixed(1)}</span>
        </div>
        <div class="discrepa-barra" aria-hidden="true">
          <div class="discrepa-pista"></div>
          <div class="discrepa-tramo" style="left:${pct(Math.min(na, nb))};width:${pct(Math.abs(na - nb))}"></div>
          <span class="discrepa-punto" style="left:${pct(nb)}">${avatar(ub, 20)}</span>
          <span class="discrepa-punto" style="left:${pct(na)}">${avatar(ua, 20)}</span>
        </div>
        <div class="discrepa-pie">
          <span>${esc(ua.nombre)} <strong>${formatearNota(na)} ${notaALetra(na)}</strong></span>
          <span>${esc(ub.nombre)} <strong>${formatearNota(nb)} ${notaALetra(nb)}</strong></span>
        </div>
      </div>
    </a>`;
}

function filaCoincide(x) {
  const j = x.juego;
  return `
    <a class="coincide" href="#juego/${j.igdb_id}" data-precarga="${esc(j.cover_id ?? '')}">
      ${portada(j, { clase: 'portada-coinciden' })}
      <span class="coincide-nombre">${esc(j.nombre)}</span>
      <span class="coincide-notas"><strong>${formatearNota(x.a.nota)}</strong> · <strong>${formatearNota(x.b.nota)}</strong></span>
    </a>`;
}

/** Hoja para cambiar el usuario de un lado (sin poder repetir el del otro). */
function elegirUsuario(cual, params) {
  const { a, b } = lados(params);
  const otro = cual === 'a' ? b : a;
  const actual = cual === 'a' ? a : b;
  const uOtro = datos.usuario(otro);
  const candidatos = metricas.usuariosActivos().filter((u) => u.id !== otro);
  abrirHoja({
    titulo: 'Comparar con…',
    antetitulo: uOtro ? `Frente a ${uOtro.nombre}` : '',
    html: `
      <div class="lista-usuarios">
        ${candidatos.map((u) => {
          const n = otro ? metricas.juegosEnComun(u.id, otro) : 0;
          return `
            <button type="button" class="fila-usuario${u.id === actual ? ' activa' : ''}" data-elegir="${esc(u.id)}">
              ${avatar(u, 40)}
              <span class="fila-usuario-nombre">${esc(u.nombre)}${u.id === usuarioActual()?.id ? ' <span class="grupo-tu">(tú)</span>' : ''}</span>
              <span class="fila-usuario-extra">${n} en común</span>
            </button>`;
        }).join('')}
      </div>`,
    alMontar(cuerpo, cerrar) {
      cuerpo.addEventListener('click', (e) => {
        const f = e.target.closest('[data-elegir]');
        if (!f) return;
        const nuevo = f.dataset.elegir;
        cerrar(true);
        const [na, nb] = cual === 'a' ? [nuevo, b] : [a, nuevo];
        reemplazarRuta(`#rankings/comparar/${na}/${nb}`);
      });
    },
  });
}
