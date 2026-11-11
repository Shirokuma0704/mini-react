// Action log of the hooks check page (his request 11-10: "hook쪽에도 액션로그가 있으면좋겠어").
// Two kinds of lines in the order things happened, newest on top:
//   what he did          press (a button), input (typing in a box, ticking a checkbox)
//   what the library did render ("다시 그림 (n번째)" + how many nodes of the card were really touched), said (rules card)
// The log never claims which press caused which render; it only keeps the order. A press with no render line after
// it means the component did not run again (spec §4-4: same value → skipped).
//
// How a render is seen: every card has a "그린 횟수" probe outside its container, bumped each time the component
// function runs (src/hooks-page/hooksPage.js countRenders). One MutationObserver per card watches that probe AND the card's
// container. Its callback runs as a microtask after the render (and its patch) finished, so the same batch of
// records says both "it ran again" and "these nodes were touched" (counted by classify() from src/page-tools/touched.js, the
// same counting as the verification page).
//
// Render lines that follow each other with nothing in between (the timer ticking) are folded into one line.
import { clock } from '../page-tools/actionLog.js';
import { classify } from '../page-tools/touched.js';

const CARDS = [
  { id: 'counter', name: '카운터' },
  { id: 'todos', name: '할 일 목록' },
  { id: 'timer', name: '타이머' },
  { id: 'filter', name: '거르기' },
  { id: 'rules', name: '규칙 어기기' },
  { id: 'form', name: '입력칸' },
];

// onLine(li, isNew): called after a line was added (isNew) or folded into (not new); the page hangs motion on it.
export function watchHooksLog(doc, { now = () => new Date(), onLine = () => {} } = {}) {
  const list = doc.getElementById('hookslog');
  const Observer = doc.defaultView?.MutationObserver;
  if (!list) return;

  function span(cls, text) {
    const el = doc.createElement('span');
    el.className = cls;
    el.textContent = text;
    return el;
  }

  let newest = null; // { li, action, card, times } of the top line

  function add({ action, card = null, what, result, touched = null }) {
    const li = doc.createElement('li');
    li.className = 'entry';
    li.dataset.action = action;
    if (card) li.dataset.card = card;
    const head = doc.createElement('div');
    head.className = 'entry-head';
    head.append(span('when', clock(now())), span('what', what), span('result', result));
    li.appendChild(head);
    if (touched !== null) {
      const detail = doc.createElement('div');
      detail.className = 'entry-detail';
      detail.appendChild(span('touched', `건드린 노드 ${touched}개`));
      li.appendChild(detail);
    }
    list.insertBefore(li, list.firstChild);
    newest = { li, action, card, times: 1 };
    onLine(li, true);
  }

  // The component of `card` ran again; `nth` is its render count now, `ran` how many runs this batch saw.
  function rendered(card, nth, ran, touched) {
    if (newest && newest.action === 'render' && newest.card === card.id) {
      newest.times += ran;
      const { li } = newest;
      li.querySelector('.when').textContent = clock(now());
      li.querySelector('.result').textContent = `다시 그림 ×${newest.times} (${nth}번째까지)`;
      li.querySelector('.touched').textContent = `건드린 노드 ${touched}개`;
      onLine(li, false);
      return;
    }
    add({
      action: 'render',
      card: card.id,
      what: card.name,
      result: ran === 1 ? `다시 그림 (${nth}번째)` : `다시 그림 ×${ran} (${nth}번째까지)`,
      touched,
    });
    newest.times = ran;
  }

  for (const card of CARDS) {
    const box = doc.getElementById(card.id);
    if (!box) continue;

    // ---- what he did ----
    box.addEventListener(
      'click',
      (event) => {
        const btn = event.target.closest?.('button');
        if (!btn || !box.contains(btn)) return;
        add({ action: 'press', card: card.id, what: card.name, result: `"${btn.textContent}" 누름` });
        if (card.id === 'rules') {
          // The rules card is plain DOM: its own click handler writes what the library said into #rules-out.
          const out = doc.getElementById('rules-out');
          queueMicrotask(() => add({ action: 'said', card: card.id, what: card.name, result: out.textContent }));
        }
      },
      true,
    );
    box.addEventListener(
      'input',
      (event) => {
        const el = event.target;
        if (el.localName !== 'input' || el.type === 'checkbox' || el.type === 'radio') return;
        add({ action: 'input', card: card.id, what: card.name, result: `"${el.value}" 입력` });
      },
      true,
    );
    box.addEventListener(
      'change',
      (event) => {
        const el = event.target;
        if (el.localName !== 'input' || el.type !== 'checkbox') return;
        add({ action: 'input', card: card.id, what: card.name, result: el.checked ? '체크 켬' : '체크 끔' });
      },
      true,
    );

    // ---- what the library did ----
    const probe = doc.getElementById(`${card.id}-renders`);
    if (!probe || !Observer) continue;
    let seen = Number(probe.textContent);
    const observer = new Observer((records) => {
      const nth = Number(probe.textContent);
      if (nth === seen) return; // the card's DOM changed without a render (nothing does that today)
      const ran = nth - seen;
      seen = nth;
      const inBox = records.filter((r) => box.contains(r.target));
      rendered(card, nth, ran, classify(inBox, box).count);
    });
    observer.observe(probe, { childList: true, characterData: true, subtree: true });
    observer.observe(box, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  add({ action: 'load', what: '시작', result: '카드 6개를 처음 그림' });
}
