// Motion for the verification page (his request 11-10: "좀더 모션이 있었으면 좋겠고").
// Rules from his design file (~/.claude/design/design.md §4): things move (transform, wipe) instead of fading,
// no bounce and no scale pop, beats run one after another, and prefers-reduced-motion shows the end state only.
//
// Nothing here writes a class or an attribute into 실제 영역: its content must stay exactly what patch made
// (tests read it back with containerToVdom). Nodes inside it are animated with element.animate(), which leaves no
// trace in the DOM, and the colored boxes live in a separate layer (#actual-fx) laid over it.
//
// What the boxes mark comes from src/touched.js (what patch REALLY touched), never from the diff result. So if patch
// touched more than the diff said, the extra boxes show it.
//
// In jsdom (tests) element.animate does not exist, so every function below does nothing.

const EASE = 'cubic-bezier(0.4, 0.14, 0.3, 1)'; // travel
const ARRIVE = 'cubic-bezier(0, 0, 0.38, 0.9)';
const TRAVEL = 520; // nodes slide from where they were to where they are now
const WIPE = 420;
const HOLD = 1900; // how long a box stays so its label can be read

const LABELS = { add: '추가', move: '자리', attrs: '속성', text: '글자', del: '지워짐' };

export function createMotion(doc, { actual, fx, tree, treeRing, status }) {
  const win = doc.defaultView;
  const can = Boolean(win && fx && typeof actual.animate === 'function' && typeof win.matchMedia === 'function');
  const off = () => !can || win.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Where a node is drawn. Text nodes have no box of their own, a Range gives one. Blank text draws nothing.
  function rectOf(node) {
    if (node.nodeType === 1) return node.getBoundingClientRect();
    if (node.nodeType === 3 && node.data.trim() !== '') {
      const range = doc.createRange();
      range.selectNodeContents(node);
      return typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
    }
    return null;
  }

  // ---------- 실제 영역 ----------

  // Call right BEFORE patch: remembers where every node of 실제 영역 is drawn.
  function before() {
    if (off()) return null;
    const rects = new Map();
    const walker = doc.createTreeWalker(actual, 5); // 5 = elements + text nodes
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const rect = rectOf(node);
      if (rect) rects.set(node, rect);
    }
    return { rects };
  }

  function clearFx() {
    while (fx.firstChild) fx.removeChild(fx.firstChild);
  }

  // A colored frame with a word on it, laid over 실제 영역 at `rect`.
  function box(kind, words, rect, base, delay) {
    const el = doc.createElement('div');
    el.className = `fx-box ${kind}`;
    el.style.left = `${rect.left - base.left}px`;
    el.style.top = `${rect.top - base.top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
    const fill = doc.createElement('span');
    fill.className = 'fx-fill';
    const tag = doc.createElement('span');
    tag.className = 'fx-tag';
    tag.textContent = words;
    el.append(fill, tag);
    fx.appendChild(el);
    // The frame itself comes from nowhere, so this one may fade (design §8: fade only what appears from nowhere).
    const life = el.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.1 },
        { opacity: 1, offset: 0.8 },
        { opacity: 0, offset: 1 },
      ],
      { duration: HOLD, delay, fill: 'both', easing: 'linear' },
    );
    life.onfinish = () => el.remove();
    return fill;
  }

  // Call right AFTER patch with what src/touched.js saw.
  function after(snap, touched) {
    if (!snap || off()) return;
    clearFx();
    const base = fx.getBoundingClientRect();

    // Beat 1 (travel): every node that is now drawn somewhere else slides there from its old place.
    // A child only gets the part of the shift its parent does not already carry.
    const shift = new Map();
    for (const [node, old] of snap.rects) {
      if (node.nodeType !== 1 || !actual.contains(node)) continue;
      const rect = node.getBoundingClientRect();
      shift.set(node, { x: old.left - rect.left, y: old.top - rect.top });
    }
    let travelled = false;
    for (const [el, own] of shift) {
      const up = shift.get(el.parentNode) ?? { x: 0, y: 0 };
      const x = own.x - up.x;
      const y = own.y - up.y;
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
      el.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], {
        duration: TRAVEL,
        easing: EASE,
      });
      travelled = true;
    }
    const wait = travelled ? TRAVEL : 0;

    // Removed nodes: a red frame where the node WAS, wiped away while the others travel.
    for (const node of touched.removed) {
      const rect = snap.rects.get(node);
      if (!rect) continue;
      const fill = box('del', LABELS.del, rect, base, 0);
      fill.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 0 100%)' }], {
        duration: WIPE + 200,
        delay: 500,
        easing: EASE,
        fill: 'forwards',
      });
    }

    // Beat 2 (arrive): a frame on every node patch touched, after the travel has ended.
    const marks = new Map(); // node -> { kind, words[] }
    const mark = (node, kind, word) => {
      const m = marks.get(node) ?? { kind, words: [] };
      m.words.push(word);
      marks.set(node, m);
    };
    for (const node of touched.added) mark(node, 'add', LABELS.add);
    for (const node of touched.moved) mark(node, 'move', LABELS.move);
    for (const node of touched.attrs) if (actual.contains(node)) mark(node, 'chg', LABELS.attrs);
    for (const node of touched.text) if (actual.contains(node)) mark(node, 'chg', LABELS.text);
    for (const [node, m] of marks) {
      const rect = rectOf(node);
      if (!rect || (rect.width === 0 && rect.height === 0)) continue;
      box(m.kind, m.words.join(' · '), rect, base, wait);
      // A new element is drawn in with a wipe from the left; until its turn it stays hidden.
      if (m.kind === 'add' && node.nodeType === 1) {
        node.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
          duration: WIPE,
          delay: wait,
          easing: ARRIVE,
          fill: 'backwards',
        });
      }
    }
  }

  // ---------- history tree ----------

  // Where the "지금" button is, relative to the ring's layer. Call before the tree is redrawn.
  function treeBefore() {
    if (off() || !treeRing) return null;
    const current = tree.querySelector('button.current');
    return current ? current.getBoundingClientRect() : null;
  }

  // After the tree is redrawn: a version that was not there before is drawn in, and the ring travels from the old
  // "지금" button to the new one (the same marker moving, not one vanishing and another appearing).
  function treeAfter(from, freshIds) {
    if (off()) return;
    for (const id of freshIds) {
      const btn = tree.querySelector(`button[data-id="${id}"]`);
      if (!btn) continue;
      btn.parentNode.animate(
        [
          { clipPath: 'inset(0 100% 0 0)', transform: 'translateX(-8px)' },
          { clipPath: 'inset(0 0 0 0)', transform: 'translateX(0)' },
        ],
        { duration: WIPE, easing: ARRIVE },
      );
    }
    const current = tree.querySelector('button.current');
    if (!from || !current || !treeRing) return;
    const to = current.getBoundingClientRect();
    if (Math.abs(to.left - from.left) < 0.5 && Math.abs(to.top - from.top) < 0.5) return;
    const base = treeRing.parentNode.getBoundingClientRect();
    const at = (r) => ({
      transform: `translate(${r.left - base.left}px, ${r.top - base.top}px)`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    treeRing.animate(
      [
        { ...at(from), opacity: 1, offset: 0 },
        { ...at(to), opacity: 1, offset: 0.75, easing: 'linear' },
        { ...at(to), opacity: 0, offset: 1 },
      ],
      { duration: TRAVEL + 180, easing: EASE },
    );
  }

  // ---------- small ones ----------

  // A new line of the action log: it is wiped in from the top and the older lines slide down to make room.
  function entered(li) {
    if (off()) return;
    const height = li.getBoundingClientRect().height;
    li.animate(
      [
        { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-8px)' },
        { clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' },
      ],
      { duration: 320, easing: ARRIVE },
    );
    for (let el = li.nextElementSibling; el; el = el.nextElementSibling) {
      el.animate([{ transform: `translateY(${-height}px)` }, { transform: 'translateY(0)' }], {
        duration: 320,
        easing: EASE,
      });
    }
  }

  // The status line got a new sentence.
  function said() {
    if (off() || !status) return;
    status.animate(
      [
        { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(6px)' },
        { clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' },
      ],
      { duration: 220, easing: ARRIVE },
    );
  }

  return { before, after, treeBefore, treeAfter, entered, said };
}
