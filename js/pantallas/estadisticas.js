// Pantalla 09 · Estadísticas de un usuario (#estadisticas/{id}).
import { icono } from '../icons.js';
import * as datos from '../datos.js';
import * as metricas from '../metricas.js';
import { usuarioActual } from '../sesion.js';
import { LETRAS, formatearNota } from '../notas.js';
import { esc, avatar, chipLetra, cabeceraAtras, estadoVacio } from '../ui.js';
import { volver, rutaPerfil, reemplazarRuta } from '../navegacion.js';
import { textoHoras } from '../metricas.js';

const ALTO_BARRA = 80;

export function render(el, { params }) {
  const id = params[0] || usuarioActual()?.id;

  const pintar = () => {
    const u = datos.usuario(id);
    const todos = metricas.usuarios();
    if (!u) {
      el.innerHTML = `${cabeceraAtras('Estadísticas')}${estadoVacio({ icono: 'perfil', titulo: 'Este perfil no existe', texto: 'Puede que esa persona ya no esté en el grupo.' })}`;
      return;
    }
    document.title = `CVJ · Estadísticas de ${u.nombre}`;
    const s = metricas.estadisticas(id);
    const bib = metricas.biblioteca(id);
    const maxTier = Math.max(1, ...Object.values(s.reparto));
    const maxPlat = Math.max(1, ...s.plataformas.map((x) => x.n));
    const vsGrupo = s.vsGrupo === null ? '' : ` · ${s.vsGrupo > 0 ? '+' : s.vsGrupo < 0 ? '−' : '±'}${Math.abs(s.vsGrupo).toFixed(1)} vs grupo`;

    el.innerHTML = `
      ${cabeceraAtras('Estadísticas')}
      <div class="chips-usuarios" role="tablist" aria-label="Usuario" data-scroll="usuarios">
        ${todos.map((x) => `
          <button type="button" role="tab" class="chip-usuario${x.id === id ? ' activo' : ''}" aria-selected="${x.id === id}" data-usuario="${esc(x.id)}">
            ${avatar(x, 30)}<span>${esc(x.nombre)}</span>
          </button>`).join('')}
      </div>

      <section class="stats-seccion">
        <h2 class="stats-titulo">Juegos</h2>
        <div class="tarjetas-3">
          ${dato(s.jugados, 'Jugados')}
          ${dato(s.completados, 'Completados')}
          ${dato(s.abandonados, 'Abandonados')}
          ${dato(s.jugando, 'Jugando')}
          ${dato(s.pendientes, 'Pendientes')}
          ${dato(bib.total || (u.psn_account_id ? 0 : null), 'En biblioteca')}
        </div>
      </section>

      <section class="stats-seccion">
        <h2 class="stats-titulo">Notas</h2>
        <div class="tarjetas-2">
          <div class="tarjeta-dato grande">
            ${s.media !== null
              ? `<span class="dato-num grande con-letra">${formatearNota(s.media)}${chipLetra(s.letra, 'md')}</span>`
              : '<span class="dato-num grande apagado">—</span>'}
            <span class="dato-etq">Nota media${esc(vsGrupo)}</span>
          </div>
          <div class="tarjeta-dato grande">
            ${s.recomendacion.total
              ? `<span class="dato-num grande con-letra">${icono('recomendado', { tam: 22, color: 'var(--acento)', trazo: 'var(--superficie)', grosor: 2.4 })}${s.recomendacion.si}<span class="dato-de">/${s.recomendacion.total}</span></span>
                 <span class="dato-etq">Juegos que recomienda · ${s.recomendacion.porcentaje}%</span>`
              : `<span class="dato-num grande apagado">—</span>
                 <span class="dato-etq">Aún no ha dicho si recomienda alguno</span>`}
          </div>
        </div>
        <div class="tarjeta-reparto">
          <span class="reparto-titulo">Reparto por tier</span>
          <div class="reparto-grande">
            ${LETRAS.map((l) => {
              const k = s.reparto[l];
              const alto = k ? Math.max(10, Math.round((k / maxTier) * ALTO_BARRA)) : 3;
              return `
                <div class="reparto-grande-col">
                  <span class="reparto-grande-n">${k}</span>
                  <div class="reparto-barra${k ? '' : ' vacia'}" data-tier="${l}" style="height:${alto}px;border-radius:6px"></div>
                  <span class="reparto-grande-l">${l}</span>
                </div>`;
            }).join('')}
          </div>
        </div>
      </section>

      <section class="stats-seccion">
        <h2 class="stats-titulo">Plataformas</h2>
        <span class="stats-nota">Según la plataforma indicada al valorar</span>
        ${s.plataformas.length
          ? `<div class="barras-plataforma">${s.plataformas.map((x) => `
              <div class="barra-plataforma">
                <span class="barra-plataforma-nombre">${esc(x.nombre)}</span>
                <div class="barra-plataforma-pista"><div style="width:${Math.max(4, Math.round((x.n / maxPlat) * 100))}%"></div></div>
                <span class="barra-plataforma-n">${x.n}</span>
              </div>`).join('')}</div>`
          : '<p class="stats-vacio">Todavía no hay plataformas indicadas.</p>'}
      </section>

      <section class="stats-seccion">
        <h2 class="stats-titulo">Tiempo de juego</h2>
        ${tiempoDeJuego(u, bib, metricas.tiempo(id))}
      </section>`;

    // Que el chip activo se vea aunque haya muchos usuarios.
    el.querySelector('.chip-usuario.activo')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };

  el.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-usuario]');
    if (chip && chip.dataset.usuario !== id) {
      reemplazarRuta(`#estadisticas/${chip.dataset.usuario}`);
      return;
    }
    if (e.target.closest('[data-accion="atras"]')) volver(rutaPerfil(id));
  });

  const desuscribir = datos.suscribir(pintar);
  pintar();
  return desuscribir;
}

/** Horas totales (PSN y las puestas a mano), top 5 por horas y PS4 frente a PS5. */
function tiempoDeJuego(u, bib, t) {
  if (!t.total) {
    return `
      <div class="caja-punteada">
        ${icono('pendiente', { tam: 18, color: 'var(--texto-2)', trazo: 'var(--fondo)' })}
        <span>${u.psn_account_id
          ? 'PlayStation está conectada, pero aún no hay juegos sincronizados.'
          : 'Las horas aparecerán aquí cuando se conecte PlayStation o se escriban al valorar.'}</span>
      </div>`;
  }
  const max = Math.max(1, ...t.top.map((x) => x.horas));
  const totalPlat = bib.porPlataforma.PS4 + bib.porPlataforma.PS5;
  return `
    <div class="tarjeta-dato grande">
      <span class="dato-num grande">${t.total}<span class="dato-de"> h</span></span>
      <span class="dato-etq">jugadas${bib.total ? ` · ${bib.total} ${bib.total === 1 ? 'juego' : 'juegos'} en PlayStation` : ''}</span>
    </div>
    ${t.top.length ? `
      <span class="stats-nota">Los más jugados</span>
      <div class="barras-plataforma barras-horas">
        ${t.top.map((x) => `
          <div class="barra-plataforma">
            <span class="barra-plataforma-nombre largo" title="${esc(x.nombre)}">${esc(x.nombre)}</span>
            <div class="barra-plataforma-pista"><div style="width:${Math.max(4, Math.round((x.horas / max) * 100))}%"></div></div>
            <span class="barra-plataforma-n ancho">${textoHoras(x.horas)}</span>
          </div>`).join('')}
      </div>` : ''}
    ${totalPlat > 0 && bib.porPlataforma.PS4 > 0 && bib.porPlataforma.PS5 > 0 ? `
      <span class="stats-nota">PS5 frente a PS4</span>
      <div class="reparto-plataformas" role="img" aria-label="PS5 ${bib.porPlataforma.PS5} horas, PS4 ${bib.porPlataforma.PS4} horas">
        <div class="reparto-plataformas-barra">
          <div style="width:${Math.round((bib.porPlataforma.PS5 / totalPlat) * 100)}%"></div>
        </div>
        <div class="reparto-plataformas-pie"><span><strong>PS5</strong> ${bib.porPlataforma.PS5} h</span><span><strong>PS4</strong> ${bib.porPlataforma.PS4} h</span></div>
      </div>` : ''}`;
}

function dato(n, etiqueta) {
  return `
    <div class="tarjeta-dato">
      <span class="dato-num${n === null ? ' apagado' : ''}">${n === null ? '—' : n}</span>
      <span class="dato-etq">${etiqueta}</span>
    </div>`;
}
