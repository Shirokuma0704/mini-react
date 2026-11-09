// Debug panel, spec-draft §2-3: old and new VDOM side by side, "ide diff처럼", colored where things changed.
//
// §2-3 (Q6-1): the color comes from OUR diff's result, not from comparing the text, "그래야 diff가 틀렸을 때 눈에 보인다".
// So this file never compares old and new itself. It lays out each VDOM one line per node piece, gives every line
// the path of its node, and paints the lines a change points at.
//
// Paths = child indexes from the root, as in src/diff.js. The root is not shown (it is the wrapper, see
// src/render.js), so the first lines have paths [0], [1], ... The old side reads a change's place in the OLD tree
// (oldPath; for remove, path), the new side its place in the NEW tree (path; remove has none there).
//
// Colors, spec §3-4: 추가 = add (new side), 지워짐 = del (old side), 교체 = del old + add new, 고침 = chg both sides
// (자리 고침 included). An unknown type is painted chg on both sides, so it still shows.
// Reach: insert / remove / replace / move cover the node and everything under it; a text or attribute change covers
// only that node's own lines. When several changes cover a line, the most specific (longest path) wins.
const SIDES = {
  insert: { new: 'add' },
  remove: { old: 'del' },
  replace: { old: 'del', new: 'add' },
};

function startsWith(path, prefix) {
  if (prefix.length > path.length) return false;
  return prefix.every((v, i) => path[i] === v);
}

function placeOn(change, side) {
  if (side === 'old') return change.type === 'remove' ? change.path : change.oldPath;
  return change.type === 'remove' ? undefined : change.path;
}

function markFor(path, changes, side) {
  let mark = null;
  let best = -1;
  for (const change of changes) {
    const at = placeOn(change, side);
    if (!at) continue;
    const known = SIDES[change.type];
    const color = known ? known[side] : 'chg';
    if (!color) continue;
    const onlyItself = change.type === 'update' && change.what !== 'move';
    const hit = onlyItself ? at.length === path.length && startsWith(path, at) : startsWith(path, at);
    if (hit && at.length > best) {
      best = at.length;
      mark = color;
    }
  }
  return mark;
}

function attrText(attrs) {
  return Object.entries(attrs)
    .map(([k, v]) => ` ${k}=${JSON.stringify(v)}`) // JSON form: quotes inside a value stay visible (Codex batch-after-limit)
    .join('');
}

// root VDOM + change list -> [{ depth, text, path, mark }]; side is 'old' or 'new'.
export function debugLines(root, changes, side) {
  const lines = [];
  function walk(node, path, depth) {
    const mark = markFor(path, changes, side);
    if (node.kind === 'text') {
      // JSON form so spaces and newlines are visible (the VDOM keeps them, spec §1).
      lines.push({ depth, text: JSON.stringify(node.text), path, mark });
      return;
    }
    lines.push({ depth, text: `<${node.tag}${attrText(node.attrs)}>`, path, mark });
    node.children.forEach((child, i) => walk(child, [...path, i], depth + 1));
    if (node.children.length > 0) lines.push({ depth, text: `</${node.tag}>`, path, mark });
  }
  root.children.forEach((child, i) => walk(child, [i], 0));
  return lines;
}

export function renderDebug(pre, lines, doc) {
  while (pre.firstChild) pre.removeChild(pre.firstChild);
  for (const line of lines) {
    const span = doc.createElement('span');
    span.className = line.mark ? `line ${line.mark}` : 'line';
    span.dataset.path = line.path.join('.');
    span.textContent = '  '.repeat(line.depth) + line.text;
    pre.appendChild(span);
  }
}
