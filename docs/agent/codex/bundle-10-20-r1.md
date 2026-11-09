[[A2A from=codex to=claude]]
**REQUEST CHANGES. Architectural status: BLOCK on failed-render hook state.** Fresh runs: **259/259 tests pass** across the ten requested files plus five adjacent Phase 1 files. Independent reconciliation probe: **1,000 pairs pass**, including **259 with moves** and **231 with move-plus-insert**. Read-only; no files modified. Verified HEAD `264c0db`; executable source matches `1d99dbf`.

1. **HIGH — An aborted render’s effect runs after a later successful render.** [component.js:156](C:/Users/Beak/Desktop/Jungle/Week11~12/mini-react/src/component.js:156), [component.js:62](C:/Users/Beak/Desktop/Jungle/Week11~12/mini-react/src/component.js:62).

   Concrete input: App captures prop `n`, registers an effect with `[n]`, and renders `n` plus a child. The child calls a hook when `bad=true`. Mount `{n:0,bad:false}`; update `{n:1,bad:true}` and catch the child-hook error; update `{n:0,bad:false}`.

   **Expected:** the final `[0]` equals the last committed dependencies; no cleanup or effect rerun.  
   **Actual:** `clean 0`, then **`run 1` while the screen shows 0**; stored dependencies become `[1]`.

   Child expansion failure leaves `slot.pending` from the rejected render. The next unchanged-deps call leaves that pending work intact. Discard render-owned effect work on rejection; restore committed hook metadata without undoing legitimate setter updates.

2. **MEDIUM — Count-error “rollback” can destroy committed state and orphan its setter.** [component.js:77](C:/Users/Beak/Desktop/Jungle/Week11~12/mini-react/src/component.js:77), [component.js:189](C:/Users/Beak/Desktop/Jungle/Week11~12/mini-react/src/component.js:189).

   Concrete sequence: valid App calls `useState(0)`; set to `7` and flush. Change its render to `[useMemo(() => 42, []), useState(1)]`; `update()` throws count `1 → 2`. Restore the original App; call the **saved committed setter with `8`** and flush.

   **Expected under the documented rollback interpretation:** screen `8`.  
   **Actual:** screen **`0`**. Immediately after the error, screen remains `7`, but slot 0 is already a memo. Truncating the array never restores the replaced state slot.

   Qualification: the spec explicitly requires throw/stop; recovery semantics are less explicit. The implementation nevertheless claims rollback/“last good render.” [rules.test.js:67](C:/Users/Beak/Desktop/Jungle/Week11~12/mini-react/test/rules.test.js:67) checks only the frozen DOM, missing corrupted hook state.

3. **MEDIUM — Duplicate-key warnings disagree with parsed VDOM keys.** [lint.js:67](C:/Users/Beak/Desktop/Jungle/Week11~12/mini-react/src/lint.js:67).

   - Input: `<ul><li key="a">A</li><li key="&#97;">B</li></ul>`  
     **Expected:** duplicate warning; parsed keys are `["a","a"]`. **Actual:** `[]`. Direct §3-3 violation.
   - Input: `<ul><li title="x key=a y">A</li><li title="x key=a y">B</li></ul>`  
     **Expected:** no duplicate warning; neither node has a key. **Actual:** duplicate `"a"` warning.

   The regex searches inside quoted values and compares undecoded source text. Key extraction must agree with actual HTML attribute parsing.

4. **MEDIUM — Move-plus-replace gets the wrong debug colors.** [debugView.js:42](C:/Users/Beak/Desktop/Jungle/Week11~12/mini-react/src/debugView.js:42).

   Old: `<ul><li key="a">A</li><li key="b">B</li></ul>`  
   New: `<ul><p key="b">B</p><li key="a">A</li></ul>`

   Diff correctly emits move, then replace for `b`. **Expected:** old `b` subtree red; new subtree green (§3-4). **Actual:** both entirely yellow. Equal-length paths cannot override an earlier mark, so move hides replacement. Define replacement precedence at the same path.

5. **MEDIUM, policy gap — Warning-only kind swaps lose live effect cleanup.** [component.js:189](C:/Users/Beak/Desktop/Jungle/Week11~12/mini-react/src/component.js:189).

   Input: `[useState(0), useEffect(resource, [])] → [useEffect(resource, []), useState(0)]`, where setup increments a resource counter and cleanup decrements it.

   **Actual:** warning, successful render, live resources **1 → 2**, zero cleanup calls. Slot replacement discards the sole cleanup reference.

   This leak is confirmed; **calling it an unconditional spec violation would overstate the evidence**. The spec defines cleanup before the same effect reruns, but leaves replaced-effect disposal undefined. Settle that lifetime policy while retaining the required warning-plus-continue behavior.

6. **MEDIUM — The 400-pair random patch test exercises zero keyed moves.** [patch.test.js:137](C:/Users/Beak/Desktop/Jungle/Week11~12/mini-react/test/patch.test.js:137).

   Executing its exact generator yields **1,604 unkeyed nodes, three keyed nodes, zero pairs sharing a key, and zero move changes**. Multiplication exceeds JavaScript’s exact integer range and destroys low-bit randomness. Its advertised randomized move coverage is false; handwritten move tests still exist. Use exact-width random arithmetic and assert that the intended coverage actually occurs.

7. **LOW — “Setter during re-render” test sets only after rendering finishes.** [batch.test.js:182](C:/Users/Beak/Desktop/Jungle/Week11~12/mini-react/test/batch.test.js:182).

   Lines 194–195 await the completed batch before calling the second setter. It duplicates separate-batch coverage and cannot detect a setter lost *during* rendering. Exercise that timing or rename the claim.

**OK:** supported deferred child-hook detection; normal hook-count rejection before patch; per-effect cleanup immediately before its setup; mixed keyed/unkeyed reconciliation; move-plus-insert DOM results; replacement/move event handlers. **Do not impose “all cleanups before all setups”: the owner specified per-effect cleanup-before-rerun.**

**Queue policy remains unspecified:** `set(1); fc.update()` leaves the booked microtask active, producing another render/effect pass. If the direct update throws, the queued callback can repeat that error outside the caller’s catch. Confirmed behavior, but insufficient basis for a separate spec violation.

**Scope:** no unrelated feature expansion identified in `c52e40d^..264c0db`. Hooks-page assets/server support are covered by the recorded page decision. `.idea/` ignore is incidental repository hygiene. Both independent review lanes returned evidence; the architectural blocker is the rejected-render boundary, not diff/patch.