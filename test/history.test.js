// Tests for goal scope item 5 / spec-draft §2-2 (history). Pure module: no DOM needed.
// Each test quotes the spec line it checks. VDOMs here are tiny hand-made roots; any VDOM works.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, vdomEqual } from '../src/history.js';

// A root VDOM whose only child is the text `s` — enough to tell versions apart.
function v(s) {
  return { kind: 'element', tag: 'div', attrs: {}, children: [{ kind: 'text', text: s }] };
}
const labels = (nodes) => nodes.map((n) => n.label);

test('starts with one version v1 holding the first VDOM, log = [v1]', () => {
  const h = createHistory(v('a'));
  assert.equal(h.current().label, 'v1');
  assert.deepEqual(h.current().vdom, v('a'));
  assert.deepEqual(labels(h.log()), ['v1']);
  assert.equal(h.canBack(), false);
  assert.equal(h.canForward(), false);
});

// §2-2 "바뀐 게 없으면 새 버전을 만들지 않고 알리기만 한다."
test('commit of the same content makes no version and no log entry', () => {
  const h = createHistory(v('a'));
  const r = h.commit(v('a'));
  assert.equal(r.result, 'same');
  assert.equal(r.node.label, 'v1');
  assert.equal(h.all().length, 1);
  assert.deepEqual(labels(h.log()), ['v1']);
});

test('commit of new content makes a child version and moves to it', () => {
  const h = createHistory(v('a'));
  const r = h.commit(v('b'));
  assert.equal(r.result, 'created');
  assert.equal(r.node.label, 'v2');
  assert.equal(h.current().label, 'v2');
  assert.equal(h.current().parent.label, 'v1');
  assert.deepEqual(labels(h.log()), ['v1', 'v2']);
});

test('the stored VDOM is a copy: changing the caller\'s object later does not change history', () => {
  const h = createHistory(v('a'));
  const mine = v('b');
  h.commit(mine);
  mine.children[0].text = 'changed';
  assert.deepEqual(h.current().vdom, v('b'));
});

test('back goes to the parent, forward comes back; both are logged', () => {
  const h = createHistory(v('a'));
  h.commit(v('b'));
  assert.equal(h.back().label, 'v1');
  assert.equal(h.forward().label, 'v2');
  assert.deepEqual(labels(h.log()), ['v1', 'v2', 'v1', 'v2']);
});

test('back at the root and forward at a leaf do nothing and return null', () => {
  const h = createHistory(v('a'));
  assert.equal(h.back(), null);
  assert.equal(h.forward(), null);
  assert.deepEqual(labels(h.log()), ['v1']);
});

// §2-2 "git처럼 트리다. 예전 버전으로 돌아가서 Patch하면 새 가지가 생기고, 원래 가지는 지워지지 않는다."
test('patching after going back makes a new branch; the old branch stays', () => {
  const h = createHistory(v('a'));
  h.commit(v('b')); // v2
  h.back(); // v1
  const r = h.commit(v('c')); // v3, sibling of v2
  assert.equal(r.result, 'created');
  assert.equal(r.node.label, 'v3');
  assert.deepEqual(labels(h.root().children), ['v2', 'v3']);
  assert.deepEqual(h.get(2).vdom, v('b'));
});

// §2-2 "(임시) 갈림길에서 앞으로가기는 마지막으로 있었던 가지로 간다."
test('forward at a fork goes to the branch visited last', () => {
  const h = createHistory(v('a'));
  h.commit(v('b')); // v2
  h.back();
  h.commit(v('c')); // v3
  h.back(); // at v1, last visited branch = v3
  assert.equal(h.forward().label, 'v3');
  h.goto(2); // visit v2 by clicking the tree
  h.back(); // at v1, last visited branch = v2 now
  assert.equal(h.forward().label, 'v2');
});

test('clicking a deep version marks its whole path as last visited', () => {
  const h = createHistory(v('a'));
  h.commit(v('b')); // v2
  h.commit(v('b2')); // v3 under v2
  h.goto(1);
  h.commit(v('c')); // v4 under v1
  h.goto(3); // deep in the first branch
  h.goto(1);
  assert.equal(h.forward().label, 'v2');
  assert.equal(h.forward().label, 'v3');
});

// §2-2 "트리를 그림으로 보여 주고, 노드를 눌러서 이동한다."
test('goto moves to any version and logs it; goto to the current one or an unknown id does nothing', () => {
  const h = createHistory(v('a'));
  h.commit(v('b'));
  h.back();
  h.commit(v('c')); // v3
  assert.equal(h.goto(2).label, 'v2');
  assert.equal(h.goto(2), null);
  assert.equal(h.goto(99), null);
  assert.deepEqual(labels(h.log()), ['v1', 'v2', 'v1', 'v3', 'v2']);
});

// §2-2 "Patch 결과가 같은 갈래(지금 버전에서 뿌리까지 올라가는 길)에 있는 버전과 내용이 똑같으면,
//        새 버전을 만들지 않고 그 버전으로 이동한다." + 로그 예: "v3 → v4 → v3"
test('commit equal to an ancestor moves there instead of making a version, and logs the move', () => {
  const h = createHistory(v('a')); // v1
  h.commit(v('b')); // v2
  h.commit(v('c')); // v3
  h.commit(v('d')); // v4
  const r = h.commit(v('c'));
  assert.equal(r.result, 'moved');
  assert.equal(r.node.label, 'v3');
  assert.equal(h.current().label, 'v3');
  assert.equal(h.all().length, 4);
  assert.deepEqual(labels(h.log()), ['v1', 'v2', 'v3', 'v4', 'v3']);
});

test('commit equal to the root moves to the root', () => {
  const h = createHistory(v('a'));
  h.commit(v('b'));
  const r = h.commit(v('a'));
  assert.equal(r.result, 'moved');
  assert.equal(r.node.label, 'v1');
});

// §2-2 "다른 가지에 똑같은 게 있으면 새로 만든다." ("같은 갈래에서만")
test('commit equal to a version on another branch makes a new version', () => {
  const h = createHistory(v('a')); // v1
  h.commit(v('b')); // v2
  h.back();
  h.commit(v('c')); // v3, other branch
  const r = h.commit(v('b')); // equal to v2, but v2 is not on v3's path to the root
  assert.equal(r.result, 'created');
  assert.equal(r.node.label, 'v4');
  assert.equal(r.node.parent.label, 'v3');
});

test('commit equal to a descendant (not an ancestor) makes a new version', () => {
  const h = createHistory(v('a'));
  h.commit(v('b')); // v2
  h.back(); // at v1
  const r = h.commit(v('b')); // v2 is a child, not on the path to the root
  assert.equal(r.result, 'created');
  assert.equal(r.node.label, 'v3');
});

test('pathToRoot lists current .. root', () => {
  const h = createHistory(v('a'));
  h.commit(v('b'));
  h.commit(v('c'));
  assert.deepEqual(labels(h.pathToRoot()), ['v3', 'v2', 'v1']);
});

test('vdomEqual: same content equal, attribute order ignored, any difference not equal', () => {
  const el = (attrs, kids = []) => ({ kind: 'element', tag: 'p', attrs, children: kids });
  assert.equal(vdomEqual(el({ a: '1', b: '2' }), el({ b: '2', a: '1' })), true);
  assert.equal(vdomEqual(el({ a: '1' }), el({ a: '2' })), false);
  assert.equal(vdomEqual(el({ a: '1' }), el({ a: '1', b: '' })), false);
  assert.equal(vdomEqual(el({}, [{ kind: 'text', text: 'x' }]), el({}, [{ kind: 'text', text: 'x ' }])), false);
  assert.equal(vdomEqual(el({}), { kind: 'element', tag: 'b', attrs: {}, children: [] }), false);
  assert.equal(vdomEqual({ kind: 'text', text: 'x' }, el({})), false);
  assert.equal(vdomEqual(el({}, [{ kind: 'text', text: 'x' }]), el({}, [])), false);
});
