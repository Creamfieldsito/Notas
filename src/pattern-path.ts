// Lógica del patrón (sin dibujo), para poder probarla.
// Los puntos se numeran así:
//   0 1 2
//   3 4 5
//   6 7 8

/**
 * Agrega un punto al trazo. Si la línea pasa por encima de un punto que
 * todavía no se usó, ese punto se agrega antes (igual que el patrón de Android).
 * Devuelve el trazo nuevo (no modifica el original).
 */
export function addPoint(path: readonly number[], next: number): number[] {
  if (next < 0 || next > 8 || path.includes(next)) return [...path];
  const out = [...path];
  const last = out[out.length - 1];
  if (last !== undefined) {
    const r1 = Math.floor(last / 3), c1 = last % 3;
    const r2 = Math.floor(next / 3), c2 = next % 3;
    if ((r1 + r2) % 2 === 0 && (c1 + c2) % 2 === 0) {
      const mid = ((r1 + r2) / 2) * 3 + (c1 + c2) / 2;
      if (!out.includes(mid)) out.push(mid);
    }
  }
  out.push(next);
  return out;
}

export const MIN_PATTERN_POINTS = 4;
