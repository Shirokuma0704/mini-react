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

test('the provisional diff (replace the root) colors every line: old side del, new side add', () => {
  const changes = diff(OLD, NEW);
  assert.ok(debugLines(OLD, changes, 'old').every((l) => l.mark === 'del'));
  assert.ok(debugLines(NEW, changes, 'new').every((l) => l.mark === 'add'));
});

test('a change at a path colors that node and everything under it, nothing else', () => {
  const changes = [{ type: 'replace', path: [0, 1], node: NEW.children[0].children[1] }];
  const marked = debugLines(NEW, changes, 'new').filter((l) => l.mark).map((l) => l.text);
  assert.deepEqual(marked, ['<li>', '"B"', '</li>']);
});

test('colors follow the diff result even when it is WRONG (§2-3: so a wrong diff is visible)', () => {
  // The real difference is li #2's text, but this (wrong) change list points at li #1.
  const wrong = [{ type: 'replace', path: [0, 0], node: NEW.children[0].children[0] }];
  const marked = debugLines(NEW, wrong, 'new').filter((l) => l.mark).map((l) => l.path.join('.'));
  assert.deepEqual(marked, ['0.0', '0.0.0', '0.0']);
});

test('an unknown change type is painted chg on both sides', () => {
  const changes = [{ type: 'text', path: [0, 1, 0] }];
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
  assert.equal(spans[2].textContent, '    "a"');
  assert.equal(spans[2].className, 'line add');
  assert.equal(spans[2].dataset.path, '0.0.0');
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
