// Which nodes of 실제 영역 did patch really touch? Read from the DOM itself with a MutationObserver, not from the
// diff's change list. The action log shows the count and the page flashes exactly these nodes (src/motion.js), so
// "바뀐 부분만 실제 영역에 반영" (the assignment) can be seen instead of believed.
//
// take() returns what happened since the last take():
//   added   — nodes put in that were not there before (a replace's new node counts here)
//   removed — nodes taken out and not put back (a replace's old node counts here)
//   moved   — nodes taken out and put back somewhere in the same pass (자리 고침)
//   attrs   — elements whose attribute changed
//   text    — text nodes whose characters changed
//   count   — how many different nodes that is (a node that moved and got a new attribute counts once)
// A node created and filled inside a new subtree is not listed on its own: only the subtree's top node was put in.

const EMPTY = { added: [], removed: [], moved: [], attrs: [], text: [], count: 0 };

// Sorts MutationRecords into added / removed / moved / attrs / text (see the list at the top). Pure: no DOM writes.
export function classify(records, container) {
  const added = new Set();
  const removed = new Set();
  const attrs = new Set();
  const text = new Set();
  for (const record of records) {
    if (record.type === 'childList') {
      for (const node of record.addedNodes) added.add(node);
      for (const node of record.removedNodes) removed.add(node);
    } else if (record.type === 'attributes') {
      attrs.add(record.target);
    } else if (record.type === 'characterData') {
      text.add(record.target);
    }
  }
  const moved = [...added].filter((node) => removed.has(node) && container.contains(node));
  for (const node of moved) {
    added.delete(node);
    removed.delete(node);
  }
  // A node that came and went within one pass never stayed in 실제 영역.
  for (const node of [...added]) {
    if (!container.contains(node)) {
      added.delete(node);
      removed.delete(node);
    }
  }
  const all = new Set([...added, ...removed, ...moved, ...attrs, ...text]);
  return { added: [...added], removed: [...removed], moved, attrs: [...attrs], text: [...text], count: all.size };
}

export function watchTouched(container, doc) {
  const Observer = doc.defaultView?.MutationObserver;
  if (!Observer) return { take: () => EMPTY };

  const observer = new Observer(() => {});
  observer.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });

  function take() {
    return classify(observer.takeRecords(), container);
  }

  return { take };
}
