// The verification page (spec-draft §2). mountApp wires behaviour onto index.html's elements.
// Takes `doc` so the same code runs in a browser and on a jsdom document in tests.
import { createSync } from './sync.js';
import { lintHtml, warningLine } from './lint.js';
import { createHistory } from './history.js';
import { renderTree, logText } from './treeView.js';
import { htmlToVdom, containerToVdom, renderInto, rootToHtml } from './render.js';
import { SAMPLES } from './samples.js';

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

  function say(text) {
    els.status.textContent = text;
  }

  // §2-4: sample buttons fill the text box only; 실제 영역 and history stay until Patch.
  for (const sample of SAMPLES) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.textContent = sample.name;
    btn.addEventListener('click', () => {
      sync.setSource(sample.html);
      say(`${sample.name}을 글자 칸에 넣었어요. Patch를 눌러야 새 버전이 돼요.`);
    });
    els.samples.appendChild(btn);
  }

  // Load (spec §2): sample HTML in 실제 영역 → VDOM (v1) → test area. §2-4: "처음 열면 샘플 1이 들어 있다".
  renderInto(els.actual, htmlToVdom(SAMPLES[0].html, doc), doc);
  const history = createHistory(containerToVdom(els.actual));
  sync.setSource(rootToHtml(history.current().vdom));

  function refresh() {
    renderTree(els.tree, history, doc, () => {}); // clicking a version is wired with the moves (back/forward)
    els.movelog.textContent = logText(history);
    els.back.disabled = !history.canBack();
    els.forward.disabled = !history.canForward();
  }

  refresh();
  say(`${history.current().label}: 실제 영역의 샘플 1에서 시작했어요.`);

  return { els, sync, history };
}
