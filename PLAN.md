# Advanced Mermaid — project plan

Iterative delivery plan for the extension. Each milestone is independently shippable:
it ends with a working `.vsix` and a version bump. Order is deliberate — earlier
milestones remove friction that later ones would otherwise pay repeatedly.

**Status:** v1.0.1 published as **Advanced Mermaid** (`AkshayDMuley.advanced-mermaid`). Seven
entries sit in `[Unreleased]` awaiting a v1.1.0 release. Renders two diagrams side-by-side, opens
framed, follows edits to whichever files it is showing, and reports git failures by kind. Panes
pan/zoom together or independently, and each comparison gets its own tab. Each pane names its own
file, diagram, and version, so a comparison can span two refs or two files. Milestones 1–5
complete. v1.1.0 is code-complete but **held**: Open VSX registration must land before it is
tagged (see Known gaps), so Milestone 6 starts first.

---

## Where the code stands today

| File | Lines | Role |
|---|---|---|
| `src/extension.ts` | 380 | Four commands, fence/ref/file pickers, side resolution, `compare` orchestration |
| `src/git.ts` | 109 | Reads a file at a ref and lists refs; waits out repository discovery; throws a classified `GitFailureError` |
| `src/git-errors.ts` | 73 | Pure failure classification + user-facing messages |
| `src/comparePanel.ts` | 225 | Webview panel registry, CSP shell, per-side edit tracking + refresh |
| `src/debounce.ts` | 45 | Pure debounce with `cancel()` / `flush()` |
| `src/webview/main.ts` | 396 | Mermaid render, per-pane pan/zoom, mode + divider wiring, last-good-render fallback |
| `src/webview/view-math.ts` | 93 | Pure fit / zoom-anchor / clamp maths + `dividerPercent` |
| `src/webview/panel-body.ts` | 51 | The panel DOM, shared by the real panel and the harness |
| `src/webview/view-mode.ts` | 63 | Pure comparison-mode state and its sync interaction |
| `src/webview/diagram-source.ts` | 7 | `isBlankDiagram()` |
| `src/test/harness/main.ts` | 61 | Boots the webview outside VS Code for Playwright |
| `scripts/verify-view.mjs` | 387 | `npm run verify:view` — 68 browser checks + screenshots |
| `scripts/make-vscode-screenshots.mjs` | 254 | Captures `docs/images/` from a real VS Code over CDP |
| `src/test/screenshots/driver.ts` | 67 | Sequences the panel states for that capture, in-host |
| `src/mermaid-file.ts` | 28 | `classifySource()` — pure file-type guard (mermaid vs markdown) |
| `src/mermaid-fences.ts` | 73 | Pure ```mermaid fence parser for Markdown |
| `src/diagram-selection.ts` | 24 | Picks the diagram a side shows; the one place both sides agree |
| `src/panel-key.ts` | 24 | Pure panel identity: both sides' file + fence + source |
| `src/side-source.ts` | 42 | What one pane shows — file, kind, fence, source; `tracksDocument` |
| `src/panel-title.ts` | 78 | Pure tab-title rules + `fileLabels` disambiguation |
| `src/ref-list.ts` | 46 | Pure ordering/dedup of branch and tag choices |
| `src/file-list.ts` | 60 | Pure ordering/dedup of the other-file choices + `excludeGlob` |
| `src/test/vscode-mock.ts` | 75 | Shared `vscode` module mock (aliased in `vitest.config.ts`) |

Build is esbuild (two bundles: node CJS extension + IIFE browser webview).
CI runs `typecheck` + `test` + `build` on every PR. `main` is PR-protected.

### Known gaps (feeding the milestones below)

- **Hidden panels stay resident.** `retainContextWhenHidden` keeps each panel's pan/zoom state
  alive, which costs memory once several are open. Dropping it would reset the view every time a
  tab is hidden, so it stays until someone actually feels the cost.
- **Panels don't survive a window reload.** No `WebviewPanelSerializer` is registered, so a
  reload closes every comparison. Never handled; more visible now that several can be open.
- **`verify:view` is not in CI.** It needs a ~130 MB Chromium download, which isn't worth it on
  every PR yet. Revisit if the webview grows. (`test:integration` *is* in CI.)
- **No usage feedback yet.** Published, hand-verified from a `.vsix`, but nobody has lived with
  it. Milestone 7's diagram-type priorities are guesses until that changes.
- **Open VSX is still unregistered, and it gates the next version bump.** No `OVSX_PAT` secret
  exists and the `AkshayDMuley` namespace returns 404, so the release workflow's Open VSX step has
  silently skipped on every tag so far. Registration is blocked on Eclipse account creation as of
  2026-07-31. This is a **hard prerequisite for tagging v1.1.0**, not a nice-to-have: Open VSX does
  not backfill, so any version tagged before the secret exists can never appear there, and a
  version number can never be republished. Steps and the `ovsx verify-pat` check are in
  `RELEASING.md`; the two silent failures are the Eclipse account's GitHub Username field and the
  unsigned Publisher Agreement.
- **The published package shipped `.claude/`** in v1.0.0 and v1.0.1 — agent and skill definitions
  users had no reason to download. Fixed in `.vscodeignore`; goes out with the next release.

---

## Milestone 1 — Test infrastructure (foundation)

*Rationale: everything after this is cheaper once it exists. Do it once, properly.*

- [x] Add Vitest + jsdom; `vitest.config.ts` with a `vscode` module alias to a mock.
- [x] Commit `src/test/vscode-mock.ts` as the single shared mock (not re-invented per task).
- [x] Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`.
- [x] Add `npm test` to `.github/workflows/ci.yml`; making the `build` job a **required status
      check** on `main` is the one remaining step (done by hand, not by an agent).
- [x] Backfill tests for the one piece of pure logic that already exists: `getNonce()`.

**Exit:** `npm test` passes locally and in CI; a failing test blocks merge.

## Milestone 2 — Correctness & robustness (v0.2.0)

*Small, high-value fixes. Each one is a natural TDD task against Milestone 1's harness.*

- [x] **File-type validation.** Extract `isMermaidFile(uri)`; reject non-`.mmd`/`.mermaid`
      with a clear message instead of rendering garbage. (Palette can bypass the `when` clause.)
      *Landed with Milestone 1 as the first real TDD task on the new harness.*
- [x] **Live refresh.** The panel tracks the source `uri` and re-renders the right pane 300 ms
      after typing stops (`src/debounce.ts`), immediately on save. A failed render mid-edit
      keeps the last good diagram and flags the error in the pane header instead of blanking it.
- [x] **Better git failure messages.** `classifyGitFailure` distinguishes no-git-extension,
      not-a-repository, unknown-ref, and path-not-in-ref.
- [x] **Extract the ref/path logic** out of `git.ts` into a pure helper — the logic worth
      extracting turned out to be error classification (`src/git-errors.ts`), not path munging;
      the git API relativizes `fsPath` itself. `git.ts` is now a thin wrapper throwing
      `GitFailureError`.
- [x] Handle the empty-diagram and whitespace-only cases without a mermaid parse error
      (`isBlankDiagram` → `(empty)` placeholder).
- [x] *Beyond the original list:* a file that doesn't exist at the ref now renders as an empty
      left pane labelled `<ref> (not present)` rather than an error — comparing a **new**
      diagram against HEAD is a valid comparison. A toolbar **Refresh** button re-runs
      `git show` so the ref side can pick up new commits.
      *Correction, Milestone 5:* this never actually worked. The classification was written
      against git's stderr, but the built-in git extension throws its own wording, so the case
      fell through to `unknown` and suppressed the panel. Fixed and covered by an integration
      test during the Markdown work.

## Milestone 3 — View controls (v0.3.0)

*The current pan/zoom is usable but blunt. This is the most visible quality-of-life jump.*

- [x] **Fit to view** — `computeFitView(content, viewport)` in `src/webview/view-math.ts`;
      Fit button + `0`. While synced, both panes fit the larger diagram so a shared scale still
      means "same size on screen".
- [x] Fit on first render instead of the hardcoded `x:40, y:40, scale:1`. Refits on resize until
      the user first pans or zooms, after which their framing is never overridden.
- [x] Zoom in/out buttons and a zoom-level readout; keyboard shortcuts (`+`/`-`/`0`).
      **"Reset view" was replaced by "Fit"** — it was approximating fit with three hardcoded numbers.
- [x] **Sync toggle** — per-pane views; re-syncing adopts the pane last interacted with.
- [x] Clamp zoom to 0.1×–8×; `zoomAt` clamps before deriving offsets, so hitting a limit is a
      true no-op rather than sliding the diagram under a stationary cursor.
- [x] *Beyond the original list:* a **Playwright harness** (`harness/index.html`,
      `npm run verify:view`) loads the real webview outside VS Code and asserts the view
      behaviour in Chromium. It caught a fit bug that the unit tests could not: `getBBox()`
      returns SVG user units, not layout pixels, so the first implementation computed a
      plausible-looking scale that still overflowed the pane.

## Milestone 4 — Publish (v1.0.0)

*Ship it. Everything above is enough to be genuinely useful.*

Split in two: everything *up to* the tag, then the publish itself.

### Part 1 — release readiness (v0.4.0, done)

- [x] **Integration tests in a real VS Code host** (`@vscode/test-electron`, `npm run
      test:integration`). Not in the original list, and the most important item in it: nothing
      here had ever been run in the extension host. Covers activation, command registration, the
      panel/webview handshake, and reading a file at a ref through the built-in git API.
- [x] Extension icon (128×128 PNG) + `icon` field in `package.json`. Generated from
      `media/icon.svg` by `npm run make:icon`; checked at 32 px, where the first draft turned to
      mush and had to be redrawn with fewer, bigger shapes.
- [x] README screenshots (`npm run make:screenshots`) replacing the `<!-- TODO: demo GIF -->`.
      No GIF: there's no ffmpeg here, and the Marketplace renders images only.
- [x] `CHANGELOG.md` following Keep a Changelog.
- [x] GitHub Action on tag push: package the `.vsix`, attach it to a GitHub Release, and publish
      only once `VSCE_PAT` exists — so tagging early is safe. `RELEASING.md` documents the
      whole sequence.

### Part 2 — publish (v1.0.0, done)

- [x] **Manual pass in a real VS Code.** Done from a packaged `.vsix` rather than F5 — that also
      exercises the `.vscodeignore` bundle, which F5 doesn't.
- [x] Bump to `1.0.0` and add the changelog entry. `[Unreleased]` was empty, so 1.0.0 is a
      release marker, not a behaviour change. The lockfile had been missed at 0.4.0 and is now
      back in step with `package.json`.
- [x] Create the Marketplace publisher, generate the PAT, add the `VSCE_PAT` secret. The
      all-organizations scope did bite: a single-org token authenticates and then reports the
      caller as a null user, which reads as a publisher problem rather than a token one.
- [x] Tag and push. Published as `AkshayDMuley.mermaid-diagram-compare` v1.0.0, then **renamed to
      `AkshayDMuley.advanced-mermaid`** at v1.0.1 — `name` is half the extension identity, so the
      Marketplace treats a rename as a new extension. The original listing was unpublished.
- [x] Replace the harness screenshots with real captures from inside VS Code.
      `npm run make:screenshots:vscode` launches VS Code, attaches Playwright over the Electron
      debugging port, and drives the panel from inside the extension host
      (`src/test/screenshots/driver.ts`). Palette-driven automation was tried first and abandoned:
      Quick Open swallows keystrokes, and the palette entries are gated on `resourceExtname`, so a
      command sent before the editor is active silently isn't there to match.
- [x] Open VSX publishing, as a second conditional step on the same tag, gated on `OVSX_PAT`
      exactly as the Marketplace step is on `VSCE_PAT`.
      **Registration is deferred** — no `OVSX_PAT` secret exists yet, so the step skips and
      nothing has been published there. Setup is in `RELEASING.md`; the Eclipse account's GitHub
      Username field and the Publisher Agreement are the two things that fail silently if missed.
      Open VSX does not backfill: only tags pushed *after* the secret exists will appear, so
      v1.0.1 and earlier stay Marketplace-only.
      *Still true at Milestone 5's close, and now a blocker rather than a deferral* — promoted to
      **Known gaps** above, since nobody reads a ticked box from two milestones ago before tagging.

## Milestone 5 — Broader inputs (v1.1.0)

- [x] **Mermaid code blocks inside Markdown** — `src/mermaid-fences.ts` finds the fences and
      `src/diagram-selection.ts` is the one place that knows a `.mmd` file *is* a diagram while a
      `.md` file merely contains some; both sides of the comparison go through it. Several fences
      prompt a QuickPick labelled by the heading above each. Fences pair across versions **by
      position** — simple and explainable, at the cost of shifting when a diagram is inserted
      above another, which the pane labels make visible.
- [x] *Beyond the original list:* comparing a file that doesn't exist at the ref opened **no panel
      at all** — the documented empty-vs-new behaviour had never worked through the real git
      extension, which resolves the path against the ref's tree and reports "relative path not
      found", wording no git command produces. `git-errors.ts` classified it as `unknown`. Caught
      only because Markdown made new-file comparisons common enough to trip over; now covered by
      an integration test that creates its fixture at runtime, since a file cannot be both
      committed and absent at HEAD.
- [x] **Compare two arbitrary refs** (not just working tree vs. ref). Both panes now describe
      where they come from (`src/side-source.ts`), so "working tree vs. ref" stopped being baked
      into the panel: `LoadSide` takes one side and the refresh paths ask each side what it is.
      A ref-vs-ref comparison is a fixed pair of commits, so it deliberately does **not** follow
      edits to the file.
      Refs are picked from the repository's real branches and tags. A probe of the running
      extension host corrected the plan here: `repository.state.refs` is empty in a fresh window,
      so `getRefs()` has to be called — the second time an assumption about this API would have
      shipped broken, and the first time it was caught before writing the code on top of it.
- [x] **Compare two arbitrary files.** The last thing baked into the panel was *which file*:
      one `uri` and one `fence` served both panes. A pane is now a whole `SideTarget` — file,
      kind, fence, source (`src/side-source.ts`) — and `panelKey`, `panelTitle` and the refresh
      paths read it per side, so an edit refreshes the pane showing *that* file. The other file
      is picked from open editors first, then the workspace, then a browse dialog
      (`src/file-list.ts` orders the choices, mirroring `ref-list.ts`).
      Resolution is deliberately asymmetric: the same file on both sides is classified and asked
      about **once**, because asking which diagram twice about one file is asking the same
      question twice; two different files number their diagrams independently and are asked
      separately. Titles gained `fileLabels` — versioned copies of a diagram are the obvious
      two-file comparison, and `diagram.mmd ↔ diagram.mmd` would say nothing, so equal names
      borrow their folder.
      Two things only the manual pass could find, both invisible to every automated suite because
      both are about what the user *sees*: the picker was hardcoding `**/node_modules/**` as its
      exclude, which **replaces** VS Code's own exclude settings rather than adding to them, so a
      workspace with build output in it filled the list with artifacts (`excludeGlob` now layers
      `files.exclude` under `search.exclude`, as the Search view does); and both pane headers read
      "Working Tree", which says nothing when the two panes are different files — they now name
      the file they are showing.
- [x] Multiple concurrent panels instead of the current singleton. Keyed by **file + both sources
      + fence** (`src/panel-key.ts`), not by source URI as originally written — URI alone would have
      re-created the very collision the item exists to remove, since the Markdown work made two
      diagrams in one file the ordinary case. Parts are length-prefixed rather than joined by a
      separator, because a ref is whatever the user typed and plain concatenation lets the same
      characters split two ways into two different comparisons.

## Milestone 6 — Visual diff modes (v1.2.0)

*Where the extension stops being "two renders" and starts being a diff tool.*

- [x] **Overlay mode** — stack both renders with adjustable opacity (onion-skin). Both panes move
      into one grid cell, so the right (newer) one is on top by DOM order and its viewport takes the
      slider's opacity. The layers register at their **top-left** corners: they share one transform,
      and centring each against the larger box was rejected because mermaid lays flowcharts out from
      a stable origin — appending a node grows the diagram downward, which top-left alignment leaves
      alone and centring would turn into whole-diagram movement that isn't there.
      The state worth extracting turned out not to be geometry but the **sync interaction**
      (`src/webview/view-mode.ts`): overlay is meaningless with two independent views, so it forces
      Sync on and disables the control, then hands back whatever the user had on the way out. The
      trap it exists to close is entering overlay twice — a naive implementation captures the
      *forced* `synced: true` as the user's own setting and loses their unsynced framing for good.
      *Found by the harness, not by reasoning:* hiding the opacity slider by setting `hidden` did
      nothing, because the author rule `#opacity-control { display: flex }` beats the UA
      stylesheet's `[hidden] { display: none }`. The unit tests saw a correct `hidden` attribute
      and passed.
- [x] **Swipe mode** — draggable divider revealing old/new. Reuses overlay's stacked grid; the
      only new geometry is `clip-path: inset(0 0 0 var(--swipe-position))` on the upper layer.
      **That clip goes on `.canvas`, never on `.viewport`:** the viewport carries the pan/zoom
      transform, and `clip-path` resolves in an element's own coordinate space *before* its
      transform, so a percentage there is measured in diagram units and the divider would slide and
      stretch on every zoom. Pinned by a harness check that zooms and asserts the divider hasn't
      moved on screen.
      `view-mode.ts` generalised from "overlay on/off" to real modes, which is what forced the
      sync rule to be restated: `remembered` is captured only when leaving a **non-stacked** mode.
      The old "same mode is a no-op" guard looked sufficient and wasn't — overlay→swipe is a
      different mode with both sides stacked, so it slipped straight past and would have recorded
      the *forced* `synced: true` as the user's own setting.
      The Overlay toggle became a mode `<select>`: three states no longer fit a pressed/unpressed
      button, and blink is one more `<option>`. Overlay was unreleased, so nothing had to be kept
      working. The divider takes arrow keys, `Shift` for bigger steps and `Home`/`End` — it would
      otherwise be the only control in the panel a keyboard can't reach.
- [ ] **Blink mode** — timed alternation between the two.
- [ ] **Export comparison as PNG/SVG.**

## Milestone 7 — Semantic diff (v2.0.0)

*The headline feature, and by far the most work. Deliberately last: it depends on stable
rendering, a test harness, and real usage feedback to know which diagram types matter.*

- [ ] Parse both versions into a node/edge graph (start with `flowchart` only).
- [ ] Diff the graphs — added / removed / changed nodes and edges.
- [ ] Render **one merged diagram** with change highlighting and a stable layout, so the
      change is visually obvious rather than requiring eye-comparison.
- [ ] Fall back cleanly to side-by-side for unsupported diagram types.
- [ ] Extend to `sequenceDiagram`, then `classDiagram`, based on demand.

---

## Working agreement

- Every behavior change goes through the **`tdd` skill** (`.claude/skills/tdd/SKILL.md`):
  pure logic is test-first; VS Code/DOM glue is written directly with manual-verification notes.
  The key move is *extraction* — pull logic out of glue so it becomes testable.
- All changes ship via PR; `main` is protected.
- Bump the version and update `CHANGELOG.md` at each milestone boundary.
