# Advanced Mermaid

**Compare rendered Mermaid diagrams instead of code.**

Git diffs of Mermaid show text changes, but a one-line edit can completely rearrange a rendered diagram. This VS Code extension shows you the *visual* difference: the old and new versions rendered side by side, with synced pan and zoom. Works on `.mmd` files and on ```` ```mermaid ```` blocks inside Markdown.

![Two versions of a deploy pipeline diagram side by side, the right one with extra steps](https://raw.githubusercontent.com/akshaymuley/AdvancedMermaid/main/docs/images/compare.png)

## Features

- **Compare Diagram with HEAD** — one click in the editor title bar to see the working-tree version next to the last committed version.
- **Compare Diagram with Ref...** — compare against any branch, tag, or commit.
- **Compare Diagram Between Refs...** — compare two refs against each other, with no working tree involved. Review a diagram change on a branch without checking it out. Both sides are picked from the repository's real branches and tags.
- **Markdown support** — compare ```` ```mermaid ```` blocks in `.md` files. When a file holds several, pick which one from a list labelled by the heading above each.
- **Several comparisons at once** — each file, ref, and diagram gets its own tab, so you can line two of them up. Re-running the same comparison brings its tab forward instead of opening a duplicate.
- SCM view integration — right-click a changed file in the Source Control panel.
- Diagrams open **fitted** to their panes. Zoom with the wheel, the buttons, or `+`/`-`/`0`.
- Pan & zoom stay **synced** across both panes — or unlock them to inspect each side on its own.
- **Live** — the working-tree pane follows your edits as you type.
- Follows your VS Code light/dark theme.
- Mermaid is bundled — works fully offline.

## Usage

1. Open a `.mmd`, `.mermaid`, or `.md` file inside a git repository.
2. Click the compare icon in the editor title bar, or run **Mermaid Compare: Compare Diagram with HEAD** from the command palette.
3. In a Markdown file with more than one ```` ```mermaid ```` block, choose which diagram to compare.

Diagrams in Markdown pair with the ref by position — the second block is compared against the
second block as it was at that ref. Insert a diagram *above* another and the pairing shifts with
it, which the pane labels make visible.

### Editing live

The working-tree pane follows your edits. Mermaid spends most of an edit in an invalid state, so
a source that doesn't parse keeps the last good diagram on screen and raises a badge in the pane
header instead of blanking the pane.

![A mid-edit diagram holding its previous render with an error badge in the pane header](https://raw.githubusercontent.com/akshaymuley/AdvancedMermaid/main/docs/images/live-edit.png)

### Inspecting one side

Both panes pan and zoom together by default. Turn **Sync** off to frame each side on its own.

![The two panes zoomed and positioned independently](https://raw.githubusercontent.com/akshaymuley/AdvancedMermaid/main/docs/images/independent-panes.png)

## Roadmap

- [ ] Visual overlay modes (onion-skin, swipe, blink) like image diff tools
- [ ] **Semantic diff** — parse both versions, diff the graph structure, and render one merged diagram with added/removed/changed elements highlighted. Stable layout, so the change jumps out.
- [ ] Compare a diagram in one file against a diagram in another
- [ ] Export comparison as image

See [PLAN.md](PLAN.md) for the full milestone-by-milestone plan.

Contributions toward any of these are very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

```bash
npm install
npm run watch     # rebuild on change
```

Press `F5` in VS Code to launch an Extension Development Host.

Other scripts: `npm run typecheck`, `npm test` (unit), `npm run test:integration` (in a real VS
Code), `npm run verify:view` (webview in Chromium), `npm run build` (production bundle).

To package a `.vsix`: `npx @vscode/vsce package`. Release process: [RELEASING.md](RELEASING.md).

## License

[MIT](LICENSE)
