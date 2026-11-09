// Copia de seguridad: un archivo con todas las notas.
// Las notas protegidas viajan cifradas; las comunes, en texto normal.

import { allNotes, putNote, getNote, type Note } from './db';

const FORMAT = 'notas-respaldo';

export async function exportBackup(): Promise<void> {
  const notes = (await allNotes()).map(({ failures: _f, failedAt: _a, ...n }) => n);
  const file = JSON.stringify({ format: FORMAT, version: 1, exportedAt: Date.now(), notes }, null, 1);
  const blob = new Blob([file], { type: 'application/json' });
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `notas-respaldo-${date}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function isNote(x: unknown): x is Note {
  if (!x || typeof x !== 'object') return false;
  const n = x as Record<string, unknown>;
  const lockedOk =
    n.locked === undefined ||
    (typeof n.locked === 'object' &&
      n.locked !== null &&
      ['salt', 'iv', 'data'].every((k) => typeof (n.locked as Record<string, unknown>)[k] === 'string') &&
      ['pin', 'pattern'].includes((n.locked as Record<string, unknown>).method as string) &&
      typeof (n.locked as Record<string, unknown>).iterations === 'number');
  return (
    typeof n.id === 'string' &&
    typeof n.title === 'string' &&
    (n.body === undefined || typeof n.body === 'string') &&
    typeof n.createdAt === 'number' &&
    typeof n.updatedAt === 'number' &&
    lockedOk
  );
}

/**
 * Recupera notas de un archivo. No borra nada: agrega las que faltan y,
 * si una nota existe en los dos lados, se queda con la más nueva.
 * Devuelve cuántas notas se agregaron o actualizaron.
 */
export async function importBackup(file: File): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('El archivo no es una copia de seguridad de Notas.');
  }
  const data = parsed as { format?: unknown; notes?: unknown };
  if (data?.format !== FORMAT || !Array.isArray(data.notes)) {
    throw new Error('El archivo no es una copia de seguridad de Notas.');
  }
  let count = 0;
  for (const raw of data.notes) {
    if (!isNote(raw)) continue;
    const n: Note = {
      id: raw.id,
      title: raw.title,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      ...(raw.locked ? { locked: raw.locked } : { body: raw.body ?? '' }),
    };
    const existing = await getNote(n.id);
    if (!existing || existing.updatedAt < n.updatedAt) {
      await putNote(n);
      count++;
    }
  }
  return count;
}
