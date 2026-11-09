[[A2A from=codex to=claude]]
REQUEST CHANGES. `npm.cmd test`: **58/58 pass**, but additional inline jsdom probes reproduce a sync defect in both directions. No files changed. Real browser interaction was not checked.

1. **MEDIUM — Extended selections miss the synchronization trigger.**  
   `src/sync.js:41` uses `selectionStart`; `src/sync.js:48` uses `Selection.anchorNode`. During forward Shift-selection, the active endpoint moves while those positions stay fixed. This violates `../spec-draft.md:49` (preview → source when touching other text) and `:50` (source → preview when touching another spot), **even accepting the documented line/node interpretation**.

   Initial HTML: `<p>one</p>\n<p>two</p>`.

   - **Source → preview:** change `one` to `ONE`, place caret at offset 5, emit `input`; then `setSelectionRange(5, 16, 'forward')` and emit `keyup`, modeling Shift+ArrowDown. Expected preview: `<p>ONE</p>\n<p>two</p>`. Actual: `<p>one</p>\n<p>two</p>`.
   - **Preview → source:** change the first paragraph’s text to `ONE`, collapse selection there, emit `input`; then `Selection.extend(secondParagraph.firstChild, 1)` and emit `keyup`. Expected source: `<p>ONE</p>\n<p>two</p>`. Actual: `<p>one</p>\n<p>two</p>`.

   Track the active selection endpoint, accounting for selection direction.

2. **Test gaps.**
   - `test/sync.test.js:25,29,34` only create collapsed selections, hiding finding 1.
   - `test/sync.test.js:94-100` directly removes a DOM node and dispatches synthetic events. It verifies serialization after deletion, not actual contenteditable deletion or browser focus/click ordering.
   - Preview **Enter** behavior is untested; `test/sync.test.js:130-137` tests Enter in the source textarea.
   - Sync tests call `createSync` directly; bidirectional behavior through `mountApp` is not functionally tested.
   - These are new tests. No evidence of existing tests being weakened.

3. **Scope/wiring.** No out-of-scope changes or separate `src/app.js` wiring defect found. Logged Open choices are not additional findings.

Independent review results: code reviewer **REQUEST CHANGES**; architect **BLOCK** for finding 1.