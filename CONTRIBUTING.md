# Contributing

Thanks for your interest! All contributions are welcome — bug reports, feature ideas, docs, and code.

## Getting started

1. Fork and clone the repo.
2. `npm install`
3. `npm run watch`, then press `F5` in VS Code to launch the Extension Development Host.
4. Open `samples/pipeline.mmd` in a git repo to try the compare commands.

## Testing

- `npm test` — Vitest unit tests. The `vscode` module resolves to `src/test/vscode-mock.ts`;
  extend that mock rather than writing a new one.
- `npm run verify:view` — loads the real webview in Chromium via `harness/index.html` and
  exercises fit/zoom/sync, writing screenshots to `dist/view-screenshots/`. Needs a one-time
  `npx playwright install chromium`. Not run in CI.
- Open `harness/index.html` in a browser after `npm run compile` to poke at the webview by hand,
  without launching VS Code.

## Guidelines

- Keep PRs focused — one change per PR.
- Run `npm run typecheck`, `npm test`, and `npm run build` before submitting.
- For larger features (e.g. items on the README roadmap), open an issue first so we can discuss the approach.

## Project layout

- `src/extension.ts` — activation and commands
- `src/git.ts` — reads old file versions via the built-in `vscode.git` API
- `src/comparePanel.ts` — webview panel host
- `src/git-errors.ts` — pure classification of git failures into user-facing messages
- `src/webview/main.ts` — runs inside the webview: renders both diagrams with Mermaid, handles pan/zoom
- `src/webview/view-math.ts` — pure fit/zoom/clamp maths
- `src/webview/panel-body.ts` — the panel's DOM, shared by the real panel and the harness
- `media/webview.css` — webview styles
- `harness/` + `src/test/harness/` — runs the webview outside VS Code for browser testing

By contributing, you agree that your contributions will be licensed under the MIT License.
