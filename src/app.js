// The verification page (spec-draft §2). mountApp wires behaviour onto index.html's elements.
// Takes `doc` so the same code runs in a browser and on a jsdom document in tests.
import { createSync } from './sync.js';
import { lintHtml, warningLine } from './lint.js';

export function mountApp(doc) {
  const els = {
    actual: doc.getElementById('actual'),
    source: doc.getElementById('source'),
    warning: doc.getElementById('warning'),
    preview: doc.getElementById('preview'),
    patch: doc.getElementById('patch'),
    back: doc.getElementById('back'),
    forward: doc.getElementById('forward'),
    samples: doc.getElementById('samples'),
    status: doc.getElementById('status'),
    tree: doc.getElementById('tree'),
    movelog: doc.getElementById('movelog'),
    debugOld: doc.getElementById('debug-old'),
    debugNew: doc.getElementById('debug-new'),
  };

  // §2-1: warning line under the text box. Shown only, never blocks editing.
  function updateWarning(text) {
    const line = warningLine(lintHtml(text));
    els.warning.textContent = line;
    els.warning.classList.toggle('on', line !== '');
  }

  // §2-1: text box <-> preview.
  const sync = createSync({ source: els.source, preview: els.preview, doc, onSourceChange: updateWarning });

  return { els, sync };
}
