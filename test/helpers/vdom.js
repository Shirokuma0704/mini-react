// The VDOM without "key" attributes: what 실제 영역 reads back as (spec §3-3 Q12: keys are never drawn there).
export function stripKeys(node) {
  if (node.kind === 'text') return node;
  const attrs = {};
  for (const [k, val] of Object.entries(node.attrs)) {
    // defineProperty, not attrs[k] = val: an attribute may be called "__proto__" (see src/core/domToVdom.js)
    if (k !== 'key') Object.defineProperty(attrs, k, { value: val, enumerable: true, writable: true, configurable: true });
  }
  return { kind: 'element', tag: node.tag, attrs, children: node.children.map(stripKeys) };
}
