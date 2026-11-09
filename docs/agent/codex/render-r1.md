[[A2A from=codex to=claude]]
REQUEST CHANGES. Fresh `npm.cmd test`: **21 passed, 0 failed**. Additional in-memory jsdom probes reproduce five preservation failures. No files changed.

1. **SVG tag and attribute names change during DOM rendering.**  
   `src/render.js:25–27` always creates HTML elements. Violates retained tag/attribute information, `../spec-draft.md:16–17`; SVG case preservation is also recorded in `docs/agent/progress.md:16`.

   - Input: `<svg viewBox="0 0 1 1"><foreignObject/></svg>`
   - Path: `htmlToVdom → renderInto → containerToVdom`
   - Expected: attribute `viewBox`, child tag `foreignObject`.
   - Actual: attribute `viewbox`, child tag `foreignobject`. The created SVG nodes also have the HTML namespace.

2. **HTML round trips delete retained leading newlines.**  
   `src/render.js:56–57` emits text without accounting for initial-newline removal by the parser. Violates exact whitespace preservation, `../spec-draft.md:23`.

   - Input: `<pre>\n\nx</pre>`; also reproduced with `textarea` and `listing`.
   - Path: `htmlToVdom → rootToHtml → htmlToVdom`
   - Expected: initial VDOM text `"\nx"` survives.
   - Actual: serialization emits `<pre>\nx</pre>`; reparsing produces `"x"`.

3. **Carriage returns become line feeds in text and attributes.**  
   `src/render.js:35–40` leaves carriage returns literal; reparsing normalizes them. Violates `../spec-draft.md:23` for text and `:17` for attributes.

   - Inputs: `<p>a&#13;b</p>` and `<div title="a&#13;b">x</div>`.
   - Same HTML round-trip path.
   - Expected: text/attribute value `"a\rb"`.
   - Actual: `"a\nb"`.

4. **Raw-text elements beyond `script` and `style` gain literal entity spellings.**  
   `src/render.js:15,54–56` applies ordinary escaping to other raw-text contexts. Violates retained text information, `../spec-draft.md:18–23,26`.

   - Input: `<iframe>a <b> & c</iframe>`; also reproduced with `xmp`, `noembed`, and `noframes`.
   - Same HTML round-trip path.
   - Expected: text `"a <b> & c"`.
   - Actual: text `"a &lt;b&gt; &amp; c"`.

5. **Comment-separated text children merge through HTML serialization.**  
   `src/render.js:56` concatenates adjacent text-node serialization.

   - Input: `<p>a<!--x-->b</p>`.
   - Initial VDOM: two children, `text("a")` and `text("b")`; the comment is correctly dropped.
   - Expected under the requested exact VDOM round-trip contract: the same two children.
   - Actual: `<p>ab</p>` reparses as one child, `text("ab")`.
   - Spec basis: ordered children at `../spec-draft.md:18–21`, comment removal at `:24`. **Distinction:** §1 does not explicitly settle text-node normalization; this is a confirmed failure of the requested exact-round-trip contract, rather than an explicit whitespace-rule violation. Silently merging the original VDOM would change that contract.

**Tests:** No weakened tracked tests found; the new test file is untracked. Coverage misses all failures above. `test/render.test.js:52–73,84–86` checks serialization spelling without reparsing; `:76–82` covers only `style`; `:89–107` drops comments between elements, missing adjacent text. `rootToHtml` is never imported or called by the tests. These are coverage gaps, not grounds to remove existing assertions.

**Out-of-scope changes:** None found in the supplied/current inventory. The synthetic root convention is acceptable. Provisional diff/patch behavior was excluded.

Both independent review lanes returned blocking findings. Real-browser behavior was not checked.