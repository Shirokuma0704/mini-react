// diff: two root VDOMs -> the list of changes that turns the old one into the new one. Spec-draft §3
// (grilled 11-09, Q1-Q15, 상철님's decisions). Pure: no DOM, inputs are never changed.
//
// Change list (§3-4 "{ 종류, 위치, 새 노드 }"; the two-path detail is the orchestrator's, see progress.md Open):
//   { type: 'insert',  path, parentOldPath, node }            추가    path = place in the NEW tree
//   { type: 'remove',  path }                                 지워짐  path = place in the OLD tree
//   { type: 'replace', oldPath, path, node }                  교체    (tag or kind differs, §3-1 Q9)
//   { type: 'update',  what: 'text',  oldPath, path, text }   고침(글자)
//   { type: 'update',  what: 'attrs', oldPath, path, set, remove }   고침(속성); set = [[name, value]...]
//   { type: 'update',  what: 'move',  oldPath, path }         고침(자리) (§3-1 Q10: no separate "옮김" kind)
// Paths are child indexes from the root ([] = root). oldPath = in the old tree, path = in the new tree.
//
// Order, per parent: its removes first, then its new children front to back (insert / move, then that child's own
// changes). src/core/patch.js applies them with the same picture: removes, then front to back.
import { vdomEqual } from './vdomEqual.js';

const keyOf = (n) => (n.kind === 'element' && Object.hasOwn(n.attrs, 'key') ? n.attrs.key : null);

export function diff(oldRoot, newRoot) {
  const out = [];
  diffNode(oldRoot, newRoot, [], [], out);
  return out;
}

function diffNode(a, b, oldPath, path, out) {
  // §3-1 Q9: tag differs → 교체, the inside is not compared. 글자 ↔ 노드 (kind differs) → 교체 too.
  if (a.kind !== b.kind || (a.kind === 'element' && a.tag !== b.tag)) {
    out.push({ type: 'replace', oldPath, path, node: b });
    return;
  }
  if (a.kind === 'text') {
    if (a.text !== b.text) out.push({ type: 'update', what: 'text', oldPath, path, text: b.text });
    return;
  }
  // Pairs of [name, value], not an object: an attribute may be called "__proto__" (domToVdom keeps it as an own key).
  const set = [];
  const remove = [];
  for (const [name, value] of Object.entries(b.attrs)) {
    if (!Object.hasOwn(a.attrs, name) || a.attrs[name] !== value) set.push([name, value]);
  }
  for (const name of Object.keys(a.attrs)) {
    if (!Object.hasOwn(b.attrs, name)) remove.push(name);
  }
  if (set.length > 0 || remove.length > 0) out.push({ type: 'update', what: 'attrs', oldPath, path, set, remove });
  diffChildren(a.children, b.children, oldPath, path, out);
}

// §3-2 for a run of nodes without keys, olds[oLo..oHi) vs news[nLo..nHi):
// 양 끝 잘라내기 — skip equal nodes from the front while they are equal, then from the back; the middle left over is
// paired by index for the shorter length (Q7-2); whatever is left unpaired becomes insert / remove.
// Writes the pairing into match[newIndex] = oldIndex.
function matchRun(olds, oLo, oHi, news, nLo, nHi, match) {
  while (oLo < oHi && nLo < nHi && vdomEqual(olds[oLo], news[nLo])) match[nLo++] = oLo++;
  while (oLo < oHi && nLo < nHi && vdomEqual(olds[oHi - 1], news[nHi - 1])) match[--nHi] = --oHi;
  const n = Math.min(oHi - oLo, nHi - nLo);
  for (let i = 0; i < n; i++) match[nLo + i] = oLo + i;
}

// §3-2 Q8: every keyless node sticks to the NEXT keyed node; keyless nodes after the last keyed node stick to it.
// A list with no keyed node at all makes one group without a key (it never pairs by key).
function groupsOf(list) {
  const groups = [];
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const key = keyOf(list[i]);
    if (key === null) continue;
    groups.push({ key, head: i, lead: [start, i], tail: [i + 1, i + 1] });
    start = i + 1;
  }
  if (start < list.length) {
    if (groups.length > 0) groups[groups.length - 1].tail = [start, list.length];
    else groups.push({ key: null, head: -1, lead: [start, list.length], tail: [list.length, list.length] });
  }
  return groups;
}

function diffChildren(olds, news, oldPath, path, out) {
  const match = new Array(news.length).fill(-1); // new index -> old index, -1 = no pair

  const keyed = olds.some((n) => keyOf(n) !== null) || news.some((n) => keyOf(n) !== null);
  if (!keyed) {
    // §3-2 Q7-1: no key anywhere in this list → 양 끝 잘라내기 over the whole list.
    matchRun(olds, 0, olds.length, news, 0, news.length, match);
  } else {
    // §3-2 Q6: pair groups by key. §3-3 Q14: duplicate keys pair in order of appearance — the 1st old "a" with the
    // 1st new "a", the 2nd with the 2nd (orchestrator's rule; the spec says "결과 보장 안 함"). An unchanged list
    // with duplicates must still give no change, or Patch would make a version for nothing (§2-2).
    const oldByKey = new Map(); // key -> old groups with that key, in order, not yet paired
    for (const g of groupsOf(olds)) {
      if (g.key === null) continue;
      if (!oldByKey.has(g.key)) oldByKey.set(g.key, []);
      oldByKey.get(g.key).push(g);
    }
    for (const ng of groupsOf(news)) {
      const og = ng.key === null ? undefined : oldByKey.get(ng.key)?.shift();
      if (!og) continue;
      match[ng.head] = og.head;
      matchRun(olds, og.lead[0], og.lead[1], news, ng.lead[0], ng.lead[1], match);
      matchRun(olds, og.tail[0], og.tail[1], news, ng.tail[0], ng.tail[1], match);
    }
  }

  // Removes: old children nobody paired with, in old order.
  const paired = new Set(match.filter((o) => o !== -1));
  for (let o = 0; o < olds.length; o++) {
    if (!paired.has(o)) out.push({ type: 'remove', path: [...oldPath, o] });
  }

  // §3-2 Q11: walk the new order front to back. `line` is the sibling list as it stands while we go (old survivors
  // in old order, then each step applied). At position i, if the paired old node is not already there, move it there.
  // Not minimal on purpose ("굳이 최소가 아니여도 되지").
  const line = [];
  for (let o = 0; o < olds.length; o++) if (paired.has(o)) line.push(o);
  for (let i = 0; i < news.length; i++) {
    const o = match[i];
    const p = [...path, i];
    if (o === -1) {
      out.push({ type: 'insert', path: p, parentOldPath: oldPath, node: news[i] });
      line.splice(i, 0, -1);
      continue;
    }
    if (line[i] !== o) {
      line.splice(line.indexOf(o), 1);
      line.splice(i, 0, o);
      out.push({ type: 'update', what: 'move', oldPath: [...oldPath, o], path: p });
    }
    diffNode(olds[o], news[i], [...oldPath, o], p, out);
  }
}
