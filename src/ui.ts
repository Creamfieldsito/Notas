// Pequeñas ayudas para armar la interfaz sin librerías.

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k in el && typeof v !== 'string') {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

/** Ventana de confirmación con botones grandes. */
export function confirmDialog(opts: {
  title: string;
  message?: string;
  ok: string;
  cancel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (v: boolean) => {
      overlay.remove();
      resolve(v);
    };
    const overlay = h(
      'div',
      { class: 'overlay', role: 'dialog', 'aria-modal': 'true' },
      h(
        'div',
        { class: 'dialog' },
        h('h2', {}, opts.title),
        opts.message ? h('p', {}, opts.message) : null,
        h(
          'div',
          { class: 'dialog-actions' },
          opts.cancel !== ''
            ? h('button', { class: 'btn', onclick: () => close(false) }, opts.cancel ?? 'Cancelar')
            : null,
          h(
            'button',
            { class: opts.danger ? 'btn btn-danger' : 'btn btn-primary', onclick: () => close(true) },
            opts.ok,
          ),
        ),
      ),
    );
    document.body.append(overlay);
    (overlay.querySelector('.btn-primary, .btn-danger') as HTMLElement | null)?.focus();
  });
}

export function alertDialog(title: string, message?: string): Promise<void> {
  return confirmDialog({ title, message, ok: 'Entendido', cancel: '' }).then(() => undefined);
}

let toastTimer: number | undefined;
export function toast(text: string): void {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), 2500);
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Hoy ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Ayer ${time}`;
  return d.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}
