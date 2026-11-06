// Pantalla 01 · Entrada (login con código personal).
import { icono } from '../icons.js';
import { entrar } from '../sesion.js';
import { normalizarCodigo, LARGO_CODIGO } from '../codigo.js';

export function render(el, { alEntrar }) {
  el.innerHTML = `
    <section class="entrada">
      <form class="entrada-form" novalidate>
        <div class="entrada-centro">
          <div class="entrada-marca">
            ${icono('logo', { tam: 64, color: 'var(--acento)', etiqueta: 'Logo de CVJ' })}
            <div>
              <h1 class="entrada-titulo">CVJ</h1>
              <p class="entrada-sub">Críticas de VideoJuegos</p>
            </div>
          </div>
          <div class="entrada-campo">
            <label for="codigo" class="entrada-label">Tu código personal</label>
            <input id="codigo" name="codigo" class="entrada-input"
              autocomplete="one-time-code" autocapitalize="characters" autocorrect="off"
              spellcheck="false" enterkeyhint="go" placeholder="······" aria-describedby="ayuda error">
            <p id="ayuda" class="entrada-ayuda">Sin registro ni contraseñas. El código lo genera el admin del grupo y queda guardado en este móvil.</p>
            <p id="error" class="entrada-error" role="alert"></p>
          </div>
        </div>
        <button type="submit" class="boton-principal" disabled>Entrar</button>
      </form>
    </section>`;

  const form = el.querySelector('form');
  const input = el.querySelector('#codigo');
  const boton = el.querySelector('button');
  const error = el.querySelector('#error');
  let enviando = false;

  const actualizar = () => {
    const cod = normalizarCodigo(input.value).slice(0, LARGO_CODIGO);
    if (input.value !== cod) input.value = cod;
    input.classList.toggle('con-texto', cod.length > 0);
    boton.disabled = enviando || cod.length !== LARGO_CODIGO;
  };

  input.addEventListener('input', () => {
    error.textContent = '';
    input.classList.remove('con-error');
    actualizar();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (boton.disabled) return;
    enviando = true;
    boton.textContent = 'Entrando…';
    actualizar();
    try {
      const usuario = await entrar(input.value);
      alEntrar(usuario);
    } catch (err) {
      enviando = false;
      boton.textContent = 'Entrar';
      actualizar();
      input.classList.add('con-error');
      error.textContent = err.tipo === 'codigo'
        ? 'Ese código no existe. Revisa que esté bien escrito.'
        : 'No se ha podido comprobar el código. Revisa la conexión y prueba otra vez.';
      input.focus();
    }
  });

  // En móvil, abrir el teclado al momento.
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
}
