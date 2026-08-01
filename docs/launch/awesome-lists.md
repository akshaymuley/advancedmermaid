# awesome-list submissions

Slow-burn and permanent: a line in a curated list keeps sending a trickle long after a launch post
has scrolled away. No timing pressure, so do these whenever.

**You submit these, not me** — they are pull requests to other people's repositories under your
name. Each list has its own contributing guide and most reject entries that ignore it, so read the
CONTRIBUTING file before opening anything.

## Candidate lists

| List | Where | Notes |
|---|---|---|
| awesome-mermaid | `mermaid-js/awesome-mermaid` | Most on-target. Look for a "Tools" or "Editors/IDE" section. |
| awesome-vscode | `viatsko/awesome-vscode` | Large and slow to merge; check the section for diff/preview tooling. |
| awesome-diagrams-as-code | search for the current maintained fork | Several exist; pick the one with recent commits. |

Check first whether an entry for the extension already exists, and whether the list is still
maintained — a PR to a list abandoned in 2021 is wasted effort.

## Entry line

Match the surrounding format exactly rather than pasting this verbatim; most lists are strict about
punctuation and alphabetical order.

```markdown
- [Advanced Mermaid: Visual Diff](https://marketplace.visualstudio.com/items?itemName=AkshayDMuley.advanced-mermaid) - VS Code extension that diffs rendered Mermaid diagrams across git refs, with overlay, swipe, blink and a merged view that marks additions, removals and changes on one diagram.
```

Shorter variant, for lists that keep descriptions to a clause:

```markdown
- [Advanced Mermaid: Visual Diff](https://marketplace.visualstudio.com/items?itemName=AkshayDMuley.advanced-mermaid) - Visual diff for Mermaid diagrams in VS Code.
```

## PR description

> Adds Advanced Mermaid: Visual Diff, a VS Code extension for comparing rendered Mermaid diagrams
> across git refs — including a merged view that marks additions, removals and changes on a single
> diagram.
>
> Disclosure: I'm the author. MIT licensed, no telemetry, published on both the VS Code Marketplace
> and Open VSX.

Keep the disclosure line. Lists that catch undisclosed self-submission tend to close the PR.
