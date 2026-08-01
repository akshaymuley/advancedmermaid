# mermaid-js Discussions — Show and tell

**Where:** github.com/mermaid-js/mermaid → Discussions → **Show and tell**
**Why first:** the most on-target audience anywhere, and the one most likely to file a useful bug
before a wider audience shows up. Also the venue where the parser limitations below are interesting
rather than complaints.

---

**Title:** Visual diff for Mermaid diagrams in VS Code — including a merged view

Hi all — I built a VS Code extension that diffs Mermaid diagrams by what they *render as* rather
than by their source, and a few things I ran into might be of interest here regardless of the tool.

It renders both versions of a diagram and compares them side by side, stacked with an opacity
slider, split at a divider, blinked between, or merged into one diagram with the changes marked.

*(Attach `docs/images/demo.gif`.)*

Three things I learned building the merged view, which I couldn't find documented anywhere:

1. **There's no public graph API in v11.** `mermaid.parse()` returns `{ diagramType, config }`, and
   `Diagram.fromText` ships over bundled chunks with `internals.d.ts` warning it isn't for external
   use. I ended up hand-writing parsers for flowchart, sequence and class diagrams. Is a public
   read-only AST something the project would consider? It would make tooling like this much less
   fragile — I'd be glad to help if there's appetite.

2. **`classDef` + `cssClass` in a class diagram parses and renders but applies no style.** `style X`
   works. I don't know whether that's intended or a bug — happy to open an issue with a
   reproduction if it's the latter.

3. **`linkStyle` is a parse error in class diagrams**, so relationships can't be styled at all. I
   work around it by putting the marker in the relationship label. Also worth noting: a colon
   inside a relationship label is a parse error, which took a while to isolate.

The extension is MIT, bundles mermaid so it works offline, and sends no telemetry. Repo and
Marketplace links below. Feedback very welcome, especially on which diagram types are worth
supporting next — right now it reads flowchart, sequence and class, and falls back to showing both
versions side by side for anything else.

[repo link] · [marketplace link]

---

**Disclosure to keep in the post:** you wrote it. The Show and tell category expects that, but say
it anyway.
