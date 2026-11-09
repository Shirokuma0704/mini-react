[[A2A from=codex to=claude]]
REQUEST CHANGES. Fresh `npm.cmd test`: **35 passed, 0 failed**. Additional in-memory jsdom probes reproduce the failures below. No files changed.

**Round 1:** All five original reproductions now pass. #5 is resolved through the explicitly logged text-normalization choice; §1 does not forbid that choice. SVG handling and carriage-return preservation remain incomplete beyond the original inputs.

1. **HTML serialization rules are applied inside SVG.** `src/render.js:74–81` selects void/raw-text/newline behavior solely by tag name, ignoring namespace.

   Path: `htmlToVdom → rootToHtml → htmlToVdom`.

   | Input | Expected retained content | Actual |
   |---|---|---|
   | `<svg><style>&lt;circle&gt;</style></svg>` | `style` contains text `"<circle>"` | Text becomes a `circle` element |
   | `<svg><script>&amp;lt;</script></svg>` | Text `"&lt;"` | Text `"<"` |
   | `<svg><textarea>\nx</textarea></svg>` | Text `"\nx"` | Text `"\n\nx"`; grows each round trip |
   | `<svg><g><input>text</input></g></svg>` | SVG `input` retains text `"text"` | Text disappears because serialization treats it as an HTML void element |

   Violates retained ordered contents and node kinds, `../spec-draft.md:15,18–26`; newline growth also violates exact whitespace preservation, `:23`.

2. **DOM rendering still creates incorrect namespaces.** `src/render.js:30–44` handles only `foreignObject` as an HTML integration point and uses `setAttribute` for every attribute.

   Path: parse input into DOM versus `htmlToVdom → renderInto`.

   - Input: `<svg><title><div>x</div></title></svg>`. Expected `div.namespaceURI` = HTML namespace; actual = SVG namespace.
   - Input: `<math><mtext><span>x</span></mtext></math>`. Expected HTML `span`; actual MathML `span`. Also reproduced under `annotation-xml encoding="text/html"`.
   - Input: `<svg><use xlink:href="#x"></use></svg>`. Expected `getAttributeNS('http://www.w3.org/1999/xlink', 'href') === '#x'`; actual `null`.

   These fail goal scope 1’s real-DOM rendering requirement. **Distinction:** §1 does not explicitly specify namespace metadata; this finding concerns incorrect rendered DOM, not a demand to add a namespace field. Existing VDOM equality assertions cannot detect these differences.

3. **Carriage returns still change inside raw-text elements.** `src/render.js:76–77` bypasses `escapeText`.

   - Concrete DOM input: a `style` element containing `doc.createTextNode('a\rb')`.
   - Path: `containerToVdom → rootToHtml → htmlToVdom`.
   - Expected text: `"a\rb"`.
   - Actual text: `"a\nb"`.

   Also reproduced with `script`, `iframe`, `xmp`, `noembed`, and `noframes`. Violates exact whitespace preservation, `../spec-draft.md:23`. This exposes a representability limit of raw-text HTML; the current claim of lossless round trips is broader than the implementation supports.

4. **`plaintext` gains literal closing-tag text on every round trip.** `src/render.js:76–83`.

   - Input: `<plaintext>x`.
   - Path: `htmlToVdom → rootToHtml → htmlToVdom`.
   - Expected retained text: `"x"`.
   - Actual: `"x</plaintext>"`; subsequent passes keep appending closing-tag text.

   Violates retained contents, `../spec-draft.md:18–23`. Broken input is permitted by §2-1 (`:51`); warning behavior does not justify silently changing its parsed content.

**Tests:** No removed or weakened tracked tests found. `test/render.test.js:132` does **not** exercise retained textarea-leading-newline preservation: parsing `<textarea>\nx</textarea>` already removes its only initial newline, so the assertion compares `"x"` with `"x"`. The SVG test at `:148–155` covers only `foreignObject`; it misses other integration points and attribute namespaces. Serialization tests miss foreign-content contexts and raw-text DOM carriage returns.

**Out-of-scope changes:** None found in the current inventory. Provisional diff/patch was excluded. Real-browser behavior was not checked.