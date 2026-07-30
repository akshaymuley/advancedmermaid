# Changelog

All notable changes to this extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Several comparisons open at once.** A panel is now identified by file, ref, and diagram
  rather than being a single global window, so two diagrams from one Markdown file — or one file
  against two different refs — can sit side by side. Re-running an identical comparison reveals
  its existing tab instead of opening a duplicate.
- **Mermaid blocks inside Markdown.** `.md` and `.markdown` files can now be compared: the
  extension finds their ```` ```mermaid ```` fences and, when there is more than one, asks which
  to compare — listed by the heading above each. Diagrams pair with the ref by position, so the
  pane header says `HEAD (no diagram 2)` when that version had fewer.
- Published to [Open VSX](https://open-vsx.org) alongside the VS Code Marketplace, so VSCodium,
  Cursor, Gitpod, and Windsurf can install it.

### Fixed

- **Comparing a file that doesn't exist at the ref opened nothing at all.** Adding a brand-new
  diagram and comparing it against HEAD is meant to show empty-versus-new, but the built-in Git
  extension resolves the path against the ref's tree itself and reports "relative path not
  found" — wording no git command produces, so it was classified as an unknown failure and the
  panel was suppressed. The unit tests missed it because they were written against git's own
  stderr.
- The `.vsix` no longer ships `.claude/` — the agent definitions, TDD skill, and eval results
  were development tooling that every user downloaded with the extension.

## [1.0.1] — 2026-07-30

### Changed

- Renamed to **Advanced Mermaid**. The extension identifier changed from
  `AkshayDMuley.mermaid-diagram-compare` to `AkshayDMuley.advanced-mermaid`, which the
  Marketplace treats as a new extension: 1.0.0 users are not upgraded automatically and must
  install the new listing. Comparison remains what the extension does today; the name leaves
  room for the broader Mermaid tooling in Milestones 5–7.

## [1.0.0] — 2026-07-27

First Marketplace release. No behaviour changes since 0.4.0 — the extension was verified by hand
from a packaged `.vsix` in a real VS Code, which is what 0.4.0 was waiting on.

## [0.4.0] — 2026-07-26

Release readiness. Not published to the Marketplace.

### Added

- Integration tests that run in a real VS Code host (`npm run test:integration`), covering
  activation, command registration, the panel/webview handshake, and reading a file at a git
  ref through the built-in Git extension.
- Extension icon, README screenshots, and a tag-triggered release workflow.

## [0.3.0] — 2026-07-26

### Added

- **Fit to view.** Diagrams now open framed and centred in their panes. Button, plus `0`.
- Zoom in/out buttons, a zoom-level readout, and `+` / `-` keyboard shortcuts.
- **Sync toggle** — unlock the two panes to pan and zoom them independently. Re-syncing adopts
  the pane you were last working in.
- A browser harness (`npm run verify:view`) that runs the webview in Chromium and asserts the
  view behaviour, with screenshots.

### Changed

- Zoom is clamped to 0.1×–8×. Reaching a limit leaves the view exactly as it was rather than
  drifting the diagram under the cursor.

### Removed

- "Reset view", which approximated fit with three hardcoded numbers. Use **Fit**.

### Fixed

- Fit measured the diagram with `getBBox()`, which reports SVG user units rather than layout
  pixels, so the computed scale still overflowed the pane.

## [0.2.0] — 2026-07-26

### Added

- **Live refresh.** The working-tree pane follows edits to the compared file — 300 ms after
  typing stops, and immediately on save.
- A **Refresh** button that re-reads the git ref, so the comparison can pick up new commits.
- Git failures are now distinguished: no Git extension, not a repository, unknown ref, and file
  absent at that ref each report what actually went wrong.

### Changed

- A file that doesn't exist at the ref is no longer an error — it means the diagram is new, so
  the ref pane renders empty and is labelled accordingly.
- A render that fails mid-edit keeps the last good diagram on screen and raises an error badge
  in the pane header, instead of blanking the pane on every keystroke.
- Blank and whitespace-only sources show an `(empty)` placeholder rather than a parse error.

## [0.1.0] — 2026-07-25

### Added

- Initial release: render a `.mmd` / `.mermaid` file's working-tree version beside its version
  at any git ref, with synced pan and zoom.
- **Compare Diagram with HEAD** and **Compare Diagram with Ref...** commands, an editor title
  bar button, and Source Control view integration.
- Rejects files that aren't `.mmd` / `.mermaid`, including via the command palette.
- Mermaid is bundled — the extension works offline.

[Unreleased]: https://github.com/akshaymuley/AdvancedMermaid/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/akshaymuley/AdvancedMermaid/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/akshaymuley/AdvancedMermaid/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/akshaymuley/AdvancedMermaid/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/akshaymuley/AdvancedMermaid/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/akshaymuley/AdvancedMermaid/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/akshaymuley/AdvancedMermaid/releases/tag/v0.1.0
