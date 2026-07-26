# Mermaid Diagram Compare

**Compare rendered Mermaid diagrams instead of code.**

Git diffs of `.mmd` files show text changes, but a one-line edit can completely rearrange a rendered diagram. This VS Code extension shows you the *visual* difference: the old and new versions rendered side by side, with synced pan and zoom.

<!-- TODO: demo GIF -->

## Features

- **Compare Diagram with HEAD** — one click in the editor title bar (for `.mmd` / `.mermaid` files) to see the working-tree version next to the last committed version.
- **Compare Diagram with Ref...** — compare against any branch, tag, or commit.
- SCM view integration — right-click a changed file in the Source Control panel.
- Diagrams open **fitted** to their panes. Zoom with the wheel, the buttons, or `+`/`-`/`0`.
- Pan & zoom stay **synced** across both panes — or unlock them to inspect each side on its own.
- **Live** — the working-tree pane follows your edits as you type.
- Follows your VS Code light/dark theme.
- Mermaid is bundled — works fully offline.

## Usage

1. Open a `.mmd` or `.mermaid` file inside a git repository.
2. Click the compare icon in the editor title bar, or run **Mermaid Compare: Compare Diagram with HEAD** from the command palette.

## Roadmap

- [ ] Visual overlay modes (onion-skin, swipe, blink) like image diff tools
- [ ] **Semantic diff** — parse both versions, diff the graph structure, and render one merged diagram with added/removed/changed elements highlighted. Stable layout, so the change jumps out.
- [ ] Support Mermaid code blocks inside Markdown files
- [ ] Compare two arbitrary files or two refs
- [ ] Export comparison as image

See [PLAN.md](PLAN.md) for the full milestone-by-milestone plan.

Contributions toward any of these are very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

```bash
npm install
npm run watch     # rebuild on change
```

Press `F5` in VS Code to launch an Extension Development Host.

Other scripts: `npm run typecheck`, `npm run build` (production bundle). To package a `.vsix`: `npx @vscode/vsce package`.

## License

[MIT](LICENSE)
