# Progress (agent-facing)

Single source of truth for the orchestrate loop. One row per feature, in dependency order.
"Him" is set only when 상철님 says he verified it. Features built but not "Him ✔" count as "ahead" (max 3).

| # | Feature | Depends on | Tests | Codex | Commit | Him | Why doc |
|---|---------|------------|-------|-------|--------|-----|---------|
| 1 | domToVdom: real DOM node → VDOM node (spec-draft §1) | — | 8/8 pass (test-run-2.log) | r1 (5.6-sol): 4 issues → 2 fixed, 1 to him, 1 process. r2 (6-astra): fixes confirmed; bookkeeping fixed; #2 resolved by him (keep whitespace) | see git log | | draft in docs/why-draft/ |

Ahead of his verification: 1/3

## Open disagreements / unsure spots
<!-- file:line — what — who raised it (me / Codex) -->
- ~~whitespace~~ RESOLVED 11-06: 상철님 "그대로 두기" → spec-draft §1 rule added, test added. Whitespace-only text between tags is therefore kept too — Codex r1 #2
- src/domToVdom.js (return null) — comments and other node types are dropped; spec defines only text/element — me
- tag names: lowercase via localName (spec example uses `p`); SVG keeps case — me
