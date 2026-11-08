// Estimación automática de horas (Ajustes → Biblioteca): mantiene al día las estimaciones
// automáticas del usuario con sesión. Se revisa al llegar datos del servidor y cada vez que
// cambia algo (un juego nuevo completado, horas reales nuevas, apagar el interruptor).
// Solo escribe si hay algo que cambiar; si una escritura falla, no insiste hasta recargar.
import * as datos from './datos.js';
import * as metricas from './metricas.js';
import { usuarioActual } from './sesion.js';

let programado = false;
let parado = false;

function revisar() {
  if (programado || parado) return;
  programado = true;
  setTimeout(async () => {
    programado = false;
    const u = usuarioActual();
    if (!u || !datos.datosFrescos()) return;
    const { poner, quitar } = metricas.planEstimaciones(u.id);
    if (!poner.length && !quitar.length) return;
    if (!(await datos.estimacionesEnLote(u.id, poner, quitar))) parado = true;
  }, 300);
}

export function iniciarEstimaciones() {
  datos.suscribir(revisar);
  datos.cuandoFrescos(revisar);
}
