// Tests for the real diff, spec-draft §3 (grilled 11-09 13:04-14:14, Q1-Q15). Written before src/core/diff.js.
//
// Change list (spec §3-4 "{ 종류, 위치, 새 노드 }", refined by the orchestrator — see docs/agent/progress.md Open):
//   { type: 'insert',  path, parentOldPath, node }            추가    path = where it sits in the NEW tree
//   { type: 'remove',  path }                                 지워짐  path = where it sat in the OLD tree
//   { type: 'replace', oldPath, path, node }                  교체
//   { type: 'update',  what: 'text',  oldPath, path, text }   고침(글자)
//   { type: 'update',  what: 'attrs', oldPath, path, set: [[name, value]...], remove: [name...] }  고침(속성)
//   { type: 'update',  what: 'move',  oldPath, path }         고침(자리)
// Paths are child indexes from the root wrapper div ([] = root, [0, 1] = root.children[0].children[1]).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { diff } from '../src/core/diff.js';
import { htmlToVdom } from '../src/core/render.js';

const doc = new JSDOM('<!DOCTYPE html><body></body>').window.document;
const v = (html) => htmlToVdom(html, doc);
const d = (a, b) => diff(v(a), v(b));
const types = (changes) => changes.map((c) => (c.type === 'update' ? `update:${c.what}` : c.type));

test('nothing changed → empty list (§3-4: "같은 버전" = diff returns nothing)', () => {
  assert.deepEqual(d('<p class="msg">hi <b>there</b> bye</p>', '<p class="msg">hi <b>there</b> bye</p>'), []);
});

test('attribute order alone is not a change', () => {
  assert.deepEqual(d('<p a="1" b="2">x</p>', '<p b="2" a="1">x</p>'), []);
});

// §3-1 고침(글자). The §1 example: "hi " → "hello ". Unkeyed list → 양 끝 잘라내기 leaves exactly that text.
test('text changed → update text at that text node', () => {
  assert.deepEqual(d('<p class="msg">hi <b>there</b> bye</p>', '<p class="msg">hello <b>there</b> bye</p>'), [
    { type: 'update', what: 'text', oldPath: [0, 0], path: [0, 0], text: 'hello ' },
  ]);
});

// §3-1 고침(속성): value changed, attribute added, attribute removed — one change carrying all three.
test('attributes changed / added / removed → one update attrs', () => {
  assert.deepEqual(d('<li class="a" title="t">x</li>', '<li class="b" data-id="1">x</li>'), [
    { type: 'update', what: 'attrs', oldPath: [0], path: [0], set: [['class', 'b'], ['data-id', '1']], remove: ['title'] },
  ]);
});

test('an attribute named __proto__ is diffed like any other (no prototype pollution)', () => {
  const changes = d('<p __proto__="a">x</p>', '<p __proto__="b">x</p>');
  assert.deepEqual(changes, [{ type: 'update', what: 'attrs', oldPath: [0], path: [0], set: [['__proto__', 'b']], remove: [] }]);
  assert.equal(Object.getPrototypeOf(changes[0]), Object.prototype);
});

// §3-1 Q9: tag differs → 교체, the inside is not compared.
test('tag changed → replace the whole node, nothing inside is compared', () => {
  const changes = d('<ul><li>밥</li></ul>', '<ol><li>국</li></ol>');
  assert.deepEqual(changes, [{ type: 'replace', oldPath: [0], path: [0], node: v('<ol><li>국</li></ol>').children[0] }]);
});

// §3-1: 글자 ↔ 노드 (kind differs) → 교체 too.
test('text ↔ element → replace', () => {
  assert.deepEqual(types(d('<p>밥</p>', '<p><b>밥</b></p>')), ['replace']);
  assert.deepEqual(d('<p><b>밥</b></p>', '<p>밥</p>'), [{ type: 'replace', oldPath: [0, 0], path: [0, 0], node: { kind: 'text', text: '밥' } }]);
});

// §3-2 key 없는 목록 → 양 끝 잘라내기. Inserting anywhere gives ONE insert.
test('unkeyed list: insert at the front, middle or end → one insert', () => {
  const ul = (...xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  const x = v('<li>x</li>').children[0];
  assert.deepEqual(d(ul('a', 'b', 'c'), ul('x', 'a', 'b', 'c')), [{ type: 'insert', path: [0, 0], parentOldPath: [0], node: x }]);
  assert.deepEqual(d(ul('a', 'b', 'c'), ul('a', 'x', 'b', 'c')), [{ type: 'insert', path: [0, 1], parentOldPath: [0], node: x }]);
  assert.deepEqual(d(ul('a', 'b', 'c'), ul('a', 'b', 'c', 'x')), [{ type: 'insert', path: [0, 3], parentOldPath: [0], node: x }]);
});

test('unkeyed list: remove one → one remove at its old place', () => {
  const ul = (...xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  assert.deepEqual(d(ul('a', 'b', 'c'), ul('a', 'c')), [{ type: 'remove', path: [0, 1] }]);
});

// §3-2 Q7-2: the middle left after trimming is paired by index for the shorter length; the rest is insert/remove.
test('unkeyed list: middle with different counts → pair by index, rest inserted', () => {
  const ul = (...xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  assert.deepEqual(d(ul('a', 'b', 'c'), ul('a', 'x', 'y', 'c')), [
    { type: 'update', what: 'text', oldPath: [0, 1, 0], path: [0, 1, 0], text: 'x' },
    { type: 'insert', path: [0, 2], parentOldPath: [0], node: v('<li>y</li>').children[0] },
  ]);
  assert.deepEqual(d(ul('a', 'x', 'y', 'c'), ul('a', 'b', 'c')), [
    { type: 'remove', path: [0, 2] },
    { type: 'update', what: 'text', oldPath: [0, 1, 0], path: [0, 1, 0], text: 'b' },
  ]);
});

// §3-2 Q6: key → pair by key. Q3's example: x put in front gives one insert, nothing else.
const kul = (...xs) => `<ul>${xs.map((x) => `<li key="${x}">${x}</li>`).join('')}</ul>`;

test('keyed list: insert at the front → one insert', () => {
  assert.deepEqual(d(kul('a', 'b', 'c'), kul('x', 'a', 'b', 'c')), [
    { type: 'insert', path: [0, 0], parentOldPath: [0], node: v('<li key="x">x</li>').children[0] },
  ]);
});

// §3-1 Q10: order only → 고침(자리). §3-2 Q11: front-walk, not minimal.
test('keyed list: [a,b,c] → [c,a,b] → c moved, one change', () => {
  assert.deepEqual(d(kul('a', 'b', 'c'), kul('c', 'a', 'b')), [{ type: 'update', what: 'move', oldPath: [0, 2], path: [0, 0] }]);
});

test('keyed list: [a,b,c,d] → [b,c,d,a] → b, c, d moved (spec §3-2 example, not minimal on purpose)', () => {
  assert.deepEqual(d(kul('a', 'b', 'c', 'd'), kul('b', 'c', 'd', 'a')), [
    { type: 'update', what: 'move', oldPath: [0, 1], path: [0, 0] },
    { type: 'update', what: 'move', oldPath: [0, 2], path: [0, 1] },
    { type: 'update', what: 'move', oldPath: [0, 3], path: [0, 2] },
  ]);
});

test('keyed list: [a,b,c,d] → [c,d,a,b] → c, d moved to the front', () => {
  assert.deepEqual(types(d(kul('a', 'b', 'c', 'd'), kul('c', 'd', 'a', 'b'))), ['update:move', 'update:move']);
});

// §3-3 Q12: key changed → a different node: remove + insert, never "attribute changed".
test('key changed → remove the old one, insert the new one', () => {
  assert.deepEqual(d('<ul><li key="a">밥</li></ul>', '<ul><li key="z">밥</li></ul>'), [
    { type: 'remove', path: [0, 0] },
    { type: 'insert', path: [0, 0], parentOldPath: [0], node: v('<li key="z">밥</li>').children[0] },
  ]);
});

// §3-1 Q9: same key, different tag → still 교체.
test('same key, different tag → replace', () => {
  assert.deepEqual(d('<div><li key="a">밥</li></div>', '<div><p key="a">밥</p></div>'), [
    { type: 'replace', oldPath: [0, 0], path: [0, 0], node: v('<p key="a">밥</p>').children[0] },
  ]);
});

test('keyed node that moved AND changed inside → move, then the inside change at the new path', () => {
  assert.deepEqual(d(kul('a', 'b'), '<ul><li key="b">B</li><li key="a">a</li></ul>'), [
    { type: 'update', what: 'move', oldPath: [0, 1], path: [0, 0] },
    { type: 'update', what: 'text', oldPath: [0, 1, 0], path: [0, 0, 0], text: 'B' },
  ]);
});

// §3-2 Q8: a keyless node sticks to the NEXT keyed node; the Q8 example with indentation.
test('indented keyed list: x put in front → its whitespace and li are inserted, nothing else', () => {
  const before = '<ul>\n  <li key="a">a</li>\n  <li key="b">b</li>\n</ul>';
  const after = '<ul>\n  <li key="x">x</li>\n  <li key="a">a</li>\n  <li key="b">b</li>\n</ul>';
  assert.deepEqual(d(before, after), [
    { type: 'insert', path: [0, 0], parentOldPath: [0], node: { kind: 'text', text: '\n  ' } },
    { type: 'insert', path: [0, 1], parentOldPath: [0], node: v('<li key="x">x</li>').children[0] },
  ]);
});

// §3-2 Q8: the keyless nodes after the LAST keyed node stick to it (to the one before).
test('trailing keyless nodes belong to the last keyed node and go away with it', () => {
  const before = '<ul>\n  <li key="a">a</li>\n  <li key="b">b</li>\n</ul>';
  const after = '<ul>\n  <li key="a">a</li>\n</ul>';
  // b's group is ["\n  ", li b, "\n"]; a's new group gains the trailing "\n".
  assert.deepEqual(d(before, after), [
    { type: 'remove', path: [0, 2] },
    { type: 'remove', path: [0, 3] },
    { type: 'remove', path: [0, 4] },
    { type: 'insert', path: [0, 2], parentOldPath: [0], node: { kind: 'text', text: '\n' } },
  ]);
});

// §3-3 Q14: duplicate keys → diff still runs; rule chosen by the orchestrator: duplicates pair in order of appearance.
test('duplicate key in the new list → the first pairs, the second is inserted', () => {
  assert.deepEqual(d('<ul><li key="a">밥</li></ul>', '<ul><li key="a">밥</li><li key="a">국</li></ul>'), [
    { type: 'insert', path: [0, 1], parentOldPath: [0], node: v('<li key="a">국</li>').children[0] },
  ]);
});

test('duplicate key in the old list → the first pairs, the second is removed', () => {
  assert.deepEqual(d('<ul><li key="a">밥</li><li key="a">국</li></ul>', '<ul><li key="a">밥</li></ul>'), [
    { type: 'remove', path: [0, 1] },
  ]);
});

// Paths: a change below a shifted node has its old path and its new path.
test('inside a node that shifted: oldPath is in the old tree, path in the new tree', () => {
  assert.deepEqual(d(kul('a', 'b'), '<ul><li key="x">x</li><li key="a">a</li><li key="b">B</li></ul>'), [
    { type: 'insert', path: [0, 0], parentOldPath: [0], node: v('<li key="x">x</li>').children[0] },
    { type: 'update', what: 'text', oldPath: [0, 1, 0], path: [0, 2, 0], text: 'B' },
  ]);
});

test('diff does not change its inputs', () => {
  const a = v(kul('a', 'b', 'c'));
  const b = v(kul('c', 'x', 'a'));
  const a0 = structuredClone(a);
  const b0 = structuredClone(b);
  diff(a, b);
  assert.deepEqual(a, a0);
  assert.deepEqual(b, b0);
});

// Found 11-09 while switching history to the diff (row 11): with "only the first duplicate pairs", an UNCHANGED list
// with a duplicate key gave remove + insert, so Patch with nothing changed made a new version (§2-2 broken).
// Rule now: duplicates pair in order of appearance (1st with 1st, 2nd with 2nd, ...).
test('duplicate keys, nothing changed → empty list', () => {
  const html = '<ul><li key="a">밥</li><li key="a">밥</li><li key="a">국</li></ul>';
  assert.deepEqual(d(html, html), []);
});

test('duplicate keys pair in order: the 2nd old "a" pairs with the 2nd new "a"', () => {
  assert.deepEqual(d('<ul><li key="a">밥</li><li key="a">국</li></ul>', '<ul><li key="a">밥</li><li key="a">죽</li></ul>'), [
    { type: 'update', what: 'text', oldPath: [0, 1, 0], path: [0, 1, 0], text: '죽' },
  ]);
});
