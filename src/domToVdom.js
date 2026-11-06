// Real DOM node -> VDOM node, following spec-draft.md section 1.
//
// VDOM node shapes (field names chosen by the orchestrator; the spec only names the slots):
//   text:    { kind: 'text', text }                        // spec: 종류 + 글자
//   element: { kind: 'element', tag, attrs, children }     // spec: 종류 + 태그 이름 + 속성 + 안에 든 것들(순서 있는 목록)
//
// Plain DOM API only, so the same file runs in a browser and in Node + jsdom.

// nodeType values from the DOM standard. Written as numbers because Node.js has no global `Node`.
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

export function domToVdom(domNode) {
  if (domNode.nodeType === TEXT_NODE) {
    return { kind: 'text', text: domNode.nodeValue };
  }

  if (domNode.nodeType === ELEMENT_NODE) {
    const attrs = {};
    for (const attr of domNode.attributes) {
      // defineProperty instead of `attrs[name] = value`: plain assignment of a key named "__proto__" hits the
      // inherited setter and the attribute vanishes (found by Codex review, 11-06).
      Object.defineProperty(attrs, attr.name, {
        value: attr.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    const children = [];
    for (const child of domNode.childNodes) {
      const vchild = domToVdom(child);
      if (vchild !== null) children.push(vchild);
    }

    // localName is lowercase for HTML elements ("p", not "P") and keeps case for SVG (e.g. "foreignObject").
    return { kind: 'element', tag: domNode.localName, attrs, children };
  }

  // Comments, processing instructions etc.: the spec only defines text and element, so they are dropped.
  // OPEN QUESTION for 상철님 (see docs/agent/progress.md).
  return null;
}
