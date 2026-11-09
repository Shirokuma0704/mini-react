// Tests for goal scope item 1: VDOM -> real DOM (render) and VDOM -> HTML text (for the text box).
// The VDOM shape is spec-draft.md section 1 as built in src/domToVdom.js.
// Main property: going DOM -> VDOM -> (DOM or HTML) -> VDOM gives back the same VDOM,
// so the page can move between the text box, the preview and 실제 영역 without losing anything the VDOM keeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { domToVdom } from '../src/domToVdom.js';
import { vdomToDom, vdomToHtml, htmlToVdom, containerToVdom, renderInto, rootToHtml } from '../src/render.js';

function makeDoc() {
  return new JSDOM('<!DOCTYPE html><body></body>').window.document;
}

const SPEC_EXAMPLE = '<p class="msg">hi <b>there</b> bye</p>';

test('vdomToDom builds a real element that converts back to the same VDOM', () => {
  const doc = makeDoc();
  const wrapper = doc.createElement('div');
  wrapper.innerHTML = SPEC_EXAMPLE;
  const vdom = domToVdom(wrapper.firstChild);

  const real = vdomToDom(vdom, doc);
  assert.equal(real.nodeType, 1);
  assert.equal(real.localName, 'p');
  assert.equal(real.getAttribute('class'), 'msg');
  assert.deepEqual(domToVdom(real), vdom);
});

test('vdomToDom builds a text node for a text VDOM, keeping whitespace', () => {
  const doc = makeDoc();
  const real = vdomToDom({ kind: 'text', text: '  hi  ' }, doc);
  assert.equal(real.nodeType, 3);
  assert.equal(real.nodeValue, '  hi  ');
});

test('vdomToDom does not interpret text as HTML', () => {
  const doc = makeDoc();
  const real = vdomToDom({ kind: 'element', tag: 'p', attrs: {}, children: [{ kind: 'text', text: '<b>x</b>' }] }, doc);
  assert.equal(real.childNodes.length, 1);
  assert.equal(real.firstChild.nodeType, 3);
  assert.equal(real.textContent, '<b>x</b>');
});

test('vdomToHtml writes the spec example back as the same HTML text', () => {
  const doc = makeDoc();
  const wrapper = doc.createElement('div');
  wrapper.innerHTML = SPEC_EXAMPLE;
  assert.equal(vdomToHtml(domToVdom(wrapper.firstChild)), SPEC_EXAMPLE);
});

test('vdomToHtml escapes text and attribute values', () => {
  const vdom = {
    kind: 'element',
    tag: 'a',
    attrs: { title: 'say "hi" & <bye>' },
    children: [{ kind: 'text', text: '1 < 2 & 3 > 2' }],
  };
  assert.equal(vdomToHtml(vdom), '<a title="say &quot;hi&quot; &amp; <bye>">1 &lt; 2 &amp; 3 &gt; 2</a>');
});

test('vdomToHtml writes void elements without a closing tag', () => {
  const vdom = {
    kind: 'element',
    tag: 'p',
    attrs: {},
    children: [
      { kind: 'text', text: 'a' },
      { kind: 'element', tag: 'br', attrs: {}, children: [] },
      { kind: 'element', tag: 'img', attrs: { src: 'x.png', alt: '' }, children: [] },
    ],
  };
  assert.equal(vdomToHtml(vdom), '<p>a<br><img src="x.png" alt=""></p>');
});

test('vdomToHtml keeps <style> text raw so it parses back the same', () => {
  const doc = makeDoc();
  const root = htmlToVdom('<style>p > b { color: red; }</style>', doc);
  const html = root.children.map(vdomToHtml).join('');
  assert.equal(html, '<style>p > b { color: red; }</style>');
  assert.deepEqual(htmlToVdom(html, doc), root);
});

test('vdomToHtml writes an empty attribute value as name=""', () => {
  const vdom = { kind: 'element', tag: 'input', attrs: { disabled: '' }, children: [] };
  assert.equal(vdomToHtml(vdom), '<input disabled="">');
});

test('htmlToVdom gives a root div holding the fragment, comments dropped', () => {
  const doc = makeDoc();
  const root = htmlToVdom('<p>a</p><!-- note -->\n<ul><li>x</li></ul>', doc);
  assert.deepEqual(root, {
    kind: 'element',
    tag: 'div',
    attrs: {},
    children: [
      { kind: 'element', tag: 'p', attrs: {}, children: [{ kind: 'text', text: 'a' }] },
      { kind: 'text', text: '\n' },
      {
        kind: 'element',
        tag: 'ul',
        attrs: {},
        children: [{ kind: 'element', tag: 'li', attrs: {}, children: [{ kind: 'text', text: 'x' }] }],
      },
    ],
  });
});

test('containerToVdom ignores the container element itself (id, class) and keeps only its contents', () => {
  const doc = makeDoc();
  const area = doc.createElement('section');
  area.id = 'actual';
  area.className = 'area';
  area.innerHTML = '<p>a</p>';
  assert.deepEqual(containerToVdom(area), htmlToVdom('<p>a</p>', doc));
});

test('renderInto replaces a container\'s contents with the root\'s children', () => {
  const doc = makeDoc();
  const area = doc.createElement('div');
  area.innerHTML = '<span>old</span>';
  const root = htmlToVdom('<ul class="list">\n  <li>one</li>\n  <li><b>two</b></li>\n</ul>text', doc);
  renderInto(area, root, doc);
  assert.deepEqual(containerToVdom(area), root);
  assert.equal(area.querySelector('span'), null);
});

// Codex render r1 #1-#5: each input must survive html -> VDOM -> html -> VDOM unchanged.
for (const html of [
  '<svg viewBox="0 0 1 1"><foreignObject><p>x</p></foreignObject></svg>',
  '<pre>\n\nx</pre>',
  '<textarea>\n\nx</textarea>', // two newlines: the parser eats the first, the VDOM keeps "\nx" (Codex r2)
  '<listing>\n\nx</listing>',
  '<p>a&#13;b</p>',
  '<div title="a&#13;b">x</div>',
  '<iframe>a <b> & c</iframe>',
  '<xmp>a <b> & c</xmp>',
  '<noembed>a <b></noembed>',
  '<noframes>a <b></noframes>',
]) {
  test(`round trip keeps the VDOM for ${JSON.stringify(html)}`, () => {
    const doc = makeDoc();
    const root = htmlToVdom(html, doc);
    assert.deepEqual(htmlToVdom(rootToHtml(root), doc), root);
  });
}

test('SVG survives vdomToDom: tag and attribute case, and the SVG namespace', () => {
  const doc = makeDoc();
  const root = htmlToVdom('<svg viewBox="0 0 1 1"><foreignObject><p>x</p></foreignObject></svg>', doc);
  const area = doc.createElement('div');
  renderInto(area, root, doc);
  assert.deepEqual(containerToVdom(area), root);
  assert.equal(area.firstChild.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(area.querySelector('p').namespaceURI, 'http://www.w3.org/1999/xhtml');
});

// Codex render r1 #5: once comments are dropped, the text on both sides would merge on the next parse anyway,
// so the root VDOM of a fragment never has two text children side by side (decision logged in progress.md Open).
test('htmlToVdom merges text left side by side after a comment is dropped', () => {
  const doc = makeDoc();
  const root = htmlToVdom('<p>a<!--x-->b</p>', doc);
  assert.deepEqual(root.children[0].children, [{ kind: 'text', text: 'ab' }]);
  assert.deepEqual(htmlToVdom(rootToHtml(root), doc), root);
});

test('containerToVdom merges split text nodes (as left by editing in the preview) and does not touch the container', () => {
  const doc = makeDoc();
  const area = doc.createElement('div');
  const p = doc.createElement('p');
  p.appendChild(doc.createTextNode('ab'));
  p.appendChild(doc.createTextNode('cd'));
  area.appendChild(p);
  assert.deepEqual(containerToVdom(area).children[0].children, [{ kind: 'text', text: 'abcd' }]);
  assert.equal(p.childNodes.length, 2);
});

test('rootToHtml joins the root children', () => {
  const doc = makeDoc();
  assert.equal(rootToHtml(htmlToVdom('<b>a</b>\n<i>b</i>', doc)), '<b>a</b>\n<i>b</i>');
});

test('round trip: html -> VDOM -> html -> VDOM is stable for a mixed sample', () => {
  const doc = makeDoc();
  const html =
    '<section id="s" data-x="1">\n  <h2>제목</h2>\n  <ol start="3"><li>a <i>b</i></li><li>c</li></ol>\n  <p>x<br>y</p>\n</section>';
  const root = htmlToVdom(html, doc);
  const htmlAgain = root.children.map(vdomToHtml).join('');
  assert.equal(htmlAgain, html);
  assert.deepEqual(htmlToVdom(htmlAgain, doc), root);
});
