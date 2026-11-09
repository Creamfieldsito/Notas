// Espera tras intentos fallidos al abrir una nota protegida.
// Las primeras 5 equivocaciones son gratis (es normal equivocarse con el patrón).
// Después la espera se duplica: 30 s, 1 min, 2 min, 4 min, 8 min, y como máximo 10 min.
// Nunca se borra la nota: solo se hace esperar.

export const FREE_ATTEMPTS = 5;
const BASE_MS = 30_000;
const MAX_MS = 10 * 60_000;

export function waitMsAfter(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return Math.min(BASE_MS * 2 ** (failures - FREE_ATTEMPTS), MAX_MS);
}

export function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} segundos`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  const min = m === 1 ? '1 minuto' : `${m} minutos`;
  return r ? `${min} y ${r} segundos` : min;
}
