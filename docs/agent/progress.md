# Progress (agent-facing)

Single source of truth for the orchestrate loop. One row per feature, in dependency order.
"Him" is set only when 상철님 says he verified it. Features built but not "Him ✔" count as "ahead" (max 3).

| # | Feature | Depends on | Tests | Codex | Commit | Him | Why doc |
|---|---------|------------|-------|-------|--------|-----|---------|
| 1 | domToVdom: real DOM node → VDOM node (spec-draft §1) | — | 8/8 pass (test-run-2.log) | r1 (5.6-sol): 4 issues → 2 fixed, 1 to him, 1 process. r2 (6-astra): fixes confirmed; bookkeeping fixed; whitespace (#2) awaits him | see git log | | draft in docs/why-draft/ |

Ahead of his verification: 1/3

## Open disagreements / unsure spots
<!-- file:line — what — who raised it (me / Codex) -->
- test/domToVdom.test.js:24,31 — whitespace: spec lists text as "hi"/"bye", DOM gives "hi "/" bye"; spec has no trimming rule. Kept DOM text as-is; decision is his — Codex round 1 #2
- src/domToVdom.js (return null) — comments and other node types are dropped; spec defines only text/element — me
- whitespace-only text between tags (e.g. indentation newlines) is kept as text nodes, same open rule as above — me
- tag names: lowercase via localName (spec example uses `p`); SVG keeps case — me
