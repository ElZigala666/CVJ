// Enlaces de confirmación (migración 043): reanimar o proponer ya no empieza nada hasta que
// el interesado acepta en #llamada/{token} (js/pantallas/llamada.js). Aquí, lo común: la URL,
// la hoja para mandar el enlace (Compartir / Copiar y el texto listo) y el botón "Escribir al
// Dictador" (WhatsApp con un mensaje ya escrito; el número lo pone el admin en Ajustes).
import { abrirHoja } from './hoja.js';
import { icono } from './icons.js';
import { esc, botonCopiar, seleccionarTexto } from './ui.js';
const DICTADOR = 'El Dictador'; // como en js/cementerio.js (sin importarlo: este módulo lo usa la página del enlace)

export const urlLlamada = (token) => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}#llamada/${token}`;

const PARA_WHATSAPP = {
  reanimacion: [
    'Dictador, pásame mi código. Ya. Sin preguntas.',
    'Dictador, he vuelto del más allá y no me acuerdo de mi código. Hazme el favor.',
    'Me están resucitando y he perdido el código por el camino. Dictador, sálvame.',
    'Dictador, soy yo, el difunto. Necesito mi código para volver al mundo de los vivos.',
  ],
  propuesta: [
    'Dictador, he aceptado la propuesta de CVJ. Pásame mi código cuando quieras. Bueno, ya.',
    'Dictador, quiero entrar en CVJ. Prometo valorar con criterio y no ponerle un 10 al FIFA.',
    'Dictador, me han propuesto y he dicho que sí. Juzgadme, pero pásame el código.',
  ],
  por_otro: [
    'Dictador, CVJ dice que estoy aceptando por otro. Te juro que soy yo. Solo compartimos wifi.',
    'Dictador, la app no se fía de mí. Soy yo de verdad, palabra de difunto.',
  ],
};
const alAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];

/** El botón de WhatsApp (o nada si el Dictador no ha puesto su número). */
export function botonWhatsapp(numero, tipo, clase = 'boton-secundario') {
  const n = String(numero ?? '').replace(/[^0-9]/g, '');
  if (!n) return '';
  const texto = alAzar(PARA_WHATSAPP[tipo] ?? PARA_WHATSAPP.reanimacion);
  return `<a class="${clase} con-icono boton-whatsapp" href="https://wa.me/${n}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">${icono('comentario', { tam: 18, color: 'currentColor' })}<span>Escribir al Dictador</span></a>`;
}

const DURACION = { reanimacion: '72 horas', propuesta: '7 días' };

/** El texto listo para mandar al interesado. */
export function mensajeLlamada(tipo, token) {
  const url = urlLlamada(token);
  return tipo === 'propuesta'
    ? `Te he propuesto para entrar en CVJ, nuestro grupo de videojuegos. Si te apetece, acepta aquí (caduca en ${DURACION.propuesta}): ${url}`
    : `Te estoy intentando reanimar en CVJ. Si quieres volver de entre los muertos, acepta aquí (caduca en ${DURACION.reanimacion}): ${url}`;
}

/** La hoja para mandar el enlace (al pedirlo y cada vez que se quiera reenviar). */
export function hojaEnlace({ tipo, nombre, token, titulo = null }) {
  const texto = mensajeLlamada(tipo, token);
  abrirHoja({
    titulo: titulo ?? (tipo === 'propuesta' ? `Manda el enlace a ${nombre}` : `Llama a ${nombre}`),
    html: `
      <div class="elegir-juegos llamada-hoja">
        <span class="cem-confirmar-icono">${icono(tipo === 'propuesta' ? 'urna' : 'rayo', { tam: 30, color: 'currentColor' })}</span>
        <p>${tipo === 'propuesta'
          ? `Para que se pueda votar, ${esc(nombre)} tiene que aceptar en este enlace. Caduca en ${DURACION.propuesta} y solo vale una vez.`
          : `${esc(nombre)} tiene que responder en este enlace para que empiece la cuenta atrás. Caduca en ${DURACION.reanimacion} y solo vale una vez.`}</p>
        <p class="llamada-url texto-seleccionable" data-ref="url">${esc(urlLlamada(token))}</p>
        <div class="fila-botones">
          <button type="button" class="boton-secundario" data-ref="copiar">Copiar</button>
          ${navigator.share ? `<button type="button" class="boton-principal con-icono" data-ref="compartir">${icono('compartir', { tam: 18, color: 'currentColor' })}<span>Compartir</span></button>` : ''}
        </div>
        <p class="ajustes-nota">Mensaje listo para mandar: «<span class="texto-seleccionable" data-ref="mensaje">${esc(texto)}</span>»</p>
        <p class="ajustes-nota">No vale aceptar desde tu móvil ni desde tu wifi: tiene que ser ${esc(nombre)}.</p>
      </div>`,
    alMontar(cuerpo) {
      botonCopiar(cuerpo.querySelector('[data-ref="copiar"]'), texto, {
        alFallar: () => seleccionarTexto(cuerpo.querySelector('[data-ref="mensaje"]')),
      });
      cuerpo.querySelector('[data-ref="compartir"]')?.addEventListener('click', () => {
        navigator.share({ title: 'CVJ', text: texto }).catch(() => {});
      });
    },
  });
}
