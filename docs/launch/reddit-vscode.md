# r/vscode

**Read the subreddit rules first** — self-promotion limits are enforced there and they change.
Some weeks a tool post is fine; some weeks it needs to be a comment in a weekly thread. Check
before posting, not after.

Post the GIF as the submission itself (an image/video post), with the text as the first comment or
in the body. A link post to a Marketplace listing performs badly and reads as an ad.

---

**Title:** I got tired of Mermaid diffs telling me nothing, so I made VS Code diff the rendered diagram

**Body:**

> Git tells me three lines of a Mermaid diagram changed. It doesn't tell me the layout engine then
> moved every node on the page — which is the thing a reviewer actually needs to see.
>
> So this renders both versions and compares the pictures. Side by side, an opacity slider to fade
> between them, a draggable divider, a blink mode for catching small movements, and a merged mode
> that draws **one** diagram with additions in green, removals dashed in red, and reworded nodes
> carrying their old text.
>
> Works on `.mmd` files and ```` ```mermaid ```` blocks in Markdown, against any branch, tag or
> commit — or against a different file entirely. Mermaid is bundled, so it works offline, and there
> is no telemetry.
>
> Free and MIT. I wrote it. Happy to answer anything, and genuinely after bug reports — it's new
> enough that you'll find things.
>
> Marketplace: [link] · Open VSX: [link] · Source: [link]

---

**Expect and prepare for:**

- *"Doesn't the Mermaid preview extension already do this?"* — No. Those render one version. This
  compares two.
- *"Why not just use the Mermaid Live Editor?"* — Because it doesn't know about your git history,
  and copy-pasting two versions into a browser tab is the workflow this replaces.
- *"Does it phone home?"* — No telemetry, mermaid bundled, works offline. Say it plainly; it earns
  more goodwill on that subreddit than any feature.
