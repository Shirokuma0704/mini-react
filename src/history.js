// Version history as a tree, spec-draft §2-2. Pure module: no DOM, so it is unit-tested on its own.
//
// Rules from the spec (his words in quotes):
// - "git처럼 트리구조": committing after going back makes a new branch; old branches are never removed.
// - "바뀐 게 없으면 새 버전을 만들지 않고 알리기만 한다": commit equal to the current version → result 'same'.
// - "같은 갈래에서만": commit equal to a version on the path current → root → move there (result 'moved').
//   An equal version on another branch, or below the current one, does not count → a new version is made.
// - "(임시) 갈림길에서 앞으로가기는 마지막으로 있었던 가지로 간다": every arrival at a version marks, for each of
//   its ancestors, the child on the way to it as `lastChild`; forward follows `lastChild`.
// - "히스토리 로그에 V3 -> V4 -> V3": every move (commit, back, forward, click) is appended to a log kept apart
//   from the tree.
//
// "Equal" = the diff returns no change (spec §3-4, Q15). For every input this gives the same answer as deep
// equality (src/vdomEqual.js, still exported here for its old callers); the spec asks for the diff so that
// "같은 버전" and "디버그 칸이 비어 있음" can never disagree.
import { vdomEqual } from './vdomEqual.js';
import { diff } from './diff.js';

export { vdomEqual };

const same = (a, b) => diff(a, b).length === 0;

// structuredClone keeps own keys such as "__proto__" (domToVdom stores them with defineProperty).
const copy = (vdom) => structuredClone(vdom);

export function createHistory(firstVdom) {
  const byId = new Map();
  let nextId = 1;
  const log = [];

  function makeNode(vdom, parent) {
    const node = { id: nextId, label: `v${nextId}`, vdom: copy(vdom), parent, children: [], lastChild: null };
    nextId += 1;
    byId.set(node.id, node);
    if (parent) parent.children.push(node);
    return node;
  }

  const root = makeNode(firstVdom, null);
  let current = root;
  log.push(root);

  function arrive(node) {
    for (let child = node; child.parent; child = child.parent) {
      child.parent.lastChild = child;
    }
    current = node;
    log.push(node);
    return node;
  }

  function pathToRoot() {
    const path = [];
    for (let n = current; n; n = n.parent) path.push(n);
    return path;
  }

  return {
    root: () => root,
    current: () => current,
    get: (id) => byId.get(id) ?? null,
    all: () => [...byId.values()],
    log: () => [...log],
    pathToRoot,
    canBack: () => current.parent !== null,
    canForward: () => current.children.length > 0,

    commit(vdom) {
      if (same(current.vdom, vdom)) return { result: 'same', node: current };
      for (let n = current.parent; n; n = n.parent) {
        if (same(n.vdom, vdom)) return { result: 'moved', node: arrive(n) };
      }
      return { result: 'created', node: arrive(makeNode(vdom, current)) };
    },

    back() {
      return current.parent ? arrive(current.parent) : null;
    },

    forward() {
      if (current.children.length === 0) return null;
      // lastChild is always set once a child exists (making a child arrives at it), the fallback is only a guard.
      return arrive(current.lastChild ?? current.children[current.children.length - 1]);
    },

    goto(id) {
      const node = byId.get(id);
      if (!node || node === current) return null;
      return arrive(node);
    },
  };
}
