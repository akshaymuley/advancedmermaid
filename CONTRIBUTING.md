# Contributing

Thanks for your interest! All contributions are welcome — bug reports, feature ideas, docs, and code.

## Getting started

1. Fork and clone the repo.
2. `npm install`
3. `npm run watch`, then press `F5` in VS Code to launch the Extension Development Host.
4. Open `samples/pipeline.mmd` in a git repo to try the compare commands.

## Guidelines

- Keep PRs focused — one change per PR.
- Run `npm run typecheck` and `npm run build` before submitting.
- For larger features (e.g. items on the README roadmap), open an issue first so we can discuss the approach.

## Project layout

- `src/extension.ts` — activation and commands
- `src/git.ts` — reads old file versions via the built-in `vscode.git` API
- `src/comparePanel.ts` — webview panel host
- `src/webview/main.ts` — runs inside the webview: renders both diagrams with Mermaid, handles pan/zoom
- `media/webview.css` — webview styles

By contributing, you agree that your contributions will be licensed under the MIT License.
