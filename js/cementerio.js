// El cementerio: vidas y muertes de cada uno (tabla vidas, migración 036), récords,
// reanimaciones en curso, textos (con humor negro, pero con gusto) y las piezas que salen
// fuera de su pantalla: el acceso de Inicio, los avisos de reanimación y las filas de la
// actividad. La pantalla está en js/pantallas/cementerio.js.
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { icono } from './icons.js';
import { esc, avatar, tiempoRelativo, aviso } from './ui.js';
import { usuarioActual } from './sesion.js';
import { llamarAdmin } from './admin-api.js';

export const DICTADOR = 'El Dictador';
const MIN = 60000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' });
const FECHA_HORA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
export const fecha = (f) => (f ? FECHA.format(new Date(f)).replace('.', '') : '');
export const fechaHora = (f) => (f ? FECHA_HORA.format(new Date(f)).replace('.', '') : '');

const esAdmin = (id) => !!datos.usuario(id)?.es_admin;
/** El admin firma como "El Dictador" en el cementerio. */
export const nombreAutor = (id) => (!id ? 'El sistema' : esAdmin(id) ? DICTADOR : datos.usuario(id)?.nombre ?? 'Alguien');
export const soyAdmin = () => esAdmin(usuarioActual()?.id);

// ---------------------------------------------------------------------------
// Vidas
// ---------------------------------------------------------------------------
let memo = { version: -1, porUsuario: new Map() };

/**
 * La historia de alguien: sus vidas (desde, hasta, causa, quién lo echó), cuántas veces ha
 * muerto y cómo está ahora. Sin eventos (migración sin aplicar), lo que diga usuarios.
 * → { vidas: [{ desde, hasta, causa, autorId, exorcismo, reanimadoPor }], muertes, muerto,
 *     exorcizado, exorcismo: evento|null, ultima: vida|null }
 */
export function historia(uid) {
  const v = datos.versionDatos();
  if (memo.version !== v) memo = { version: v, porUsuario: new Map() };
  if (memo.porUsuario.has(uid)) return memo.porUsuario.get(uid);
  const u = datos.usuario(uid);
  const eventos = datos.vidasDe(uid).slice().sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || orden(a) - orden(b));
  const vidas = [];
  let vivo = false;
  let actual = null;
  let exorcismo = null;
  const nacer = (desde, reanimadoPor = null) => { vivo = true; actual = { desde, hasta: null, causa: null, autorId: null, exorcismo: false, reanimadoPor }; };
  if (!eventos.some((e) => e.tipo === 'alta') && u?.creado_en) nacer(u.creado_en);
  for (const e of eventos) {
    if (e.tipo === 'alta' && !vivo && !vidas.length) nacer(e.fecha);
    else if (e.tipo === 'reanimacion' && !vivo) nacer(e.fecha, e.autor_id);
    else if ((e.tipo === 'expulsion' || e.tipo === 'exorcismo') && vivo) {
      Object.assign(actual, { hasta: e.fecha, causa: e.causa ?? null, autorId: e.autor_id, exorcismo: e.tipo === 'exorcismo' });
      vidas.push(actual);
      vivo = false;
      actual = null;
    }
    if (e.tipo === 'exorcismo') exorcismo = e;
    if (e.tipo === 'exorcismo_levantado') exorcismo = null;
  }
  if (actual) vidas.push(actual);
  const muertas = vidas.filter((x) => x.hasta);
  // Si los eventos y la tabla de usuarios no cuadran, manda usuarios (es lo que vale para entrar).
  const muerto = u ? u.activo === false : !vivo;
  const r = {
    vidas,
    muertes: Math.max(muertas.length, muerto ? 1 : 0),
    muerto,
    exorcizado: muerto && (u?.exorcizado === true || (!!exorcismo && u?.exorcizado !== false)),
    exorcismo,
    ultima: muertas[muertas.length - 1] ?? null,
  };
  memo.porUsuario.set(uid, r);
  return r;
}
// Mismo instante: primero se nace y luego se muere (y se pide antes de volver).
const ORDEN = { alta: 0, reanimacion_pedida: 1, veto: 2, reanimacion: 3, expulsion: 4, exorcismo: 5, exorcismo_levantado: 6 };
const orden = (e) => ORDEN[e.tipo] ?? 9;

/** Los difuntos: los que están fuera ahora, el último en caer primero. */
export function difuntos() {
  return datos.estado.usuarios
    .filter((u) => u.activo === false)
    .map((u) => ({ u, h: historia(u.id) }))
    .sort((a, b) => new Date(b.h.ultima?.hasta ?? 0) - new Date(a.h.ultima?.hasta ?? 0));
}

/** "Sobrevivió 5 h 3 min" (menos de un día) o "Aguantó 12 días". */
export function duracion(desde, hasta) {
  if (!desde || !hasta) return '';
  const ms = Math.max(0, new Date(hasta) - new Date(desde));
  if (ms < DIA) {
    const h = Math.floor(ms / HORA);
    const m = Math.floor((ms % HORA) / MIN);
    if (!h) return `Sobrevivió ${Math.max(1, m)} min`;
    return `Sobrevivió ${h} h${m ? ` ${m} min` : ''}`;
  }
  const d = Math.floor(ms / DIA);
  return `Aguantó ${d} ${d === 1 ? 'día' : 'días'}`;
}
/** "5 h 3 min" / "12 días", sin verbo (récords). */
export const duracionCorta = (desde, hasta) => duracion(desde, hasta).replace(/^(Sobrevivió|Aguantó) /, '');

/** Récords: el que menos duró, el que más y el que más veces ha muerto (vivos incluidos). */
export function records() {
  const todas = [];
  let masMuertes = null;
  for (const u of datos.estado.usuarios) {
    const h = historia(u.id);
    for (const x of h.vidas) if (x.hasta) todas.push({ u, x, ms: new Date(x.hasta) - new Date(x.desde) });
    if (h.muertes >= 2 && (!masMuertes || h.muertes > masMuertes.n)) masMuertes = { u, n: h.muertes };
  }
  if (!todas.length) return null;
  todas.sort((a, b) => a.ms - b.ms);
  return { corta: todas[0], larga: todas.length > 1 ? todas[todas.length - 1] : null, masMuertes };
}

/** Su legado: juegos valorados, nota media y horas. */
export function legado(uid) {
  const p = metricas.perfil(uid);
  const t = metricas.tiempo(uid);
  return { juegos: p.jugados, media: p.media, letra: p.letra, horas: t.total ?? 0, completados: p.completados };
}

/** Sus últimas palabras: la última reseña con texto. */
export function ultimasPalabras(uid) {
  const conTexto = [
    ...(datos.estado.valoraciones ?? []).filter((v) => v.usuario_id === uid && v.resena?.trim()).map((v) => ({ v, j: datos.juegoConocido(v.juego_id) })),
    ...(datos.estado.valColecciones ?? []).filter((v) => v.usuario_id === uid && v.resena?.trim()).map((v) => ({ v, j: datos.comoJuego(datos.coleccion(v.coleccion_id)) })),
  ].filter((x) => x.j);
  conTexto.sort((a, b) => new Date(b.v.actualizado_en ?? b.v.creado_en) - new Date(a.v.actualizado_en ?? a.v.creado_en));
  return conTexto[0] ?? null;
}

// Epitafios: según lo que dejó. Siempre el mismo para cada uno (no cambia al repintar).
const EPITAFIOS = [
  'Valoró poco, opinó menos.',
  'Prometió completar la saga. Mintió.',
  'Se fue como juegan algunos: sin guardar la partida.',
  'Nunca le dio a «Continuar».',
  'Su backlog le sobrevivió.',
  'Le pilló el jefe final sin pociones.',
  'Pulsó «Salir sin guardar». Para siempre.',
  'Murió como vivió: en pendientes.',
];
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
export function epitafio(u, h, l) {
  const vida = h.ultima;
  const ms = vida ? new Date(vida.hasta) - new Date(vida.desde) : null;
  if (h.exorcizado) return 'Ni la muerte lo quiso de vuelta.';
  if (h.muertes >= 3) return 'Tiene más vidas que un gato. Y las gasta igual de rápido.';
  if (ms != null && ms < DIA) return 'No le dio tiempo ni a deshacer la maleta.';
  if (!l.juegos) return 'No dejó ni una nota. Ni de despedida.';
  if (l.media != null && l.media < 5) return 'Lo puntuaba todo como si le debieran dinero.';
  if (l.media != null && l.media >= 8.5) return 'Todo le parecía una obra maestra. Hasta esto.';
  if (l.juegos && !l.completados) return 'No completó nada. Tampoco su estancia aquí.';
  return EPITAFIOS[hash(u.id) % EPITAFIOS.length];
}

// ---------------------------------------------------------------------------
// Reanimaciones
// ---------------------------------------------------------------------------
/** "11 h 20 min" o "35 min" hasta que acabe. */
export function queda(r, ahora = Date.now()) {
  const total = Math.max(1, Math.ceil(Math.max(0, new Date(r.termina_en) - ahora) / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
/** Solo las horas ("quedan 11 h"), para el aviso de Inicio. */
export function quedaHoras(r, ahora = Date.now()) {
  const ms = Math.max(0, new Date(r.termina_en) - ahora);
  return ms < HORA ? `${Math.max(1, Math.ceil(ms / MIN))} min` : `${Math.ceil(ms / HORA)} h`;
}
export const progreso = (r, ahora = Date.now()) => {
  const t0 = new Date(r.respondida_en ?? r.empieza_en).getTime();
  const t1 = new Date(r.termina_en).getTime();
  return Math.min(1, Math.max(0, (ahora - t0) / Math.max(1, t1 - t0)));
};

/** Mi último intento con este difunto, si fue hace menos de 7 días: hasta cuándo espero. */
export function esperaDe(autorId, difuntoId, ahora = Date.now()) {
  const mios = (datos.estado.reanimaciones ?? []).filter((r) => r.autor_id === autorId && r.difunto_id === difuntoId);
  if (!mios.length) return null;
  const ultima = Math.max(...mios.map((r) => new Date(r.empieza_en).getTime()));
  const hasta = ultima + 7 * DIA;
  return hasta > ahora ? new Date(hasta).toISOString() : null;
}

/** Vetar o permitir ya (solo admin). */
export async function resolver(r, accion) {
  const d = datos.usuario(r.difunto_id);
  const res = await llamarAdmin(accion, { reanimacion_id: r.id });
  if (!res.ok) { aviso(res.error ?? 'No se ha podido'); return false; }
  await datos.refrescar();
  aviso(accion === 'vetar' ? `${d?.nombre ?? 'El difunto'} sigue bajo tierra` : `${d?.nombre ?? 'El difunto'} ha vuelto de entre los muertos`);
  return true;
}

// ---------------------------------------------------------------------------
// Fuera del cementerio: acceso de Inicio y avisos
// ---------------------------------------------------------------------------
/** Al final de "El grupo": la lápida con el número de difuntos. */
export function accesoGrupo() {
  const n = difuntos().length;
  if (!n) return '';
  return `
    <a class="el-grupo-persona el-grupo-cementerio" href="#cementerio">
      <span class="cementerio-acceso" aria-hidden="true">${icono('lapida', { tam: 26, color: 'currentColor' })}</span>
      <span>Cementerio (${n})</span>
    </a>`;
}

/**
 * En Inicio, solo para el Dictador (que actúa): las reanimaciones en cuenta atrás (Vetar /
 * Permitir ya) y las de quien quiere volver sin código (Aprobar con código nuevo / Rechazar).
 * Para los demás, el aviso va en Avisos (notificaciones).
 */
export function avisosInicio() {
  const yo = usuarioActual();
  if (!soyAdmin()) return '';
  const lista = (datos.estado.reanimaciones ?? [])
    .filter((r) => (r.estado === 'en_curso' || r.estado === 'sin_codigo') && datos.usuario(r.difunto_id) && datos.usuario(r.autor_id));
  return lista.map((r) => {
    const d = datos.usuario(r.difunto_id);
    const a = datos.usuario(r.autor_id);
    if (r.estado === 'sin_codigo') {
      return `
        <div class="aviso-reanimar destacado" role="status">
          <span class="aviso-reanimar-cab">
            <span class="aviso-reanimar-icono">${icono('rayo', { tam: 18, color: 'currentColor' })}</span>
            <span><strong>${esc(d.nombre)} quiere volver, sin código</strong>
            <small>Ha respondido a ${a.id === yo?.id ? 'tu llamada' : `la llamada de ${esc(a.nombre)}`}. Si lo apruebas, vuelve con un código nuevo que tendrás que darle.</small></span>
          </span>
          <span class="aviso-reanimar-botones">
            <button type="button" class="boton-secundario neutro boton-pequeno" data-aprobar="${esc(r.id)}">Aprobar y darle código</button>
            <button type="button" class="boton-secundario boton-pequeno peligro" data-vetar="${esc(r.id)}">Rechazar</button>
          </span>
        </div>`;
    }
    const quien = a.id === yo?.id ? 'Estás' : `${esc(a.nombre)} está`;
    return `
      <div class="aviso-reanimar destacado" role="status">
        <span class="aviso-reanimar-cab">
          <span class="aviso-reanimar-icono">${icono('rayo', { tam: 18, color: 'currentColor' })}</span>
          <span><strong>${quien} intentando reanimar a ${esc(d.nombre)}</strong>
          <small>Ha respondido. Si no haces nada, volverá en <b data-queda="${esc(r.termina_en)}">${esc(queda(r))}</b>.</small></span>
        </span>
        <span class="aviso-reanimar-botones">
          <button type="button" class="boton-secundario boton-pequeno peligro" data-vetar="${esc(r.id)}">Vetar</button>
          <button type="button" class="boton-secundario neutro boton-pequeno" data-permitir="${esc(r.id)}">Permitir ya</button>
          <a class="enlace-discreto" href="#cementerio">Ver la lápida</a>
        </span>
      </div>`;
  }).join('');
}

/** Clics de los avisos y lápidas (Vetar / Permitir ya / Aprobar sin código / reenviar el enlace). true si era suyo. */
export function clicAviso(e) {
  const env = e.target.closest('[data-enlace]');
  if (env) { reenviarEnlace(datos.reanimacion(env.dataset.enlace), env); return true; }
  const ap = e.target.closest('[data-aprobar]');
  if (ap) { aprobarSinCodigo(datos.reanimacion(ap.dataset.aprobar), ap); return true; }
  const v = e.target.closest('[data-vetar], [data-permitir]');
  if (!v) return false;
  const r = datos.reanimacion(v.dataset.vetar ?? v.dataset.permitir);
  if (!r) return true;
  v.disabled = true;
  resolver(r, v.dataset.vetar ? 'vetar' : 'permitir').finally(() => { v.disabled = false; });
  return true;
}

/** El enlace de la llamada otra vez (quien llamó o el admin). */
async function reenviarEnlace(r, boton) {
  const d = r && datos.usuario(r.difunto_id);
  if (!d) return;
  boton.disabled = true;
  const res = await datos.enlaceDe('reanimacion', r.id, usuarioActual()?.id);
  boton.disabled = false;
  if (!res.ok) { aviso(res.codigo === 'red' ? 'Sin conexión' : 'Ese enlace ya no vale'); return; }
  const { hojaEnlace } = await import('./llamada.js');
  hojaEnlace({ tipo: 'reanimacion', nombre: d.nombre, token: res.token });
}

/** Aprobar al que quiere volver sin código: vuelve y se le genera uno nuevo (se enseña una vez). */
async function aprobarSinCodigo(r, boton) {
  const d = r && datos.usuario(r.difunto_id);
  if (!d) return;
  boton.disabled = true;
  const res = await llamarAdmin('permitir', { reanimacion_id: r.id });
  if (!res.ok) { boton.disabled = false; aviso(res.error ?? 'No se ha podido'); return; }
  const grupo = await import('./ajustes-grupo.js');
  const c = await grupo.codigoNuevo(d.nombre, 'nuevo_codigo', { usuario_id: d.id });
  await datos.refrescar();
  boton.disabled = false;
  if (c.ok) grupo.mostrarCodigo(d.nombre, c.codigo);
  else aviso(`${d.nombre} ha vuelto, pero no se ha podido generar su código: hazlo desde Gestionar grupo.`, 5000);
}

/** Los contadores "quedan…" se actualizan solos (sin repintar). */
export function actualizarCuentas(raiz, ahora = Date.now()) {
  for (const el of raiz.querySelectorAll('[data-queda]')) el.textContent = queda({ termina_en: el.dataset.queda }, ahora);
  for (const el of raiz.querySelectorAll('[data-queda-h]')) el.textContent = quedaHoras({ termina_en: el.dataset.quedaH }, ahora);
}

// ---------------------------------------------------------------------------
// Actividad
// ---------------------------------------------------------------------------
/** Lo que sale en "Actividad reciente": expulsiones, intentos, vetos, vueltas y exorcismos. */
export function eventosActividad() {
  return (datos.estado.vidas ?? [])
    // El exorcismo que se levanta al aceptar una apelación no sale aparte: es parte de la vuelta.
    .filter((e) => e.tipo !== 'alta' && !(e.tipo === 'exorcismo_levantado' && e.apelacion_id) && datos.usuario(e.usuario_id))
    .map((e) => ({ e, fecha: e.fecha }));
}

const ICONO_EVENTO = { expulsion: 'lapida', exorcismo: 'sello', exorcismo_levantado: 'sello', reanimacion_pedida: 'rayo', veto: 'lapida', reanimacion: 'rayo' };

export function filaActividad({ e }, ahora = new Date()) {
  const d = datos.usuario(e.usuario_id);
  const autor = e.autor_id ? datos.usuario(e.autor_id) : null;
  const nom = (u) => `<strong>${esc(u?.nombre ?? 'Alguien')}</strong>`;
  let frase = '';
  let extra = '';
  let vivo = false;
  if (e.tipo === 'expulsion') {
    frase = autor ? `${nom(autor)} ha expulsado a ${nom(d)}` : `${nom(d)} ha sido expulsado`;
    if (e.causa) extra = `Causa de la muerte: ${esc(e.causa)}`;
  } else if (e.tipo === 'exorcismo') {
    frase = autor ? `${nom(autor)} ha exorcizado a ${nom(d)}. No volverá.` : `${nom(d)} ha sido exorcizado. No volverá.`;
    if (e.causa) extra = `Motivo: ${esc(e.causa)}`;
  } else if (e.tipo === 'exorcismo_levantado') {
    frase = `<strong>${DICTADOR}</strong> ha levantado el exorcismo de ${nom(d)}`;
    extra = 'Ya se le puede intentar reanimar.';
  } else if (e.tipo === 'reanimacion_pedida') {
    const r = e.reanimacion_id ? datos.reanimacion(e.reanimacion_id) : null;
    const vivo2 = ['pendiente', 'en_curso', 'sin_codigo'].includes(r?.estado);
    if (r?.estado === 'caducada') {
      frase = `${nom(d)} no respondió a la llamada`;
      extra = `${esc(autor?.nombre ?? 'Alguien')} intentó reanimarlo. Ni un mensaje desde el más allá.`;
    } else {
      frase = vivo2 ? `${nom(autor)} está intentando reanimar a ${nom(d)}` : `${nom(autor)} intentó reanimar a ${nom(d)}`;
      if (r?.estado === 'pendiente') extra = 'Intentando contactar con el más allá…';
      else if (r?.estado === 'en_curso') extra = `Ha respondido · quedan <span data-queda-h="${esc(r.termina_en)}">${esc(quedaHoras(r))}</span>. Que alguien avise al Dictador.`;
      else if (r?.estado === 'sin_codigo') extra = `Ha respondido, pero sin código. Decide ${DICTADOR}.`;
    }
  } else if (e.tipo === 'veto') {
    const r = e.reanimacion_id ? datos.reanimacion(e.reanimacion_id) : null;
    const quien = r ? datos.usuario(r.autor_id) : null;
    frase = `<strong>${DICTADOR}</strong> ha vetado la reanimación de ${nom(d)}`;
    extra = quien ? `${esc(quien.nombre)} tendrá que buscarse otro muerto.` : 'Descanse en paz. Otra vez.';
  } else if (e.tipo === 'reanimacion') {
    vivo = true;
    if (e.apelacion_id) frase = `${nom(d)} ha vuelto tras apelar`;
    const por = autor && !(autor.es_admin && !e.reanimacion_id) ? `reanimado por ${esc(autor.nombre)}` : `indultado por ${DICTADOR}`;
    if (!frase) frase = `${nom(d)} ha vuelto de entre los muertos (${por})`;
  } else return '';
  return `
    <a class="actividad-fila actividad-cementerio" href="${vivo ? `#perfil/${esc(d.id)}` : '#cementerio'}">
      <span class="${vivo ? '' : 'difunto-foto'}">${avatar(d, 36)}</span>
      <div class="actividad-texto">
        <span class="actividad-frase">${frase}</span>
        ${extra ? `<span class="actividad-cementerio-extra">${extra}</span>` : ''}
        <span class="actividad-tiempo" data-fecha="${esc(e.fecha)}">${tiempoRelativo(e.fecha, ahora)}</span>
      </div>
      <span class="actividad-cementerio-icono${e.tipo === 'reanimacion' ? ' vivo' : ''}${e.tipo === 'exorcismo' ? ' sellado' : ''}" aria-hidden="true">${icono(ICONO_EVENTO[e.tipo], { tam: 24, color: 'currentColor' })}</span>
    </a>`;
}
