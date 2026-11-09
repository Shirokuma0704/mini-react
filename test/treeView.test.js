// Tests for the history tree view and move log (spec-draft §2-2, goal scope item 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createHistory } from '../src/history.js';
import { renderTree, logText } from '../src/treeView.js';

const dom = new JSDOM('<!DOCTYPE html><body><div id="t"></div></body>');
const doc = dom.window.document;
const v = (s) => ({ kind: 'element', tag: 'div', attrs: {}, children: [{ kind: 'text', text: s }] });

function branchy() {
  const h = createHistory(v('a')); // v1
  h.commit(v('b')); // v2
  h.back();
  h.commit(v('c')); // v3
  h.commit(v('d')); // v4
  return h;
}

test('every version is a button, nested like the tree', () => {
  const box = doc.getElementById('t');
  renderTree(box, branchy(), doc, () => {});
  const labels = [...box.querySelectorAll('button')].map((b) => b.textContent);
  assert.deepEqual(labels, ['v1', 'v2', 'v3', 'v4']);
  // v2 and v3 are both children of v1; v4 is under v3.
  const li = (label) => [...box.querySelectorAll('button')].find((b) => b.textContent === label).parentElement;
  assert.equal(li('v2').parentElement, li('v3').parentElement);
  assert.equal(li('v4').parentElement.parentElement, li('v3'));
});

test('the current version and its path to the root are marked', () => {
  const box = doc.getElementById('t');
  renderTree(box, branchy(), doc, () => {});
  const cls = (label) => [...box.querySelectorAll('button')].find((b) => b.textContent === label).className;
  assert.equal(cls('v4'), 'current');
  assert.equal(cls('v3'), 'on-path');
  assert.equal(cls('v1'), 'on-path');
  assert.equal(cls('v2'), '');
});

test('clicking a version calls back with its id', () => {
  const box = doc.getElementById('t');
  const picked = [];
  renderTree(box, branchy(), doc, (id) => picked.push(id));
  [...box.querySelectorAll('button')].find((b) => b.textContent === 'v2').click();
  assert.deepEqual(picked, [2]);
});

test('logText writes the move log apart from the tree, e.g. v3 → v4 → v3', () => {
  const h = createHistory(v('a'));
  h.commit(v('b'));
  h.back();
  assert.equal(logText(h), 'v1 → v2 → v1');
});
