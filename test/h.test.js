// Tests for feature 14: h() builds VDOM, h(Component, props) makes a component node, expand() unrolls components
// into plain VDOM before diff. Spec-draft §4-1 (Q1, Q8) and §4-8 (AI candidates he accepted: "unroll before diff",
// "on… names go to the event slot"). Written by the orchestrator (Opus) BEFORE src/component/h.js exists (his rule 11-09:
// the hand that writes the code does not write its tests).
//
// VDOM shape is spec §1 (kind / tag / attrs / children). Phase 2 adds:
//   - element nodes MAY carry `events`: { click: fn, input: fn, ... } — only when at least one handler was given,
//     so VDOM built from HTML text (Phase 1) keeps exactly its old shape.
//   - a new kind: { kind: 'component', fn, props } — only before expand(); diff never sees it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h, expand } from '../src/component/h.js';
import { diff } from '../src/core/diff.js';
import { vdomEqual } from '../src/core/vdomEqual.js';

const text = (t) => ({ kind: 'text', text: t });

// ---------- h(tag, props, children) → element node (§4-1 Q1) ----------

test('h makes an element node in the §1 shape', () => {
  assert.deepEqual(h('p', { class: 'msg' }, ['hi']), {
    kind: 'element',
    tag: 'p',
    attrs: { class: 'msg' },
    children: [text('hi')],
  });
});

test('h: the §1 example spec "<p class=msg>hi <b>there</b> bye</p>" built by hand', () => {
  const node = h('p', { class: 'msg' }, ['hi ', h('b', {}, ['there']), ' bye']);
  assert.deepEqual(node, {
    kind: 'element',
    tag: 'p',
    attrs: { class: 'msg' },
    children: [text('hi '), { kind: 'element', tag: 'b', attrs: {}, children: [text('there')] }, text(' bye')],
  });
});

test('h: props and children may be left out', () => {
  assert.deepEqual(h('hr'), { kind: 'element', tag: 'hr', attrs: {}, children: [] });
  assert.deepEqual(h('div', null), { kind: 'element', tag: 'div', attrs: {}, children: [] });
  assert.deepEqual(h('div', undefined, ['x']).children, [text('x')]);
});

test('h: numbers among children become text (the counter: h("button", {}, [count]))', () => {
  assert.deepEqual(h('button', {}, [3]).children, [text('3')]);
  assert.deepEqual(h('span', {}, [0]).children, [text('0')]);
});

test('h: nested arrays among children are flattened (children built with .map)', () => {
  const items = ['밥', '국'].map((t) => h('li', {}, [t]));
  const node = h('ul', {}, [items]);
  assert.equal(node.children.length, 2);
  assert.equal(node.children[0].tag, 'li');
  assert.deepEqual(node.children[1].children, [text('국')]);
  const mixed = h('ul', {}, [h('li', {}, ['a']), [h('li', {}, ['b']), [h('li', {}, ['c'])]]]);
  assert.deepEqual(mixed.children.map((c) => c.children[0].text), ['a', 'b', 'c']);
});

test('h: null, undefined, true and false among children draw nothing (for "cond && h(...)")', () => {
  const node = h('div', {}, [null, 'a', undefined, false, true, 'b']);
  assert.deepEqual(node.children, [text('a'), text('b')]);
});

test('h: an empty string child is still a text node (only null/undefined/booleans are skipped)', () => {
  assert.deepEqual(h('p', {}, ['']).children, [text('')]);
});

test('h: attribute values are stored as strings, like attributes read from HTML (§1)', () => {
  const node = h('input', { value: 5, maxlength: 10 });
  assert.deepEqual(node.attrs, { value: '5', maxlength: '10' });
});

test('h: true → attribute present with "", false/null/undefined → attribute left out', () => {
  const node = h('input', { disabled: true, checked: false, title: null, alt: undefined });
  assert.deepEqual(node.attrs, { disabled: '' });
});

test('h: key stays an attribute, so the Phase 1 diff pairs by it (§3-2 Q6, §3-3)', () => {
  const node = h('li', { key: 7 }, ['a']);
  assert.deepEqual(node.attrs, { key: '7' });
});

test('h: does not keep a reference to the props object it was given', () => {
  const props = { class: 'a' };
  const node = h('p', props);
  props.class = 'b';
  assert.equal(node.attrs.class, 'a');
});

// ---------- events: "on…" names go to a separate slot (§4-2, §4-8) ----------

test('h: an on… function goes to `events`, keyed by the lowercase event name, not to attrs', () => {
  const click = () => {};
  const node = h('button', { onClick: click, class: 'big' }, ['+']);
  assert.deepEqual(node.attrs, { class: 'big' });
  assert.equal(node.events.click, click);
  assert.deepEqual(Object.keys(node.events), ['click']);
});

test('h: several handlers, mixed case names → lowercase event names', () => {
  const a = () => {};
  const b = () => {};
  const node = h('input', { onInput: a, onKeyDown: b });
  assert.equal(node.events.input, a);
  assert.equal(node.events.keydown, b);
  assert.deepEqual(node.attrs, {});
});

test('h: no handler given → the node has no `events` key at all (Phase 1 shape unchanged)', () => {
  assert.equal(Object.hasOwn(h('p', { class: 'x' }), 'events'), false);
  assert.equal(Object.hasOwn(h('p', { onClick: null }), 'events'), false);
});

test('h: an on… value that is not a function stays out of events', () => {
  const node = h('button', { onClick: 'alert(1)' });
  assert.equal(Object.hasOwn(node, 'events'), false);
});

test('events do not count for diff: same tree with different handler functions → no changes (§4-2)', () => {
  const a = h('div', {}, [h('button', { onClick: () => 1 }, ['0'])]);
  const b = h('div', {}, [h('button', { onClick: () => 2 }, ['0'])]);
  assert.deepEqual(diff(a, b), []);
  assert.equal(vdomEqual(a, b), true);
});

// ---------- h(Component, props) → component node (§4-1 Q8) ----------

function TodoItem(props) {
  return h('li', {}, [props.text]);
}

test('h(Component, props) does NOT call the component: it records fn + props (§4-1 Q8)', () => {
  let calls = 0;
  const Counted = () => {
    calls++;
    return h('p');
  };
  const node = h(Counted, { a: 1 });
  assert.equal(calls, 0);
  assert.equal(node.kind, 'component');
  assert.equal(node.fn, Counted);
  assert.deepEqual(node.props, { a: 1 });
});

test('h(Component): props are kept as given (not stringified like attributes)', () => {
  const list = ['a'];
  const onPick = () => {};
  const node = h(TodoItem, { count: 3, list, onPick });
  assert.equal(node.props.count, 3);
  assert.equal(node.props.list, list);
  assert.equal(node.props.onPick, onPick);
});

test('h(Component, props, children) passes children as props.children', () => {
  const node = h(TodoItem, { text: 'x' }, ['inner']);
  assert.deepEqual(node.props.children, [text('inner')]);
});

test('h(Component) with no props → props is an empty object', () => {
  assert.deepEqual(h(TodoItem).props, {});
});

// ---------- expand(): unroll components before diff (§4-8) ----------

test('expand turns a component node into what the component returns', () => {
  assert.deepEqual(expand(h(TodoItem, { text: '밥' })), h('li', {}, ['밥']));
});

test('expand works through nesting: components inside elements inside components', () => {
  const List = (props) => h('ul', {}, props.items.map((t) => h(TodoItem, { text: t })));
  const App = () => h('div', { class: 'app' }, [h('h1', {}, ['할 일']), h(List, { items: ['밥', '국'] })]);
  assert.deepEqual(
    expand(h(App)),
    h('div', { class: 'app' }, [h('h1', {}, ['할 일']), h('ul', {}, [h('li', {}, ['밥']), h('li', {}, ['국'])])]),
  );
});

test('expand: a component that returns another component node is unrolled until plain VDOM', () => {
  const Inner = () => h('b', {}, ['in']);
  const Outer = () => h(Inner);
  assert.deepEqual(expand(h(Outer)), h('b', {}, ['in']));
});

test('expand: a component may return a string or number → text node', () => {
  const Label = (p) => p.n;
  assert.deepEqual(expand(h('p', {}, [h(Label, { n: 4 })])), h('p', {}, ['4']));
  const Word = () => 'hi';
  assert.deepEqual(expand(h(Word)), text('hi'));
});

test('expand: a child component returning null draws nothing in its parent', () => {
  const Maybe = (p) => (p.show ? h('i', {}, ['x']) : null);
  const tree = h('div', {}, [h(Maybe, { show: false }), h(Maybe, { show: true })]);
  assert.deepEqual(expand(tree), h('div', {}, [h('i', {}, ['x'])]));
});

test('expand keeps events on the expanded elements', () => {
  const click = () => {};
  const Btn = () => h('button', { onClick: click }, ['+']);
  const out = expand(h('div', {}, [h(Btn)]));
  assert.equal(out.children[0].events.click, click);
});

test('expand keeps keys, so a keyed list of components diffs by key', () => {
  const Item = (p) => h('li', { key: p.id }, [p.id]);
  const before = expand(h('ul', {}, ['a', 'b'].map((id) => h(Item, { id }))));
  const after = expand(h('ul', {}, ['x', 'a', 'b'].map((id) => h(Item, { id }))));
  const changes = diff(h('div', {}, [before]), h('div', {}, [after]));
  assert.deepEqual(
    changes.map((c) => c.type),
    ['insert'],
  );
});

test('expand does not change the tree it was given', () => {
  const tree = h('div', {}, [h(TodoItem, { text: 'a' })]);
  const snapshot = JSON.stringify(tree, (k, val) => (typeof val === 'function' ? `fn:${val.name}` : val));
  expand(tree);
  assert.equal(JSON.stringify(tree, (k, val) => (typeof val === 'function' ? `fn:${val.name}` : val)), snapshot);
  assert.equal(tree.children[0].kind, 'component');
});

test('expand of a tree with no components returns an equal plain tree', () => {
  const tree = h('p', { class: 'msg' }, ['hi ', h('b', {}, ['there']), ' bye']);
  assert.deepEqual(expand(tree), tree);
});

test('expand: the component is called with its props (and gets the same values it was given)', () => {
  const seen = [];
  const Spy = (props) => {
    seen.push(props);
    return h('p');
  };
  const props = { a: 1 };
  expand(h(Spy, props));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].a, 1);
});
