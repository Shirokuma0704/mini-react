// Text box <-> preview sync, spec-draft §2-1.
//
// - The text box is the source of truth ("텍스트가 메인"); Patch reads it.
// - The preview is fully editable (text, deleting whole tags, Enter).
// - Preview -> text box: "다른 글자를 건드릴 때 + 미리보기를 떠날 때" (Q2 "둘다 해줘").
// - Text box -> preview: the same, "다른 곳을 건드리거나 글자 칸을 떠날 때" (Q3).
//
// Choices the spec leaves open (docs/agent/progress.md "Open"):
// - "another spot" = the caret is on another line (text box) / in another DOM node (preview),
//   checked on keyup and click. A caret move caused by typing itself (Enter) does not count.
// - a side is copied over only if it was edited since the last sync ("dirty"). So just clicking through the preview
//   never replaces broken text the user typed with the browser's repaired version.
// - both directions go through the VDOM (htmlToVdom / containerToVdom), so comments are dropped on the way, the
//   same way Patch sees the text.
import { htmlToVdom, containerToVdom, renderInto, rootToHtml } from '../core/render.js';

export function createSync({ source, preview, doc, onSourceChange = () => {} }) {
  let sourceDirty = false;
  let previewDirty = false;
  let sourceSpot = null; // line number of the caret
  let previewSpot = null; // DOM node holding the caret

  function sourceToPreview() {
    sourceDirty = false;
    renderInto(preview, htmlToVdom(source.value, doc), doc);
    previewSpot = null;
  }

  function previewToSource() {
    previewDirty = false;
    source.value = rootToHtml(containerToVdom(preview));
    onSourceChange(source.value);
  }

  function flush() {
    if (sourceDirty) sourceToPreview();
    if (previewDirty) previewToSource();
  }

  // The moving end of the selection (where Shift+arrow goes), not its fixed start (Codex sync r1 #1).
  function caretLine() {
    const end = source.selectionDirection === 'backward' ? source.selectionStart : source.selectionEnd;
    const upTo = source.value.slice(0, end ?? 0);
    return upTo.split('\n').length;
  }

  function caretNode() {
    const sel = doc.getSelection ? doc.getSelection() : null;
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.focusNode;
    return node && preview.contains(node) ? node : null;
  }

  function checkSourceSpot() {
    const line = caretLine();
    if (line !== sourceSpot && sourceDirty) sourceToPreview();
    sourceSpot = line;
  }

  function checkPreviewSpot() {
    const node = caretNode();
    if (node !== previewSpot && previewDirty) previewToSource();
    previewSpot = node;
  }

  // Typing moves the caret too (Enter goes to a new line). That is not "touching another spot", so the spot is
  // re-recorded on every input; only a move without typing (arrows, click) counts.
  source.addEventListener('input', () => {
    sourceDirty = true;
    sourceSpot = caretLine();
    onSourceChange(source.value);
  });
  source.addEventListener('keyup', checkSourceSpot);
  source.addEventListener('click', checkSourceSpot);
  source.addEventListener('focusout', () => {
    if (sourceDirty) sourceToPreview();
  });

  preview.addEventListener('input', () => {
    previewDirty = true;
    previewSpot = caretNode();
  });
  preview.addEventListener('keyup', checkPreviewSpot);
  preview.addEventListener('click', checkPreviewSpot);
  preview.addEventListener('focusout', () => {
    if (previewDirty) previewToSource();
    previewSpot = null;
  });

  // Put new text in the text box and draw it in the preview: the test area changes as a whole
  // (sample buttons, history moves). Unsynced edits on either side are dropped, the new text replaces them.
  function setSource(html) {
    source.value = html;
    sourceDirty = false;
    previewDirty = false;
    sourceSpot = null;
    sourceToPreview();
    onSourceChange(source.value);
  }

  return { flush, setSource };
}
