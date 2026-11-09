// Tests for goal scope item 4 / spec-draft §2-1 broken-HTML warning.
// §2-1: "'깨짐' 기준은 IDE가 알려 주는 정도: 닫히지 않은 태그, 모르는 태그 이름, 짝 없는 닫는 태그.
//        따옴표 없는 속성은 경고하지 않는다." Pure module: works on the text, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintHtml, warningLine } from '../src/lint.js';

const kinds = (html) => lintHtml(html).map((w) => `${w.kind}:${w.tag}`);

test('well-formed HTML gives no warnings', () => {
  assert.deepEqual(lintHtml('<ul class="a">\n  <li>one</li>\n  <li><b>two</b></li>\n</ul>\n<p>x<br>y</p>'), []);
});

test('unclosed tag', () => {
  assert.deepEqual(kinds('<div><p>hi</div>'), ['unclosed:p']);
  assert.deepEqual(kinds('<section>'), ['unclosed:section']);
});

test('stray closing tag', () => {
  assert.deepEqual(kinds('<p>hi</p></span>'), ['stray:span']);
  assert.deepEqual(kinds('</div>'), ['stray:div']);
});

test('unknown tag name', () => {
  assert.deepEqual(kinds('<dvi>x</dvi>'), ['unknown:dvi']);
});

test('crossed tags: the inner one is unclosed and its later closing tag is stray', () => {
  assert.deepEqual(kinds('<b><i>x</b></i>'), ['unclosed:i', 'stray:i']);
});

test('unquoted attributes are fine (§2-1)', () => {
  assert.deepEqual(lintHtml('<p class=msg id=a>hi</p>'), []);
});

test('void elements need no closing tag, with or without a slash', () => {
  assert.deepEqual(lintHtml('<p>a<br>b<br/>c<img src=x.png><input type="text" /></p><hr>'), []);
});

test('comments, doctype and text with < that is not a tag are ignored', () => {
  assert.deepEqual(lintHtml('<!DOCTYPE html><!-- <div> not real --><p>1 < 2 and a <= b</p>'), []);
});

test('tag names are case-insensitive', () => {
  assert.deepEqual(lintHtml('<DIV>x</div>'), []);
});

test('custom elements (with a dash) are not unknown', () => {
  assert.deepEqual(lintHtml('<my-card>x</my-card>'), []);
});

test('script and style contents are not read as tags', () => {
  assert.deepEqual(lintHtml('<script>if (a < b) document.write("</p>")</script><style>p > b {}</style>'), []);
});

test('attribute values may contain > inside quotes', () => {
  assert.deepEqual(lintHtml('<p title="a > b">x</p>'), []);
});

test('each warning knows its line number (1-based)', () => {
  const ws = lintHtml('<ul>\n  <li>a</li>\n  <lx>b</lx>\n</ul>\n</ul>');
  assert.deepEqual(
    ws.map((w) => [w.kind, w.tag, w.line]),
    [['unknown', 'lx', 3], ['stray', 'ul', 5]],
  );
});

test('an unclosed tag reports the line where it was opened', () => {
  const ws = lintHtml('<div>\n<p>\nhi\n</div>');
  assert.deepEqual(ws.map((w) => [w.kind, w.tag, w.line]), [['unclosed', 'p', 2]]);
});

test('warningLine: empty when fine; first warning + count of the rest when broken', () => {
  assert.equal(warningLine([]), '');
  assert.equal(warningLine(lintHtml('<dvi>x</dvi>')), '1번째 줄: 모르는 태그 <dvi>');
  assert.equal(warningLine(lintHtml('<b><i>x</b></i>')), '1번째 줄: 닫히지 않은 태그 <i> (외 1개)');
  assert.equal(warningLine(lintHtml('<p>x</p></span>')), '1번째 줄: 짝 없는 닫는 태그 </span>');
});

// Codex batch-after-limit (c2f15a4): a slash does not close a non-void HTML element, and an unfinished tag is broken.
test('<div/> is still an open div (the slash only closes void and SVG/MathML elements)', () => {
  assert.deepEqual(kinds('<div/>'), ['unclosed:div']);
  assert.deepEqual(lintHtml('<svg><circle r="1"/></svg>'), []);
});

test('an unfinished opening tag at the end is reported', () => {
  assert.deepEqual(kinds('<p>x</p><div'), ['unclosed:div']);
});

test('any tag name inside <svg> or <math> is not "unknown" (SVG/MathML have too many names to list)', () => {
  assert.deepEqual(lintHtml('<svg><filter><feGaussianBlur /></filter></svg>'), []);
  assert.deepEqual(lintHtml('<math><mmultiscripts><mi>x</mi></mmultiscripts></math>'), []);
  assert.deepEqual(kinds('<svg></svg><filter></filter>'), ['unknown:filter']); // outside svg it is unknown again
});

// Codex fix-batch r2.
test('a tag cut off inside a quoted attribute value is reported', () => {
  assert.deepEqual(kinds('<div title="'), ['unclosed:div']);
  assert.deepEqual(kinds("<div title='hello"), ['unclosed:div']);
});

test('inside <foreignObject> it is HTML again: unknown names and <div/> are flagged', () => {
  assert.deepEqual(kinds('<svg><foreignObject><dvi></dvi></foreignObject></svg>'), ['unknown:dvi']);
  assert.deepEqual(kinds('<svg><foreignObject><div/></foreignObject></svg>'), ['unclosed:div']);
});

test('a typo in an SVG tag name is unknown', () => {
  assert.deepEqual(kinds('<svg><filtter /></svg>'), ['unknown:filtter']);
});

test('an unclosed <script> does not make its text look like a cut-off tag', () => {
  assert.deepEqual(kinds('<script>const x = "<div'), ['unclosed:script']);
});

// Spec §3-3 Q14: "한 목록 안에서 key가 겹치면 경고 줄에 알린다. 수정은 막지 않는다."
// "한 목록" = siblings under the same parent. The warning sits on the line of the SECOND (repeating) one.
test('duplicate key among siblings is warned on the repeating one', () => {
  assert.deepEqual(lintHtml('<ul>\n  <li key="a">밥</li>\n  <li key="a">국</li>\n</ul>'), [{ kind: 'dupkey', tag: 'li', key: 'a', line: 3 }]);
});

test('the same key under different parents is fine', () => {
  assert.deepEqual(lintHtml('<ul><li key="a">x</li></ul><ol><li key="a">y</li></ol>'), []);
  assert.deepEqual(lintHtml('<ul><li key="a"><b key="a">x</b></li></ul>'), []);
});

test('key values are compared exactly; quotes, single quotes, unquoted and upper-case KEY all count', () => {
  assert.deepEqual(kinds(`<p key=a></p><p key='a'></p><p KEY="a"></p>`), ['dupkey:p', 'dupkey:p']);
  assert.deepEqual(kinds('<p key="a"></p><p key="A"></p><p data-key="a"></p>'), []);
});

test('top-level siblings (no parent tag) count as one list too', () => {
  assert.deepEqual(kinds('<li key="1">a</li>\n<li key="1">b</li>'), ['dupkey:li']);
});

test('warningLine shows the repeated key', () => {
  assert.equal(warningLine(lintHtml('<ul><li key="a">밥</li><li key="a">국</li></ul>')), '1번째 줄: 겹친 key "a" <li>');
});
