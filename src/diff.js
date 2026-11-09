// PROVISIONAL, replace after the diff grill (spec-draft §2-5: what diff reports as "changed" is not decided yet).
//
// For now diff reports ONE change: replace the whole root. The page around it (Patch, history, debug panel) is
// built against the change-list format below, so the real diff can drop in later.
//
// Change-list format (minimal, an open question for 상철님 in docs/agent/progress.md):
//   change = { type, path, node? }
//   - type: 'replace' (the only type so far)
//   - path: child indexes from the root, [] = the root itself, [1, 0] = root.children[1].children[0]
//   - node: the new VDOM for that spot (for 'replace')

export function diff(oldRoot, newRoot) {
  return [{ type: 'replace', path: [], node: newRoot }];
}
