# LinkedIn and X

Both live or die on the GIF. Upload `docs/images/demo.gif` directly rather than linking — a link
preview gets a fraction of the attention an autoplaying image does.

## LinkedIn

Longer, slower, and the audience skews toward people who write architecture docs for a living —
which is exactly who reviews diagrams.

> Git told me three lines of a diagram changed. It didn't tell me the layout engine had moved every
> node on the page.
>
> That's the gap I kept hitting reviewing Mermaid diagrams in pull requests: the text diff is
> accurate and useless. What a reviewer needs is the picture.
>
> So I built a VS Code extension that renders both versions and compares them — side by side, faded
> over each other, split at a divider, or merged into a single diagram with additions in green,
> removals dashed in red, and reworded nodes carrying the text they used to have.
>
> The interesting part was that Mermaid exposes no graph API, so it hand-parses three diagram types
> and regenerates source for the merged view. Each type has to mark its changes differently,
> because each allows different things — and in one case the obvious approach renders perfectly and
> marks nothing at all, which is the kind of bug that ships with a green test suite.
>
> Free, MIT, no telemetry, works offline. On the VS Code Marketplace and Open VSX.
>
> [link]

## X

Thread, GIF on the first post.

1. Git says three lines of your Mermaid diagram changed. It doesn't say the layout engine moved
   every node on the page. That's the review problem I wanted fixed. 🧵 *(attach GIF)*
2. So: render both versions, compare the pictures. Side by side, opacity fade, draggable divider,
   blink, or one merged diagram with the changes marked on it.
3. Mermaid 11 exposes no graph — `mermaid.parse()` gives you `{ diagramType, config }` and nothing
   else. So there are three hand-written parsers: flowchart, sequence, class.
4. Each marks changes differently, because each allows different things. Class diagrams were the
   trap: `classDef` + `cssClass` parses, renders, and applies no style at all. Valid source, green
   tests, zero effect. Only `style X` works.
5. Free, MIT, no telemetry, mermaid bundled so it works offline. Marketplace + Open VSX: [link]

## Timing

Post after the article exists, so replies asking "how does it work" have somewhere to go. Don't
post the same day as Show HN — if HN goes well you'll want the day free to answer comments there.
