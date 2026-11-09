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
