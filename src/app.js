// The verification page (spec-draft §2). mountApp wires behaviour onto index.html's elements.
// Takes `doc` so the same code runs in a browser and on a jsdom document in tests.
import { createSync } from './sync.js';
import { lintHtml, warningLine } from './lint.js';
import { createHistory } from './history.js';
import { renderTree, logText } from './treeView.js';
import { containerToVdom } from './render.js';

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

  // §2-2: history starts from what 실제 영역 holds (spec §2: "로드하면 실제 영역의 샘플 HTML → VDOM").
  const history = createHistory(containerToVdom(els.actual));

  function refresh() {
    renderTree(els.tree, history, doc, () => {}); // clicking a version is wired with the moves (back/forward)
    els.movelog.textContent = logText(history);
    els.back.disabled = !history.canBack();
    els.forward.disabled = !history.canForward();
  }

  refresh();

  return { els, sync, history };
}
