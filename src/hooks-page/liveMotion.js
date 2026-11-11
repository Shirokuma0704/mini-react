// Motion for hooks.html. FunctionComponent.update() runs diff + patch inside itself, so there is no "before patch"
// hook to call. Instead each container keeps a snapshot of where its elements are drawn, and a MutationObserver
// (its callback runs as a microtask right after patch, before paint) compares the snapshot with the new places.
// Only element.animate() is used: no class, attribute or wrapper node is written into a card.
// In jsdom (tests) element.animate does not exist, so nothing at all is created there.

import { ARRIVE, TRAVEL, WIPE, canAnimate, flip, slideInLine } from '../page-tools/motion.js';
import { classify } from '../page-tools/touched.js';

const COMPONENTS = ['counter', 'todos', 'timer', 'filter', 'form']; // #rules is plain DOM with only buttons
const PROBES = [
  'counter-renders',
  'todos-renders',
  'timer-renders',
  'timer-alive',
  'timer-saw',
  'filter-renders',
  'filter-computes',
  'form-renders',
  'rules-out',
];
const CUE = 220;

export function watchLiveMotion(doc) {
  const win = doc.defaultView;
  if (!win || typeof win.MutationObserver !== 'function' || !canAnimate(doc, win.Element?.prototype)) {
    return () => {};
  }
  const reduced = () => win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const observers = [];

  const wipe = (el, duration, delay = 0) =>
    el.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
      duration,
      delay,
      easing: ARRIVE,
      fill: 'backwards',
    });
  const isInline = (el) => win.getComputedStyle(el).display === 'inline';

  const snapshot = (container) => {
    const rects = new Map();
    for (const el of container.querySelectorAll('*')) rects.set(el, el.getBoundingClientRect());
    return rects;
  };

  // ---- component cards ----
  for (const id of COMPONENTS) {
    const container = doc.getElementById(id);
    if (!container) continue;
    let rects = snapshot(container);
    const observer = new win.MutationObserver((records) => {
      // Measure first: a running animation moves what getBoundingClientRect() reports.
      const next = snapshot(container);
      const old = rects;
      rects = next;
      if (reduced()) return;
      const touched = classify(records, container);

      const travelled = flip(container, old, { delay: 0 });

      const fresh = touched.added.filter((n) => n.nodeType === 1 && container.contains(n));
      for (const el of fresh) wipe(el, WIPE, travelled ? TRAVEL : 0);

      const cued = new Set();
      const parents = [...touched.text, ...touched.added.filter((n) => n.nodeType === 3)].map((n) => n.parentNode);
      for (const parent of parents) {
        if (!parent || parent.nodeType !== 1 || parent === container || !container.contains(parent)) continue;
        if (cued.has(parent) || ['BUTTON', 'INPUT', 'LABEL'].includes(parent.tagName)) continue;
        if (isInline(parent) || fresh.some((a) => a.contains(parent))) continue;
        cued.add(parent);
        wipe(parent, CUE);
      }
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    observers.push(observer);
  }

  // ---- probe outputs: play only when the number/text really changed ----
  for (const id of PROBES) {
    const out = doc.getElementById(id);
    if (!out) continue;
    let last = out.textContent;
    const observer = new win.MutationObserver(() => {
      const now = out.textContent;
      if (now === last) return;
      last = now;
      if (!reduced()) wipe(out, CUE);
    });
    observer.observe(out, { childList: true, characterData: true, subtree: true });
    observers.push(observer);
  }

  return () => observers.forEach((o) => o.disconnect());
}

// A line of the hooks log (src/hooks-page/hooksLog.js): a new line slides in on top; a line that was folded into (the timer
// ticking) gets the short wipe on its text instead, since nothing new arrived.
export function lineEntered(doc, li, isNew) {
  const win = doc.defaultView;
  if (!canAnimate(doc, li) || win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (isNew) {
    slideInLine(li);
    return;
  }
  const result = li.querySelector('.result');
  if (result) {
    result.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: CUE, easing: ARRIVE });
  }
}
