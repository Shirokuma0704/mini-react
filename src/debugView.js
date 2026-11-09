// Debug panel, spec-draft §2-3: old and new VDOM side by side, "ide diff처럼", colored where things changed.
//
// §2-3 (Q6-1): the color comes from OUR diff's result, not from comparing the text, "그래야 diff가 틀렸을 때 눈에 보인다".
// So this file never compares old and new itself. It lays out each VDOM one line per node piece, gives every line
// the path of its node, and paints the lines whose path is at or under a changed path.
//
// Path = child indexes from the root, the same as change.path in src/diff.js. The root is not shown
// (it is the wrapper, see src/render.js), so the first lines have paths [0], [1], ...
//
// Colors by change type and side. Only 'replace' exists while diff is PROVISIONAL; any other type the real diff
// adds is painted 'chg' on both sides until this table learns it.
const MARKS = {
  replace: { old: 'del', new: 'add' },
};

function startsWith(path, prefix) {
  if (prefix.length > path.length) return false;
  return prefix.every((v, i) => path[i] === v);
}

function markFor(path, changes, side) {
  let mark = null;
  for (const change of changes) {
    if (!startsWith(path, change.path)) continue;
    mark = MARKS[change.type]?.[side] ?? 'chg';
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
