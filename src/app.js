// The verification page (spec-draft §2). mountApp wires behaviour onto index.html's elements.
// Takes `doc` so the same code runs in a browser and on a jsdom document in tests.
//
// Flow (spec §2, "과제 문서로 이미 정해진 것"):
// - load: sample HTML in 실제 영역 → VDOM (v1) → drawn in the test area (text box + preview)
// - Patch: text box → VDOM → diff with the current version → patch 실제 영역 → store in history
// - back / forward / tree click: 실제 영역 and the test area change together
import { createSync } from './sync.js';
import { lintHtml, warningLine } from './lint.js';
import { createHistory } from './history.js';
import { renderTree, logText } from './treeView.js';
import { htmlToVdom, containerToVdom, renderInto, rootToHtml } from './render.js';
import { SAMPLES } from './samples.js';
import { diff } from './diff.js'; // PROVISIONAL
import { patch } from './patch.js'; // PROVISIONAL
import { debugLines, renderDebug } from './debugView.js';

const EMPTY_ROOT = { kind: 'element', tag: 'div', attrs: {}, children: [] };

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

  function say(text) {
    els.status.textContent = text;
  }

  // §2-1: warning line under the text box. Shown only, never blocks editing.
  function updateWarning(text) {
    const line = warningLine(lintHtml(text));
    els.warning.textContent = line;
    els.warning.classList.toggle('on', line !== '');
  }

  // §2-1: text box <-> preview.
  const sync = createSync({ source: els.source, preview: els.preview, doc, onSourceChange: updateWarning });

  // §2-4: sample buttons fill the text box only; 실제 영역 and history stay until Patch.
  for (const sample of SAMPLES) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.textContent = sample.name;
    btn.addEventListener('click', () => {
      sync.setSource(sample.html);
      say(`글자 칸에 ${sample.name} 내용을 넣었어요. Patch를 눌러야 새 버전이 돼요.`);
    });
    els.samples.appendChild(btn);
  }

  // Load (spec §2): sample HTML in 실제 영역 → VDOM (v1) → test area. §2-4: "처음 열면 샘플 1이 들어 있다".
  renderInto(els.actual, htmlToVdom(SAMPLES[0].html, doc), doc);
  const history = createHistory(containerToVdom(els.actual));
  sync.setSource(rootToHtml(history.current().vdom));

  function refresh() {
    renderTree(els.tree, history, doc, goto);
    els.movelog.textContent = logText(history);
    els.back.disabled = !history.canBack();
    els.forward.disabled = !history.canForward();
  }

  // §2-3: debug panel, old vs new side by side, colored from the diff RESULT (never from comparing them here).
  function showDebug(oldRoot, newRoot, changes) {
    renderDebug(els.debugOld, debugLines(oldRoot, changes, 'old'), doc);
    renderDebug(els.debugNew, debugLines(newRoot, changes, 'new'), doc);
  }

  // diff the two versions, patch 실제 영역 with the result, and show the same result in the debug panel.
  function apply(fromRoot, toRoot) {
    const changes = diff(fromRoot, toRoot);
    patch(els.actual, changes, doc);
    showDebug(fromRoot, toRoot, changes);
    return changes;
  }

  // Patch button. The text box is the source of truth (§2-1); pending preview edits are pushed into it first.
  function doPatch() {
    sync.flush();
    const before = history.current();
    const r = history.commit(htmlToVdom(els.source.value, doc));
    if (r.result === 'same') {
      // §2-2 "바뀐 게 없으면 새 버전을 만들지 않고 알리기만 한다."
      say(`바뀐 게 없어요. 새 버전을 만들지 않았어요 (지금 ${before.label}).`);
      return r;
    }
    apply(before.vdom, r.node.vdom);
    say(
      r.result === 'created'
        ? `새 버전 ${r.node.label} 만들었어요.`
        : `같은 갈래에 내용이 같은 버전이 있어서, 새로 만들지 않고 옮겨 갔어요 → ${r.node.label}`,
    );
    refresh();
    return r;
  }

  // back / forward / tree click: 실제 영역 and the test area change together.
  function move(step, failText) {
    sync.flush();
    const before = history.current();
    const node = step();
    if (!node) {
      if (failText) say(failText);
      return null;
    }
    apply(before.vdom, node.vdom);
    sync.setSource(rootToHtml(node.vdom));
    say(`${before.label} → ${node.label}`);
    refresh();
    return node;
  }

  const back = () => move(() => history.back(), '더 뒤로 갈 버전이 없어요.');
  const forward = () => move(() => history.forward(), '더 앞으로 갈 버전이 없어요.');
  function goto(id) {
    return move(() => history.goto(id), null);
  }

  els.patch.addEventListener('click', doPatch);
  els.back.addEventListener('click', back);
  els.forward.addEventListener('click', forward);

  showDebug(EMPTY_ROOT, history.current().vdom, []);
  refresh();
  say(`${history.current().label}: 실제 영역의 샘플 1에서 시작했어요.`);

  return { els, sync, history, patch: doPatch, back, forward, goto };
}
