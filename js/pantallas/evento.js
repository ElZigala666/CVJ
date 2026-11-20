// #evento/{id}: la página de un evento destacado (The Game Awards...), en modo consulta.
// Arriba: mi papeleta (completa o "8 de 24", con el botón para seguir), la porra (antes de
// la gala, quién ha completado la suya; después, la clasificación), quién ha votado en la
// oficial y el veredicto de CVJ. Debajo, las categorías plegables en modo lectura: favorito
// y apuesta de cada uno con avatares y la nota del grupo; para cambiar algo, la papeleta se
// abre en esa categoría.
// #evento/{id}/papeleta(/{categoria}): la papeleta paso a paso (js/pantallas/papeleta.js).
// #evento/{id}/editar y #evento/nuevo: el editor del admin (js/pantallas/evento-editar.js).
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as ev from '../eventos.js';
import { usuarioActual } from '../sesion.js';
import { esc, avatar, portada, conservarScroll, aviso, notaConLetra, esperaDatos } from '../ui.js';
import { volver } from '../navegacion.js';
import { abrirHoja } from '../hoja.js';
import { rutaDe } from '../metricas.js';

const CLAVE_LEYENDA = 'cvj.evento.leyenda';
const leyendaVista = () => { try { return localStorage.getItem(CLAVE_LEYENDA) === '1'; } catch { return false; } };

export function render(el, ctx = {}) {
  const params = ctx.params ?? [];
  const otra = params[0] === 'nuevo' || params[1] === 'editar' ? './evento-editar.js' : params[1] === 'papeleta' ? './papeleta.js' : null;
  if (otra) {
    // El editor o la papeleta, en su módulo (la limpieza llega cuando se ha cargado).
    let limpiar = null;
    let fuera = false;
    import(otra).then((m) => { if (!fuera) limpiar = m.render(el, ctx); });
    return () => { fuera = true; limpiar?.(); };
  }
  const id = params[0];
  const yo = usuarioActual();
  const abiertas = new Set();

  const pintar = () => conservarScroll(el, () => { el.innerHTML = html(datos.evento(id), yo, abiertas); });

  el.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-accion="atras"]')) { volver('#inicio'); return; }
    const evt = datos.evento(id);
    if (!evt) return;
    if (t.closest('[data-leyenda-ok]')) { try { localStorage.setItem(CLAVE_LEYENDA, '1'); } catch { /* nada */ } pintar(); return; }
    if (t.closest('[data-chuleta]')) { hojaChuleta(evt, yo); return; }
  });
  el.addEventListener('change', (e) => {
    if (!e.target.matches('[data-votado]')) return;
    datos.marcarVotadoEvento(id, yo.id, e.target.checked, aviso);
  });
  // Recordar qué categorías están abiertas (los <details> se repintan con los datos).
  el.addEventListener('toggle', (e) => {
    const d = e.target.closest?.('[data-cat]');
    if (!d) return;
    if (d.open) abiertas.add(d.dataset.cat); else abiertas.delete(d.dataset.cat);
  }, true);

  // Cuenta atrás cada 30 s; al llegar la gala, se repinta (se bloquea todo).
  const reloj = setInterval(() => {
    ev.actualizarCuentas(el);
    const evt = datos.evento(id);
    if (evt && ev.cerrado(evt) && !el.querySelector('.evento-cerrado')) pintar();
  }, 30_000);
  const quitar = datos.suscribir(pintar);
  pintar();
  return () => { clearInterval(reloj); quitar(); };
}

function html(e, yo, abiertas) {
  if (!e) {
    return `
      <section class="evento">
        <header class="cementerio-cab">
          <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
          <div class="cementerio-cab-texto">${esperaDatos(datos.estadoCarga(), 'Este evento ya no existe.', 'cementerio-sub')}</div>
        </header>
      </section>`;
  }
  document.title = `CVJ · ${e.titulo}`;
  const admin = !!datos.usuario(yo?.id)?.es_admin;
  const cats = ev.incluidas(e.id);
  const img = ev.imagenDe(e);
  const cerrado = ev.cerrado(e);
  const falta = ev.cuentaAtras(e.fecha_clave);
  return `
    <section class="evento${cerrado ? ' evento-cerrado' : ''}" style="--evento:${esc(ev.colorDe(e))}">
      <header class="evento-cab${img ? ' con-imagen' : ''}">
        ${img ? `<img class="evento-cab-img" src="${esc(img)}" alt="" decoding="async" crossorigin="anonymous" style="object-position:${ev.foco(e)}">` : ''}
        <div class="evento-cab-velo"></div>
        <div class="evento-cab-barra">
          <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
          ${admin ? `<a class="boton-secundario boton-pequeno neutro" href="#evento/${esc(e.id)}/editar">Editar</a>` : ''}
        </div>
        <div class="evento-cab-texto">
          ${e.siglas ? `<span class="evento-banner-siglas">${esc(e.siglas)}</span>` : ''}
          <h1 class="evento-titulo">${esc(e.titulo)}</h1>
          ${e.fecha_clave ? `<p class="evento-fecha">${esc(e.etiqueta_clave || 'Fecha clave')}: ${esc(ev.fechaHora(e.fecha_clave))}${falta ? ` · faltan <b data-cuenta="${esc(e.fecha_clave)}">${esc(falta)}</b>` : ''}</p>` : ''}
        </div>
      </header>
      ${cats.length ? bloquePapeleta(e, yo, cats) : ''}
      ${cats.length ? bloquePorra(e, yo) : ''}
      ${bloqueOficial(e, yo, cats)}
      ${bloqueVeredicto(e)}
      ${cats.length ? `
        <section class="evento-lectura">
          <h2 class="evento-seccion">Categorías</h2>
          ${leyendaVista() ? '' : `
            <p class="evento-leyenda-linea">
              <span><span class="marca-voto">${icono('corazon', { tam: 14, color: 'currentColor' })}</span> tu favorito · <span class="marca-pronostico">${icono('diana', { tam: 14, color: 'currentColor' })}</span> quién crees que gana el premio de verdad (puntúa)</span>
              <button type="button" class="evento-leyenda-ok" data-leyenda-ok aria-label="Ocultar">${icono('cerrar', { tam: 14, color: 'currentColor' })}</button>
            </p>`}
          <div class="evento-categorias">${cats.map((c) => categoria(e, c, yo, abiertas.has(c.id))).join('')}</div>
        </section>` : ''}
    </section>`;
}

function bloquePapeleta(e, yo, cats) {
  const pr = ev.progreso(e.id, yo.id);
  const cerrado = ev.cerrado(e);
  const etiqueta = cerrado ? (pr.completa ? 'Tu papeleta, completa' : `Tu papeleta: ${pr.hechas} de ${pr.total}`)
    : pr.completa ? 'Tu papeleta está completa' : pr.empezada ? `Tu papeleta: ${pr.hechas} de ${pr.total}` : 'Aún no has hecho tu porra';
  const boton = cerrado ? '' : pr.completa
    ? `<a class="boton-secundario" href="#evento/${esc(e.id)}/papeleta">Revisar mi papeleta</a>`
    : `<a class="boton-principal" href="#evento/${esc(e.id)}/papeleta">${pr.empezada ? 'Seguir mi porra' : 'Hacer mi porra'}</a>`;
  return `
    <section class="evento-caja evento-mi-papeleta${pr.completa ? ' completa' : ''}">
      <div class="evento-mi-papeleta-fila">
        <strong>${esc(etiqueta)}</strong>
        ${pr.completa ? `<span class="evento-ok">${icono('hecho', { tam: 18, color: 'currentColor' })}</span>` : ''}
      </div>
      <div class="pap-progreso"><i style="width:${cats.length ? (pr.hechas / cats.length) * 100 : 0}%"></i></div>
      ${boton}
    </section>`;
}

function bloquePorra(e, yo) {
  const vivos = datos.estado.usuarios.filter((u) => u.activo !== false);
  if (!e.resultados_en) {
    // Antes de los resultados: quién ha completado su papeleta.
    const filas = vivos.map((u) => ({ u, p: ev.progreso(e.id, u.id) })).sort((a, b) => b.p.hechas - a.p.hechas || a.u.nombre.localeCompare(b.u.nombre));
    const completas = filas.filter((f) => f.p.completa).length;
    return `
      <section class="evento-caja">
        <h2 class="evento-seccion">La porra <small>${completas} de ${filas.length} completas</small></h2>
        <ul class="evento-porra-lista">
          ${filas.map((f) => `
            <li class="${f.u.id === yo?.id ? 'yo' : ''}">
              ${avatar(f.u, 28)}
              <span class="evento-porra-nombre">${esc(f.u.nombre)}</span>
              <span class="evento-porra-estado${f.p.completa ? ' completa' : ''}">${f.p.completa ? `${icono('hecho', { tam: 14, color: 'currentColor' })} Completa` : f.p.empezada ? `${f.p.hechas}/${f.p.total}` : 'Sin empezar'}</span>
            </li>`).join('')}
        </ul>
        <p class="evento-nota">Puntúan las apuestas. La clasificación, tras la gala.</p>
      </section>`;
  }
  const p = ev.porra(e.id);
  if (!p.lista.length) return '';
  return `
    <section class="evento-caja evento-porra">
      <h2 class="evento-seccion">${icono('trofeo', { tam: 16, color: 'currentColor' })} La porra <small>${p.decididas} de ${p.total} decididas</small></h2>
      <ol class="evento-porra-lista">
        ${p.lista.map((f, i) => `
          <li class="${p.ganadores.includes(f) ? 'gana' : ''}${f.u.id === yo?.id ? ' yo' : ''}">
            <span class="evento-porra-pos">${i + 1}</span>
            ${avatar(f.u, 28)}
            <span class="evento-porra-nombre">${esc(f.u.nombre)}</span>
            <span class="evento-porra-pts"><span><b>${f.puntos}</b> ${f.puntos === 1 ? 'punto' : 'puntos'}</span><small>${f.aciertos} de ${f.jugadas}</small></span>
          </li>`).join('')}
      </ol>
    </section>`;
}

function bloqueOficial(e, yo, cats) {
  const votados = datos.votadoEn(e.id).map((x) => datos.usuario(x.usuario_id)).filter((u) => u && u.activo !== false);
  const total = datos.estado.usuarios.filter((u) => u.activo !== false).length;
  const yaVote = votados.some((u) => u.id === yo?.id);
  const abierta = ev.votacionAbierta(e) && !ev.cerrado(e);
  if (!e.enlace_url) return '';
  return `
    <section class="evento-caja evento-oficial">
      <p class="evento-votados">
        ${votados.length ? `<span class="evento-avatares">${votados.map((u) => avatar(u, 24)).join('')}</span>` : ''}
        <span><strong>${votados.length} de ${total}</strong> han votado en la oficial</span>
      </p>
      ${abierta ? `
        <div class="fila-botones">
          <a class="boton-secundario con-icono" href="${esc(e.enlace_url)}" target="_blank" rel="noopener">Web oficial${icono('externo', { tam: 14, color: 'currentColor' })}</a>
          ${cats.length ? '<button type="button" class="boton-secundario neutro" data-chuleta>Mi chuleta</button>' : ''}
        </div>
        <label class="interruptor mini evento-check"><input type="checkbox" data-votado${yaVote ? ' checked' : ''}> Ya he votado en la oficial</label>` : ''}
    </section>`;
}

function bloqueVeredicto(e) {
  const v = ev.veredicto(e.id);
  if (!v?.favorito) return '';
  const { n, g } = v.favorito;
  const j = n.juego_id ? datos.juegoConocido(n.juego_id) : null;
  return `
    <section class="evento-caja evento-veredicto">
      <h2 class="evento-seccion">El veredicto de CVJ <small>${esc(v.categoria.nombre)}</small></h2>
      <a class="evento-veredicto-juego" href="${j ? rutaDe(j) : '#'}">
        ${j ? portada(j, { clase: 'portada-evento-grande' }) : ''}
        <span>
          <strong>${esc(n.nombre)}</strong>
          <span class="evento-veredicto-nota">${notaConLetra(g.media, 'lg')} <small>${g.votos} ${g.votos === 1 ? 'nota' : 'notas'}${v.pocas ? ' · aún pocas' : ''}</small></span>
        </span>
      </a>
    </section>`;
}

/** Una categoría, plegable y en modo lectura. Para cambiar, la papeleta en esa categoría. */
function categoria(e, c, yo, abierta) {
  const noms = datos.nominadosDe(c.id);
  const veoApu = ev.veoPronosticos(e, c.id);
  const favs = ev.eleccionesPorNominado(c.id, 'voto');
  const apus = veoApu ? ev.eleccionesPorNominado(c.id, 'pronostico') : new Map();
  const miF = ev.miEleccion(c.id, 'voto', yo?.id)?.nominado_id;
  const miA = ev.miEleccion(c.id, 'pronostico', yo?.id)?.nominado_id;
  const ganador = c.ganador_id ? datos.nominado(c.ganador_id) : null;
  const jurado = ganador ? (favs.get(ganador.id) ?? []) : [];
  const gf = ev.masElegido(c.id, 'voto');
  const ga = veoApu ? ev.masElegido(c.id, 'pronostico') : null;
  const mios = [
    miF ? `<span class="marca-voto">${icono('corazon', { tam: 12, color: 'currentColor' })}</span>${esc(datos.nominado(miF)?.nombre ?? '')}` : '',
    miA ? `<span class="marca-pronostico">${icono('diana', { tam: 12, color: 'currentColor' })}</span>${miA === miF ? 'el mismo' : esc(datos.nominado(miA)?.nombre ?? '')}` : '',
  ].filter(Boolean).join(' <span aria-hidden="true">·</span> ');
  const fila = (nm) => {
    const j = c.tipo === 'juegos' && nm.juego_id ? datos.juegoConocido(nm.juego_id) : null;
    const g = j ? ev.notaGrupo(nm.juego_id) : null;
    const f = favs.get(nm.id) ?? [];
    const a = apus.get(nm.id) ?? [];
    return `
      <li class="evento-lec${ganador?.id === nm.id ? ' gana' : ''}">
        ${j ? portada(j, { clase: 'portada-lectura' }) : ''}
        <span class="evento-lec-texto">
          <span class="evento-lec-nombre">${ganador?.id === nm.id ? icono('trofeo', { tam: 13, color: 'currentColor' }) : ''}<span>${esc(nm.nombre)}</span>${g?.votos ? `<span class="evento-lec-nota">${notaConLetra(g.media, 'sm')}</span>` : ''}</span>
          ${f.length || a.length ? `<span class="evento-quienes">
            ${f.length ? `<span class="evento-quien voto">${icono('corazon', { tam: 11, color: 'currentColor' })}${f.map((u) => avatar(u, 18)).join('')}</span>` : ''}
            ${a.length ? `<span class="evento-quien pronostico">${icono('diana', { tam: 11, color: 'currentColor' })}${a.map((u) => avatar(u, 18)).join('')}</span>` : ''}
          </span>` : ''}
        </span>
      </li>`;
  };
  return `
    <details class="evento-cat" data-cat="${esc(c.id)}"${abierta ? ' open' : ''}>
      <summary>
        <span class="evento-cat-texto">
          <strong>${esc(c.nombre)}${(c.peso ?? 1) > 1 ? ` <small>×${c.peso}</small>` : ''}</strong>
          <small>${ganador ? `${icono('trofeo', { tam: 12, color: 'currentColor' })} ${esc(ganador.nombre)}` : mios || 'Sin elegir'}</small>
        </span>
        ${icono('desplegable', { tam: 12, color: 'var(--texto-2)', clase: 'evento-cat-flecha' })}
      </summary>
      <ul class="evento-noms">${noms.map(fila).join('')}</ul>
      ${gf || ga || jurado.length ? `<p class="evento-cat-resumen">
        ${gf ? `<span>El favorito del grupo: <strong>${gf.empate ? 'empate' : esc(gf.nominado?.nombre ?? '')}</strong></span>` : ''}
        ${ga ? `<span>El grupo apuesta por: <strong>${ga.empate ? 'empate' : esc(ga.nominado?.nombre ?? '')}</strong></span>` : ''}
        ${jurado.length ? `<span>El jurado está de acuerdo con ${esc(ev.nombres(jurado))}</span>` : ''}
      </p>` : ''}
      ${ev.cerrado(e) ? '' : `<a class="boton-secundario boton-pequeno evento-cat-cambiar" href="#evento/${esc(e.id)}/papeleta/${esc(c.id)}">${miF || miA ? 'Cambiar mi elección' : 'Elegir'}</a>`}
    </details>`;
}

/** La chuleta: MIS FAVORITOS, en el orden de la web oficial, para seguirla mientras voto allí. */
export function hojaChuleta(e, yo) {
  const cats = ev.incluidas(e.id);
  const hechos = cats.filter((c) => ev.miEleccion(c.id, 'voto', yo.id)).length;
  abrirHoja({
    titulo: 'Mi chuleta',
    html: `
      <div class="evento-chuleta">
        <p class="evento-nota">Tus favoritos, en el orden de la web oficial (${hechos} de ${cats.length}).</p>
        ${e.enlace_url ? `<a class="boton-principal con-icono" href="${esc(e.enlace_url)}" target="_blank" rel="noopener">${esc(e.enlace_texto || 'Ir a la web oficial')}${icono('externo', { tam: 16, color: 'currentColor' })}</a>` : ''}
        <ol class="evento-chuleta-lista">
          ${cats.map((c) => {
            const n = datos.nominado(ev.miEleccion(c.id, 'voto', yo.id)?.nominado_id);
            return `<li${n ? '' : ' class="sin"'}><span>${esc(c.nombre)}</span><strong>${n ? esc(n.nombre) : 'Sin favorito'}</strong></li>`;
          }).join('')}
        </ol>
      </div>`,
  });
}
