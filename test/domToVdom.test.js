// Tests for spec-draft.md section 1 (VDOM node), written before the implementation.
// Every expectation below is traced to a line of the spec. Whitespace in text is kept exactly as the DOM has it
// ("hi ", " bye") — spec rule added 11-06 by 상철님 ("그대로 두기") after Codex review #2.
// Behaviour the spec does not decide (comments, tag case for SVG) is not tested here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { domToVdom } from '../src/domToVdom.js';

// Parse an HTML fragment and return its first node, using jsdom as the DOM.
function firstNode(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  return dom.window.document.body.firstChild;
}

// Spec: whitespace rule — leading/trailing spaces in text stay.
test('whitespace in text is kept exactly', () => {
  const vdom = domToVdom(firstNode('<p>  a  <b> b </b>  </p>'));
  assert.deepEqual(
    vdom.children.map((c) => (c.kind === 'text' ? c.text : c.children[0].text)),
    ['  a  ', ' b ', '  '],
  );
});

// Spec: the worked example, end to end.
// "종류 / 태그 이름: p / 속성: class = msg / 안에 든 것들: 순서대로 목록 — 글자 "hi", b 노드(안에 글자 "there"), 글자 "bye""
test('spec example: <p class="msg">hi <b>there</b> bye</p>', () => {
  const vdom = domToVdom(firstNode('<p class="msg">hi <b>there</b> bye</p>'));
  assert.deepEqual(vdom, {
    kind: 'element',
    tag: 'p',
    attrs: { class: 'msg' },
    children: [
      { kind: 'text', text: 'hi ' },
      {
        kind: 'element',
        tag: 'b',
        attrs: {},
        children: [{ kind: 'text', text: 'there' }],
      },
      { kind: 'text', text: ' bye' },
    ],
  });
});

// Spec: "종류: 이게 글자인지 노드인지 구분하는 칸"
test('kind tells text and element apart', () => {
  const vdom = domToVdom(firstNode('<p>hi <b>there</b></p>'));
  assert.equal(vdom.kind, 'element');
  assert.equal(vdom.children[0].kind, 'text');
  assert.equal(vdom.children[1].kind, 'element');
});

// Spec: "안에 든 것들: 순서대로 목록에 담는다" — order must survive.
test('children keep document order', () => {
  const vdom = domToVdom(firstNode('<ul><li>a</li><li>b</li><li>c</li></ul>'));
  const texts = vdom.children.map((li) => li.children[0].text);
  assert.deepEqual(texts, ['a', 'b', 'c']);
});

// Spec: "목록 안에 든 노드도 똑같은 모양이에요" — nesting at any depth uses the same shape.
// Checks the whole tree, not just the deepest node (Codex review 11-06: intermediate nodes were unchecked).
test('nested nodes use the same shape at every depth', () => {
  const vdom = domToVdom(firstNode('<div><section><p><b>deep</b></p></section></div>'));
  assert.deepEqual(vdom, {
    kind: 'element',
    tag: 'div',
    attrs: {},
    children: [
      {
        kind: 'element',
        tag: 'section',
        attrs: {},
        children: [
          {
            kind: 'element',
            tag: 'p',
            attrs: {},
            children: [
              {
                kind: 'element',
                tag: 'b',
                attrs: {},
                children: [{ kind: 'text', text: 'deep' }],
              },
            ],
          },
        ],
      },
    ],
  });
});

// Spec: "속성: class = msg" — attributes are name → value; more than one must all be kept.
test('all attributes are kept as name -> value', () => {
  const vdom = domToVdom(firstNode('<a href="/x" id="link" class="btn">go</a>'));
  assert.deepEqual(vdom.attrs, { href: '/x', id: 'link', class: 'btn' });
});

// Spec: "속성" must be kept whatever the attribute is called (Codex review 11-06: "__proto__" was dropped).
test('an attribute named __proto__ is kept as an own property', () => {
  const vdom = domToVdom(firstNode('<p __proto__="kept">hi</p>'));
  assert.equal(Object.hasOwn(vdom.attrs, '__proto__'), true);
  assert.equal(vdom.attrs['__proto__'], 'kept');
  assert.deepEqual(Object.keys(vdom.attrs), ['__proto__']);
});

// Spec shape applied to the empty case: no attributes → empty attrs, no contents → empty list.
test('element with no attributes and no children', () => {
  const vdom = domToVdom(firstNode('<br>'));
  assert.deepEqual(vdom, { kind: 'element', tag: 'br', attrs: {}, children: [] });
});

// Spec: a text node on its own is "글자".
test('a text node converts on its own', () => {
  const vdom = domToVdom(firstNode('just text'));
  assert.deepEqual(vdom, { kind: 'text', text: 'just text' });
});
