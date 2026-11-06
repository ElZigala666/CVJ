// Nombre limpio de un título de PlayStation, igual que en las funciones psn e igdb:
// "Ghost of Tsushima™ PS4 & PS5 Edición Estándar" → "ghost of tsushima".
// Sirve para juntar duplicados (la versión de PS4 y la de PS5 de un mismo juego).

const EDICIONES = /\b(standard|digital|deluxe|ultimate|gold|complete|definitive|premium|special|collector s|game of the year|goty|launch|day one|cross gen|estandar|digital deluxe|completa|definitiva|del juego del ano)\s+(edition|edicion|bundle)\b/g;

export function claveNombrePsn(nombre, sinRemaster = false) {
  let n = String(nombre ?? '')
    .replace(/[™®©]/g, '')
    .replace(/['’`´]/g, '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(ps4|ps5)\s+version\b/g, ' ')
    .replace(/\bversion\s+(ps4|ps5)\b/g, ' ')
    .replace(/\bplay\s*station\s*(4|5)\b/g, ' ')
    .replace(/\b(ps4|ps5)(\s+(and|y)?\s*(ps4|ps5))?\b/g, ' ')
    .replace(EDICIONES, ' ')
    .replace(/\b(edition|edicion)\s+(estandar|standard|digital|deluxe|completa|definitiva)\b/g, ' ')
    .replace(/\s+(edition|edicion)\s*$/g, ' ')
    .replace(/\bremasterizad[oa]\b/g, 'remastered');
  if (sinRemaster) n = n.replace(/\b(remastered|remaster)\b/g, ' ');
  return n.replace(/\s+/g, ' ').trim();
}

/** Texto normalizado para buscar por nombre en el cliente (sin tildes ni mayúsculas). */
export function normalizarBusqueda(t) {
  return String(t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
