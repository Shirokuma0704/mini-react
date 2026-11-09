// Tests for the PROVISIONAL diff and patch (goal: "diff returns one 'replace the root' change, patch applies changes
// to 실제 영역"). They pin only the provisional contract; replace them after the diff grill (spec §2-5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { diff } from '../src/diff.js';
import { patch } from '../src/patch.js';
import { htmlToVdom, containerToVdom } from '../src/render.js';

const doc = new JSDOM('<!DOCTYPE html><body></body>').window.document;

test('PROVISIONAL diff: one change, replace the root, carrying the new root', () => {
  const oldRoot = htmlToVdom('<p>a</p>', doc);
  const newRoot = htmlToVdom('<p>b</p><ul><li>x</li></ul>', doc);
  assert.deepEqual(diff(oldRoot, newRoot), [{ type: 'replace', path: [], node: newRoot }]);
});

test('PROVISIONAL patch: replace-the-root makes 실제 영역 hold exactly the new root', () => {
  const area = doc.createElement('div');
  area.id = 'actual';
  area.innerHTML = '<p>a</p>';
  const newRoot = htmlToVdom('<p>b</p><ul><li>x</li></ul>', doc);
  patch(area, diff(containerToVdom(area), newRoot), doc);
  assert.deepEqual(containerToVdom(area), newRoot);
  assert.equal(area.id, 'actual'); // the container itself is kept
});

test('PROVISIONAL patch: an empty change list changes nothing', () => {
  const area = doc.createElement('div');
  area.innerHTML = '<p>a</p>';
  patch(area, [], doc);
  assert.equal(area.innerHTML, '<p>a</p>');
});

test('PROVISIONAL patch: a change it does not know yet fails loudly instead of being skipped', () => {
  const area = doc.createElement('div');
  assert.throws(() => patch(area, [{ type: 'text', path: [0, 0], text: 'x' }], doc), /PROVISIONAL/);
});
