// #evento/{id}/editar y #evento/nuevo (solo admin): los datos del evento (título, texto,
// imagen subida o arte de un juego, color, fechas, enlace externo), las categorías (cuáles
// entran: "Incluida" y el atajo "Solo las principales"; peso en la porra; ganador) y sus
// nominados (nombre, detalle y juego de IGDB, por si hay errores). Al final, publicar
// resultados (la porra se cierra y el banner vuelve a salir) y borrar el evento.
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as ev from '../eventos.js';
import { usuarioActual } from '../sesion.js';
import { esc, conservarScroll, aviso } from '../ui.js';
import { volver } from '../navegacion.js';
import { abrirHoja } from '../hoja.js';
import { buscarJuegos, fichaJuego } from '../igdb.js';

const CAMPOS = [
  ['titulo', 'Título', 'text', 80, 'The Game Awards 2026'],
  ['siglas', 'Siglas (para las etiquetas)', 'text', 24, 'TGA 2026'],
  ['texto', 'Texto corto', 'area', 280, 'Qué es y qué hay que hacer'],
  ['inicio', 'Se ve desde', 'fecha'],
  ['fin', 'Se esconde el', 'fecha'],
  ['fecha_clave', 'Fecha y hora clave', 'fecha'],
  ['etiqueta_clave', 'Nombre de la fecha clave', 'text', 40, 'La gala'],
  ['votacion_fin', 'Cierre de la votación oficial (opcional)', 'fecha'],
  ['enlace_url', 'Enlace externo', 'url', 300, 'https://…'],
  ['enlace_texto', 'Texto del enlace', 'text', 40, 'Votar en la web oficial'],
];

// datetime-local ↔ ISO (en la hora de este dispositivo).
const aLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const deLocal = (v) => (v ? new Date(v).toISOString() : null);

export function render(el, { params = [] } = {}) {
  const nuevo = params[0] === 'nuevo';
  const id = nuevo ? null : params[0];
  const abiertas = new Set();

  const pintar = () => {
    // Lo que se está escribiendo no se pierde si llegan datos nuevos.
    const act = document.activeElement;
    const foco = act && el.contains(act) && act.dataset.campo ? { campo: act.dataset.campo, id: act.dataset.id ?? '', valor: act.value } : null;
    conservarScroll(el, () => { el.innerHTML = html(nuevo ? null : datos.evento(id), abiertas); });
    if (foco) {
      const x = el.querySelector(`[data-campo="${CSS.escape(foco.campo)}"][data-id="${CSS.escape(foco.id)}"]`) ?? el.querySelector(`[data-campo="${CSS.escape(foco.campo)}"]:not([data-id])`);
      if (x) { x.value = foco.valor; x.focus(); }
    }
  };

  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-accion="atras"]')) { volver(id ? `#evento/${id}` : '#inicio'); return; }
    const evt = id ? datos.evento(id) : null;
    if (t.closest('[data-crear]')) { crear(el); return; }
    if (t.closest('[data-imagen-juego]')) { elegirJuego((j) => datos.editarEvento('eventos', id, { juego_imagen_id: j.igdb_id, imagen_url: null }, aviso)); return; }
    const fc = t.closest('[data-foco]');
    if (fc && id) {
      // La imagen se ve entera (contain): el punto, en % de la imagen dibujada.
      const im = fc.querySelector('img');
      const r = im.getBoundingClientRect();
      const ratio = im.naturalWidth / im.naturalHeight || r.width / r.height;
      let w = r.width; let h = r.width / ratio;
      if (h > r.height) { h = r.height; w = h * ratio; }
      const x0 = r.left + (r.width - w) / 2; const y0 = r.top + (r.height - h) / 2;
      const fx = Math.round(Math.min(100, Math.max(0, ((e.clientX - x0) / w) * 100)));
      const fy = Math.round(Math.min(100, Math.max(0, ((e.clientY - y0) / h) * 100)));
      datos.editarEvento('eventos', id, { foco_x: fx, foco_y: fy }, aviso);
      return;
    }
    if (t.closest('[data-imagen-quitar]')) { datos.editarEvento('eventos', id, { juego_imagen_id: null, imagen_url: null }, aviso); return; }
    const ab = t.closest('[data-abrir-cat]');
    if (ab) { const c = ab.dataset.abrirCat; if (abiertas.has(c)) abiertas.delete(c); else abiertas.add(c); pintar(); return; }
    if (t.closest('[data-principales]') || t.closest('[data-todas]')) {
      const solo = !!t.closest('[data-principales]');
      const cambios = new Map(datos.categoriasDe(id).map((c) => [c.id, { incluida: solo ? !!c.principal : true }]));
      datos.editarCategorias(cambios, aviso);
      aviso(solo ? `Solo las principales (${[...cambios.values()].filter((x) => x.incluida).length})` : 'Todas incluidas');
      return;
    }
    if (t.closest('[data-nueva-cat]')) {
      const orden = Math.max(-1, ...datos.categoriasDe(id).map((c) => c.orden)) + 1;
      const c = await datos.crearEnEvento('eventosCategorias', { evento_id: id, nombre: 'Nueva categoría', orden }, aviso);
      if (c) { abiertas.add(c.id); pintar(); }
      return;
    }
    const bc = t.closest('[data-borrar-cat]');
    if (bc) {
      const c = datos.categoriaEvento(bc.dataset.borrarCat);
      if (c && confirm(`¿Borrar «${c.nombre}» con sus nominados y lo que haya elegido cada uno?`)) datos.borrarEnEvento('eventosCategorias', c.id, aviso);
      return;
    }
    const nn = t.closest('[data-nuevo-nom]');
    if (nn) {
      const cat = nn.dataset.nuevoNom;
      const orden = Math.max(-1, ...datos.nominadosDe(cat).map((n) => n.orden)) + 1;
      datos.crearEnEvento('eventosNominados', { categoria_id: cat, nombre: 'Nuevo nominado', orden }, aviso);
      return;
    }
    const bn = t.closest('[data-borrar-nom]');
    if (bn) {
      const n = datos.nominado(bn.dataset.borrarNom);
      if (n && confirm(`¿Quitar a «${n.nombre}» de la categoría?`)) datos.borrarEnEvento('eventosNominados', n.id, aviso);
      return;
    }
    const jn = t.closest('[data-juego-nom]');
    if (jn) {
      const nid = jn.dataset.juegoNom;
      elegirJuego((j) => datos.editarEvento('eventosNominados', nid, { juego_id: j.igdb_id }, aviso), datos.nominado(nid)?.nombre);
      return;
    }
    const qj = t.closest('[data-quitar-juego]');
    if (qj) { datos.editarEvento('eventosNominados', qj.dataset.quitarJuego, { juego_id: null }, aviso); return; }
    if (t.closest('[data-publicar]') && evt) {
      const sin = ev.incluidas(id).filter((c) => !c.ganador_id).length;
      if (sin && !confirm(`Faltan ${sin} ${sin === 1 ? 'categoría' : 'categorías'} sin ganador. ¿Publicar igualmente?`)) return;
      datos.editarEvento('eventos', id, { resultados_en: new Date().toISOString(), aviso_version: (evt.aviso_version ?? 1) + 1 }, aviso);
      aviso('Resultados publicados: la porra está cerrada');
      return;
    }
    if (t.closest('[data-retirar]') && evt) { datos.editarEvento('eventos', id, { resultados_en: null }, aviso); return; }
    if (t.closest('[data-borrar-evento]') && evt) {
      if (!confirm(`¿Borrar «${evt.titulo}» entero? Se pierden sus categorías, nominados, votos y pronósticos.`)) return;
      if (await datos.borrarEnEvento('eventos', id, aviso)) { aviso('Evento borrado'); location.hash = '#inicio'; }
    }
  });

  el.addEventListener('change', async (e) => {
    const t = e.target;
    if (!id) return;
    const f = t.dataset.campo;
    if (t.matches('[data-subir]') && t.files?.[0]) { subir(id, t.files[0]); return; }
    if (!f) return;
    const [tabla, campo] = f.split('.');
    const valor = t.type === 'checkbox' ? t.checked
      : t.type === 'datetime-local' ? deLocal(t.value)
        : t.dataset.numero ? Number(t.value)
          : t.value.trim() || null;
    if (tabla === 'eventos') {
      if ((campo === 'titulo' || campo === 'inicio' || campo === 'fin') && !valor) { aviso('Ese campo no puede quedar vacío'); pintar(); return; }
      if (campo === 'enlace_url' && valor && !/^https:\/\//.test(valor)) { aviso('El enlace tiene que empezar por https://'); pintar(); return; }
      datos.editarEvento('eventos', id, { [campo]: valor }, aviso);
    } else if (tabla === 'cat') {
      if (campo === 'nombre' && !valor) { pintar(); return; }
      datos.editarEvento('eventosCategorias', t.dataset.id, { [campo]: campo === 'ganador_id' ? (valor || null) : valor }, aviso);
    } else if (tabla === 'nom') {
      if (campo === 'nombre' && !valor) { pintar(); return; }
      datos.editarEvento('eventosNominados', t.dataset.id, { [campo]: valor }, aviso);
    }
  });

  const quitar = datos.suscribir(pintar);
  pintar();
  return () => quitar();
}

async function crear(el) {
  const v = (n) => el.querySelector(`[data-campo="eventos.${n}"]`)?.value.trim() || null;
  const titulo = v('titulo');
  const fin = deLocal(v('fin'));
  if (!titulo || !fin) { aviso('Pon al menos el título y hasta cuándo se ve'); return; }
  const fila = {
    titulo, siglas: v('siglas'), texto: v('texto'),
    inicio: deLocal(v('inicio')) ?? new Date().toISOString(), fin,
    fecha_clave: deLocal(v('fecha_clave')), etiqueta_clave: v('etiqueta_clave'), votacion_fin: deLocal(v('votacion_fin')),
    enlace_url: v('enlace_url'), enlace_texto: v('enlace_texto'), color: el.querySelector('[data-campo="eventos.color"]')?.value || null,
  };
  if (fila.enlace_url && !/^https:\/\//.test(fila.enlace_url)) { aviso('El enlace tiene que empezar por https://'); return; }
  const e = await datos.crearEnEvento('eventos', fila, aviso);
  if (e) { aviso('Evento creado'); location.hash = `#evento/${e.id}/editar`; }
}

async function subir(id, archivo) {
  if (!/^image\//.test(archivo.type)) { aviso('Tiene que ser una imagen'); return; }
  if (archivo.size > 6 * 1024 * 1024) { aviso('La imagen pasa de 6 MB'); return; }
  aviso('Subiendo la imagen…');
  try {
    const ext = (archivo.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const url = await datos.subirImagenColumna(`eventos/${id}-${Date.now()}.${ext}`, archivo);
    datos.editarEvento('eventos', id, { imagen_url: url, juego_imagen_id: null }, aviso);
    aviso('Imagen puesta');
  } catch {
    aviso('No se ha podido subir la imagen');
  }
}

/** Buscar un juego en IGDB (y guardarlo en la tabla juegos) para un nominado o la imagen. */
function elegirJuego(alElegir, texto = '') {
  abrirHoja({
    titulo: 'Elegir juego',
    html: `
      <div class="elegir-juegos">
        <input class="psn-input" data-ref="q" placeholder="Buscar en IGDB" value="${esc(texto)}" autocomplete="off">
        <ul class="evento-busqueda" data-ref="res"></ul>
      </div>`,
    alMontar(cuerpo, cerrar) {
      const q = cuerpo.querySelector('[data-ref="q"]');
      const res = cuerpo.querySelector('[data-ref="res"]');
      let lista = [];
      let reloj = 0;
      let ctrl = null;
      const buscar = () => {
        clearTimeout(reloj);
        reloj = setTimeout(async () => {
          ctrl?.abort(); ctrl = new AbortController();
          const t = q.value.trim();
          if (t.length < 2) { res.innerHTML = ''; return; }
          res.innerHTML = '<li class="evento-nota">Buscando…</li>';
          try { lista = await buscarJuegos(t, ctrl.signal); } catch { return; }
          res.innerHTML = lista.length
            ? lista.map((j, i) => `<li><button type="button" data-i="${i}"><strong>${esc(j.nombre)}</strong><small>${esc([j.anio, (j.plataformas || []).join(', ')].filter(Boolean).join(' · '))}</small></button></li>`).join('')
            : '<li class="evento-nota">Nada con ese nombre.</li>';
        }, 300);
      };
      q.addEventListener('input', buscar);
      res.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        const j = lista[Number(b.dataset.i)];
        b.disabled = true;
        try { await fichaJuego(j.igdb_id); } catch { /* ya estaba o sin red: se enlaza igual */ }
        await datos.refrescar();
        alElegir(j);
        cerrar(true);
      });
      if (texto) buscar();
      q.focus();
    },
  });
}

function campo([k, etq, tipo, max, ph], e) {
  const v = e?.[k] ?? '';
  const comun = `data-campo="eventos.${k}" id="ev-${k}"`;
  let input;
  if (tipo === 'area') input = `<textarea class="psn-input prop-textarea" ${comun} maxlength="${max}" rows="2" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
  else if (tipo === 'fecha') input = `<input class="psn-input" type="datetime-local" ${comun} value="${esc(aLocal(v))}">`;
  else input = `<input class="psn-input" type="${tipo === 'url' ? 'url' : 'text'}" ${comun} maxlength="${max}" placeholder="${esc(ph)}" value="${esc(v)}" autocomplete="off">`;
  return `<label class="campo-titulo" for="ev-${k}">${esc(etq)}</label>${input}`;
}

function html(e, abiertas) {
  const admin = !!datos.usuario(usuarioActual()?.id)?.es_admin;
  const cab = (titulo) => `
    <header class="cementerio-cab">
      <button type="button" class="boton-cuadrado" data-accion="atras" aria-label="Volver">${icono('atras', { tam: 20, color: 'var(--texto)' })}</button>
      <div class="cementerio-cab-texto"><h1 class="cementerio-titulo evento-editar-titulo">${esc(titulo)}</h1></div>
    </header>`;
  if (!admin) return `<section class="evento-editar">${cab('Eventos')}<p class="evento-nota">Solo el admin puede editar eventos.</p></section>`;
  if (e === null && !location.hash.includes('nuevo')) return `<section class="evento-editar">${cab('Evento')}<p class="evento-nota">${datos.datosFrescos() ? 'Este evento ya no existe.' : 'Cargando…'}</p></section>`;
  document.title = 'CVJ · Editar evento';
  const img = e ? ev.imagenDe(e) : null;
  const cats = e ? datos.categoriasDe(e.id) : [];
  const nIncl = cats.filter((c) => c.incluida !== false).length;
  return `
    <section class="evento-editar">
      ${cab(e ? e.titulo : 'Nuevo evento')}
      <section class="ajustes-bloque evento-form">
        ${CAMPOS.map((c) => campo(c, e)).join('')}
        <label class="campo-titulo" for="ev-color">Color</label>
        <input id="ev-color" class="evento-color" type="color" data-campo="eventos.color" value="${esc(e?.color || '#6D28D9')}">
        ${e ? `
          <span class="campo-titulo">Imagen</span>
          <div class="evento-imagen" style="--evento:${esc(ev.colorDe(e))}"${img ? ' data-foco' : ''}>${img ? `<img src="${esc(img)}" alt="" crossorigin="anonymous"><span class="evento-foco" style="left:${Number(e.foco_x ?? 50)}%;top:${Number(e.foco_y ?? 50)}%" aria-hidden="true"></span>` : '<span>Sin imagen: se usa el color</span>'}</div>
          ${img ? '<p class="evento-nota">Toca en la imagen lo importante (caras, el título...): será el centro del recorte en todos los tamaños.</p>' : ''}
          <div class="fila-botones">
            <label class="boton-secundario boton-pequeno">Subir imagen<input type="file" accept="image/*" data-subir hidden></label>
            <button type="button" class="boton-secundario neutro boton-pequeno" data-imagen-juego>Arte de un juego</button>
          </div>
          ${img ? '<button type="button" class="enlace-discreto" data-imagen-quitar>Quitar la imagen</button>' : ''}
          <p class="evento-nota">Los cambios se guardan solos.</p>`
          : '<button type="button" class="boton-principal" data-crear>Crear evento</button>'}
      </section>
      ${e ? `
        <section class="ajustes-bloque">
          <span class="campo-titulo">Categorías · ${nIncl} de ${cats.length} incluidas</span>
          <p class="evento-nota">Las que no estén incluidas no salen en la página, ni en Mi voto, Mi pronóstico, la chuleta o la porra (lo elegido se guarda por si vuelven).</p>
          <div class="fila-botones">
            <button type="button" class="boton-secundario boton-pequeno" data-principales>Solo las principales</button>
            <button type="button" class="boton-secundario neutro boton-pequeno" data-todas>Todas</button>
          </div>
          <div class="evento-ed-cats">${cats.map((c) => categoriaEd(c, abiertas.has(c.id))).join('')}</div>
          <button type="button" class="boton-secundario con-icono" data-nueva-cat>${icono('mas', { tam: 18, color: 'currentColor' })}<span>Añadir categoría</span></button>
        </section>
        <section class="ajustes-bloque">
          <span class="campo-titulo">Resultados</span>
          ${e.resultados_en
            ? `<p class="evento-nota">Publicados ${esc(ev.fechaHora(e.resultados_en))}. La porra está cerrada y en la actividad.</p>
               <button type="button" class="boton-secundario neutro" data-retirar>Retirar los resultados</button>`
            : `<p class="evento-nota">Marca el ganador de cada categoría (en su desplegable) y publica. El banner volverá a salir a todos con la porra.</p>
               <button type="button" class="boton-principal" data-publicar>Publicar resultados</button>`}
          <button type="button" class="enlace-discreto peligro-texto" data-borrar-evento>Borrar el evento</button>
        </section>` : ''}
    </section>`;
}

function categoriaEd(c, abierta) {
  const noms = datos.nominadosDe(c.id);
  const ganador = c.ganador_id ? datos.nominado(c.ganador_id) : null;
  return `
    <div class="evento-ed-cat${c.incluida === false ? ' fuera' : ''}">
      <div class="evento-ed-cat-cab">
        <label class="interruptor" title="Incluida">
          <input type="checkbox" data-campo="cat.incluida" data-id="${esc(c.id)}" aria-label="Incluida: ${esc(c.nombre)}"${c.incluida !== false ? ' checked' : ''}>
        </label>
        <button type="button" class="evento-ed-cat-nombre" data-abrir-cat="${esc(c.id)}" aria-expanded="${abierta}">
          <strong>${esc(c.nombre)}</strong>
          <small>${noms.length} ${noms.length === 1 ? 'nominado' : 'nominados'}${c.principal ? ' · principal' : ''}${(c.peso ?? 1) > 1 ? ` · ×${c.peso}` : ''}${ganador ? ` · gana ${esc(ganador.nombre)}` : ''}</small>
        </button>
        ${icono('desplegable', { tam: 12, color: 'var(--texto-2)', clase: abierta ? 'girar-180' : '' })}
      </div>
      ${abierta ? `
        <div class="evento-ed-cat-cuerpo">
          <label class="campo-titulo" for="cn-${esc(c.id)}">Nombre</label>
          <input id="cn-${esc(c.id)}" class="psn-input" data-campo="cat.nombre" data-id="${esc(c.id)}" maxlength="80" value="${esc(c.nombre)}">
          <div class="evento-ed-fila">
            <label><span class="campo-titulo">Tipo</span>
              <select class="psn-input" data-campo="cat.tipo" data-id="${esc(c.id)}">
                <option value="juegos"${c.tipo === 'juegos' ? ' selected' : ''}>Juegos</option>
                <option value="texto"${c.tipo === 'texto' ? ' selected' : ''}>Texto (personas, series…)</option>
              </select></label>
            <label><span class="campo-titulo">Peso en la porra</span>
              <select class="psn-input" data-campo="cat.peso" data-id="${esc(c.id)}" data-numero="1">
                ${[1, 2, 3].map((p) => `<option value="${p}"${(c.peso ?? 1) === p ? ' selected' : ''}>×${p}</option>`).join('')}
              </select></label>
          </div>
          <label class="evento-ed-check"><input type="checkbox" data-campo="cat.principal" data-id="${esc(c.id)}"${c.principal ? ' checked' : ''}> Principal (entra en "Solo las principales")</label>
          <label><span class="campo-titulo">Ganador</span>
            <select class="psn-input" data-campo="cat.ganador_id" data-id="${esc(c.id)}">
              <option value="">Sin decidir</option>
              ${noms.map((n) => `<option value="${esc(n.id)}"${c.ganador_id === n.id ? ' selected' : ''}>${esc(n.nombre)}</option>`).join('')}
            </select></label>
          <span class="campo-titulo">Nominados (en el orden de la web oficial)</span>
          <ul class="evento-ed-noms">
            ${noms.map((n) => {
              const j = n.juego_id ? datos.juegoConocido(n.juego_id) : null;
              return `
                <li>
                  <input class="psn-input" data-campo="nom.nombre" data-id="${esc(n.id)}" maxlength="120" value="${esc(n.nombre)}" aria-label="Nombre">
                  <input class="psn-input" data-campo="nom.detalle" data-id="${esc(n.id)}" maxlength="120" value="${esc(n.detalle ?? '')}" placeholder="Detalle (opcional)" aria-label="Detalle">
                  <div class="evento-ed-nom-juego">
                    ${c.tipo === 'juegos' ? (j
                      ? `<span>${icono('hecho', { tam: 14, color: 'currentColor' })} ${esc(j.nombre)}${j.anio ? ` (${esc(j.anio)})` : ''}</span><button type="button" class="enlace-discreto" data-juego-nom="${esc(n.id)}">Cambiar</button><button type="button" class="enlace-discreto" data-quitar-juego="${esc(n.id)}">Quitar</button>`
                      : `<span class="evento-aviso">Sin juego enlazado</span><button type="button" class="enlace-discreto" data-juego-nom="${esc(n.id)}">Enlazar juego</button>`) : ''}
                    <button type="button" class="enlace-discreto peligro-texto" data-borrar-nom="${esc(n.id)}">Quitar</button>
                  </div>
                </li>`;
            }).join('')}
          </ul>
          <div class="fila-botones">
            <button type="button" class="boton-secundario boton-pequeno" data-nuevo-nom="${esc(c.id)}">Añadir nominado</button>
            <button type="button" class="boton-secundario peligro boton-pequeno" data-borrar-cat="${esc(c.id)}">Borrar categoría</button>
          </div>
        </div>` : ''}
    </div>`;
}
