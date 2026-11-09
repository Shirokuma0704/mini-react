# Progress (agent-facing)

Single source of truth for the orchestrate loop. One row per feature, in dependency order.
"Him" is set only when 상철님 says he verified it. Features built but not "Him ✔" count as "ahead" (max 3).

Run of 11-09 afternoon: goal file ../goals/01-verify-page.md ("끝까지 쭉") — build the Phase 1 verification page
(spec-draft §2) without stopping between features; ONE handoff at the end. So the max-3-ahead stop is suspended for
this run by his choice; rows 2-9 are all "ahead" until he checks them.

| # | Feature | Depends on | Tests | Codex | Commit | Him | Why doc |
|---|---------|------------|-------|-------|--------|-----|---------|
| 1 | domToVdom: real DOM node → VDOM node (spec-draft §1) | — | 9/9 pass (test-run-3.log) | r1 (5.6-sol): 4 issues → 2 fixed, 1 to him, 1 process. r2 (6-astra): fixes confirmed; bookkeeping fixed; #2 resolved by him (keep whitespace) | see git log | ✔ 11-09 10:52 (printed real output for the spec example, compared with spec-draft §1: "내 의도랑 맞는거같아") | jungle-notes/mini-react/VDOM 변환.md |
| 2 | render: VDOM → real DOM, VDOM → HTML text, html/container → root VDOM (goal scope 1) | 1 | 35/35 pass (test-run-5.log) | r1: 5 round-trip bugs (SVG, pre newline, \r, raw-text tags, merged text) → all fixed + tested; r2: r1 fixes confirmed; 4 more foreign-content/rare-tag cases → NOT fixed, in Open as disagreement; textarea test gap fixed | see git log | | jungle-notes/mini-react/렌더.md |
| 3 | page layout + `npm start` static server (scope 2) | 2 | 46/46 pass (test-run-6.log) | r1: Windows case bypass (/NODE_MODULES/) → fixed + tested; r2: Windows stream alias (node_modules::$INDEX_ALLOCATION) → server now serves an allowlist (index.html, style.css, src/*.js), tested; r3 FAILED: usage limit → PENDING | see git log | | jungle-notes/mini-react/검증 페이지 뼈대.md |
| 4 | text box ↔ preview sync (scope 3, spec §2-1) | 2, 3 | 65/65 pass (test-run-7.log) | r1: Shift-selection missed (anchor vs moving end) → fixed + tested; gaps (preview Enter, via mountApp) → tests added; r2 FAILED: Codex usage limit (both 6.1-sol and 6-astra) until 16:39 → PENDING | see git log | | jungle-notes/mini-react/글자 칸과 미리보기.md |
| 5 | broken-HTML warning (scope 4, spec §2-1) | 3 | 82/82 pass (test-run-8.log) | PENDING: Codex usage limit until 16:39 | see git log | | jungle-notes/mini-react/깨진 HTML 경고.md |
| 6 | history tree (pure module) + tree view + move log (scope 5, spec §2-2) | 3 | 103/103 pass (test-run-9.log) | PENDING: Codex usage limit until 16:39 | see git log | | jungle-notes/mini-react/히스토리 트리.md |
| 7 | samples 1/2 (scope 7, spec §2-4) | 3, 4 | 111/111 pass (test-run-10.log) | PENDING: Codex usage limit until 16:39 | see git log | | jungle-notes/mini-react/샘플.md |
| 8 | PROVISIONAL diff/patch + wire Patch / back / forward + jsdom flow test (scope 8) | 2, 6 | | | | | |
| 9 | debug panel colored from the diff result (scope 6, spec §2-3) | 8 | | | | | |

Order note: debug panel (scope 6) comes after diff/patch (scope 8) because it colors from the diff result.

Ahead of his verification: 1 (stop suspended for this run, see above)

## Codex usage limit (11-09 12:01)
Both preferred models refused with "usage limit, try again at 4:39 PM". Not switched to a weaker model (skill §3). Every row marked PENDING needs its Codex round after 16:39.

## Codex replies
Raw replies: docs/agent/codex/<feature>-r<round>.md (model gpt-6.1-sol, reasoning effort high, read-only sandbox).

## PROVISIONAL (replace after the diff grill, spec §2-5)
<!-- filled by feature 8 -->

## Open disagreements / unsure spots
<!-- file:line — what — who raised it (me / Codex) -->
- ~~whitespace~~ RESOLVED 11-06: 상철님 "그대로 두기" → spec-draft §1 rule added, test added. Whitespace-only text between tags is therefore kept too — Codex r1 #2
- ~~comments~~ RESOLVED 11-09: 상철님 "개발용인데 굳이 보낼 필요가 없잖아" → drop comments (src/domToVdom.js return null), spec-draft §1 rule added. Carry to the patch spec: VDOM child index ≠ real DOM childNodes index when a comment sits in between — me
- tag names: lowercase via localName (spec example uses `p`); SVG keeps case — me
- src/render.js:5 — a version's VDOM root is a plain `div` with no attrs wrapping the fragment; the root is never drawn, its children go into 실제 영역 / preview. Spec says "샘플 HTML → VDOM" but not what the root is — me
- src/render.js:91 — htmlToVdom / containerToVdom merge text nodes left side by side (after dropping a comment, or split by editing in the preview). §1 says "keep the DOM text as it is" about spaces; merging is a new rule. Without it `a<!--x-->b` is 2 children but its own HTML parses back as 1, and "no change → no new version" (§2-2) would fail after preview edits — Codex render r1 #5 found it, me chose the fix. domToVdom itself is unchanged (still 1 DOM node = 1 VDOM node)
- src/render.js:30 — VDOM has no namespace slot; vdomToDom infers SVG/MathML from the tag like the parser does — me
- DISAGREEMENT with Codex render r2 (docs/agent/codex/render-r2.md), NOT fixed: round trips still change content for foreign content and rare tags — HTML void/raw-text/newline rules applied inside SVG (`<svg><style>`, `<svg><textarea>`), HTML integration points other than foreignObject (`svg title`, `math mtext`, `annotation-xml`), `xlink:href` namespace, `\r` inside raw-text tags, `<plaintext>`. My view: the page's samples are plain HTML (lists, attributes, nesting); fixing these means a full HTML serializer. His call whether it matters. Codex r2's textarea test gap was real and is fixed (test/render.test.js:132)
- src/sync.js:9 — "다른 글자를 건드릴 때 / 다른 곳을 건드리거나" read as: the caret moves (arrow keys, click) to another line of the text box / another DOM node of the preview, without typing. A caret move caused by typing (Enter) does not count — me
- src/sync.js:11 — a side is copied over only if it was edited since the last sync, so clicking through the preview never overwrites broken text with the browser-repaired version. When the text box is broken, the preview shows the browser's repair — me
- src/sync.js:13 — both directions go through the VDOM, so an HTML comment typed in the text box vanishes from the text box after the preview is edited (§1 drops comments) — me
- src/lint.js:6 — every non-void tag must be closed, even <li>/<p> where HTML allows omitting the end tag (an IDE like WebStorm does not flag those) — me
- src/lint.js:7 — names with a dash = custom elements, never "unknown"; SVG/MathML names are known — me
- src/lint.js:8 — crossed tags <b><i></b></i>: <i> unclosed at </b>, then </i> stray (2 warnings) — me
- app.js — the warning line shows the first warning (by line) + "(외 N개)"; it updates on every keystroke, unlike the preview sync — me
- src/history.js:14 — "equal" = deep VDOM equality (attr order ignored), not "diff returned nothing": the provisional diff always returns one change. Revisit after the diff grill — me
- src/history.js:43 — version labels v1, v2, … in creation order — me
- src/history.js:53 — (임시 rule) arriving anywhere, including a tree click deep in a branch, marks every fork on its path as "last visited" toward it; forward goes one step along that — me
- src/history.js — ancestors on one path are never equal to each other (commit refuses to create a duplicate of an ancestor), so "which equal ancestor" never needs a tie-break — me
- src/treeView.js — tree drawn as nested lists with buttons; current = filled, path to root = outlined; shape left open by §2-5 — me
- src/samples.js — SAMPLE CONTENT IS MINE, NOT HIS (§2-5 left it open): todo card (ul with data-id/class, b inside li, a href/title) and a post (header, ol with a nested ul, code/em, img, br). Chosen to give the 5 diff cases something to bite; replace freely — me
- src/app.js — load = sample 1 drawn into 실제 영역 first, then v1 = containerToVdom(실제 영역), then the test area is drawn from v1 (follows the assignment order "실제 영역의 샘플 HTML → VDOM → 테스트 영역") — me
- index.html — layout (two columns: 실제 영역 | 테스트 영역; below: history | debug; sticky control bar) is mine; spec §2-5 says shapes are decided after he sees it — me
- server.js:12 — serves only index.html, style.css, src/*.js (allowlist after Codex r1+r2 found Windows name aliases); add a pattern if the page ever needs another file — me
- server.js:62 — port 5173 (PORT env overrides), binds 127.0.0.1 only — me
- src/render.js:75 — HTML text is written back from the VDOM with no pretty-printing; formatting survives only because whitespace text is kept (§1) — me
