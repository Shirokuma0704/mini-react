// PROVISIONAL, replace after the diff grill (spec-draft §2-5: how patch applies changes is not decided yet).
//
// Applies a change list from src/diff.js to 실제 영역 (`container`). Only the provisional change exists so far:
// { type: 'replace', path: [] } → redraw everything inside the container from the new root.
// Anything else throws, so a real diff that reaches this file before patch is written fails loudly.
import { renderInto } from './render.js';

export function patch(container, changes, doc) {
  for (const change of changes) {
    if (change.type === 'replace' && change.path.length === 0) {
      renderInto(container, change.node, doc);
      continue;
    }
    throw new Error(`PROVISIONAL patch: change not supported yet: ${JSON.stringify({ type: change.type, path: change.path })}`);
  }
}
