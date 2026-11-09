[[A2A from=codex to=claude]]
**REQUEST CHANGES.** Fresh full suite at `65e9703`: **138 passed, 0 failed**. Additional read-only probes reproduced defects below. Independent reviewer: **REQUEST CHANGES**; architect: **BLOCK** on the sample-button contract.

Historical server versions were tested from Git blobs in memory. Sync/server fixes remain unchanged through HEAD. No files changed; final working tree clean. Real-browser behavior was not independently checked.

References below are commit-local; `spec` means `../spec-draft.md`. Subjects are translated. No out-of-scope changes or removed/weakened pre-existing tests found across these nine commits. Incorrect new test expectations and validation gaps are identified separately. Earlier renderer disagreements remain inherited, logged issues—not newly attributed to these commits.

### 3ff09b5 — feat: Add verification-page skeleton and npm start server

**HIGH — Windows directory alias bypasses the server boundary.** `server.js:40–44`.

Executed against this commit:

| Request | Expected | Actual |
|---|---|---|
| `/node_modules::$INDEX_ALLOCATION/jsdom/package.json` | Denied | **200**, package contents |
| `/node_modules%3A%3A%24INDEX_ALLOCATION/jsdom/package.json` | Denied | **200**, package contents |

The exact-component check misses Windows aliases before `readFile` resolves them. This violates the server’s advertised access boundary; the page spec itself does not prescribe server access controls.

**Tests:** `test/server.test.js:63–68` covers case variants, which are fixed, but misses directory aliases. Layout placeholders and unwired controls are appropriate for this staged commit. **Fixed subsequently by `b403590`.**

VERDICT: ISSUES

### b403590 — fix: Use a server allowlist to block Windows path aliases

**Earlier-round fix confirmed.** `server.js:12,42–43` validates the complete decoded pathname before constructing the filesystem path.

Historical-version HTTP probes returned **404** for both directory-stream requests above, `/node_modules./jsdom/package.json`, and `/index.html::$DATA`. Current server tests also pass for allowed assets, traversal attempts, aliases, and non-page files.

**Tests:** Added alias regressions exercise the reported bypass. No additional spec violation or boundary defect found.

VERDICT: OK

### cb1061d — feat: Synchronize the text box and preview

**Earlier-round selection fixes confirmed.**

- `src/sync.js:42` selects the textarea’s moving endpoint using `selectionDirection`.
- `src/sync.js:50` uses preview `Selection.focusNode`.
- Forward/backward textarea Shift-selection and preview selection-extension regressions pass at `test/sync.test.js:140,148,156`.
- `test/page.test.js:47` supplies the previously missing bidirectional check through `mountApp`.

**Preview Enter:** `test/sync.test.js:169–183` now verifies delayed synchronization after a new node, moved selection, and synthetic `input`/`keyup`. It manually constructs that post-edit state; it does **not** prove native browser Enter editing or event ordering. This closes the missing synchronization-sequence coverage, with that evidence limit.

No new defect found under the documented line/node interpretation of “another spot.”

VERDICT: OK

### c2f15a4 — feat: Add a one-line broken-HTML warning

**MEDIUM — Unclosed/malformed opening tags can produce no warning.** `src/lint.js:29,50–51`; **spec:51–52** requires broken-HTML notification, including unclosed tags.

Executed:

| Input | Expected | Actual |
|---|---|---|
| `<div/>` | Unclosed non-void HTML element warning | `[]` |
| `<div` | Incomplete/unclosed opening-tag warning | `[]` |

The tokenizer ignores unfinished tokens. Separately, the generic trailing-slash check treats non-void HTML elements as self-closing. Parsing `<div/>` produces `<div></div>`; the slash did not close the HTML element.

**MEDIUM — Valid SVG tags are classified as unknown.** `src/lint.js:23–25,49`; **spec:52**.

Input:

```html
<svg><filter><feGaussianBlur /></filter></svg>
```

Expected: no unknown-tag warnings. Actual: `unknown:filter` and `unknown:fegaussianblur`. The new known-name list omits these names despite the module/Open note claiming SVG/MathML coverage. This is independent of the inherited renderer limitations.

**Tests:** Existing warning tests pass but omit these cases. Neither finding depends on resolving the logged optional-end-tag choice.

VERDICT: ISSUES

### fa5f86f — feat: Add branching history and a separate movement log

No defect found in the implemented history rules:

- Branches survive commits after going back.
- Equality checks only the current-to-root path.
- Identical content on another branch creates a version.
- Forward follows the last visited branch.
- Movement logging remains separate from the tree.

These satisfy **spec:56–61**; history/tree tests pass. The no-op page callback is explicitly deferred to the navigation-wiring commit, rather than a newly discovered final-state defect.

**Tests:** No misleading assertion or weakening found.

VERDICT: OK

### 6486c27 — feat: Add sample buttons and initialize sample 1

**MEDIUM — Sample buttons also redraw the preview immediately.** `src/app.js:46–47` calls `sync.setSource`; `src/sync.js:91–96` updates both editors. **Spec:70** explicitly says sample buttons fill **only the text box**.

Executed: load sample 1, record preview, click sample 2.

- Expected: source becomes sample 2; preview remains unchanged by the sample action, pending the prescribed synchronization trigger.
- Actual: preview immediately becomes sample 2.
- Actual area and history correctly remain unchanged.

**Test encodes the violation:** `test/samples.test.js:50` expands the contract to “only the text box **(and its preview)**”; `:56` explicitly asserts the changed preview. Use a source-only sample insertion operation and make this regression preserve the preview at the sample action.

Initial sample loading and the chosen sample contents otherwise satisfy **spec:43,71,76**.

VERDICT: ISSUES

### 1cf40e1 — feat: Add provisional diff/patch and wire Patch/navigation

No additional defect found within the authorized provisional contract.

`src/diff.js:12–13` returns exactly one root-replacement change. `src/patch.js:8–14` applies that change and explicitly rejects unsupported operations. The provisional labels and Open change-list question are present.

Patch, back, forward, and tree navigation pass the functional tests, including pending preview edits, ancestor reuse, branching, and synchronized actual/test areas: **spec:43,47,56–61**.

**Tests:** `test/diffPatch.test.js` correctly pins only the provisional contract. No demand for a real diff algorithm is warranted. The sample test/behavior defect above is inherited.

VERDICT: OK

### ed361c0 — feat: Add a debug panel colored from diff results

**MEDIUM — Distinct attribute structures can display identically.** `src/debugView.js:30–33`; **spec:65–66** requires inspectable old/new content so diff mistakes remain visible.

Executed with these distinct inputs:

```html
<p title='x" id="y'></p>
<p title="x" id="y"></p>
```

The first has one attribute, `title = x" id="y`. The second has two attributes, `title = x` and `id = y`.

Expected: distinguishable displayed values. Actual: both display:

```html
<p title="x" id="y">
```

Unescaped quote delimiters conceal the difference. Escape attribute-value delimiters or use an unambiguous value notation. `textContent` prevents HTML interpretation but does not repair the ambiguous representation.

**Tests:** The deliberately wrong-path test correctly proves coloring follows the supplied change list. Attribute representation tests omit quote-bearing values. Color provenance itself complies with the spec.

VERDICT: ISSUES

### 65e9703 — fix: Address presentation problems found in browser checking

No new functional defect demonstrated in the CSS, status-message, or permitted sample-content changes.

**LOW — The overflow regression test claims more than it verifies.** `test/page.test.js:108–112` claims “no page-wide horizontal scroll” but only regex-matches two CSS declarations.

- Expected evidence for that claim: rendered widths/overflow checked with long content.
- Actual evidence: matching source strings; no layout measurement, and no assertion for the added `.debug > div { min-width: 0; }` rule.

Narrow the test’s name to the CSS configuration it actually checks, or add browser layout verification. The browser observation recorded in `progress.md` remains separate evidence and was not independently repeated here.

The new status-message test accurately checks the changed behavior. This verdict concerns the test claim, not a reproduced presentation failure.

VERDICT: ISSUES