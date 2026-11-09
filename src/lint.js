// Broken-HTML warning for the text box, spec-draft §2-1. Pure module: reads the text, no DOM.
//
// §2-1: warn "IDE가 알려 주는 정도" — unclosed tag, unknown tag name, stray closing tag.
// Unquoted attributes are not warned about. The warning never blocks editing (the page only shows it).
//
// Choices the spec does not make (docs/agent/progress.md "Open"):
// - every non-void tag needs its closing tag, even <li> and <p> where HTML allows leaving it out
// - names with a dash are custom elements → never "unknown"; SVG/MathML tag names are in the known list
// - crossed tags `<b><i></b></i>`: at </b>, <i> is reported unclosed; the later </i> is then stray

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes']);

// HTML Living Standard element names, plus common obsolete ones browsers still know, plus SVG and MathML.
const KNOWN = new Set(`
a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col
colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3
h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter
nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section
select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time
title tr track u ul var video wbr
acronym big center font marquee nobr strike tt xmp listing plaintext noembed noframes
svg g path circle ellipse line polyline polygon rect text tspan defs use symbol title desc lineargradient
radialgradient stop clippath mask pattern image foreignobject marker
math mi mn mo ms mtext mrow mfrac msqrt mroot msub msup msubsup mtable mtr mtd semantics annotation annotation-xml
`.trim().split(/\s+/));

// One token: a comment, a doctype/other <! … >, or a tag with quoted attribute values allowed to hold ">".
const TOKEN = /<!--[\s\S]*?(?:-->|$)|<![^>]*>?|<(\/?)([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

export function lintHtml(text) {
  const warnings = [];
  const stack = []; // { tag, line }
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m[2] === undefined) continue; // comment or <!…>
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const line = lineAt(text, m.index);

    if (!closing) {
      if (!KNOWN.has(tag) && !tag.includes('-')) warnings.push({ kind: 'unknown', tag, line });
      const selfClosed = /\/\s*$/.test(m[3]);
      if (VOID.has(tag) || selfClosed) continue;
      if (RAW_TEXT.has(tag)) {
        // Skip to the matching closing tag: what is inside is text, not tags.
        const close = new RegExp(`</${tag}\\s*>`, 'ig');
        close.lastIndex = TOKEN.lastIndex;
        const end = close.exec(text);
        if (!end) {
          warnings.push({ kind: 'unclosed', tag, line });
          break;
        }
        TOKEN.lastIndex = close.lastIndex;
        continue;
      }
      stack.push({ tag, line });
      continue;
    }

    // closing tag
    if (VOID.has(tag)) continue; // </br> and friends: browsers tolerate them, IDEs do not flag them either
    const at = stack.map((s) => s.tag).lastIndexOf(tag);
    if (at === -1) {
      warnings.push({ kind: 'stray', tag, line });
      continue;
    }
    for (const open of stack.splice(at).slice(1)) {
      warnings.push({ kind: 'unclosed', tag: open.tag, line: open.line });
    }
  }
  for (const open of stack) warnings.push({ kind: 'unclosed', tag: open.tag, line: open.line });

  return warnings.sort((a, b) => a.line - b.line);
}

const NAMES = { unclosed: '닫히지 않은 태그', unknown: '모르는 태그', stray: '짝 없는 닫는 태그' };

// The one line shown under the text box.
export function warningLine(warnings) {
  if (warnings.length === 0) return '';
  const w = warnings[0];
  const shown = w.kind === 'stray' ? `</${w.tag}>` : `<${w.tag}>`;
  const more = warnings.length > 1 ? ` (외 ${warnings.length - 1}개)` : '';
  return `${w.line}번째 줄: ${NAMES[w.kind]} ${shown}${more}`;
}
