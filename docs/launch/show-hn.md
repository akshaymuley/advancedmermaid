# Show HN

Post as a **Show HN** with the GitHub repo as the URL — not the Marketplace listing. HN clicks
through to code, and a store page reads as an ad.

## Title

Pick one. Keep it under 80 characters.

- `Show HN: Visual diff for Mermaid diagrams in VS Code`
- `Show HN: I diff Mermaid diagrams as pictures, not text`

The first is clearer about what it is. The second is more likely to start an argument about whether
that's the right approach, which on HN is not necessarily bad.

## Text

> Git shows me that a Mermaid diagram changed by three lines. It does not show me that the layout
> engine then moved every node on the page. I wanted to see the picture, so I built this.
>
> It renders both versions and compares them: side by side, stacked with an opacity slider, split
> at a draggable divider, blinked between, or — the part I care about — merged into a single
> diagram with additions in green, removals dashed in red, and reworded nodes carrying the text
> they used to have.
>
> The merged view was harder than expected. Mermaid 11 exposes no graph: `mermaid.parse()` hands
> back `{ diagramType, config }` and nothing else, and `Diagram.fromText` ships as types over
> bundled chunks with no export path. So there are three hand-written parsers — flowchart, sequence
> and class — and each one marks its changes differently, because mermaid allows different things
> in each:
>
> - **Flowcharts** take `classDef`, so changes are styled directly.
> - **Sequence diagrams** give a message no class to style, so each change is wrapped in a coloured
>   `rect` band. Translucent, not solid — a solid band swallows the message text on a dark theme.
> - **Class diagrams** were the surprise. `classDef` + `cssClass` — the obvious route, the one that
>   works for flowcharts — parses, renders, and applies no style at all. Silent no-op. Only
>   `style X ...` works, and relationships can't be styled at all (`linkStyle` is a parse error
>   there), so a changed relationship says so in its label instead.
>
> I found each of those by rendering test cases against real mermaid and looking at the output
> before writing the emitter. None of them are documented, and all three would have shipped as
> "renders fine, marks nothing" with a green test suite.
>
> MIT, no telemetry, mermaid bundled so it works offline. Marketplace and Open VSX.
>
> [repo link]

## If it gets traction

- **Answer every comment**, including the ones saying you should have used the Mermaid Live Editor.
- The likeliest technical pushback: *why not diff the SVG output?* Honest answer: mermaid's SVG has
  no stable identity between renders — node ids shift, and a relayout changes coordinates for
  everything, so an SVG diff reports the entire file as changed. The graph is the only stable thing.
- The likeliest product pushback: *why not just look at the two diagrams?* That's exactly what
  side-by-side mode is, and it's the default. The merged view exists for when the diagram is large
  enough that eye-comparison fails.
