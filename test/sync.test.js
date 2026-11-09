// Tests for goal scope item 3 / spec-draft §2-1: text box <-> preview sync.
// §2-1: "미리보기도 완전히 자유롭게 고칠 수 있다" / "미리보기 → 글자 칸 반영 시점: 다른 글자를 건드릴 때 + 미리보기를 떠날 때"
//       "글자 칸 → 미리보기 반영 시점도 같다: 다른 곳을 건드리거나 글자 칸을 떠날 때"
// "Another spot" = another line in the text box, another node in the preview (choice logged in progress.md Open).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createSync } from '../src/sync.js';

function setup(html = '<p>one</p>\n<p>two</p>') {
  const dom = new JSDOM('<!DOCTYPE html><body><textarea id="s"></textarea><div id="p" contenteditable="true"></div></body>');
  const doc = dom.window.document;
  const source = doc.getElementById('s');
  const preview = doc.getElementById('p');
  const changes = [];
  const sync = createSync({ source, preview, doc, onSourceChange: (text) => changes.push(text) });
  sync.setSource(html);
  const fire = (el, type) => el.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  return { dom, doc, source, preview, sync, changes, fire };
}

// Text box editing helpers: change the text, put the caret somewhere, fire the events a browser fires.
function typeInSource(t, value, caret = value.length) {
  t.source.value = value;
  t.source.setSelectionRange(caret, caret);
  t.fire(t.source, 'input');
}
function moveSourceCaret(t, caret) {
  t.source.setSelectionRange(caret, caret);
  t.fire(t.source, 'keyup');
}
// Preview editing helpers: edit a text node in place, put the caret in some node.
function placePreviewCaret(t, node) {
  t.doc.getSelection().collapse(node, 0);
}

test('setSource fills the text box and draws the preview', () => {
  const t = setup('<p>one</p>');
  assert.equal(t.source.value, '<p>one</p>');
  assert.equal(t.preview.innerHTML, '<p>one</p>');
});

test('text box -> preview does not happen while typing on the same line', () => {
  const t = setup('<p>one</p>');
  typeInSource(t, '<p>one!</p>');
  moveSourceCaret(t, 3); // still line 1
  assert.equal(t.preview.innerHTML, '<p>one</p>');
});

test('text box -> preview happens when the caret moves to another line', () => {
  const t = setup('<p>one</p>\n<p>two</p>');
  typeInSource(t, '<p>one!</p>\n<p>two</p>', 5); // edit on line 1
  moveSourceCaret(t, 14); // line 2
  assert.equal(t.preview.innerHTML, '<p>one!</p>\n<p>two</p>');
});

test('text box -> preview happens when the text box loses focus', () => {
  const t = setup('<p>one</p>');
  typeInSource(t, '<p>changed</p>');
  t.fire(t.source, 'focusout');
  assert.equal(t.preview.innerHTML, '<p>changed</p>');
});

test('broken HTML in the text box: preview shows what the browser makes of it, the text box keeps the user\'s text', () => {
  const t = setup('<p>one</p>');
  typeInSource(t, '<p>one');
  t.fire(t.source, 'focusout');
  assert.equal(t.preview.innerHTML, '<p>one</p>');
  assert.equal(t.source.value, '<p>one');
});

test('preview -> text box does not happen while editing the same node', () => {
  const t = setup('<p>one</p>\n<p>two</p>');
  const text = t.preview.querySelector('p').firstChild;
  text.nodeValue = 'ONE';
  placePreviewCaret(t, text);
  t.fire(t.preview, 'input');
  t.fire(t.preview, 'keyup');
  assert.equal(t.source.value, '<p>one</p>\n<p>two</p>');
});

test('preview -> text box happens when another node is touched', () => {
  const t = setup('<p>one</p>\n<p>two</p>');
  const [p1, p2] = t.preview.querySelectorAll('p');
  placePreviewCaret(t, p1.firstChild);
  t.fire(t.preview, 'click');
  p1.firstChild.nodeValue = 'ONE';
  t.fire(t.preview, 'input');
  placePreviewCaret(t, p2.firstChild);
  t.fire(t.preview, 'click');
  assert.equal(t.source.value, '<p>ONE</p>\n<p>two</p>');
});

test('preview -> text box happens when the preview loses focus, and tells the page', () => {
  const t = setup('<p>one</p>');
  t.preview.querySelector('p').remove(); // "태그째 지우기" is allowed (§2-1)
  t.fire(t.preview, 'input');
  t.fire(t.preview, 'focusout');
  assert.equal(t.source.value, '');
  assert.deepEqual(t.changes.at(-1), '');
});

test('leaving the preview without editing does not rewrite the text box (keeps broken text as typed)', () => {
  const t = setup('<p>one</p>');
  typeInSource(t, '<p>one');
  t.fire(t.source, 'focusout'); // preview now repaired
  t.fire(t.preview, 'click');
  t.fire(t.preview, 'focusout');
  assert.equal(t.source.value, '<p>one');
});

test('flush() pushes pending edits from either side (used before Patch)', () => {
  const t = setup('<p>one</p>');
  t.preview.querySelector('p').firstChild.nodeValue = 'x';
  t.fire(t.preview, 'input');
  t.sync.flush();
  assert.equal(t.source.value, '<p>x</p>');

  typeInSource(t, '<p>y</p>');
  t.sync.flush();
  assert.equal(t.preview.innerHTML, '<p>y</p>');
});

test('onSourceChange is called on every text change (typing too) so the page can update the warning', () => {
  const t = setup('<p>one</p>');
  typeInSource(t, '<p>on');
  assert.equal(t.changes.at(-1), '<p>on');
});

test('Enter while typing in the text box is not "another spot": no sync until the caret is moved', () => {
  const t = setup('<p>one</p>');
  typeInSource(t, '<p>one</p>\n'); // Enter: caret now on line 2
  t.fire(t.source, 'keyup');
  assert.equal(t.preview.innerHTML, '<p>one</p>');
  moveSourceCaret(t, 2); // arrow up to line 1
  assert.equal(t.preview.innerHTML, '<p>one</p>\n');
});

// Codex sync r1 #1: Shift+arrow moves the selection's moving end; that is touching another spot too.
test('extending a selection in the text box onto another line syncs to the preview', () => {
  const t = setup('<p>one</p>\n<p>two</p>');
  typeInSource(t, '<p>ONE</p>\n<p>two</p>', 5);
  t.source.setSelectionRange(5, 16, 'forward');
  t.fire(t.source, 'keyup');
  assert.equal(t.preview.innerHTML, '<p>ONE</p>\n<p>two</p>');
});

test('extending a selection backward in the text box onto another line syncs too', () => {
  const t = setup('<p>one</p>\n<p>two</p>');
  typeInSource(t, '<p>one</p>\n<p>TWO</p>', 15);
  t.source.setSelectionRange(2, 15, 'backward');
  t.fire(t.source, 'keyup');
  assert.equal(t.preview.innerHTML, '<p>one</p>\n<p>TWO</p>');
});

test('extending a selection in the preview onto another node syncs to the text box', () => {
  const t = setup('<p>one</p>\n<p>two</p>');
  const [p1, p2] = t.preview.querySelectorAll('p');
  placePreviewCaret(t, p1.firstChild);
  p1.firstChild.nodeValue = 'ONE';
  t.fire(t.preview, 'input');
  t.doc.getSelection().extend(p2.firstChild, 1);
  t.fire(t.preview, 'keyup');
  assert.equal(t.source.value, '<p>ONE</p>\n<p>two</p>');
});

// Codex sync r1 #2: Enter in the preview makes a new node and puts the caret in it; like Enter in the text box,
// that is typing, not touching another spot.
test('Enter in the preview (caret lands in a new node while typing) does not sync until the caret is moved', () => {
  const t = setup('<p>one</p>');
  const p1 = t.preview.querySelector('p');
  placePreviewCaret(t, p1.firstChild);
  t.fire(t.preview, 'click');
  const p2 = t.doc.createElement('p'); // what a browser's Enter makes
  p2.appendChild(t.doc.createTextNode('new'));
  p1.after(p2);
  placePreviewCaret(t, p2.firstChild);
  t.fire(t.preview, 'input');
  t.fire(t.preview, 'keyup');
  assert.equal(t.source.value, '<p>one</p>');
  placePreviewCaret(t, p1.firstChild); // arrow up
  t.fire(t.preview, 'keyup');
  assert.equal(t.source.value, '<p>one</p><p>new</p>');
});

// Sample buttons and history moves use setSource: it replaces both sides and drops unsynced edits.
test('setSource drops an unsynced preview edit instead of copying it back later', () => {
  const t = setup('<p>one</p>');
  t.preview.querySelector('p').firstChild.nodeValue = 'unsynced';
  t.fire(t.preview, 'input');
  t.sync.setSource('<p>sample</p>');
  t.fire(t.preview, 'focusout');
  assert.equal(t.source.value, '<p>sample</p>');
  assert.equal(t.preview.innerHTML, '<p>sample</p>');
});
