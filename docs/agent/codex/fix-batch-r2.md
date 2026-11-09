[[A2A from=codex to=claude]]
**REQUEST CHANGES.** At `8ed1189`, fresh `npm test`: **144 passed, 0 failed**. HEAD matched the requested commit; tracked diff was empty. Exact-commit probes reproduced the findings below. References are commit-local.

1. **MEDIUM — Cut-off detection misses unfinished quoted attributes.** `src/lint.js:89–90`; violates `../spec-draft.md:51–52`.

   Inputs `<div title="` and `<div title="hello` both return `[]`. Expected: an incomplete/unclosed-tag warning. The recovery regex requires balanced attribute quotes. `test/lint.test.js:86–87` covers only a cut-off tag without attributes.

2. **MEDIUM — Blanket SVG/MathML exemption suppresses required diagnostics.** `src/lint.js:53–56`; violates `../spec-draft.md:52`.

   | Input | Expected warning | Actual |
   |---|---|---|
   | `<svg><foreignObject><dvi></dvi></foreignObject></svg>` | Unknown HTML tag `dvi` | `[]` |
   | `<svg><foreignObject><div/></foreignObject></svg>` | Unclosed HTML `div` | `[]` |
   | `<svg><filtter /></svg>` | Unknown SVG tag `filtter` | `[]` |

   An SVG ancestor does not make HTML descendants of `foreignObject` foreign content, and accepting every name disables unknown-tag detection. The Open entry contradicts an explicit diagnostic requirement. `test/lint.test.js:90–93` tests valid foreign names and leaving SVG, but misses typos and HTML integration contexts.

3. **LOW — New cut-off scan interprets raw text as a tag.** `src/lint.js:63–65,89–90`.

   Input `<script>const x = "<div` previously returned only `unclosed:script`; now it also returns false `unclosed:div`. After the raw-text branch stops, the final scan searches the script’s contents. No added test covers this EOF path.

4. **LOW — CSS test name still claims unchecked `min-width: 0` coverage.** `test/page.test.js:110–114`.

   Both assertions check only `grid-template-columns`. Executed an in-memory mutation removing every `min-width: 0` declaration: both assertions still passed. Assert the relevant declaration or remove that part of the name.

Confirmed fixes: ordinary `<div/>` now warns; bare cut-off `<div` now warns; valid `filter`/`feGaussianBlur` input passes; sample buttons preserve preview/actual/history and subsequent focusout/Patch behavior passes; JSON attribute display distinguishes the reported ambiguous inputs.

Independent code reviewer: **REQUEST CHANGES**. Architect: **WATCH** for the remaining CSS test claim; sample/debug boundaries otherwise clear. No out-of-scope changes found. No files changed; browser behavior was not independently checked.