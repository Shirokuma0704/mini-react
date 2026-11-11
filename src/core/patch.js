// patch: apply a change list from src/core/diff.js to 실제 영역 (`container`), touching only what changed
// (the assignment: "바뀐 부분만 실제 영역에 반영"). Spec-draft §3.
//
// 실제 영역 is always drawn from a VDOM, so its child indexes are the VDOM's child indexes (no comments, no merged-
// away text). §3-3 Q12: the "key" attribute is never drawn here.
//
// The index problem (§3-5 "지워짐이 먼저 일어나면 뒤 번호가 밀리는 문제"): paths go stale as soon as the DOM changes.
// So patch first turns every old path into the DOM node it names, BEFORE changing anything, and from then on works
// with those node references. Then, in phases:
//   1. replace  — swap the node in place (the reference now points at the new node)
//   2. update   — text and attributes, on the referenced nodes
//   3. remove   — take the referenced nodes out
//   4. insert / move — per parent, front to back by the NEW index: put the node in front of whatever is at that
//      index now. This is the same walk diff did (§3-2 Q11), so after step 3 the parent's children are exactly the
//      survivors in old order, and each step makes positions 0..i final.
import { vdomToDomUnder, renderInto } from './render.js';

const NO_KEYS = { keys: false };
const id = (path) => path.join('.');

export function patch(container, changes, doc) {
  const at = (path) => path.reduce((node, i) => node.childNodes[i], container);

  // Resolve every old path first.
  const refs = new Map();
  const remember = (path) => {
    if (path && !refs.has(id(path))) refs.set(id(path), at(path));
  };
  for (const c of changes) {
    remember(c.oldPath);
    remember(c.parentOldPath);
    if (c.type === 'remove') remember(c.path);
  }

  for (const c of changes) {
    if (c.type !== 'replace') continue;
    if (c.oldPath.length === 0) {
      renderInto(container, c.node, doc, NO_KEYS); // the root wrapper itself (never happens: roots are both <div>)
      continue;
    }
    const old = refs.get(id(c.oldPath));
    const fresh = vdomToDomUnder(old.parentNode, c.node, doc, NO_KEYS);
    old.parentNode.replaceChild(fresh, old);
    refs.set(id(c.oldPath), fresh);
  }

  for (const c of changes) {
    if (c.type !== 'update') continue;
    const node = refs.get(id(c.oldPath));
    if (c.what === 'text') {
      node.data = c.text;
    } else if (c.what === 'attrs') {
      for (const [name, value] of c.set) if (name !== 'key') node.setAttribute(name, value);
      for (const name of c.remove) node.removeAttribute(name);
    }
  }

  for (const c of changes) {
    if (c.type === 'remove') {
      const node = refs.get(id(c.path));
      node.parentNode.removeChild(node);
    }
  }

  // Inserts and moves, grouped by the parent they happen in, each group sorted by new index.
  const byParent = new Map();
  const add = (parent, index, node) => {
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push({ index, node });
  };
  for (const c of changes) {
    const index = c.path?.[c.path.length - 1];
    if (c.type === 'insert') {
      const parent = refs.get(id(c.parentOldPath));
      add(parent, index, vdomToDomUnder(parent, c.node, doc, NO_KEYS));
    } else if (c.type === 'update' && c.what === 'move') {
      const node = refs.get(id(c.oldPath));
      add(node.parentNode, index, node);
    }
  }
  for (const [parent, steps] of byParent) {
    steps.sort((a, b) => a.index - b.index);
    for (const { index, node } of steps) {
      parent.insertBefore(node, parent.childNodes[index] ?? null);
    }
  }
}
