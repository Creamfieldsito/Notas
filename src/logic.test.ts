import { describe, expect, it } from 'vitest';
import { addPoint } from './pattern-path';
import { formatWait, waitMsAfter } from './lockout';

describe('patrón', () => {
  it('agrega puntos en orden', () => {
    expect(addPoint(addPoint([], 0), 1)).toEqual([0, 1]);
  });
  it('agrega el punto del medio si la línea lo cruza', () => {
    expect(addPoint([0], 2)).toEqual([0, 1, 2]);
    expect(addPoint([0], 8)).toEqual([0, 4, 8]);
    expect(addPoint([6], 0)).toEqual([6, 3, 0]);
  });
  it('no repite el punto del medio si ya estaba usado', () => {
    expect(addPoint([1, 0], 2)).toEqual([1, 0, 2]);
  });
  it('no repite puntos', () => {
    expect(addPoint([0, 1], 0)).toEqual([0, 1]);
  });
  it('no agrega punto intermedio en saltos tipo caballo', () => {
    expect(addPoint([0], 5)).toEqual([0, 5]);
  });
});

describe('espera tras errores', () => {
  it('las primeras 5 equivocaciones no hacen esperar', () => {
    for (let i = 0; i < 5; i++) expect(waitMsAfter(i)).toBe(0);
  });
  it('después la espera crece y tiene tope', () => {
    expect(waitMsAfter(5)).toBe(30_000);
    expect(waitMsAfter(6)).toBe(60_000);
    expect(waitMsAfter(50)).toBe(600_000);
  });
  it('formatea el tiempo en palabras', () => {
    expect(formatWait(30_000)).toBe('30 segundos');
    expect(formatWait(60_000)).toBe('1 minuto');
    expect(formatWait(90_000)).toBe('1 minuto y 30 segundos');
  });
});
