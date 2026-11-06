// #conectar-xbox: vuelta del inicio de sesión de Microsoft (OpenXBL). xbox.html deja
// el código guardado; aquí se manda a la función xbox, que lo canjea y sincroniza.
import * as xbox from '../xbox.js';
import { usuarioActual } from '../sesion.js';
import { reemplazarRuta } from '../navegacion.js';
import { aviso, esc } from '../ui.js';
import { iconoFuente } from '../plataformas-ui.js';
import { resumen } from '../ajustes-xbox.js';

export function render(el) {
  const yo = usuarioActual();
  const pantalla = (titulo, texto, botones = '') => {
    el.innerHTML = `
      <section class="conectar-xbox">
        ${iconoFuente('xbox', 48)}
        <h1 class="titulo-pantalla">${esc(titulo)}</h1>
        <p class="vacio-texto">${esc(texto)}</p>
        ${botones}
      </section>`;
  };
  if (!yo) { reemplazarRuta('#inicio'); return; }
  const code = xbox.tomarCodigo();
  if (!code) {
    pantalla('No ha llegado el inicio de sesión', 'Microsoft no ha devuelto el permiso. Vuelve a probar desde Ajustes → Plataformas.',
      '<button type="button" class="boton-principal" data-reintentar>Conectar Xbox otra vez</button>');
  } else {
    pantalla('Xbox conectada · sincronizando…', 'Estamos trayendo tus juegos y logros. Tarda unos segundos.');
    xbox.conectar(yo.id, code).then((r) => {
      if (!el.isConnected) return;
      if (!r.ok) {
        pantalla('No se ha podido conectar', xbox.mensajeXbox(r),
          '<button type="button" class="boton-principal" data-reintentar>Conectar Xbox otra vez</button>');
        return;
      }
      const s = r.sincronizacion;
      aviso(s?.ok ? `Xbox conectada como ${r.gamertag}. ${resumen(s)}` : `Xbox conectada como ${r.gamertag}. ${xbox.mensajeXbox(s)}`, 5000);
      reemplazarRuta(s?.ok && s.nuevos ? '#revisar' : '#perfil');
    });
  }
  el.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-reintentar]')) return;
    const r = await xbox.irAIniciarSesion();
    if (!r.ok) aviso(xbox.mensajeXbox(r));
  });
}
