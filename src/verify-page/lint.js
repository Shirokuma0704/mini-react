// Broken-HTML warning for the text box, spec-draft §2-1. Pure module: reads the text, no DOM.
//
// §2-1: warn "IDE가 알려 주는 정도" — unclosed tag, unknown tag name, stray closing tag.
// Unquoted attributes are not warned about. The warning never blocks editing (the page only shows it).
//
// Choices the spec does not make (docs/agent/progress.md "Open"):
// - every non-void tag needs its closing tag, even <li> and <p> where HTML allows leaving it out
// - names with a dash are custom elements → never "unknown"
// - inside <svg>/<math> names are checked against the SVG/MathML lists and "/>" closes a tag; inside <foreignObject>
//   it is HTML again, where "/>" closes only void tags (the parser ignores it on <div/>) — Codex batch r1, fix r2
// - an opening tag cut off at the end ("<div", '<div title="x') counts as unclosed
// - crossed tags `<b><i></b></i>`: at </b>, <i> is reported unclosed; the later </i> is then stray
// - the key is read like an HTML attribute (tokenized, first one wins, decimal/hex and &amp; &lt; &gt; &quot; &apos;
//   decoded, other named references left as written)
// - spec §3-3 Q14: a key repeated among siblings (same parent, or both at the top) is warned on the repeating tag

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes']);

const words = (s) => new Set(s.trim().split(/\s+/).map((w) => w.toLowerCase()));

// HTML Living Standard element names, plus common obsolete ones browsers still know, plus svg and math themselves.
const HTML_NAMES = words(`
a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col
colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3
h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter
nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section
select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time
title tr track u ul var video wbr
acronym big center font marquee nobr strike tt xmp listing plaintext noembed noframes
svg math`);

// SVG 2 element names (W3C SVG 2 element index) and MathML Core element names.
const SVG_NAMES = words(`
a animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend feColorMatrix
feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow
feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset
fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject g image line linearGradient
marker mask metadata mpath path pattern polygon polyline radialGradient rect script set stop style svg switch
symbol text textPath title tspan use view`);
const MATH_NAMES = words(`
math maction annotation annotation-xml menclose merror mfenced mfrac mi mmultiscripts mn mo mover mpadded mphantom
mprescripts mroot mrow ms mspace msqrt mstyle msub msubsup msup mtable mtd mtext mtr munder munderover none semantics`);

// One token: a comment, a doctype/other <! … >, or a tag with quoted attribute values allowed to hold ">".
const TOKEN = /<!--[\s\S]*?(?:-->|$)|<![^>]*>?|<(\/?)([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
// An opening tag cut off at the end of the text, possibly inside an unfinished quoted value.
const CUT_OFF = /<([a-zA-Z][^\s/>]*)(?:[^>"']|"[^"]*"|'[^']*')*(?:"[^"]*|'[^']*)?$/;

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

// Which language the next tag is in: the nearest <svg>, <math> or <foreignObject> above it decides.
function contextOf(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const t = stack[i].tag;
    if (t === 'svg') return 'svg';
    if (t === 'math') return 'math';
    if (t === 'foreignobject') return 'html';
  }
  return 'html';
}

// Character references in an attribute value: decimal, hex, and the five named ones below. Other named references stay
// as written (a full table is out of scope).
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(value) {
  return value.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g, (whole, dec, hex, name) => {
    if (name) return NAMED[name];
    const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
  });
}

// The decoded value of the "key" attribute in a tag's attribute text, or null. Walks name / optional = value pairs the
// way the HTML parser does: values are "double", 'single' or unquoted (up to whitespace or >); names are
// case-insensitive; the FIRST key attribute counts; a bare `key` means "".
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
function keyIn(attrText) {
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(attrText)) !== null) {
    if (m[1].toLowerCase() === 'key') return decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return null;
}

function isKnown(tag, context) {
  if (tag.includes('-') && context === 'html') return true;
  if (context === 'svg') return SVG_NAMES.has(tag);
  if (context === 'math') return MATH_NAMES.has(tag);
  return HTML_NAMES.has(tag);
}

export function lintHtml(text) {
  const warnings = [];
  const stack = []; // { tag, line, keys }
  const topKeys = new Set(); // keys seen among top-level siblings
  TOKEN.lastIndex = 0;
  let m;
  let lastEnd = 0; // end of what has been read, so the cut-off check never looks inside a token or raw text
  while ((m = TOKEN.exec(text)) !== null) {
    lastEnd = TOKEN.lastIndex;
    if (m[2] === undefined) continue; // comment or <!…>
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const line = lineAt(text, m.index);

    if (!closing) {
      const context = contextOf(stack);
      if (!isKnown(tag, context)) warnings.push({ kind: 'unknown', tag, line });
      const key = keyIn(m[3]);
      if (key !== null) {
        const siblings = stack.length > 0 ? stack[stack.length - 1].keys : topKeys;
        if (siblings.has(key)) warnings.push({ kind: 'dupkey', tag, key, line });
        else siblings.add(key);
      }
      // "/>" closes a tag in SVG/MathML (and on <svg/>, <math/> themselves); in HTML the parser ignores the slash.
      const foreignTag = context !== 'html' || tag === 'svg' || tag === 'math';
      const selfClosed = foreignTag && /\/\s*$/.test(m[3]);
      if (VOID.has(tag) || selfClosed) continue;
      if (RAW_TEXT.has(tag) && context === 'html') {
        // Skip to the matching closing tag: what is inside is text, not tags.
        const close = new RegExp(`</${tag}\\s*>`, 'ig');
        close.lastIndex = TOKEN.lastIndex;
        const end = close.exec(text);
        if (!end) {
          warnings.push({ kind: 'unclosed', tag, line });
          lastEnd = text.length; // the rest is this element's text
          break;
        }
        TOKEN.lastIndex = close.lastIndex;
        lastEnd = close.lastIndex;
        continue;
      }
      stack.push({ tag, line, keys: new Set() });
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

  const cut = CUT_OFF.exec(text.slice(lastEnd));
  if (cut) warnings.push({ kind: 'unclosed', tag: cut[1].toLowerCase(), line: lineAt(text, lastEnd + cut.index) });

  return warnings.sort((a, b) => a.line - b.line);
}

const NAMES = { unclosed: '닫히지 않은 태그', unknown: '모르는 태그', stray: '짝 없는 닫는 태그', dupkey: '겹친 key' };

// The one line shown under the text box.
export function warningLine(warnings) {
  if (warnings.length === 0) return '';
  const w = warnings[0];
  let shown = w.kind === 'stray' ? `</${w.tag}>` : `<${w.tag}>`;
  if (w.kind === 'dupkey') shown = `${JSON.stringify(w.key)} ${shown}`;
  const more = warnings.length > 1 ? ` (외 ${warnings.length - 1}개)` : '';
  return `${w.line}번째 줄: ${NAMES[w.kind]} ${shown}${more}`;
}
