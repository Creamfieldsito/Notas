import { describe, expect, it } from 'vitest';
import { createKey, encryptWith, secretFor, unlock } from './crypto';

const FAST = 1000; // pocas iteraciones para que las pruebas sean rápidas

describe('cifrado de notas', () => {
  it('abre con el PIN correcto', async () => {
    const k = await createKey('pin', '4821', FAST);
    const p = await encryptWith(k, 'Clave del banco: 1234');
    const r = await unlock(p, '4821');
    expect(r?.plaintext).toBe('Clave del banco: 1234');
  });

  it('no abre con un PIN incorrecto', async () => {
    const k = await createKey('pin', '4821', FAST);
    const p = await encryptWith(k, 'secreto');
    expect(await unlock(p, '4822')).toBeNull();
    expect(await unlock(p, 'abcd')).toBeNull();
  });

  it('abre con el patrón correcto y no con otro', async () => {
    const k = await createKey('pattern', [0, 1, 2, 5, 8], FAST);
    const p = await encryptWith(k, 'secreto');
    expect((await unlock(p, [0, 1, 2, 5, 8]))?.plaintext).toBe('secreto');
    expect(await unlock(p, [8, 5, 2, 1, 0])).toBeNull();
    expect(await unlock(p, [0, 1, 2, 5])).toBeNull();
  });

  it('el texto cifrado no contiene el texto original', async () => {
    const k = await createKey('pin', '0000', FAST);
    const p = await encryptWith(k, 'contraseña super secreta');
    expect(JSON.stringify(p)).not.toContain('secreta');
  });

  it('usa un IV distinto en cada guardado', async () => {
    const k = await createKey('pin', '1111', FAST);
    const a = await encryptWith(k, 'mismo texto');
    const b = await encryptWith(k, 'mismo texto');
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
    expect(a.salt).toBe(b.salt);
  });

  it('la llave abierta sirve para volver a guardar', async () => {
    const k = await createKey('pin', '2468', FAST);
    const p1 = await encryptWith(k, 'v1');
    const opened = await unlock(p1, '2468');
    const p2 = await encryptWith(opened!.openKey, 'v2');
    expect((await unlock(p2, '2468'))?.plaintext).toBe('v2');
  });

  it('detecta si alguien modifica el dato cifrado', async () => {
    const k = await createKey('pin', '1357', FAST);
    const p = await encryptWith(k, 'secreto');
    const tampered = { ...p, data: (p.data[0] === 'A' ? 'B' : 'A') + p.data.slice(1) };
    expect(await unlock(tampered, '1357')).toBeNull();
  });

  it('rechaza PIN o patrón inválidos al crear', () => {
    expect(() => secretFor('pin', '123')).toThrow();
    expect(() => secretFor('pin', '12345')).toThrow();
    expect(() => secretFor('pattern', [0, 1, 2])).toThrow();
  });
});
