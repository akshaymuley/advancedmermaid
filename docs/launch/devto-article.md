# Article draft — dev.to / Hashnode / personal blog

The one asset the other posts link to. Worth writing first, and worth being genuinely useful on its
own: someone who never installs the extension should still come away knowing something.

**Title:** Why diffing Mermaid as text doesn't work
**Tags:** `mermaid`, `vscode`, `git`, `documentation`

Add a disclosure line at the end: *"I wrote the extension this article ends with."*

---

## The problem, in one screenshot

Take a CI pipeline diagram. Add one step:

```diff
  C[Unit tests] --> D[Build]
+ C --> I[Integration tests]
+ I --> D
```

Three lines. Now look at the rendered result: the layout engine has moved almost every node to make
room, so the picture your reader sees is substantially different from the one they saw last week.
The diff told you three lines changed. It did not tell you the shape changed.

That gap matters wherever diagrams are reviewed rather than just written — architecture decision
records, runbooks, onboarding docs, anything where the diagram *is* the documentation.

*(Insert `docs/images/demo.gif` here.)*

## Why the obvious fixes don't work

**Diff the SVG.** Mermaid's output has no stable identity between renders: element ids are
generated per render and a relayout moves coordinates for every node. An SVG diff reports the whole
file as changed, every time.

**Ask mermaid for the graph.** Mermaid 11 doesn't expose one. `mermaid.parse()` returns
`{ diagramType, config }` and nothing more. `Diagram.fromText` exists in the type definitions but
ships over bundled chunks with no export path, and `internals.d.ts` says in as many words that it
should not be used by external packages.

So if you want a structural diff, you parse the source yourself.

## What a structural diff needs to get right

Once you're parsing, the interesting decisions are all about **identity** — what counts as "the same
thing" across an edit:

- A flowchart **node** is its id. Key on the label instead and every reworded node reports as a
  deletion plus an addition, and the merged diagram draws the box twice.
- A class-diagram **member** is its name, not its signature. `+int age` → `+String age` is one
  changed field. Key on the whole text and the commonest edit in the language reads as a deletion
  plus an addition.
- A sequence **message** is trickier. Position alone can't distinguish "the second message was
  deleted" from "the second was reworded and the third deleted" — both leave one fewer message
  between the same pair, and positional keying always picks the second reading. Anchor identical
  messages first, pair the leftovers by position.

## Then you have to draw it

Rendering the diff means regenerating mermaid source for the union of both versions and letting
mermaid lay it out — reaching into its SVG puts you back in the trap above.

Each diagram type allows a different marking mechanism, and none of this is documented:

| Type | What works | What doesn't |
|---|---|---|
| Flowchart | `classDef` + `class` | — |
| Sequence | `rect` bands (use `rgba`, not `rgb`) | no class on a message |
| Class | `style X ...` | **`classDef` + `cssClass` renders and marks nothing**; `linkStyle` is a parse error |

That third row is the one worth remembering. The obvious approach for class diagrams — the one that
works for flowcharts — produces valid source, renders without error, and applies no styling
whatsoever. Every unit test passes, and the feature does nothing. The only way to catch it is to
render a test case and look at it.

## The lesson that generalises

Every one of those findings came from ten minutes of rendering probes against the real library
before writing the code that depended on them. Three separate assumptions, each plausible, each
wrong, each of which would have shipped silently broken.

If your code generates input for someone else's renderer, a passing test suite tells you the input
was *accepted*. It does not tell you it *did anything*.

---

*I wrote [Advanced Mermaid: Visual Diff](https://marketplace.visualstudio.com/items?itemName=AkshayDMuley.advanced-mermaid),
the VS Code extension these examples come from. MIT, no telemetry, mermaid bundled so it works
offline. Also on [Open VSX](https://open-vsx.org/extension/AkshayDMuley/advanced-mermaid).*
