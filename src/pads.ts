// Teclado de PIN y cuadrícula de patrón.

import { h } from './ui';
import { addPoint } from './pattern-path';

export interface Pad {
  el: HTMLElement;
  reset(): void;
  showError(): void;
  setDisabled(v: boolean): void;
}

const SVG = 'http://www.w3.org/2000/svg';
const POS = [50, 150, 250];
const HIT = 42; // radio en el que el dedo "toca" un punto (unidades del dibujo)

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function patternPad(onComplete: (path: number[]) => void): Pad {
  const svg = svgEl('svg', { viewBox: '0 0 300 300', class: 'pattern', role: 'img', 'aria-label': 'Cuadrícula para dibujar el patrón' });
  const line = svgEl('polyline', { class: 'pattern-line', points: '' });
  svg.append(line);
  const dots: SVGCircleElement[] = [];
  for (let i = 0; i < 9; i++) {
    const c = svgEl('circle', { cx: POS[i % 3], cy: POS[Math.floor(i / 3)], r: 14, class: 'pattern-dot' });
    dots.push(c);
    svg.append(c);
  }

  let path: number[] = [];
  let drawing = false;
  let disabled = false;

  const toLocal = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 300, y: ((e.clientY - r.top) / r.height) * 300 };
  };
  const hitTest = (x: number, y: number) => {
    for (let i = 0; i < 9; i++) {
      if (Math.hypot(x - POS[i % 3], y - POS[Math.floor(i / 3)]) < HIT) return i;
    }
    return -1;
  };
  const draw = (finger?: { x: number; y: number }) => {
    const pts = path.map((i) => `${POS[i % 3]},${POS[Math.floor(i / 3)]}`);
    if (finger && path.length) pts.push(`${finger.x},${finger.y}`);
    line.setAttribute('points', pts.join(' '));
    dots.forEach((d, i) => d.classList.toggle('on', path.includes(i)));
  };
  const visit = (p: { x: number; y: number }) => {
    const i = hitTest(p.x, p.y);
    if (i >= 0 && !path.includes(i)) {
      path = addPoint(path, i);
      navigator.vibrate?.(15);
    }
    draw(p);
  };

  svg.addEventListener('pointerdown', (e) => {
    if (disabled) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    svg.classList.remove('error');
    path = [];
    drawing = true;
    visit(toLocal(e));
  });
  svg.addEventListener('pointermove', (e) => {
    if (drawing) visit(toLocal(e));
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    draw();
    if (path.length) onComplete([...path]);
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  const wrap = h('div', { class: 'pad' });
  wrap.append(svg);
  return {
    el: wrap,
    reset() {
      path = [];
      svg.classList.remove('error');
      draw();
    },
    showError() {
      svg.classList.add('error');
      navigator.vibrate?.([60, 60, 60]);
    },
    setDisabled(v) {
      disabled = v;
      svg.classList.toggle('disabled', v);
    },
  };
}

export function pinPad(onComplete: (pin: string) => void): Pad {
  let pin = '';
  let disabled = false;
  const slots = [0, 1, 2, 3].map(() => h('span', { class: 'pin-slot' }));
  const display = h('div', { class: 'pin-display', 'aria-live': 'polite' }, slots);
  const update = () => {
    slots.forEach((s, i) => s.classList.toggle('on', i < pin.length));
    display.setAttribute('aria-label', `${pin.length} de 4 números`);
  };
  const press = (d: string) => {
    if (disabled || pin.length >= 4) return;
    display.classList.remove('error');
    pin += d;
    update();
    navigator.vibrate?.(10);
    if (pin.length === 4) {
      const done = pin;
      setTimeout(() => onComplete(done), 120);
    }
  };
  const del = () => {
    if (disabled) return;
    pin = pin.slice(0, -1);
    update();
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k) => {
    if (k === '') return h('span');
    if (k === 'del') return h('button', { class: 'key key-del', 'aria-label': 'Borrar', onclick: del }, '⌫');
    return h('button', { class: 'key', onclick: () => press(k) }, k);
  });
  const wrap = h('div', { class: 'pad' }, display, h('div', { class: 'keypad' }, keys));
  update();
  return {
    el: wrap,
    reset() {
      pin = '';
      display.classList.remove('error');
      update();
    },
    showError() {
      display.classList.add('error');
      navigator.vibrate?.([60, 60, 60]);
    },
    setDisabled(v) {
      disabled = v;
      wrap.classList.toggle('disabled', v);
    },
  };
}
