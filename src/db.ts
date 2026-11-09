// Almacenamiento local en el celular (IndexedDB).
// Las notas comunes se guardan tal cual; las protegidas solo cifradas.

import type { LockedPayload } from './crypto';

export interface Note {
  id: string;
  title: string;
  body?: string; // solo en notas comunes
  locked?: LockedPayload; // solo en notas protegidas
  createdAt: number;
  updatedAt: number;
  failures?: number; // intentos fallidos seguidos
  failedAt?: number; // momento del último intento fallido
}

const DB_NAME = 'notas';
const STORE = 'notes';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export async function allNotes(): Promise<Note[]> {
  const notes = await run<Note[]>('readonly', (s) => s.getAll());
  return notes.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getNote(id: string): Promise<Note | undefined> {
  return run<Note | undefined>('readonly', (s) => s.get(id));
}

export async function putNote(note: Note): Promise<void> {
  await run('readwrite', (s) => s.put(note));
}

export async function deleteNote(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Pide al navegador que no borre los datos para liberar espacio. */
export async function askPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // no es crítico
  }
}
