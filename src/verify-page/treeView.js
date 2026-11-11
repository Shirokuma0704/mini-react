// History tree view and move log, spec-draft §2-2.
// "트리를 그림으로 보여 주고, 노드를 눌러서 이동한다" / "이동한 순서는 트리와 따로 로그로 남긴다"
// The drawing is nested lists with connector lines (style.css .tree); its look is left open by §2-5.
// Every version is a button; the current one and the path from it to the root are marked.

export function renderTree(container, history, doc, onPick) {
  const current = history.current();
  const onPath = new Set(history.pathToRoot());

  function item(node) {
    const li = doc.createElement('li');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.textContent = node.label;
    btn.dataset.id = String(node.id);
    if (node === current) {
      btn.classList.add('current');
      btn.setAttribute('aria-current', 'true');
    } else if (onPath.has(node)) {
      btn.classList.add('on-path');
    }
    btn.addEventListener('click', () => onPick(node.id));
    li.appendChild(btn);
    if (node === current) {
      const label = doc.createElement('span');
      label.className = 'label';
      label.textContent = '← 지금';
      li.appendChild(label);
    }
    if (node.children.length > 0) {
      const ul = doc.createElement('ul');
      for (const child of node.children) ul.appendChild(item(child));
      li.appendChild(ul);
    }
    return li;
  }

  while (container.firstChild) container.removeChild(container.firstChild);
  const ul = doc.createElement('ul');
  ul.appendChild(item(history.root()));
  container.appendChild(ul);
}

export function logText(history) {
  return history.log().map((n) => n.label).join(' → ');
}
