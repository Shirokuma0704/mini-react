// Deep equality of two VDOM nodes (spec §1 shape). Attribute order is ignored; everything else must match.
// Used by diff's 양 끝 잘라내기 (spec §3-2) to tell "the same node" at the ends of a list.
// Moved out of src/history.js (history re-exports it) so diff and history can share it without importing each other.
export function vdomEqual(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'text') return a.text === b.text;
  if (a.tag !== b.tag) return false;
  const ak = Object.keys(a.attrs);
  const bk = Object.keys(b.attrs);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.hasOwn(b.attrs, k) || a.attrs[k] !== b.attrs[k]) return false;
  }
  if (a.children.length !== b.children.length) return false;
  for (let i = 0; i < a.children.length; i++) {
    if (!vdomEqual(a.children[i], b.children[i])) return false;
  }
  return true;
}
