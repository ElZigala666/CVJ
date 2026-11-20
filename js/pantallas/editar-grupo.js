// Editor de una colección (#coleccion/{id}/editar) o de una saga (#saga/{id}/editar), solo
// admin. Todo desde aquí y guardado al momento (escrituras optimistas: se ve en toda la app):
//   · nombre y, en colecciones, la portada;
//   · añadir juegos con el buscador de aquí mismo (de la app y del catálogo de IGDB, varios a
//     la vez; los que ya están salen marcados);
//   · colecciones: reordenar arrastrando el tirador (en móvil, mantener pulsado; con
//     vibración y desplazamiento automático cerca del borde), con ↑/↓ como alternativa, y los
//     atajos "Por fecha de salida" / "Por nombre" (luego se retoca a mano). Las sagas van
//     siempre en orden de salida;
//   · quitar un juego (con Deshacer), fusionar con otra y eliminar (colección) u ocultar (saga).
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import { usuarioActual } from '../sesion.js';
import { esc, portada, aviso, avisoDeshacer, pintarHtml, esperaDatos } from '../ui.js';
import { volver } from '../navegacion.js';
import { abrirHoja } from '../hoja.js';
import { buscarJuegos } from '../igdb.js';
import { normalizarBusqueda } from '../psn-nombres.js';

export function render(el, { params = [] } = {}, tipo = 'coleccion') {
  const id = params[0];
  const yo = usuarioActual();
  const esCol = tipo === 'coleccion';
  const T = esCol
    ? { uno: 'colección', ruta: '#coleccion/', obtener: datos.coleccion, juegos: datos.juegosDeColeccion }
    : { uno: 'saga', ruta: '#saga/', obtener: datos.saga, juegos: datos.juegosDeSaga };
  const busq = { texto: '', remotos: [], elegidos: new Set(), pidiendo: null, reloj: 0 };
  const vista = { confirmar: false };

  el.innerHTML = `
    <section class="edg">
      <header class="cementerio-cab edg-cab">
        <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
        <div class="cementerio-cab-texto"><h1 class="cementerio-titulo edg-titulo">Editar ${T.uno}</h1></div>
      </header>
      <div data-ref="datos"></div>
      <section class="edg-bloque">
        <h2 class="seccion-titulo">Añadir juegos</h2>
        <input type="search" class="psn-input" data-ref="q" placeholder="Busca en la app y en el catálogo" autocomplete="off" enterkeyhint="search">
        <div class="edg-resultados" data-ref="resultados"></div>
      </section>
      <div data-ref="juegos"></div>
      <div data-ref="final"></div>
    </section>`;
  const $ = (r) => el.querySelector(`[data-ref="${r}"]`);
  const admin = () => !!datos.usuario(yo?.id)?.es_admin;

  // ----- Datos (nombre, portada) ------------------------------------------------
  function pintarDatos(g) {
    const portadas = esCol ? T.juegos(id).map((x) => datos.juegoConocido(x)).filter((j) => j?.cover_id) : [];
    const elegida = esCol ? datos.portadaColeccion(g) : null;
    pintarHtml($('datos'), `
      <section class="edg-bloque">
        <label class="campo-titulo" for="edg-nombre">Nombre</label>
        <input id="edg-nombre" class="psn-input" maxlength="80" value="${esc(g.nombre)}" autocomplete="off">
        ${portadas.length > 1 ? `
          <span class="campo-titulo">Portada</span>
          <div class="coleccion-portadas" data-scroll="portadas">${portadas.map((j) => `
            <button type="button" class="coleccion-portada${j.cover_id === elegida ? ' activa' : ''}" data-portada="${esc(j.cover_id)}" data-k="p${esc(j.cover_id)}" aria-pressed="${j.cover_id === elegida}" aria-label="Portada de ${esc(j.nombre)}">
              ${portada(j, { clase: 'portada-lista' })}
            </button>`).join('')}</div>` : ''}
      </section>`);
  }

  // ----- Buscador para añadir ------------------------------------------------------
  function pintarResultados() {
    const ya = new Set(T.juegos(id));
    const q = normalizarBusqueda(busq.texto);
    if (!q) {
      pintarHtml($('resultados'), busq.elegidos.size ? botonAnadir() : '<p class="ajustes-nota">Escribe para buscar. Se pueden elegir varios y añadirlos de golpe.</p>');
      return;
    }
    const vistos = new Set();
    const lista = [];
    for (const j of datos.estado.juegos) {
      const c = datos.canonico(j.igdb_id);
      if (vistos.has(c) || !normalizarBusqueda(j.nombre).includes(q)) continue;
      vistos.add(c);
      const jj = datos.juegoConocido(c);
      if (jj) lista.push(jj);
      if (lista.length >= 30) break;
    }
    for (const r of busq.remotos) {
      const c = datos.canonico(r.igdb_id);
      if (vistos.has(c)) continue;
      vistos.add(c);
      lista.push(r);
    }
    const fila = (j) => {
      const c = datos.canonico(j.igdb_id);
      const esta = ya.has(c);
      const sel = busq.elegidos.has(c);
      return `
        <button type="button" class="fila-elegir${sel ? ' elegida' : ''}${esta ? ' ya-esta' : ''}" data-elegir="${c}" data-k="r${c}" aria-pressed="${sel || esta}"${esta ? ' disabled' : ''}>
          ${portada(j, { clase: 'portada-lista' })}
          <span class="fila-elegir-texto"><strong>${esc(j.nombre)}</strong><small>${esta ? 'Ya está' : esc(String(j.anio ?? ''))}</small></span>
          <span class="casilla${sel || esta ? ' marcada' : ''}" aria-hidden="true">${sel || esta ? icono('completado', { tam: 22, color: esta ? 'var(--texto-2)' : 'var(--acento)', trazo: 'var(--sobre-acento)' }) : ''}</span>
        </button>`;
    };
    pintarHtml($('resultados'), `
      <div class="elegir-lista">${lista.map(fila).join('') || `<p class="ajustes-nota">${busq.pidiendo ? 'Buscando…' : 'Ningún juego con ese nombre.'}</p>`}</div>
      ${busq.elegidos.size ? botonAnadir() : ''}`);
  }
  const botonAnadir = () => `<button type="button" class="boton-principal" data-accion="anadir">Añadir ${busq.elegidos.size} ${busq.elegidos.size === 1 ? 'juego' : 'juegos'}</button>`;

  // ----- La lista (arrastrar, subir/bajar, quitar) ---------------------------------
  function pintarJuegos() {
    const ids = T.juegos(id);
    pintarHtml($('juegos'), `
      <section class="edg-bloque">
        <div class="seccion-cab">
          <h2 class="seccion-titulo">Juegos</h2>
          <span class="seccion-extra">${ids.length} ${ids.length === 1 ? 'juego' : 'juegos'}</span>
        </div>
        ${esCol && ids.length > 1 ? `
          <div class="edg-atajos">
            <span>Ordenar:</span>
            <button type="button" class="chip" data-ordenar="fecha">Por fecha de salida</button>
            <button type="button" class="chip" data-ordenar="nombre">Por nombre</button>
          </div>
          <p class="ajustes-nota">Arrastra el tirador para cambiar el orden (en el móvil, mantenlo pulsado).</p>` : ''}
        ${!esCol ? '<p class="ajustes-nota">Las sagas van siempre en orden de salida.</p>' : ''}
        ${ids.length ? `<ol class="edg-lista" data-ref="lista">${ids.map((gid, i) => {
          const j = datos.juegoConocido(gid);
          if (!j) return '';
          return `
            <li class="edg-juego" data-id="${gid}" data-k="j${gid}">
              ${esCol ? `<span class="edg-asa" data-asa aria-label="Arrastrar para ordenar" role="button" tabindex="-1">${icono('arrastrar', { tam: 20, color: 'currentColor' })}</span>` : ''}
              <span class="edg-portada"${esCol ? ' data-asa' : ''}>${portada(j, { clase: 'portada-lista' })}</span>
              <span class="edg-texto"><strong>${esc(j.nombre)}</strong><small>${esc(String(j.anio ?? ''))}</small></span>
              <span class="edg-acciones">
                ${esCol ? `
                  <button type="button" class="boton-cuadrado" data-subir="${i}" aria-label="Subir ${esc(j.nombre)}"${i === 0 ? ' disabled' : ''}>${icono('desplegable', { tam: 14, color: 'var(--texto)', clase: 'girar-180' })}</button>
                  <button type="button" class="boton-cuadrado" data-bajar="${i}" aria-label="Bajar ${esc(j.nombre)}"${i === ids.length - 1 ? ' disabled' : ''}>${icono('desplegable', { tam: 14, color: 'var(--texto)' })}</button>` : ''}
                <button type="button" class="boton-cuadrado" data-quitar="${gid}" aria-label="Quitar ${esc(j.nombre)}">${icono('cerrar', { tam: 14, color: 'var(--peligro)' })}</button>
              </span>
            </li>`;
        }).join('')}</ol>` : `<p class="ajustes-nota">La ${T.uno} está vacía. Añade sus juegos con el buscador de arriba.</p>`}
      </section>`);
  }

  function pintarFinal() {
    const peligro = esCol
      ? { pedir: 'Eliminar colección', texto: '¿Eliminar la colección? Sus juegos vuelven a verse sueltos y se borran las valoraciones de la colección. Las de cada juego no se tocan.', si: 'Sí, eliminar' }
      : { pedir: 'Ocultar saga', texto: '¿Ocultar la saga? Deja de salir en las fichas de sus juegos. Se puede volver a mostrar desde Ajustes → Gestionar grupo.', si: 'Sí, ocultar' };
    pintarHtml($('final'), `
      <section class="edg-bloque edg-final">
        <button type="button" class="boton-secundario neutro" data-accion="fusionar">Fusionar con otra ${T.uno}…</button>
        ${vista.confirmar ? `
          <div class="psn-confirmar" role="group" aria-label="Confirmar">
            <p>${peligro.texto}</p>
            <div class="psn-confirmar-botones">
              <button type="button" class="boton-secundario neutro" data-accion="no">Cancelar</button>
              <button type="button" class="boton-secundario peligro" data-accion="si">${peligro.si}</button>
            </div>
          </div>` : `<button type="button" class="enlace-discreto peligro-texto" data-accion="pedir">${peligro.pedir}</button>`}
      </section>`);
  }

  function pintar() {
    const g = T.obtener(id);
    if (!g || !admin()) {
      pintarHtml($('datos'), !g ? esperaDatos(datos.estadoCarga(), `Esta ${T.uno} ya no existe.`, 'evento-nota edg-vacia') : `<p class="evento-nota edg-vacia">Solo el admin puede editar la ${T.uno}.</p>`);
      for (const r of ['juegos', 'final', 'resultados']) pintarHtml($(r), '');
      return;
    }
    if (!esCol && g.fusionada_en) { location.hash = `#saga/${g.fusionada_en}/editar`; return; }
    document.title = `CVJ · Editar ${g.nombre}`;
    // Lo que se está escribiendo en el nombre no se pisa.
    if (document.activeElement?.id !== 'edg-nombre') pintarDatos(g);
    if (!arrastre) pintarJuegos();
    pintarResultados();
    pintarFinal();
  }

  // ----- Acciones -----------------------------------------------------------------------
  const guardarOrden = (ids) => datos.ordenarColeccion(id, ids, aviso);
  const anio = (gid) => datos.juegoConocido(gid)?.anio ?? 9999;
  const nombreDe = (gid) => datos.juegoConocido(gid)?.nombre ?? '';

  function quitar(gid) {
    const n = nombreDe(gid);
    const r = esCol ? datos.quitarDeColeccionEnLote([gid], aviso) : datos.quitarDeSagaEnLote(id, [gid], aviso);
    avisoDeshacer(`«${n}» quitado`, () => r.deshacer());
  }

  function fusionar() {
    const otras = (esCol ? datos.colecciones() : datos.sagas()).filter((x) => x.id !== id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const g = T.obtener(id);
    abrirHoja({
      titulo: `Fusionar con otra ${T.uno}`,
      antetitulo: g?.nombre ?? '',
      html: `
        <div class="elegir-juegos">
          <p class="ajustes-nota">Los juegos de la otra ${T.uno} pasan ${esCol ? 'al final de esta' : 'a esta'}, que se queda con su nombre${esCol ? ' y su portada' : ''}.</p>
          ${otras.map((x) => `
            <button type="button" class="fila-elegir" data-otra="${esc(x.id)}">
              ${esCol ? portada(datos.comoJuego(x), { clase: 'portada-lista' }) : `<span class="fila-elegir-icono">${icono('saga', { tam: 22, color: 'var(--acento)' })}</span>`}
              <span class="fila-elegir-texto"><strong>${esc(x.nombre)}</strong><small>${T.juegos(x.id).length} juegos</small></span>
            </button>`).join('') || `<p class="ajustes-nota">No hay otras ${esCol ? 'colecciones' : 'sagas'}.</p>`}
        </div>`,
      alMontar(cuerpo, cerrar) {
        cuerpo.addEventListener('click', (e) => {
          const b = e.target.closest('[data-otra]');
          if (!b) return;
          cerrar();
          const otra = T.obtener(b.dataset.otra);
          if (esCol) datos.fusionarColecciones(id, otra.id, aviso); else datos.fusionarSagas(id, otra.id, aviso);
          aviso(`«${otra?.nombre ?? ''}» fusionada en «${g?.nombre ?? ''}»`);
        });
      },
    });
  }

  el.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-accion="atras"]')) { volver(`${T.ruta}${id}`); return; }
    if (!admin()) return;
    const p = t.closest('[data-portada]');
    if (p) { datos.editarColeccion(id, { cover_id: p.dataset.portada }, aviso); return; }
    const sel = t.closest('[data-elegir]');
    if (sel) {
      const c = Number(sel.dataset.elegir);
      if (busq.elegidos.has(c)) busq.elegidos.delete(c); else busq.elegidos.add(c);
      pintarResultados();
      return;
    }
    const o = t.closest('[data-ordenar]');
    if (o) {
      const ids = [...T.juegos(id)];
      ids.sort(o.dataset.ordenar === 'fecha'
        ? (a, b) => anio(a) - anio(b) || nombreDe(a).localeCompare(nombreDe(b), 'es')
        : (a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es', { numeric: true }));
      guardarOrden(ids);
      aviso(o.dataset.ordenar === 'fecha' ? 'Ordenada por fecha de salida' : 'Ordenada por nombre');
      return;
    }
    const sb = t.closest('[data-subir], [data-bajar]');
    if (sb) {
      const ids = [...T.juegos(id)];
      const i = Number(sb.dataset.subir ?? sb.dataset.bajar);
      const j = i + (sb.dataset.subir != null ? -1 : 1);
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      guardarOrden(ids);
      return;
    }
    const q = t.closest('[data-quitar]');
    if (q) { quitar(Number(q.dataset.quitar)); return; }
    const a = t.closest('[data-accion]')?.dataset.accion;
    if (a === 'anadir') {
      const ids = [...busq.elegidos];
      if (!ids.length) return;
      if (esCol) datos.anadirAColeccion(id, ids, aviso); else datos.anadirASaga(id, ids, aviso);
      aviso(ids.length === 1 ? 'Añadido' : `${ids.length} juegos añadidos`);
      busq.elegidos.clear();
      pintarResultados();
    } else if (a === 'fusionar') fusionar();
    else if (a === 'pedir') { vista.confirmar = true; pintarFinal(); }
    else if (a === 'no') { vista.confirmar = false; pintarFinal(); }
    else if (a === 'si') {
      const n = T.obtener(id)?.nombre ?? '';
      if (esCol) { datos.eliminarColeccion(id, aviso); aviso(`Colección «${n}» eliminada`); } else { datos.editarSaga(id, { oculta: true }, aviso); aviso('Saga oculta'); }
      location.hash = '#inicio';
    }
  });

  el.addEventListener('change', (e) => {
    if (e.target.id !== 'edg-nombre') return;
    const v = e.target.value.trim();
    const g = T.obtener(id);
    if (!v || v === g?.nombre) return;
    if (esCol) datos.editarColeccion(id, { nombre: v }, aviso); else datos.editarSaga(id, { nombre: v }, aviso);
    aviso('Nombre guardado');
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'edg-nombre') e.target.blur(); });

  $('q').addEventListener('input', (e) => {
    busq.texto = e.target.value;
    pintarResultados();
    clearTimeout(busq.reloj);
    if (busq.texto.trim().length < 2) { busq.remotos = []; return; }
    busq.reloj = setTimeout(async () => {
      busq.pidiendo?.abort();
      busq.pidiendo = new AbortController();
      try {
        const r = await buscarJuegos(busq.texto.trim(), busq.pidiendo.signal);
        datos.recordarParciales(r);
        busq.remotos = r;
      } catch { /* sin red: quedan los de la app */ }
      busq.pidiendo = null;
      if (el.isConnected) pintarResultados();
    }, 350);
  });

  // ----- Arrastrar para reordenar (colecciones) -------------------------------------
  let arrastre = null;
  let pulsacion = null;
  const BORDE = 90;
  function empezar(li, x, y) {
    const lista = $('lista');
    const filas = [...lista.children];
    const i0 = filas.indexOf(li);
    const r = li.getBoundingClientRect();
    const paso = filas.length > 1 ? Math.abs(filas[1].getBoundingClientRect().top - filas[0].getBoundingClientRect().top) : r.height;
    arrastre = { li, filas, i0, destino: i0, y0: y, scroll0: window.scrollY, paso, yActual: y, reloj: 0 };
    li.classList.add('arrastrando');
    document.body.classList.add('reordenando');
    navigator.vibrate?.(12);
    // Desplazamiento automático cerca de los bordes de la pantalla.
    arrastre.reloj = setInterval(() => {
      if (!arrastre) return;
      const yy = arrastre.yActual;
      if (yy < BORDE) window.scrollBy(0, -Math.ceil((BORDE - yy) / 6));
      else if (yy > window.innerHeight - BORDE) window.scrollBy(0, Math.ceil((yy - (window.innerHeight - BORDE)) / 6));
      mover(yy);
    }, 16);
  }
  function mover(y) {
    if (!arrastre) return;
    const a = arrastre;
    a.yActual = y;
    const dy = y - a.y0 + (window.scrollY - a.scroll0);
    a.li.style.transform = `translateY(${dy}px)`;
    const destino = Math.max(0, Math.min(a.filas.length - 1, a.i0 + Math.round(dy / a.paso)));
    if (destino === a.destino) return;
    a.destino = destino;
    a.filas.forEach((f, k) => {
      if (f === a.li) return;
      let d = 0;
      if (a.i0 < destino && k > a.i0 && k <= destino) d = -a.paso;
      if (a.i0 > destino && k >= destino && k < a.i0) d = a.paso;
      f.style.transform = d ? `translateY(${d}px)` : '';
    });
  }
  function terminar() {
    if (!arrastre) return;
    const a = arrastre;
    clearInterval(a.reloj);
    arrastre = null;
    document.body.classList.remove('reordenando');
    for (const f of a.filas) { f.style.transform = ''; f.classList.remove('arrastrando'); }
    if (a.destino !== a.i0) {
      const ids = a.filas.map((f) => Number(f.dataset.id));
      const [m] = ids.splice(a.i0, 1);
      ids.splice(a.destino, 0, m);
      guardarOrden(ids);
      navigator.vibrate?.(8);
    } else pintarJuegos();
  }
  el.addEventListener('pointerdown', (e) => {
    const asa = e.target.closest('[data-asa]');
    const li = asa?.closest('.edg-juego');
    if (!li || !esCol || e.button > 0) return;
    const desdeTirador = !!e.target.closest('.edg-asa');
    // Ratón o el tirador: al momento. Tocando la portada: mantener pulsado (no estorba al scroll).
    if (e.pointerType === 'mouse' || desdeTirador) {
      e.preventDefault();
      empezar(li, e.clientX, e.clientY);
      return;
    }
    pulsacion = { x: e.clientX, y: e.clientY, reloj: setTimeout(() => { pulsacion = null; empezar(li, e.clientX, e.clientY); }, 300) };
  });
  const alMover = (e) => {
    if (pulsacion && Math.hypot(e.clientX - pulsacion.x, e.clientY - pulsacion.y) > 8) { clearTimeout(pulsacion.reloj); pulsacion = null; }
    if (arrastre) mover(e.clientY);
  };
  window.addEventListener('pointermove', alMover);
  const soltar = () => { if (pulsacion) { clearTimeout(pulsacion.reloj); pulsacion = null; } terminar(); };
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);
  // Mientras se arrastra, la página no se desplaza con el dedo (lo hace el borde).
  const sinScroll = (e) => { if (arrastre && e.cancelable) e.preventDefault(); };
  window.addEventListener('touchmove', sinScroll, { passive: false });

  const quitarSub = datos.suscribir(pintar);
  pintar();
  return () => {
    quitarSub();
    clearTimeout(busq.reloj);
    if (arrastre) clearInterval(arrastre.reloj);
    window.removeEventListener('pointermove', alMover);
    window.removeEventListener('pointerup', soltar);
    window.removeEventListener('pointercancel', soltar);
    window.removeEventListener('touchmove', sinScroll);
  };
}
