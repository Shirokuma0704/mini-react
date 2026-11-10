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

export const EASE = 'cubic-bezier(0.4, 0.14, 0.3, 1)'; // travel
export const ARRIVE = 'cubic-bezier(0, 0, 0.38, 0.9)';
export const TRAVEL = 520; // nodes slide from where they were to where they are now
export const WIPE = 420;
const HOLD = 1900; // how long a box stays so its label can be read
const GONE = 600; // beat 0: a removed node's ghost is held 250 ms, then wiped away over the other 350 ms

const LABELS = { add: '추가', move: '자리', attrs: '속성', text: '글자', del: '지워짐' };

// Can this document animate at all? (jsdom has no element.animate, so everything stays a no-op there.)
export function canAnimate(doc, probe) {
  const win = doc.defaultView;
  return Boolean(win && probe && typeof probe.animate === 'function' && typeof win.matchMedia === 'function');
}

// FLIP pass: every element of `container` that is now drawn somewhere else than in `oldRects` slides there from its
// old place. Inline boxes ignore transform, so they are skipped; a child only gets the part of the shift that its
// nearest transformable ancestor does not already carry. Returns whether anything travelled.
export function flip(container, oldRects, { delay = 0 } = {}) {
  const win = container.ownerDocument.defaultView;
  const isInline = new Map();
  const inline = (el) => {
    if (!isInline.has(el)) isInline.set(el, win?.getComputedStyle?.(el)?.display === 'inline');
    return isInline.get(el);
  };
  const shift = new Map(); // transformable elements only
  for (const [node, old] of oldRects) {
    if (node.nodeType !== 1 || node === container || !container.contains(node) || inline(node)) continue;
    const rect = node.getBoundingClientRect();
    shift.set(node, { x: old.left - rect.left, y: old.top - rect.top });
  }
  let travelled = false;
  for (const [el, own] of shift) {
    let up = { x: 0, y: 0 };
    for (let p = el.parentNode; p && p !== container; p = p.parentNode) {
      if (p.nodeType !== 1 || inline(p)) continue;
      up = shift.get(p) ?? up; // nearest transformable ancestor only; a new one (no old rect) carries nothing
      break;
    }
    const x = own.x - up.x;
    const y = own.y - up.y;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
    el.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }], {
      duration: TRAVEL,
      delay,
      easing: EASE,
      fill: 'backwards',
    });
    travelled = true;
  }
  return travelled;
}

// A new line on top of a log list: it and every line under it come down as one block; the new line is clipped so
// nothing of it is drawn above the list's top edge.
export function slideInLine(li) {
  const height = li.getBoundingClientRect().height;
  li.animate(
    [
      { transform: `translateY(${-height}px)`, clipPath: 'inset(100% 0 0 0)' },
      { transform: 'translateY(0)', clipPath: 'inset(0 0 0 0)' },
    ],
    { duration: 320, easing: EASE },
  );
  for (let el = li.nextElementSibling; el; el = el.nextElementSibling) {
    el.animate([{ transform: `translateY(${-height}px)` }, { transform: 'translateY(0)' }], {
      duration: 320,
      easing: EASE,
    });
  }
}

export function createMotion(doc, { actual, fx, tree, treeRing, statusText }) {
  const win = doc.defaultView;
  const can = Boolean(fx) && canAnimate(doc, actual);
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

  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  // A colored frame with a word on it, laid over 실제 영역 at `rect`. `placed` holds the tag rects already drawn in
  // this pass: a tag that lands on one of them is pushed sideways. Returns the box and how far the tag and the halo
  // reach left/right of it (so a clip-path wipe does not crop them).
  function box(kind, words, rect, base, placed) {
    const el = doc.createElement('div');
    // Near the top of the stage a tag above the box would stick out over the panel heading: put it inside instead.
    // A removed node's tag also goes inside (right end): above, it would cover the line before the removed one.
    const inside = kind === 'del' || rect.top - base.top < 24;
    el.className = `fx-box ${kind}${inside ? ' in' : ''}`;
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
    let tagRect = tag.getBoundingClientRect();
    let offset = 0;
    for (let tries = 0; tries < 6; tries += 1) {
      const hit = placed.find((p) => overlaps(tagRect, p));
      if (!hit) break;
      offset += hit.width + 4;
      if (inside) tag.style.marginRight = `${offset}px`;
      else tag.style.marginLeft = `${offset}px`;
      tagRect = tag.getBoundingClientRect();
    }
    placed.push(tagRect);
    const boxRect = el.getBoundingClientRect();
    return {
      el,
      padL: Math.max(8, boxRect.left - tagRect.left),
      padR: Math.max(8, tagRect.right - boxRect.right),
    };
  }

  // A copy of a removed node for the overlay: it shows WHAT went away. The copy lives in #actual-fx, never in
  // 실제 영역. ids are dropped so the page never holds the same id twice while the copy is up.
  function ghostOf(node) {
    const ghost = doc.createElement('div');
    ghost.className = 'fx-ghost';
    const copy = node.cloneNode(true);
    if (copy.nodeType === 1) {
      copy.removeAttribute('id');
      for (const el of copy.querySelectorAll('[id]')) el.removeAttribute('id');
      copy.style.margin = '0';
    }
    ghost.appendChild(copy);
    return ghost;
  }

  // How long a frame lives. A frame that is not wiped in comes from nowhere, so it may fade in (design §8).
  function life(el, delay, fadeIn) {
    const frames = fadeIn
      ? [
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.1 },
          { opacity: 1, offset: 0.8 },
          { opacity: 0, offset: 1 },
        ]
      : [
          { opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.8 },
          { opacity: 0, offset: 1 },
        ];
    const anim = el.animate(frames, { duration: HOLD, delay, fill: 'both', easing: 'linear' });
    anim.onfinish = () => el.remove();
  }

  // Call right AFTER patch with what src/touched.js saw.
  function after(snap, touched) {
    if (!snap || off()) return;
    clearFx();
    const base = fx.getBoundingClientRect();
    const placed = [];

    // Beat 0 (remove): the removed node itself stays visible where it WAS, as a struck-through red copy inside the
    // red frame (his feedback 11-10: an empty red box "따로 놀아 보임" — the content had already vanished under it).
    // Copy, frame and tag are held, then wiped away as one. The other nodes keep their old places meanwhile.
    let gone = 0;
    for (const node of touched.removed) {
      const rect = snap.rects.get(node);
      if (!rect) continue;
      gone = GONE;
      const { el, padL, padR } = box('del', LABELS.del, rect, base, placed);
      el.insertBefore(ghostOf(node), el.lastChild); // under the tag, over the fill
      const whole = `inset(-30px ${-padR}px -8px ${-padL}px)`;
      const wiped = `inset(-30px ${-padR}px -8px 100%)`;
      const wipe = el.animate(
        [
          { clipPath: whole, offset: 0 },
          { clipPath: whole, offset: 0.42, easing: EASE },
          { clipPath: wiped, offset: 1 },
        ],
        { duration: GONE, easing: 'linear', fill: 'forwards' },
      );
      wipe.onfinish = () => el.remove();
    }

    // Beat 1 (travel): every node that is now drawn somewhere else slides there from its old place.
    const travelled = flip(actual, snap.rects, { delay: gone });

    // Beat 2 (arrive): a frame on every node patch touched, after the travel has ended.
    const wait = gone + (travelled ? TRAVEL : 0);
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
      const { el, padL, padR } = box(m.kind, m.words.join(' · '), rect, base, placed);
      // A new element is drawn in with a wipe from the left; its frame is wiped in step with it.
      if (m.kind === 'add' && node.nodeType === 1) {
        const opts = { duration: WIPE, delay: wait, easing: ARRIVE, fill: 'backwards' };
        node.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], opts);
        el.animate(
          [{ clipPath: `inset(-30px 100% -8px ${-padL}px)` }, { clipPath: `inset(-30px ${-padR}px -8px ${-padL}px)` }],
          opts,
        );
        life(el, wait, false);
      } else {
        life(el, wait, true);
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
      // Insets reach past the li so its connector line (left of it) and the button's ring are not cropped.
      btn.parentNode.animate(
        [
          { clipPath: 'inset(-6px 100% -6px -24px)', transform: 'translateX(-8px)' },
          { clipPath: 'inset(-6px -6px -6px -24px)', transform: 'translateX(0)' },
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
    // The ring in flight is the only ring: the new button's own ring stays hidden for the whole flight (animate,
    // so no class or style lands on it) and shows up in the same frame the flying one ends.
    const hidden = '0 0 0 2px transparent, 0 0 0 4px transparent';
    current.animate([{ boxShadow: hidden }, { boxShadow: hidden }], { duration: TRAVEL, easing: 'steps(1, end)' });
    treeRing.animate([{ ...at(from), opacity: 1 }, { ...at(to), opacity: 1 }], { duration: TRAVEL, easing: EASE });
  }

  // ---------- small ones ----------

  // A new line of the action log: the new line and the older ones below it move down together as one block.
  function entered(li) {
    if (off()) return;
    slideInLine(li);
  }

  // The status line got a new sentence: the box stays, only the text rises into it.
  function said() {
    if (off() || !statusText) return;
    statusText.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], {
      duration: 220,
      easing: ARRIVE,
    });
  }

  return { before, after, treeBefore, treeAfter, entered, said };
}
