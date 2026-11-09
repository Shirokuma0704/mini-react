// VDOM -> real DOM, and VDOM -> HTML text (goal scope item 1). The reverse of src/domToVdom.js.
//
// Every function that creates nodes takes `doc` (a Document) so the same file runs in a browser and in Node + jsdom.
//
// "Root" VDOM: the page keeps each version as one VDOM whose root is a plain { tag: 'div', attrs: {} } holding the
// fragment the user wrote. The root is never drawn itself; its children go inside an existing container
// (실제 영역, the preview). This choice is the orchestrator's, not the spec's (see docs/agent/progress.md "Open").
//
// Goal: html -> VDOM -> html -> VDOM gives the same VDOM. The edge cases below come from Codex review r1 (11-09).
import { domToVdom } from './domToVdom.js';
import { attachEvents } from './events.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MATH_NS = 'http://www.w3.org/1998/Math/MathML';

// Elements that never have a closing tag in HTML (HTML Living Standard, "void elements").
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);
// Raw text: the parser does not decode entities inside, so the text must be written as it is.
const RAW_TEXT_TAGS = new Set(['script', 'style', 'iframe', 'xmp', 'noembed', 'noframes']);
// The parser drops one newline right after these opening tags, so a text starting with "\n" needs one extra.
const LEADING_NEWLINE_TAGS = new Set(['pre', 'textarea', 'listing']);

export function isVoidTag(tag) {
  return VOID_TAGS.has(tag);
}

// The VDOM does not store a namespace (spec §1 has no slot for it), so it is inferred from the tag and the parent,
// the same way the HTML parser does it: <svg> starts SVG, <math> starts MathML, foreignObject's children are HTML.
function childNamespace(tag, ns) {
  if (ns === SVG_NS && tag === 'foreignObject') return null;
  return ns;
}

// opts.keys = false: leave out the "key" attribute (spec §3-3 Q12: 실제 영역 never shows keys; the preview does, Q13).
function createNode(vnode, doc, parentNs, opts) {
  if (vnode.kind === 'text') {
    return doc.createTextNode(vnode.text);
  }
  let ns = parentNs;
  if (vnode.tag === 'svg') ns = SVG_NS;
  else if (vnode.tag === 'math') ns = MATH_NS;
  const el = ns ? doc.createElementNS(ns, vnode.tag) : doc.createElement(vnode.tag);
  for (const [name, value] of Object.entries(vnode.attrs)) {
    if (name === 'key' && opts.keys === false) continue;
    el.setAttribute(name, value);
  }
  attachEvents(el, vnode.events); // handlers are never attributes (spec §4-2)
  const inner = childNamespace(vnode.tag, ns);
  for (const child of vnode.children) {
    el.appendChild(createNode(child, doc, inner, opts));
  }
  return el;
}

export function vdomToDom(vnode, doc, opts = {}) {
  return createNode(vnode, doc, null, opts);
}

// Same, for a node that will live inside `parent` (an element already in a document): the namespace comes from the
// parent, so a node patched in under <svg> is still SVG (src/patch.js).
export function vdomToDomUnder(parent, vnode, doc, opts = {}) {
  let ns = parent.namespaceURI === SVG_NS || parent.namespaceURI === MATH_NS ? parent.namespaceURI : null;
  if (ns === SVG_NS && parent.localName === 'foreignObject') ns = null;
  return createNode(vnode, doc, ns, opts);
}

function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
}

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\r/g, '&#13;');
}

export function vdomToHtml(vnode) {
  if (vnode.kind === 'text') {
    return escapeText(vnode.text);
  }
  let open = `<${vnode.tag}`;
  for (const [name, value] of Object.entries(vnode.attrs)) {
    open += ` ${name}="${escapeAttr(value)}"`;
  }
  open += '>';
  if (isVoidTag(vnode.tag)) return open;

  let inner = RAW_TEXT_TAGS.has(vnode.tag)
    ? vnode.children.map((c) => (c.kind === 'text' ? c.text : vdomToHtml(c))).join('')
    : vnode.children.map(vdomToHtml).join('');
  const first = vnode.children[0];
  if (LEADING_NEWLINE_TAGS.has(vnode.tag) && first && first.kind === 'text' && first.text.startsWith('\n')) {
    inner = '\n' + inner;
  }
  return open + inner + `</${vnode.tag}>`;
}

// The HTML text of a root VDOM's contents (what goes in the text box).
export function rootToHtml(root) {
  return root.children.map(vdomToHtml).join('');
}

// Remove comments, then merge text nodes left side by side. Without this, "a<!--x-->b" would be two text children
// while its own HTML text parses back as one, and editing in the preview splits text nodes at random places.
// Decision logged in docs/agent/progress.md "Open" (Codex render r1 #5).
function canonicalize(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 8) node.removeChild(child); // COMMENT_NODE
    else if (child.nodeType === 1) canonicalize(child);
  }
  node.normalize();
}

// HTML text (a fragment, possibly broken) -> root VDOM. The browser's own parser repairs broken HTML here.
export function htmlToVdom(html, doc) {
  const wrapper = doc.createElement('div');
  wrapper.innerHTML = html;
  canonicalize(wrapper);
  return domToVdom(wrapper);
}

// An existing container's contents -> root VDOM. The container's own tag and attributes are ignored,
// and the container itself is not changed (a copy is cleaned).
export function containerToVdom(container) {
  const copy = container.cloneNode(true);
  canonicalize(copy);
  const children = [];
  for (const child of copy.childNodes) {
    const vchild = domToVdom(child);
    if (vchild !== null) children.push(vchild);
  }
  return { kind: 'element', tag: 'div', attrs: {}, children };
}

// Replace everything inside `container` with the root's children. opts as in createNode.
export function renderInto(container, root, doc, opts = {}) {
  while (container.firstChild) container.removeChild(container.firstChild);
  for (const child of root.children) {
    container.appendChild(vdomToDomUnder(container, child, doc, opts));
  }
}
