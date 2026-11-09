// Tests for goal scope item 6 / spec-draft §2-3 (debug panel).
// §2-3: old and new side by side, colored where changed; "색칠은 우리 diff 알고리즘이 내놓은 결과를 기준으로 한다.
//        글자를 따로 비교한 결과가 아니다." So these tests feed hand-made change lists, including WRONG ones,
// and check that the colors follow the list, not the actual difference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { debugLines, renderDebug } from '../src/debugView.js';
import { htmlToVdom } from '../src/render.js';
import { diff } from '../src/diff.js';

const doc = new JSDOM('<!DOCTYPE html><body></body>').window.document;
const OLD = htmlToVdom('<ul><li>a</li><li>b</li></ul>', doc);
const NEW = htmlToVdom('<ul><li>a</li><li>B</li></ul>', doc);

test('lays the VDOM out one line per open tag / text / close tag, with paths, root not shown', () => {
  const lines = debugLines(OLD, [], 'old');
  assert.deepEqual(
    lines.map((l) => [l.depth, l.text, l.path.join('.')]),
    [
      [0, '<ul>', '0'],
      [1, '<li>', '0.0'],
      [2, '"a"', '0.0.0'],
      [1, '</li>', '0.0'],
      [1, '<li>', '0.1'],
      [2, '"b"', '0.1.0'],
      [1, '</li>', '0.1'],
      [0, '</ul>', '0'],
    ],
  );
});

test('no changes -> nothing colored', () => {
  assert.ok(debugLines(NEW, [], 'new').every((l) => l.mark === null));
});

const marks = (root, changes, side) =>
  debugLines(root, changes, side).filter((l) => l.mark).map((l) => `${l.mark} ${l.text}`);

// Spec §3-4 colors: 추가 = green on the new side, 지워짐 = red on the old side, 교체 = old red + new green,
// 고침 = yellow on both sides (자리 고침 included). oldPath is read on the old side, path on the new side.
test('the real diff of a text change colors only that text, yellow on both sides', () => {
  const changes = diff(OLD, NEW);
  assert.deepEqual(marks(OLD, changes, 'old'), ['chg "b"']);
  assert.deepEqual(marks(NEW, changes, 'new'), ['chg "B"']);
});

test('replace colors the node and everything under it: old side red, new side green', () => {
  const changes = [{ type: 'replace', oldPath: [0, 1], path: [0, 1], node: NEW.children[0].children[1] }];
  assert.deepEqual(marks(OLD, changes, 'old'), ['del <li>', 'del "b"', 'del </li>']);
  assert.deepEqual(marks(NEW, changes, 'new'), ['add <li>', 'add "B"', 'add </li>']);
});

test('insert is green on the new side only; remove is red on the old side only', () => {
  const a = htmlToVdom('<ul><li>a</li></ul>', doc);
  const b = htmlToVdom('<ul><li>x</li><li>a</li></ul>', doc);
  const ins = diff(htmlToVdom('<ul><li key="a">a</li></ul>', doc), htmlToVdom('<ul><li key="x">x</li><li key="a">a</li></ul>', doc));
  assert.deepEqual(marks(b, ins, 'new'), ['add <li>', 'add "x"', 'add </li>']);
  assert.deepEqual(marks(a, ins, 'old'), []);
  const rem = [{ type: 'remove', path: [0, 0] }];
  assert.deepEqual(marks(b, rem, 'old'), ['del <li>', 'del "x"', 'del </li>']);
  assert.deepEqual(marks(a, rem, 'new'), []);
});

test("an attribute change colors only that element's own lines, not its inside", () => {
  const a = htmlToVdom('<p class="a"><b>x</b></p>', doc);
  const b = htmlToVdom('<p class="b"><b>x</b></p>', doc);
  assert.deepEqual(marks(b, diff(a, b), 'new'), ['chg <p class="b">', 'chg </p>']);
  assert.deepEqual(marks(a, diff(a, b), 'old'), ['chg <p class="a">', 'chg </p>']);
});

test('a move colors the moved node and its inside yellow, at its old place and at its new place', () => {
  const a = htmlToVdom('<ul><li key="a">a</li><li key="c">c</li></ul>', doc);
  const b = htmlToVdom('<ul><li key="c">c</li><li key="a">a</li></ul>', doc);
  const changes = diff(a, b);
  assert.deepEqual(marks(a, changes, 'old'), ['chg <li key="c">', 'chg "c"', 'chg </li>']);
  assert.deepEqual(marks(b, changes, 'new'), ['chg <li key="c">', 'chg "c"', 'chg </li>']);
});

test('inside a moved node, a more specific change wins (an insert stays green)', () => {
  const a = htmlToVdom('<ul><li key="a">a</li><li key="c">c</li></ul>', doc);
  const b = htmlToVdom('<ul><li key="c">c<b>new</b></li><li key="a">a</li></ul>', doc);
  assert.deepEqual(marks(b, diff(a, b), 'new'), ['chg <li key="c">', 'chg "c"', 'add <b>', 'add "new"', 'add </b>', 'chg </li>']);
});

test('colors follow the diff result even when it is WRONG (§2-3: so a wrong diff is visible)', () => {
  // The real difference is li #2's text, but this (wrong) change list points at li #1.
  const wrong = [{ type: 'replace', oldPath: [0, 0], path: [0, 0], node: NEW.children[0].children[0] }];
  const marked = debugLines(NEW, wrong, 'new').filter((l) => l.mark).map((l) => l.path.join('.'));
  assert.deepEqual(marked, ['0.0', '0.0.0', '0.0']);
});

test('an unknown change type is painted chg on both sides', () => {
  const changes = [{ type: 'text', oldPath: [0, 1, 0], path: [0, 1, 0] }];
  assert.equal(debugLines(OLD, changes, 'old').find((l) => l.text === '"b"').mark, 'chg');
  assert.equal(debugLines(NEW, changes, 'new').find((l) => l.text === '"B"').mark, 'chg');
});

test('whitespace text is shown visibly', () => {
  const root = htmlToVdom('<p>\n  x </p>', doc);
  assert.equal(debugLines(root, [], 'old')[1].text, '"\\n  x "');
});

test('renderDebug writes one span per line with its class and indentation', () => {
  const pre = doc.createElement('pre');
  renderDebug(pre, debugLines(NEW, diff(OLD, NEW), 'new'), doc);
  const spans = pre.querySelectorAll('span.line');
  assert.equal(spans.length, 8);
  assert.equal(spans[5].textContent, '    "B"');
  assert.equal(spans[5].className, 'line chg');
  assert.equal(spans[5].dataset.path, '0.1.0');
  assert.equal(spans[2].className, 'line');
});

test('renderDebug does not interpret tag text as HTML', () => {
  const pre = doc.createElement('pre');
  renderDebug(pre, debugLines(htmlToVdom('<b>x</b>', doc), [], 'old'), doc);
  assert.equal(pre.querySelector('b'), null);
});

// Codex batch-after-limit (ed361c0): quotes inside a value must not make two different attribute sets look the same.
test('attribute values are shown unambiguously (JSON form, like text)', () => {
  const one = htmlToVdom(`<p title='x" id="y'></p>`, doc);
  const two = htmlToVdom('<p title="x" id="y"></p>', doc);
  const a = debugLines(one, [], 'old')[0].text;
  const b = debugLines(two, [], 'old')[0].text;
  assert.notEqual(a, b);
  assert.equal(a, '<p title="x\\" id=\\"y">');
  assert.equal(b, '<p title="x" id="y">');
});

// Codex bundle r1 F4 (11-09): diff gives "move" AND "replace" for the same key. §3-4: 교체 = old red + new green, so
// the replace must win over the move's yellow at the same place, whatever order the list has.
test('move + replace on the same key: replace wins (old red, new green), in either list order', () => {
  const a = htmlToVdom('<ul><li key="a">A</li><li key="b">B</li></ul>', doc);
  const b = htmlToVdom('<ul><p key="b">B</p><li key="a">A</li></ul>', doc);
  const changes = diff(a, b);
  assert.deepEqual(changes.map((c) => c.what ?? c.type), ['move', 'replace']);
  for (const list of [changes, [...changes].reverse()]) {
    assert.deepEqual(marks(a, list, 'old'), ['del <li key="b">', 'del "B"', 'del </li>']);
    assert.deepEqual(marks(b, list, 'new'), ['add <p key="b">', 'add "B"', 'add </p>']);
  }
});
