// #evento/{id}: la página de un evento destacado (The Game Awards...). Arriba, la cuenta
// atrás, "Votar en la web oficial", la chuleta con MIS VOTOS y "Ya he votado"; después, el
// veredicto de CVJ (o, con resultados, la porra) y las categorías incluidas con sus
// nominados. En cada nominado, dos marcas independientes: "Mi voto" (corazón, a quién
// quiero que gane) y "Mi pronóstico" (diana, quién creo que ganará: la porra).
// #evento/{id}/editar y #evento/nuevo: el editor del admin (js/pantallas/evento-editar.js).
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as ev from '../eventos.js';
import { usuarioActual } from '../sesion.js';
import { esc, avatar, portada, chipLetra, conservarScroll, aviso, notaConLetra } from '../ui.js';
import { volver } from '../navegacion.js';
import { abrirHoja } from '../hoja.js';
import { rutaDe } from '../metricas.js';

export function render(el, ctx = {}) {
  const params = ctx.params ?? [];
  if (params[0] === 'nuevo' || params[1] === 'editar') {
    // El editor del admin, en su módulo (la limpieza llega cuando se ha cargado).
    let limpiar = null;
    let fuera = false;
    import('./evento-editar.js').then((m) => { if (!fuera) limpiar = m.render(el, ctx); });
    return () => { fuera = true; limpiar?.(); };
  }
  const id = params[0];
  const yo = usuarioActual();

  const pintar = () => conservarScroll(el, () => { el.innerHTML = html(datos.evento(id), yo); });

  el.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-accion="atras"]')) { volver('#inicio'); return; }
    const evt = datos.evento(id);
    if (!evt) return;
    const marca = t.closest('[data-elegir]');
    if (marca) {
      e.preventDefault();
      if (ev.cerrado(evt)) { aviso('La gala ya ha empezado: no se puede cambiar.'); return; }
      const { elegir: tipo, categoria, nominado } = marca.dataset;
      const ya = ev.miEleccion(categoria, tipo, yo.id);
      const nuevo = ya?.nominado_id === nominado ? null : nominado;
      datos.elegirEnEvento(yo.id, categoria, tipo, nuevo, aviso);
      if (tipo === 'pronostico' && nuevo && !ya) aviso('Pronóstico hecho. Ya puedes ver los de los demás.', 2400);
      return;
    }
    if (t.closest('[data-chuleta]')) { hojaChuleta(evt, yo); return; }
    const v = t.closest('[data-votado]');
    if (v) {
      const ya = datos.votadoEn(id).some((x) => x.usuario_id === yo.id);
      datos.marcarVotadoEvento(id, yo.id, !ya, aviso);
    }
  });

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

function html(e, yo) {
  if (!e) {
    return `
      <section class="evento">
        <header class="cementerio-cab">
          <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
          <div class="cementerio-cab-texto"><p class="cementerio-sub">${datos.datosFrescos() ? 'Este evento ya no existe.' : 'Cargando…'}</p></div>
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
        ${img ? `<img class="evento-cab-img" src="${esc(img)}" alt="" decoding="async" crossorigin="anonymous">` : ''}
        <div class="evento-cab-velo"></div>
        <div class="evento-cab-barra">
          <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
          ${admin ? `<a class="boton-secundario boton-pequeno neutro" href="#evento/${esc(e.id)}/editar">Editar</a>` : ''}
        </div>
        <div class="evento-cab-texto">
          ${e.siglas ? `<span class="evento-banner-siglas">${esc(e.siglas)}</span>` : ''}
          <h1 class="evento-titulo">${esc(e.titulo)}</h1>
          ${e.texto ? `<p class="evento-sub">${esc(e.texto)}</p>` : ''}
          ${e.fecha_clave ? `<p class="evento-fecha">${esc(e.etiqueta_clave || 'Fecha clave')}: ${esc(ev.fechaHora(e.fecha_clave))} (hora española)</p>` : ''}
          ${falta ? `<p class="evento-fecha evento-falta">Faltan <b data-cuenta="${esc(e.fecha_clave)}">${esc(falta)}</b></p>` : ''}
        </div>
      </header>
      ${e.resultados_en ? bloquePorra(e, yo) : ''}
      ${bloqueOficial(e, yo, cats)}
      ${bloqueVeredicto(e)}
      ${cats.length ? `
        <div class="evento-leyenda">
          <p><span class="marca-voto">${icono('corazon', { tam: 16, color: 'currentColor' })}</span><span><strong>Mi voto</strong>: a quién quieres que gane. Es lo que votas en la web oficial.</span></p>
          <p><span class="marca-pronostico">${icono('diana', { tam: 16, color: 'currentColor' })}</span><span><strong>Mi pronóstico</strong>: quién crees que va a ganar. Es la porra.</span></p>
          ${cerrado ? `<p class="evento-bloqueado">${icono('candado', { tam: 14, color: 'currentColor' })}<span>La gala ya ha empezado: todo queda como estaba.</span></p>` : '<p class="evento-nota">Puedes cambiarlos hasta que empiece la gala. Los pronósticos de los demás se ven cuando haces el tuyo.</p>'}
        </div>
        <div class="evento-categorias">${cats.map((c) => categoria(e, c, yo)).join('')}</div>` : '<p class="evento-nota evento-sin">Aún no hay categorías.</p>'}
    </section>`;
}

function bloqueOficial(e, yo, cats) {
  const votados = datos.votadoEn(e.id).map((x) => datos.usuario(x.usuario_id)).filter((u) => u && u.activo !== false);
  const total = datos.estado.usuarios.filter((u) => u.activo !== false).length;
  const yaVote = votados.some((u) => u.id === yo?.id);
  const abierta = ev.votacionAbierta(e);
  if (!e.enlace_url && !cats.length) return '';
  return `
    <section class="evento-oficial">
      ${e.enlace_url ? `<a class="boton-principal con-icono" href="${esc(e.enlace_url)}" target="_blank" rel="noopener">${esc(e.enlace_texto || 'Ir a la web oficial')}${icono('externo', { tam: 16, color: 'currentColor' })}</a>` : ''}
      ${e.votacion_fin ? `<p class="evento-nota">${abierta ? `La votación oficial está abierta hasta el ${esc(ev.fechaHora(e.votacion_fin))}.` : 'La votación oficial ya está cerrada.'} Allí se vota con tu cuenta; desde CVJ no se envía nada.</p>` : ''}
      ${cats.length ? `
        <div class="fila-botones">
          <button type="button" class="boton-secundario" data-chuleta>Mi chuleta</button>
          <button type="button" class="boton-secundario neutro con-icono" data-votado aria-pressed="${yaVote}">${icono(yaVote ? 'hecho' : 'urna', { tam: 16, color: 'currentColor' })}<span>${yaVote ? 'Votado' : 'Ya he votado'}</span></button>
        </div>
        <p class="evento-votados">
          ${votados.length ? `<span class="evento-avatares">${votados.map((u) => avatar(u, 24)).join('')}</span>` : ''}
          <span>${votados.length} de ${total} ${votados.length === 1 ? 'ha votado' : 'han votado'} en la oficial</span>
        </p>` : ''}
    </section>`;
}

function bloqueVeredicto(e) {
  const v = ev.veredicto(e.id);
  if (!v) return '';
  if (!v.favorito) {
    return `
      <section class="evento-veredicto">
        <span class="evento-veredicto-etq">El veredicto de CVJ</span>
        <p class="evento-nota">Nadie del grupo ha puntuado aún a los nominados a ${esc(v.categoria.nombre)}. Sin notas no hay veredicto.</p>
      </section>`;
  }
  const { n, g } = v.favorito;
  const j = n.juego_id ? datos.juegoConocido(n.juego_id) : null;
  return `
    <section class="evento-veredicto">
      <span class="evento-veredicto-etq">El veredicto de CVJ · ${esc(v.categoria.nombre)}</span>
      <a class="evento-veredicto-juego" href="${j ? rutaDe(j) : '#'}">
        ${j ? portada(j, { clase: 'portada-evento-grande' }) : ''}
        <span>
          <strong>${esc(n.nombre)}</strong>
          <span class="evento-veredicto-nota">${notaConLetra(g.media, 'lg')} <small>${g.votos} ${g.votos === 1 ? 'nota' : 'notas'} del grupo</small></span>
        </span>
      </a>
      ${v.filas.length > 1 ? `<ol class="evento-veredicto-resto">${v.filas.slice(1).map((x) => `<li><span>${esc(x.n.nombre)}</span>${notaConLetra(x.g.media, 'sm')}</li>`).join('')}</ol>` : ''}
      ${v.pocas ? '<p class="evento-aviso">Con muy pocas notas: tomadlo con pinzas.</p>' : ''}
    </section>`;
}

function bloquePorra(e, yo) {
  const p = ev.porra(e.id);
  if (!p.lista.length) return '';
  return `
    <section class="evento-porra">
      <span class="evento-veredicto-etq">${icono('trofeo', { tam: 14, color: 'currentColor' })} La porra · ${p.decididas} de ${p.total} categorías decididas</span>
      <ol class="evento-porra-lista">
        ${p.lista.map((f, i) => `
          <li class="${p.ganadores.includes(f) ? 'gana' : ''}${f.u.id === yo?.id ? ' yo' : ''}">
            <span class="evento-porra-pos">${i + 1}</span>
            ${avatar(f.u, 32)}
            <span class="evento-porra-nombre">${esc(f.u.nombre)}</span>
            <span class="evento-porra-pts"><span><b>${f.puntos}</b> ${f.puntos === 1 ? 'punto' : 'puntos'}</span><small>${f.aciertos} de ${f.jugadas}</small></span>
          </li>`).join('')}
      </ol>
    </section>`;
}

function categoria(e, c, yo) {
  const noms = datos.nominadosDe(c.id);
  const votos = ev.eleccionesPorNominado(c.id, 'voto');
  const veo = ev.veoPronosticos(e, c.id);
  const pron = veo ? ev.eleccionesPorNominado(c.id, 'pronostico') : new Map();
  const miVoto = ev.miEleccion(c.id, 'voto', yo?.id)?.nominado_id;
  const miPron = ev.miEleccion(c.id, 'pronostico', yo?.id)?.nominado_id;
  const fav = ev.masElegido(c.id, 'voto');
  const pg = veo ? ev.masElegido(c.id, 'pronostico') : null;
  const ganador = c.ganador_id ? datos.nominado(c.ganador_id) : null;
  const jurado = ganador ? (votos.get(ganador.id) ?? []) : [];
  const cerrado = ev.cerrado(e);
  const resumen = [
    fav ? `<span>${icono('corazon', { tam: 13, color: 'currentColor' })} Favorito del grupo: <strong>${fav.empate ? 'empate' : esc(fav.nominado?.nombre ?? '')}</strong></span>` : '',
    pg ? `<span>${icono('diana', { tam: 13, color: 'currentColor' })} Pronóstico del grupo: <strong>${pg.empate ? 'empate' : esc(pg.nominado?.nombre ?? '')}</strong></span>` : '',
    !veo && datos.eleccionesDe(c.id).some((x) => x.tipo === 'pronostico') ? '<span class="evento-oculto">Haz tu pronóstico para ver el del grupo.</span>' : '',
  ].filter(Boolean).join('');
  return `
    <article class="evento-cat" id="cat-${esc(c.id)}">
      <h2 class="evento-cat-nombre">${esc(c.nombre)}${(c.peso ?? 1) > 1 ? ` <small>×${c.peso} en la porra</small>` : ''}</h2>
      ${ganador ? `<p class="evento-ganador">${icono('trofeo', { tam: 16, color: 'currentColor' })}<span>Ganador: <strong>${esc(ganador.nombre)}</strong>${jurado.length ? ` · El jurado está de acuerdo con ${esc(ev.nombres(jurado))}` : ''}</span></p>` : ''}
      <ul class="evento-noms">
        ${noms.map((n) => nominadoFila(e, c, n, { votos, pron, miVoto, miPron, cerrado, gana: ganador?.id === n.id })).join('')}
      </ul>
      ${resumen ? `<div class="evento-cat-resumen">${resumen}</div>` : ''}
    </article>`;
}

function nominadoFila(e, c, n, { votos, pron, miVoto, miPron, cerrado, gana }) {
  const j = c.tipo === 'juegos' && n.juego_id ? datos.juegoConocido(n.juego_id) : null;
  const g = j ? ev.notaGrupo(n.juego_id) : null;
  const vs = votos.get(n.id) ?? [];
  const ps = pron.get(n.id) ?? [];
  const marca = (tipo, mio, nombreIcono, etiqueta) => `
    <button type="button" class="evento-marca marca-${tipo}${mio ? ' activa' : ''}" data-elegir="${tipo}" data-categoria="${esc(c.id)}" data-nominado="${esc(n.id)}"
      aria-pressed="${mio}" aria-label="${etiqueta}: ${esc(n.nombre)}"${cerrado ? ' disabled' : ''}>${icono(nombreIcono, { tam: 20, color: 'currentColor' })}</button>`;
  const quien = (lista, tipo) => (lista.length ? `<span class="evento-quien ${tipo}">${icono(tipo === 'voto' ? 'corazon' : 'diana', { tam: 11, color: 'currentColor' })}${lista.map((u) => avatar(u, 18)).join('')}</span>` : '');
  const cuerpo = `
    ${j ? portada(j, { clase: 'portada-evento' }) : c.tipo === 'juegos' ? '<span class="portada portada-evento evento-sin-portada"></span>' : ''}
    <span class="evento-nom-texto">
      <strong>${esc(n.nombre)}</strong>
      ${n.detalle ? `<small>${esc(n.detalle)}</small>` : ''}
      ${g?.votos ? `<span class="evento-nom-grupo">${notaConLetra(g.media, 'sm')}<span class="evento-letras">${g.quien.map((x) => `<span class="evento-letra" title="${esc(x.u.nombre)}">${avatar(x.u, 16)}${chipLetra(x.letra, 'sm')}</span>`).join('')}</span></span>` : ''}
      ${vs.length || ps.length ? `<span class="evento-quienes">${quien(vs, 'voto')}${quien(ps, 'pronostico')}</span>` : ''}
    </span>`;
  return `
    <li class="evento-nom${gana ? ' gana' : ''}">
      ${j ? `<a class="evento-nom-enlace" href="${rutaDe(j)}">${cuerpo}</a>` : `<div class="evento-nom-enlace">${cuerpo}</div>`}
      <span class="evento-marcas">
        ${marca('voto', miVoto === n.id, 'corazon', 'Mi voto')}
        ${marca('pronostico', miPron === n.id, 'diana', 'Mi pronóstico')}
      </span>
    </li>`;
}

/** La chuleta: MIS VOTOS, en el orden de la web oficial, para seguirla mientras voto allí. */
function hojaChuleta(e, yo) {
  const cats = ev.incluidas(e.id);
  const hechos = cats.filter((c) => ev.miEleccion(c.id, 'voto', yo.id)).length;
  abrirHoja({
    titulo: 'Mi chuleta',
    html: `
      <div class="evento-chuleta">
        <p class="evento-nota">Tus votos (no tus pronósticos), en el orden de la web oficial. ${hechos} de ${cats.length}.</p>
        ${e.enlace_url ? `<a class="boton-principal con-icono" href="${esc(e.enlace_url)}" target="_blank" rel="noopener">${esc(e.enlace_texto || 'Ir a la web oficial')}${icono('externo', { tam: 16, color: 'currentColor' })}</a>` : ''}
        <ol class="evento-chuleta-lista">
          ${cats.map((c) => {
            const n = datos.nominado(ev.miEleccion(c.id, 'voto', yo.id)?.nominado_id);
            return `<li${n ? '' : ' class="sin"'}><span>${esc(c.nombre)}</span><strong>${n ? esc(n.nombre) : 'Sin votar'}</strong></li>`;
          }).join('')}
        </ol>
      </div>`,
  });
}
