// Cifrado de notas protegidas.
//
// - La clave (PIN de 4 números o patrón) nunca se guarda.
// - De la clave se deriva una llave AES-256 con PBKDF2-SHA256 y una sal aleatoria.
// - El contenido se cifra con AES-GCM, que además detecta claves incorrectas
//   y cualquier modificación del dato cifrado.
//
// Todo usa Web Crypto, el cifrado que trae el navegador. No hay cripto propia.

export type LockMethod = 'pin' | 'pattern';

export interface LockedPayload {
  method: LockMethod;
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  data: string; // base64 (texto cifrado + etiqueta GCM)
}

export const DEFAULT_ITERATIONS = 600_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Convierte el PIN o el patrón en el texto secreto que alimenta a PBKDF2. */
export function secretFor(method: LockMethod, value: string | number[]): string {
  if (method === 'pin') {
    if (typeof value !== 'string' || !/^\d{4}$/.test(value)) {
      throw new Error('El PIN debe tener 4 números');
    }
    return `pin:${value}`;
  }
  if (!Array.isArray(value) || value.length < 4) {
    throw new Error('El patrón debe unir al menos 4 puntos');
  }
  return `pattern:${value.join('-')}`;
}

async function deriveKey(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // la llave no se puede exportar
    ['encrypt', 'decrypt'],
  );
}

/**
 * Llave abierta de una nota protegida. Se mantiene solo en memoria
 * mientras la nota está abierta, para poder guardar cambios sin volver
 * a pedir la clave. Se descarta al cerrar la nota.
 */
export interface OpenKey {
  method: LockMethod;
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
  key: CryptoKey;
}

export async function createKey(
  method: LockMethod,
  value: string | number[],
  iterations = DEFAULT_ITERATIONS,
): Promise<OpenKey> {
  const salt = randomBytes(16);
  const key = await deriveKey(secretFor(method, value), salt, iterations);
  return { method, iterations, salt, key };
}

export async function encryptWith(openKey: OpenKey, plaintext: string): Promise<LockedPayload> {
  const iv = randomBytes(12); // IV nuevo en cada guardado
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, openKey.key, enc.encode(plaintext));
  return {
    method: openKey.method,
    iterations: openKey.iterations,
    salt: toBase64(openKey.salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ct)),
  };
}

/** Intenta abrir una nota. Devuelve null si la clave es incorrecta. */
export async function unlock(
  payload: LockedPayload,
  value: string | number[],
): Promise<{ plaintext: string; openKey: OpenKey } | null> {
  let secret: string;
  try {
    secret = secretFor(payload.method, value);
  } catch {
    return null;
  }
  const salt = fromBase64(payload.salt);
  const key = await deriveKey(secret, salt, payload.iterations);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.data),
    );
    return {
      plaintext: dec.decode(pt),
      openKey: { method: payload.method, iterations: payload.iterations, salt, key },
    };
  } catch {
    return null;
  }
}
