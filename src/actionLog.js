// Action log of the verification page, spec-draft §2-6 (his request 11-10: "무슨 액션이있었는지 로그도 보여줬으면").
// One line per action: load, sample button, Patch, back, forward, tree click. Newest line on top.
//
// A line that changed 실제 영역 carries two independent numbers:
// - chips: the four change kinds counted from OUR diff's result (the same source the debug panel colors from, §2-3).
//   Nothing is compared here; a wrong diff shows up as wrong counts.
// - touched: how many nodes of 실제 영역 were really touched, counted by src/touched.js (a MutationObserver).
//   This one does not come from the diff, so "patch touches only what changed" can be read off the line.

// diff result -> { insert, remove, replace, text, attrs, move }
export function countChanges(changes) {
  const counts = { insert: 0, remove: 0, replace: 0, text: 0, attrs: 0, move: 0 };
  for (const c of changes) {
    if (c.type === 'update') counts[c.what] += 1;
    else counts[c.type] += 1;
  }
  return counts;
}

// counts -> [{ kind, text }], one chip per kind that happened. kind picks the color (style.css .chip.add …),
// the same colors as the debug panel: 추가 green, 지워짐 red, 교체 red+green, 고침 yellow (§3-4).
export function countChips(counts) {
  const chips = [];
  if (counts.insert > 0) chips.push({ kind: 'add', text: `추가 ${counts.insert}` });
  if (counts.remove > 0) chips.push({ kind: 'del', text: `지워짐 ${counts.remove}` });
  if (counts.replace > 0) chips.push({ kind: 'rep', text: `교체 ${counts.replace}` });
  const fixed = counts.text + counts.attrs + counts.move;
  if (fixed > 0) {
    const what = [
      counts.text > 0 ? `글자 ${counts.text}` : null,
      counts.attrs > 0 ? `속성 ${counts.attrs}` : null,
      counts.move > 0 ? `자리 ${counts.move}` : null,
    ].filter(Boolean);
    chips.push({ kind: 'chg', text: `고침 ${fixed} (${what.join(' · ')})` });
  }
  return chips;
}

const two = (n) => String(n).padStart(2, '0');
export const clock = (date) => `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;

const NAMES = { load: '시작', sample: '샘플', patch: 'Patch', back: '뒤로가기', forward: '앞으로가기', tree: '트리 클릭' };

// The log itself. `list` is the <ol>; a new line is put on top, older lines are never rebuilt
// (so only the new line plays its entrance motion).
export function createActionLog(list, doc, now = () => new Date()) {
  const entries = [];

  function span(cls, text) {
    const el = doc.createElement('span');
    el.className = cls;
    el.textContent = text;
    return el;
  }

  // entry: { action, result, changes?, touched? }. changes = the diff result of this action, touched = a number.
  function add({ action, result, changes = null, touched = null }) {
    const entry = {
      action,
      when: clock(now()),
      result,
      counts: changes ? countChanges(changes) : null,
      touched,
    };
    entries.push(entry);

    const li = doc.createElement('li');
    li.className = 'entry';
    li.dataset.action = action;
    const head = doc.createElement('div');
    head.className = 'entry-head';
    head.append(span('when', entry.when), span('what', NAMES[action] ?? action), span('result', result));
    li.appendChild(head);
    if (entry.counts) {
      const detail = doc.createElement('div');
      detail.className = 'entry-detail';
      for (const chip of countChips(entry.counts)) detail.appendChild(span(`chip ${chip.kind}`, chip.text));
      if (touched !== null) detail.appendChild(span('touched', `건드린 노드 ${touched}개`));
      li.appendChild(detail);
    }
    list.insertBefore(li, list.firstChild);
    return li;
  }

  return { add, entries: () => [...entries] };
}
