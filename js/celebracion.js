// "¡Completado!": cuando alguien acaba un juego que tenía en Jugando de verdad (lo decide
// datos.guardarValoracion al guardar: actividad.celebrar), los demás lo ven UNA vez al entrar
// en Inicio o en su perfil, aunque sea días después. Una animación corta con la portada y el
// color de acento; se toca para pasar. Si hay varias se encadenan; con más de tres, juntas.
import * as datos from './datos.js';
import { usuarioActual } from './sesion.js';
import { esc, portada, avatar } from './ui.js';

const DIAS = 21;          // más antiguas ya no se celebran
const DURACION_MS = 3400;
const MAX_SEGUIDAS = 3;
let mostrando = false;

/** Las celebraciones que me quedan por ver (de otros), de la más antigua a la más nueva. */
export function pendientes(deUsuario = null) {
  const yo = usuarioActual();
  if (!yo || !Array.isArray(datos.estado.celebracionesVistas)) return [];
  const vistas = new Set(datos.estado.celebracionesVistas.filter((x) => x.usuario_id === yo.id).map((x) => x.actividad_id));
  const limite = Date.now() - DIAS * 86400000;
  const unicas = new Map(); // una por persona y juego
  for (const a of datos.estado.actividad ?? []) {
    if (!a.celebrar || a.tipo !== 'completo' || a.usuario_id === yo.id || vistas.has(a.id)) continue;
    if (deUsuario && a.usuario_id !== deUsuario) continue;
    if (new Date(a.creado_en).getTime() < limite) continue;
    const u = datos.usuario(a.usuario_id);
    const j = datos.juegoConocido(a.juego_id);
    if (!u || u.activo === false || !j) continue;
    const k = `${a.usuario_id}:${datos.canonico(a.juego_id)}`;
    if (!unicas.has(k) || unicas.get(k).a.creado_en < a.creado_en) unicas.set(k, { a, u, j });
  }
  return [...unicas.values()].sort((x, y) => x.a.creado_en.localeCompare(y.a.creado_en));
}

const tarjeta = ({ a, u, j }) => `
  <div class="celebra-portada">
    <span class="celebra-halo" aria-hidden="true"></span>
    ${portada(j, { clase: 'portada-ficha', prioridad: true })}
    <span class="celebra-brillo" aria-hidden="true"></span>
    <span class="celebra-sello" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24"><path d="M5.5 12.5l4.2 4.2L18.5 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
  </div>
  <div class="celebra-texto">
    <span class="celebra-quien">${avatar(u, 28)}<span><strong>${esc(u.nombre)}</strong> ha completado${a.vuelta > 1 ? ' otra vez' : ''}</span></span>
    <strong class="celebra-juego">${esc(j.nombre)}</strong>
  </div>`;

const grupo = (lista) => `
  <div class="celebra-pila">
    ${lista.slice(0, 5).map(({ j }, i) => `<span style="--i:${i}">${portada(j, { clase: 'portada-jugando', prioridad: true })}</span>`).join('')}
  </div>
  <div class="celebra-texto">
    <strong class="celebra-juego">${lista.length} juegos completados</strong>
    <ul class="celebra-lista">${lista.slice(0, 6).map(({ u, j }) => `<li><strong>${esc(u.nombre)}</strong> · ${esc(j.nombre)}</li>`).join('')}${lista.length > 6 ? `<li>y ${lista.length - 6} más</li>` : ''}</ul>
  </div>`;

/**
 * Enseña las celebraciones pendientes (todas, o solo las de un usuario si se está en su
 * perfil). Solo con datos del servidor ya llegados, y nunca encima de una hoja.
 */
export function revisarCelebraciones(deUsuario = null) {
  if (mostrando || !datos.datosFrescos() || document.body.classList.contains('hoja-abierta')) return;
  const lista = pendientes(deUsuario);
  if (!lista.length) return;
  const yo = usuarioActual();
  mostrando = true;
  // Vistas desde ya (aunque se cierre la app a media animación, no se repiten).
  datos.marcarCelebracionesVistas(yo.id, lista.map((x) => x.a.id));

  const pasos = lista.length > MAX_SEGUIDAS ? [grupo(lista)] : lista.map(tarjeta);
  const capa = document.createElement('div');
  capa.className = 'celebra';
  capa.setAttribute('role', 'status');
  capa.innerHTML = `<div class="celebra-fondo"></div><div class="celebra-escena"></div>${pasos.length > 1 ? `<div class="celebra-puntos">${pasos.map(() => '<i></i>').join('')}</div>` : ''}<span class="celebra-pista">Toca para seguir</span>`;
  document.body.appendChild(capa);
  document.body.classList.add('celebrando');
  const escena = capa.querySelector('.celebra-escena');
  let i = -1;
  let reloj = null;
  const cerrar = () => {
    clearTimeout(reloj);
    capa.classList.add('saliendo');
    document.body.classList.remove('celebrando');
    document.removeEventListener('keydown', alTeclado);
    setTimeout(() => { capa.remove(); mostrando = false; }, 220);
  };
  const siguiente = () => {
    clearTimeout(reloj);
    i += 1;
    if (i >= pasos.length) { cerrar(); return; }
    escena.innerHTML = `<div class="celebra-paso">${pasos[i]}</div>`;
    capa.querySelectorAll('.celebra-puntos i').forEach((p, k) => p.classList.toggle('activo', k === i));
    reloj = setTimeout(siguiente, lista.length > MAX_SEGUIDAS ? DURACION_MS + 1800 : DURACION_MS);
  };
  const alTeclado = (e) => { if (e.key === 'Escape') cerrar(); else if (e.key === 'Enter' || e.key === ' ') siguiente(); };
  capa.addEventListener('click', siguiente);
  document.addEventListener('keydown', alTeclado);
  requestAnimationFrame(() => { capa.classList.add('visible'); siguiente(); });
}
