// "Revisa tu biblioteca" (#revisar): lo nuevo o dudoso de la última sincronización
// con PlayStation. Por fila: Confirmar / Cambiar juego / Quitar; selección múltiple
// con barra inferior; arriba, las colecciones que se podrían agrupar y las parejas de
// "¿Es el mismo juego?".
import * as datos from '../datos.js';
import * as metricas from '../metricas.js';
import { usuarioActual } from '../sesion.js';
import { esc, portada, cabeceraAtras, estadoVacio, aviso } from '../ui.js';
import { volver } from '../navegacion.js';
import { tarjetaFusion, clicFusion } from '../fusiones.js';
import { textoHoras } from '../metricas.js';

export function render(el) {
  const yo = usuarioActual();
  if (!yo) return;
  const sel = new Set();

  const pintar = () => {
    const bib = metricas.biblioteca(yo.id);
    const items = bib.porRevisar;
    const claves = new Set(items.map((x) => x.clave));
    for (const k of [...sel]) if (!claves.has(k)) sel.delete(k);
    const parejas = metricas.parejasFusion(yo.id).slice(0, 6);
    // Abajo, aparte, los de "relleno" (por debajo del umbral): se pueden mandar todos a Probados.
    const principales = items.filter((x) => !x.probado);
    const relleno = items.filter((x) => x.probado);
    const conPropuesta = items.filter((x) => x.coleccion || x.igdbId != null || x.revision.propuesta);
    const bajas = conPropuesta.filter((x) => !x.revision.seguro).length;
    document.title = 'CVJ · Revisa tu biblioteca';

    el.innerHTML = `
      ${cabeceraAtras('Revisa tu biblioteca', items.length ? `${items.length} ${items.length === 1 ? 'juego' : 'juegos'} por revisar` : 'Todo revisado')}
      <div class="revisar${items.length ? ' con-barra' : ''}">
        ${parejas.map(tarjetaFusion).join('')}
        ${items.length ? `
          ${conPropuesta.length ? `
            <div class="revisar-todas">
              <button type="button" class="boton-principal" data-bloque="todas">Confirmar todas las propuestas (${conPropuesta.length})</button>
              <span class="ajustes-nota">${bajas ? `${bajas} ${bajas === 1 ? 'es' : 'son'} de confianza baja («Revisar»): échales un vistazo antes.` : 'Todas son seguras.'}</span>
            </div>` : ''}
          <div class="revisar-lista">${principales.map((x) => fila(x, sel.has(x.clave))).join('')}</div>
          ${relleno.length ? `
            <div class="revisar-relleno">
              <div class="seccion-cab">
                <h2 class="seccion-titulo">Jugados muy poco (${relleno.length})</h2>
                <button type="button" class="boton-secundario boton-pequeno" data-bloque="probados">Mandar todos a Probados</button>
              </div>
              <p class="ajustes-nota">Por debajo de tu umbral y sin jugar últimamente. En «Probados» no estorban y no se borran.</p>
              <div class="revisar-lista">${relleno.map((x) => fila(x, sel.has(x.clave))).join('')}</div>
            </div>` : ''}`
          : estadoVacio({ icono: 'completado', titulo: 'No hay nada que revisar', texto: 'Cuando sincronices juegos nuevos, aparecerán aquí para que los compruebes.' })}
      </div>
      ${items.length ? `
        <div class="barra-accion">
          ${sel.size
            ? `<button type="button" class="boton-secundario neutro" data-bloque="quitar">Quitar (${sel.size})</button>
               <button type="button" class="boton-principal" data-bloque="confirmar">Confirmar (${sel.size})</button>`
            : `<span class="barra-accion-nota">Marca varios para confirmarlos o quitarlos a la vez.</span>`}
        </div>` : ''}`;
  };

  /** Lo que se confirma de una entrada: lo emparejado, la colección o la propuesta. */
  const aConfirmar = (x) => {
    const tipo = x.coleccion ? 'coleccion' : 'juego';
    const igdbId = x.coleccion ? x.coleccion.id : x.igdbId ?? x.revision.propuesta?.igdb_id ?? null;
    return x.titulos.map((titulo) => ({ titulo, igdbId: igdbId != null ? Number(igdbId) : null, tipo, juegos: x.emp?.juegos ?? null }));
  };
  const porClave = (k) => metricas.biblioteca(yo.id).porRevisar.find((x) => x.clave === k);
  const confirmar = (lista) => {
    const ok = lista.filter((x) => x.coleccion || x.igdbId != null || x.revision.propuesta);
    if (!ok.length) { aviso('Sin propuesta: usa «Cambiar juego» o «Quitar»'); return; }
    datos.confirmarRevision(yo.id, ok.flatMap(aConfirmar), aviso);
    aviso(ok.length === 1 ? 'Confirmado' : `${ok.length} confirmados`);
  };
  const quitar = (lista) => {
    datos.ocultarBiblioteca(yo.id, lista.flatMap((x) => x.titulos), true, aviso);
    aviso(lista.length === 1 ? 'Quitado de tu biblioteca' : `${lista.length} quitados de tu biblioteca`);
  };

  el.addEventListener('change', (e) => {
    const c = e.target.closest('[data-sel]');
    if (!c) return;
    if (c.checked) sel.add(c.dataset.sel); else sel.delete(c.dataset.sel);
    pintar();
  });
  el.addEventListener('click', (e) => {
    if (clicFusion(e, yo.id)) return;
    if (e.target.closest('[data-accion="atras"]')) { volver('#perfil'); return; }
    const b = e.target.closest('[data-confirmar], [data-quitar], [data-bloque]');
    if (!b) return;
    if (b.dataset.confirmar) { const x = porClave(b.dataset.confirmar); if (x) confirmar([x]); return; }
    if (b.dataset.quitar) { const x = porClave(b.dataset.quitar); if (x) quitar([x]); return; }
    const items = metricas.biblioteca(yo.id).porRevisar;
    const elegidos = items.filter((x) => sel.has(x.clave));
    if (b.dataset.bloque === 'confirmar') confirmar(elegidos);
    if (b.dataset.bloque === 'quitar') quitar(elegidos);
    if (b.dataset.bloque === 'todas') confirmar(items);
    if (b.dataset.bloque === 'probados') {
      const relleno = items.filter((x) => x.probado);
      datos.ponerEnMisJuegos(yo.id, relleno.flatMap((x) => x.titulos), false, aviso);
      aviso(`${relleno.length} a Probados`);
    }
    sel.clear();
  });

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}

function fila(x, marcada) {
  const f = x.filas[0];
  const r = x.revision;
  const seguro = r.seguro;
  const horas = textoHoras(x.horasSinc);
  let propuesta;
  if (x.coleccion) {
    const j = x.coleccion.juego ?? x.coleccion.juegos[0];
    propuesta = `
      ${j ? portada(j, { clase: 'portada-lista' }) : '<span class="revisar-sin"></span>'}
      <span class="revisar-nombre"><strong>${esc(x.coleccion.juego?.nombre ?? x.nombre)}</strong><small>Colección · ${x.coleccion.juegos.length} juegos: ${esc(x.coleccion.juegos.map((g) => g.nombre).join(', '))}</small></span>`;
  } else {
    const j = x.juego ?? r.propuesta;
    propuesta = j
      ? `${portada(j, { clase: 'portada-lista' })}<span class="revisar-nombre"><strong>${esc(j.nombre)}</strong><small>${[j.anio, (j.plataformas ?? []).filter((p) => /PS/.test(p)).join(', ')].filter(Boolean).join(' · ')}</small></span>`
      : '<span class="revisar-sin"></span><span class="revisar-nombre"><strong>Sin propuesta</strong><small>No sabemos qué juego es.</small></span>';
  }
  const sinNada = !x.coleccion && !x.juego && !r.propuesta;
  return `
    <div class="revisar-fila${marcada ? ' marcada' : ''}">
      <label class="revisar-check"><input type="checkbox" data-sel="${esc(x.clave)}"${marcada ? ' checked' : ''}><span class="sr">Seleccionar ${esc(f.nombre_psn)}</span></label>
      <div class="revisar-cuerpo">
        <div class="revisar-psn">
          <span class="revisar-img" style="--bloque:var(--superficie-2)">${f.imagen_psn ? `<img src="${esc(f.imagen_psn)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}</span>
          <span class="revisar-nombre"><strong>${esc(f.nombre_psn)}</strong><small>En PlayStation · ${esc(x.plataformas.join(', '))}${horas ? ` · ${horas}` : ''}</small></span>
          <span class="etiqueta-confianza ${seguro ? 'seguro' : 'revisar'}">${seguro ? 'Seguro' : 'Revisar'}</span>
        </div>
        <div class="revisar-propuesta">${propuesta}</div>
        <div class="revisar-acciones">
          ${sinNada ? '' : `<button type="button" class="boton-principal revisar-si" data-confirmar="${esc(x.clave)}">Sí, es este</button>`}
          <a class="boton-secundario neutro boton-pequeno" href="#elegir/${encodeURIComponent(x.psnTitleId)}">${sinNada ? 'Elegir el juego' : 'Cambiar'}</a>
          <button type="button" class="enlace-discreto" data-quitar="${esc(x.clave)}">Quitar</button>
        </div>
      </div>
    </div>`;
}


