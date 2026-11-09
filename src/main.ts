import './style.css';
import { createKey, encryptWith, unlock, type LockMethod, type OpenKey } from './crypto';
import { allNotes, askPersistentStorage, deleteNote, getNote, newId, putNote, type Note } from './db';
import { exportBackup, importBackup } from './backup';
import { FREE_ATTEMPTS, formatWait, waitMsAfter } from './lockout';
import { MIN_PATTERN_POINTS } from './pattern-path';
import { patternPad, pinPad, type Pad } from './pads';
import { alertDialog, confirmDialog, formatDate, h, toast } from './ui';

const app = document.getElementById('app')!;

// ---------------------------------------------------------------------------
// Navegación: una pila de pantallas conectada al botón "atrás" del celular.

type View = () => void | Promise<void>;
const stack: View[] = [];
let leaveCurrent: (() => Promise<void> | void) | null = null;

async function leave() {
  const fn = leaveCurrent;
  leaveCurrent = null;
  await fn?.();
}

async function show(view: View) {
  app.replaceChildren();
  window.scrollTo(0, 0);
  await view();
}

async function push(view: View) {
  await leave();
  stack.push(view);
  history.pushState({ depth: stack.length }, '');
  await show(view);
}

function back() {
  if (stack.length) history.back();
  else void show(listView);
}

let homing = false;

window.addEventListener('popstate', async () => {
  if (homing) {
    homing = false;
    await show(listView);
    return;
  }
  await leave();
  stack.pop();
  await show(stack[stack.length - 1] ?? listView);
});

/** Vuelve a la lista de golpe (por ejemplo, al cerrar una nota protegida sola). */
async function goHome() {
  await leave();
  const depth = stack.length;
  stack.length = 0;
  closeSession();
  if (!depth) return show(listView);
  // Se vacía la pantalla y se espera a que el historial vuelva al inicio,
  // así no queda nada visible ni se puede tocar nada mientras tanto.
  app.replaceChildren();
  homing = true;
  history.go(-depth);
  setTimeout(() => {
    if (homing) {
      homing = false;
      void show(listView);
    }
  }, 1500);
}

// ---------------------------------------------------------------------------
// Nota protegida abierta: la llave y el texto viven solo en memoria.

interface Session {
  noteId: string;
  openKey: OpenKey;
  body: string;
}
let session: Session | null = null;

function closeSession() {
  session = null;
}

const AUTO_LOCK_MS = 3 * 60_000;
let idleTimer: number | undefined;

function resetIdle() {
  clearTimeout(idleTimer);
  if (session) {
    idleTimer = window.setTimeout(async () => {
      if (!session) return;
      await goHome();
      toast('La nota protegida se cerró sola 🔒');
    }, AUTO_LOCK_MS);
  }
}
['pointerdown', 'keydown', 'input'].forEach((ev) => document.addEventListener(ev, resetIdle, { passive: true }));

// Si el celular se bloquea o se cambia de app, la nota protegida se cierra.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && session) void goHome();
});

// ---------------------------------------------------------------------------
// Instalación en el celular

let installEvent: (Event & { prompt(): Promise<void> }) | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e as typeof installEvent;
});

function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function getFlag(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function setFlag(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    // sin importancia
  }
}

// ---------------------------------------------------------------------------
// Pantalla: lista de notas

function header(title: string, opts: { back?: boolean; right?: Node } = {}) {
  return h(
    'header',
    { class: 'bar' },
    opts.back ? h('button', { class: 'bar-btn', onclick: back, 'aria-label': 'Volver' }, '← Volver') : null,
    h('h1', { class: opts.back ? 'bar-title small' : 'bar-title' }, title),
    opts.right ?? null,
  );
}

async function listView() {
  const notes = await allNotes();
  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: '🔍 Buscar',
    'aria-label': 'Buscar notas',
  });
  const list = h('ul', { class: 'notes' });

  const renderList = () => {
    const q = search.value.trim().toLowerCase();
    const shown = notes.filter(
      (n) => !q || n.title.toLowerCase().includes(q) || (n.body ?? '').toLowerCase().includes(q),
    );
    list.replaceChildren(
      ...shown.map((n) =>
        h(
          'li',
          {},
          h(
            'button',
            { class: 'note-item', onclick: () => openNote(n.id) },
            h('span', { class: 'note-title' }, n.locked ? '🔒 ' : '', n.title.trim() || 'Sin título'),
            h(
              'span',
              { class: 'note-preview' },
              n.locked ? 'Nota protegida. Tocá para abrir.' : firstLine(n.body ?? '') || 'Nota vacía',
            ),
            h('span', { class: 'note-date' }, formatDate(n.updatedAt)),
          ),
        ),
      ),
    );
    if (!shown.length) {
      list.append(
        h('li', { class: 'empty' }, q ? 'No hay notas con esa palabra.' : 'Todavía no hay notas. Tocá "Nueva nota" para escribir la primera.'),
      );
    }
  };
  search.addEventListener('input', renderList);
  renderList();

  const banner =
    !isInstalled() && getFlag('hide-install') !== '1'
      ? h(
          'div',
          { class: 'banner' },
          h('p', {}, '📲 Instalá la app en el celular para usarla como cualquier otra y que tus notas queden bien guardadas.'),
          h(
            'div',
            { class: 'banner-actions' },
            h('button', { class: 'btn btn-primary', onclick: install }, 'Instalar'),
            h(
              'button',
              {
                class: 'btn',
                onclick: (e: Event) => {
                  setFlag('hide-install', '1');
                  (e.currentTarget as HTMLElement).closest('.banner')?.remove();
                },
              },
              'Ahora no',
            ),
          ),
        )
      : null;

  app.append(
    header('Mis notas', {
      right: h('button', { class: 'bar-btn', onclick: () => push(optionsView), 'aria-label': 'Más opciones' }, '⋮ Más'),
    }),
    h(
      'main',
      { class: 'content' },
      banner,
      notes.length > 3 ? search : null,
      list,
    ),
    h(
      'div',
      { class: 'fab-wrap' },
      h('button', { class: 'btn btn-primary btn-big', onclick: newNote }, '＋ Nueva nota'),
    ),
  );
}

function firstLine(s: string) {
  return s.split('\n').find((l) => l.trim())?.trim().slice(0, 80) ?? '';
}

async function newNote() {
  const now = Date.now();
  const note: Note = { id: newId(), title: '', body: '', createdAt: now, updatedAt: now };
  await putNote(note);
  await push(() => editorView(note.id));
}

async function openNote(id: string) {
  const note = await getNote(id);
  if (!note) return;
  if (note.locked) await push(() => unlockView(id));
  else await push(() => editorView(id));
}

async function install() {
  if (installEvent) {
    await installEvent.prompt();
    installEvent = null;
  } else {
    await push(installHelpView);
  }
}

// ---------------------------------------------------------------------------
// Pantalla: editor

async function editorView(id: string) {
  const note = await getNote(id);
  if (!note) return void back();
  const isLocked = !!note.locked;
  if (isLocked && session?.noteId !== id) {
    // No debería pasar: una nota protegida solo se edita después de abrirla.
    return void goHome();
  }
  if (isLocked) resetIdle();

  const title = h('input', {
    class: 'title-input',
    type: 'text',
    placeholder: 'Título',
    value: note.title,
    'aria-label': 'Título',
    maxlength: 200,
  });
  const body = h('textarea', {
    class: 'body-input',
    placeholder: 'Escribí acá…',
    'aria-label': 'Contenido de la nota',
  });
  body.value = isLocked ? session!.body : (note.body ?? '');
  const status = h('span', { class: 'save-status', 'aria-live': 'polite' }, '');

  let dirty = false;
  let timer: number | undefined;

  const save = async () => {
    clearTimeout(timer);
    if (!dirty) return;
    dirty = false;
    const current = await getNote(id);
    if (!current) return;
    current.title = title.value;
    current.updatedAt = Date.now();
    if (current.locked) {
      if (!session || session.noteId !== id) return;
      session.body = body.value;
      current.locked = await encryptWith(session.openKey, body.value);
      delete current.body;
    } else {
      current.body = body.value;
    }
    await putNote(current);
    status.textContent = 'Guardado ✓';
  };
  const schedule = () => {
    dirty = true;
    status.textContent = 'Guardando…';
    clearTimeout(timer);
    timer = window.setTimeout(save, 600);
  };
  title.addEventListener('input', schedule);
  body.addEventListener('input', schedule);

  leaveCurrent = async () => {
    await save();
    const n = await getNote(id);
    const goingToProtect = protecting;
    protecting = false;
    // Si se va a la pantalla de proteger, la nota sigue "abierta" por debajo.
    if (goingToProtect) return;
    // Si quedó vacía, no la dejamos en la lista.
    if (n && !n.locked && !n.title.trim() && !(n.body ?? '').trim()) await deleteNote(id);
    // Al salir de una nota protegida, se cierra.
    if (n?.locked) closeSession();
  };

  const actions = isLocked
    ? [
        h('button', { class: 'btn', onclick: () => startProtect(id, body.value, true) }, '🔑 Cambiar clave'),
        h('button', { class: 'btn', onclick: () => removeProtection(id, save) }, '🔓 Quitar protección'),
      ]
    : [h('button', { class: 'btn', onclick: () => startProtect(id, body.value, false) }, '🔒 Proteger esta nota')];

  app.append(
    header(isLocked ? '🔒 Nota protegida' : 'Nota', { back: true, right: status }),
    h(
      'main',
      { class: 'content editor' },
      isLocked
        ? h('p', { class: 'hint' }, 'El contenido está protegido. El título se ve en la lista, así que no pongas datos secretos en el título.')
        : null,
      title,
      body,
      h(
        'div',
        { class: 'editor-actions' },
        actions,
        h('button', { class: 'btn btn-danger-outline', onclick: () => removeNote(id) }, '🗑 Borrar nota'),
      ),
    ),
  );
  if (!note.title && !body.value) title.focus();

  // Para que "Proteger" use lo último escrito.
  pendingSave = async () => {
    dirty = true;
    await save();
  };
}

let pendingSave: (() => Promise<void>) | null = null;
let protecting = false;

async function removeNote(id: string) {
  const ok = await confirmDialog({
    title: '¿Borrar esta nota?',
    message: 'Se borra para siempre y no se puede recuperar.',
    ok: 'Sí, borrar',
    danger: true,
  });
  if (!ok) return;
  leaveCurrent = null;
  await deleteNote(id);
  closeSession();
  toast('Nota borrada');
  back();
}

async function removeProtection(id: string, save: () => Promise<void>) {
  const ok = await confirmDialog({
    title: '¿Quitar la protección?',
    message: 'Cualquiera que use el celular va a poder leer esta nota.',
    ok: 'Sí, quitar',
  });
  if (!ok || !session) return;
  await save();
  const n = await getNote(id);
  if (!n) return;
  delete n.locked;
  delete n.failures;
  delete n.failedAt;
  n.body = session.body;
  n.updatedAt = Date.now();
  await putNote(n);
  closeSession();
  clearTimeout(idleTimer);
  leaveCurrent = null;
  await show(stack[stack.length - 1] ?? listView);
  toast('La nota ya no está protegida');
}

// ---------------------------------------------------------------------------
// Proteger una nota (o cambiar su clave)

async function startProtect(id: string, currentBody: string, isChange: boolean) {
  // Guarda lo último escrito antes de cambiar de pantalla.
  await pendingSave?.();
  protecting = true;
  await push(() => protectView(id, currentBody, isChange));
}

function protectView(id: string, bodyText: string, isChange: boolean) {
  const main = h('main', { class: 'content center' });
  app.append(header(isChange ? 'Cambiar clave' : 'Proteger nota', { back: true }), main);

  leaveCurrent = () => {
    // Si cancela el cambio de clave, la nota sigue abierta.
  };

  const chooseMethod = () => {
    main.replaceChildren(
      h('h2', {}, '¿Cómo querés protegerla?'),
      h(
        'div',
        { class: 'choices' },
        h('button', { class: 'choice', onclick: () => ask('pattern') }, h('span', { class: 'choice-icon' }, '⠿'), 'Con un patrón', h('small', {}, 'Uniendo puntos con el dedo')),
        h('button', { class: 'choice', onclick: () => ask('pin') }, h('span', { class: 'choice-icon' }, '🔢'), 'Con 4 números', h('small', {}, 'Como el PIN de una tarjeta')),
      ),
      h(
        'p',
        { class: 'warning' },
        '⚠️ Importante: si te olvidás la clave, la nota no se puede abrir nunca más. Nadie puede recuperarla. Elegí algo que recuerdes.',
      ),
    );
  };

  const ask = (method: LockMethod, first?: string | number[]) => {
    const isConfirm = first !== undefined;
    const message = h('p', { class: 'pad-message', 'aria-live': 'polite' });
    const prompt = isConfirm
      ? method === 'pattern'
        ? 'Dibujá el mismo patrón otra vez para confirmar'
        : 'Escribí los mismos 4 números otra vez para confirmar'
      : method === 'pattern'
        ? 'Dibujá tu patrón uniendo al menos 4 puntos'
        : 'Elegí 4 números';

    let pad: Pad;
    const onValue = async (value: string | number[]) => {
      if (method === 'pattern' && (value as number[]).length < MIN_PATTERN_POINTS) {
        pad.showError();
        message.textContent = `Uní al menos ${MIN_PATTERN_POINTS} puntos. Probá de nuevo.`;
        setTimeout(() => pad.reset(), 900);
        return;
      }
      if (!isConfirm) return ask(method, value);
      if (String(value) !== String(first)) {
        pad.showError();
        message.textContent = 'No coincide. Empecemos de nuevo.';
        setTimeout(() => ask(method), 1200);
        return;
      }
      pad.setDisabled(true);
      message.textContent = 'Protegiendo la nota…';
      await finish(method, value);
    };
    pad = method === 'pattern' ? patternPad(onValue) : pinPad((p) => onValue(p));
    main.replaceChildren(
      h('h2', {}, prompt),
      pad.el,
      message,
      h('button', { class: 'btn btn-link', onclick: chooseMethod }, 'Elegir otra forma'),
    );
  };

  const finish = async (method: LockMethod, value: string | number[]) => {
    const note = await getNote(id);
    if (!note) return void goHome();
    const body = session?.noteId === id ? session.body : bodyText;
    const openKey = await createKey(method, value);
    note.locked = await encryptWith(openKey, body);
    delete note.body;
    delete note.failures;
    delete note.failedAt;
    note.updatedAt = Date.now();
    await putNote(note);
    session = { noteId: id, openKey, body };
    resetIdle();
    toast(isChange ? 'Clave cambiada 🔑' : 'Nota protegida 🔒');
    back();
  };

  chooseMethod();
}

// ---------------------------------------------------------------------------
// Abrir una nota protegida

async function unlockView(id: string) {
  const note = await getNote(id);
  if (!note?.locked) return void back();
  const method = note.locked.method;

  const message = h('p', { class: 'pad-message', 'aria-live': 'polite' });
  let countdown: number | undefined;
  leaveCurrent = () => clearInterval(countdown);

  const remainingWait = (n: Note) => {
    const until = (n.failedAt ?? 0) + waitMsAfter(n.failures ?? 0);
    return Math.max(0, until - Date.now());
  };

  const startCountdown = (n: Note) => {
    pad.setDisabled(true);
    const tick = () => {
      const ms = remainingWait(n);
      if (ms <= 0) {
        clearInterval(countdown);
        pad.setDisabled(false);
        pad.reset();
        message.textContent = 'Ya podés intentar de nuevo.';
        return;
      }
      message.textContent = `Demasiados intentos. Esperá ${formatWait(ms)} para volver a probar.`;
    };
    tick();
    clearInterval(countdown);
    countdown = window.setInterval(tick, 1000);
  };

  const attempt = async (value: string | number[]) => {
    const current = await getNote(id);
    if (!current?.locked) return;
    if (remainingWait(current) > 0) return startCountdown(current);
    pad.setDisabled(true);
    message.textContent = 'Abriendo…';
    const result = await unlock(current.locked, value);
    if (result) {
      current.failures = 0;
      delete current.failedAt;
      await putNote(current);
      session = { noteId: id, openKey: result.openKey, body: result.plaintext };
      leaveCurrent = null;
      clearInterval(countdown);
      stack[stack.length - 1] = () => editorView(id);
      await show(() => editorView(id));
      return;
    }
    current.failures = (current.failures ?? 0) + 1;
    current.failedAt = Date.now();
    await putNote(current);
    pad.showError();
    const left = FREE_ATTEMPTS - current.failures;
    if (left > 0) {
      message.textContent =
        (method === 'pattern' ? 'Patrón incorrecto.' : 'Números incorrectos.') +
        (left <= 2 ? ` Te quedan ${left} ${left === 1 ? 'intento' : 'intentos'} antes de tener que esperar.` : ' Probá de nuevo.');
      setTimeout(() => {
        pad.setDisabled(false);
        pad.reset();
      }, 900);
    } else {
      setTimeout(() => startCountdown(current), 900);
    }
  };

  const pad: Pad = method === 'pattern' ? patternPad(attempt) : pinPad((p) => attempt(p));

  app.append(
    header('🔒 ' + (note.title.trim() || 'Nota protegida'), { back: true }),
    h(
      'main',
      { class: 'content center' },
      h('h2', {}, method === 'pattern' ? 'Dibujá el patrón para abrir' : 'Escribí los 4 números para abrir'),
      pad.el,
      message,
    ),
  );
  if (remainingWait(note) > 0) startCountdown(note);
}

// ---------------------------------------------------------------------------
// Opciones: copia de seguridad, instalar, ayuda

function optionsView() {
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const n = await importBackup(file);
      await alertDialog('Copia recuperada', n ? `Se recuperaron ${n} ${n === 1 ? 'nota' : 'notas'}.` : 'Ya tenías todas las notas de esa copia.');
    } catch (e) {
      await alertDialog('No se pudo recuperar', (e as Error).message);
    }
  });

  app.append(
    header('Más opciones', { back: true }),
    h(
      'main',
      { class: 'content' },
      h(
        'section',
        { class: 'card' },
        h('h2', {}, '💾 Copia de seguridad'),
        h(
          'p',
          {},
          'Las notas se guardan solo en este celular. Si el celular se rompe o se pierde, se pierden las notas. ',
          'Guardá una copia de vez en cuando (por ejemplo en Google Drive o mandátela por mail).',
        ),
        h('p', { class: 'hint' }, 'Las notas protegidas quedan protegidas también en la copia. Las comunes se pueden leer, así que guardá el archivo en un lugar privado.'),
        h(
          'button',
          {
            class: 'btn btn-primary',
            onclick: async () => {
              await exportBackup();
              setFlag('last-backup', String(Date.now()));
              toast('Copia descargada');
            },
          },
          'Guardar una copia',
        ),
        h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Recuperar desde una copia'),
        fileInput,
      ),
      !isInstalled()
        ? h(
            'section',
            { class: 'card' },
            h('h2', {}, '📲 Instalar en el celular'),
            h('button', { class: 'btn', onclick: install }, 'Cómo instalar'),
          )
        : null,
      h(
        'section',
        { class: 'card' },
        h('h2', {}, '🔒 Sobre las notas protegidas'),
        h('p', {}, 'El contenido de una nota protegida se guarda cifrado y solo se puede leer con su patrón o sus 4 números.'),
        h('p', {}, 'Si te equivocás 5 veces seguidas, la app te hace esperar un rato antes de volver a probar.'),
        h('p', {}, 'Cuando bloqueás el celular, cambiás de app o la dejás 3 minutos sin tocar, la nota se cierra sola.'),
        h('p', { class: 'warning' }, '⚠️ Si te olvidás la clave de una nota, no hay forma de abrirla.'),
      ),
    ),
  );
}

function installHelpView() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  app.append(
    header('Instalar la app', { back: true }),
    h(
      'main',
      { class: 'content' },
      h(
        'section',
        { class: 'card' },
        ios
          ? h(
              'ol',
              { class: 'steps' },
              h('li', {}, 'Abrí esta página en Safari.'),
              h('li', {}, 'Tocá el botón de compartir (el cuadrado con una flecha hacia arriba).'),
              h('li', {}, 'Elegí "Agregar a inicio".'),
              h('li', {}, 'Tocá "Agregar". Vas a ver el ícono de Notas en la pantalla.'),
            )
          : h(
              'ol',
              { class: 'steps' },
              h('li', {}, 'Abrí esta página en Chrome.'),
              h('li', {}, 'Tocá los tres puntitos ⋮ arriba a la derecha.'),
              h('li', {}, 'Elegí "Agregar a la pantalla principal" o "Instalar app".'),
              h('li', {}, 'Confirmá. Vas a ver el ícono de Notas en la pantalla.'),
            ),
        h('p', {}, 'Después abrí siempre la app desde ese ícono.'),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Inicio

void askPersistentStorage();
void show(listView);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
