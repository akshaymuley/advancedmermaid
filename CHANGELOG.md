# Changelog

All notable changes to this extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Semantic mode — one merged diagram instead of two.** Reads both versions of a flowchart as a
  graph, works out what actually changed, and draws a single diagram with additions in green,
  removals dashed in red, and reworded nodes in amber carrying the text they used to have
  (`Build image (was: Build)`). Mermaid still does the layout, so the merged diagram looks like
  your diagram rather than like a diff tool's idea of one.
  It reads flowcharts (`flowchart` and `graph`); anything else — a sequence or class diagram —
  falls back to showing both versions side by side with a line saying why, and edits are picked up
  live, so turning a diagram back into a flowchart brings the merged view straight back.
- **Export the comparison as SVG or PNG.** A new **Export…** button writes both diagrams side by
  side under their labels, as one image — the thing you actually want to paste into a pull
  request. The extension you pick in the save dialog decides the format; PNG is rasterised at 2×.
  The image is the comparison rather than a screenshot: it ignores pan, zoom and the current mode,
  and paints your theme's background so a dark render doesn't come out as invisible text.
- **Blink mode.** Alternates between the two versions in place, which is what catches a node that
  moved only slightly — hard to see faded, impossible across a gap, obvious when it jumps. Three
  speeds (the fastest is a 0.8s cycle, well under the flash threshold in WCAG 2.3.1) and a Pause
  that stops on the newer version. Where the system asks for reduced motion it starts paused, so
  nothing animates until you say so.
- **Swipe mode.** The same two stacked layers split at a draggable divider — the old version left
  of it, the new version right of it. The divider is keyboard-operable once focused (arrows,
  `Shift` for bigger steps, `Home`/`End`), and stays put on screen while you pan and zoom.
- **A mode picker** in the toolbar replaces the Overlay toggle, now that there is more than one
  way to show the two versions: Side by side, Overlay, Swipe, Blink, Semantic.
- **Overlay mode.** Stacks both renders in one canvas, with a slider that fades the upper (newer)
  one — an onion skin. The two layers register at their top-left corners
  and share a single pan and zoom, so a node that shifted reads as movement instead of as two
  diagrams that happen to look different. Leaving overlay gives back whatever the Sync setting was
  before.
- **Compare two different files.** A new **Compare Diagram with File...** command compares a
  diagram against one in another file rather than against another version of the same file —
  a diagram against the copy it was forked from, or an `.mmd` against a block inside a `.md`.
  The other file is picked from the workspace, with open files listed first and a browse option
  for anything outside it; the list respects your `files.exclude` and `search.exclude` settings,
  as the Search view does. Each pane names its file and follows edits to it, and a file holding
  several diagrams is asked about separately.
- **Compare a diagram between two refs.** A new **Compare Diagram Between Refs...** command
  compares any two branches, tags, or commits directly — no working tree involved, so you can
  review a diagram change on someone else's branch without checking it out. Both refs are chosen
  from a list of the repository's actual branches and tags, with manual entry for anything else.
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

- **Diagrams are drawn in your editor's font.** They had always rendered in mermaid's default
  Trebuchet MS, a few pixels from a panel drawn in the editor's own font — two typefaces side by
  side in one view. The font is resolved before mermaid is told about it rather than handed over as
  `var(--vscode-font-family)`: the variable would look right on screen and then break on export,
  where an SVG written to a file has nothing to resolve it against and the text falls back to a
  serif.
- **Comparing too soon after opening a window could report "not a git repository"** for a file
  that is plainly tracked. The built-in Git extension discovers repositories asynchronously and
  answers "none" until it has finished looking; that answer is now only believed once it says the
  scan is complete. The error was self-correcting a second later, which made it look random.
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
