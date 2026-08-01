# Advanced Mermaid — project plan

Iterative delivery plan for the extension. Each milestone is independently shippable:
it ends with a working `.vsix` and a version bump. Order is deliberate — earlier
milestones remove friction that later ones would otherwise pay repeatedly.

**Status:** v1.0.1 published as **Advanced Mermaid** (`AkshayDMuley.advanced-mermaid`). Renders two
diagrams side-by-side, opens framed, follows edits to whichever files it is showing, and reports git
failures by kind. Panes pan/zoom together or independently, and each comparison gets its own tab.
Each pane names its own file, diagram, and version, so a comparison can span two refs or two files.
The two versions can also be stacked — faded, split at a divider, or blinked between — and exported
as SVG or PNG, either side by side or as the merged diff. **Milestones 1–7 complete.**

Everything since v1.0.1 sits in `[Unreleased]` — two milestones' worth, since nothing has been
tagged in between. Whether that ships as one version or as v1.1.0 followed by v1.2.0 is a decision
for release time; either way it is **held** on Open VSX registration (see Known gaps). Milestone 7
is **complete**: flowcharts, sequence diagrams and class diagrams are each parsed, diffed, and
rendered as **one merged diagram** with the changes marked, falling back to side by side for
anything else. Each type marks its changes the way mermaid actually allows — which took a probe
to establish, every time.

---

## Where the code stands today

| File | Lines | Role |
|---|---|---|
| `src/extension.ts` | 457 | Four commands, fence/ref/file pickers, side resolution, `compare` orchestration |
| `src/git.ts` | 109 | Reads a file at a ref and lists refs; waits out repository discovery; throws a classified `GitFailureError` |
| `src/git-errors.ts` | 73 | Pure failure classification + user-facing messages |
| `src/comparePanel.ts` | 349 | Webview panel registry, CSP shell, per-side edit tracking, refresh, export round trip |
| `src/debounce.ts` | 45 | Pure debounce with `cancel()` / `flush()` |
| `src/webview/main.ts` | 711 | Mermaid render, pan/zoom, mode/divider/blink/semantic wiring, export composition + rasterise |
| `src/webview/view-math.ts` | 93 | Pure fit / zoom-anchor / clamp maths + `dividerPercent` |
| `src/webview/panel-body.ts` | 61 | The panel DOM, shared by the real panel and the harness |
| `src/webview/view-mode.ts` | 78 | Pure comparison-mode state, its layout category, and its sync interaction |
| `src/webview/export-image.ts` | 211 | Pure SVG composition for export — the two diagrams, or the merged one under its key |
| `src/webview/flowchart-parse.ts` | 392 | Pure `flowchart`/`graph` source → nodes, edges, subgraphs; `null` for anything else |
| `src/webview/flowchart-diff.ts` | 84 | Pure graph diff — added / removed / changed, in a stable order |
| `src/webview/flowchart-merge.ts` | 149 | Pure: a diff back out as one mermaid source, changes styled |
| `src/webview/reconcile.ts` | 93 | Pure list matching + removal placement, shared by all three diffs |
| `src/webview/sequence-parse.ts` | 297 | Pure `sequenceDiagram` source → participants, messages, notes, nested blocks; `null` for anything else |
| `src/webview/sequence-diff.ts` | 245 | Pure sequence diff — anchored messages, recursion through blocks |
| `src/webview/sequence-merge.ts` | 159 | Pure: the diff back out as one mermaid source, changes banded in `rect` |
| `src/webview/semantic-diff.ts` | 96 | Picks the reader, returns the merged source and its legend kinds, or `null` |
| `src/webview/class-parse.ts` | 270 | Pure `classDiagram` source → classes, members, relationships, notes; `null` for anything else |
| `src/webview/class-diff.ts` | 141 | Pure class diff — classes, members, relationships, notes |
| `src/webview/class-merge.ts` | 139 | Pure: the diff back out as one mermaid source, classes styled and the rest marked in text |
| `src/webview/diagram-source.ts` | 7 | `isBlankDiagram()` |
| `src/test/harness/main.ts` | 61 | Boots the webview outside VS Code for Playwright |
| `scripts/verify-view.mjs` | 896 | `npm run verify:view` — 144 browser checks + screenshots |
| `scripts/make-vscode-screenshots.mjs` | 254 | Captures `docs/images/` from a real VS Code over CDP |
| `src/test/screenshots/driver.ts` | 67 | Sequences the panel states for that capture, in-host |
| `src/mermaid-file.ts` | 28 | `classifySource()` — pure file-type guard (mermaid vs markdown) |
| `src/mermaid-fences.ts` | 73 | Pure ```mermaid fence parser for Markdown |
| `src/diagram-selection.ts` | 24 | Picks the diagram a side shows; the one place both sides agree |
| `src/panel-key.ts` | 24 | Pure panel identity: both sides' file + fence + source |
| `src/panel-state.ts` | 113 | Pure reload state — what each pane showed, validated on the way back |
| `src/side-source.ts` | 42 | What one pane shows — file, kind, fence, source; `tracksDocument` |
| `src/panel-title.ts` | 78 | Pure tab-title rules + `fileLabels` disambiguation |
| `src/ref-list.ts` | 46 | Pure ordering/dedup of branch and tag choices |
| `src/file-list.ts` | 60 | Pure ordering/dedup of the other-file choices + `excludeGlob` |
| `src/export-file.ts` | 37 | Pure export file naming and format-from-extension |
| `src/test/vscode-mock.ts` | 75 | Shared `vscode` module mock (aliased in `vitest.config.ts`) |

Build is esbuild (two bundles: node CJS extension + IIFE browser webview).
CI runs three jobs on every PR: `build` (`typecheck` + `test` + `build`), `integration` (a real VS
Code host), and `view` (the browser checks, with a cached Chromium). `main` is PR-protected.

### Known gaps (feeding the milestones below)

- **Hidden panels stay resident.** `retainContextWhenHidden` keeps each panel's pan/zoom state
  alive, which costs memory once several are open. Dropping it would reset the view every time a
  tab is hidden, so it stays until someone actually feels the cost.
- ~~**Panels don't survive a window reload.**~~ **Closed.** A `WebviewPanelSerializer` is
  registered and each panel keeps a `PanelState` — what each pane was showing — through
  `setState`, so a reload rebuilds every comparison. Two things this turned up that would each
  have failed silently: `onWebviewPanel:mermaidCompare` is **not** an implicit activation event
  the way `onCommand:` is for contributed commands, so with `activationEvents: []` the extension
  would never have woken to serve the serializer; and a restored panel has to be filed under its
  `panelKey` like any other, or reopening the same comparison gets a second tab.
  A third, older bug fell out of the same test, and only on CI: `onDidDispose` deleted its key from
  the registry unconditionally, so a panel closing while the same comparison was reopening evicted
  the **new** panel's entry and the next identical comparison opened a duplicate. It now deletes
  only when the registry still points at itself. Timing-dependent, which is why a Windows machine
  never showed it and a slower Linux runner did every time.
  The view — pan, zoom and the mode — is deliberately **not** restored: a reloaded panel comes
  back framed and side by side. Carrying that through means the webview merging its own state with
  the host's, which is a separate decision from "the tab still exists".
- ~~**`verify:view` is not in CI.**~~ **Closed.** It runs as a third job, `view`. What settled it
  was not the download getting cheaper but the checks getting more important: since Semantic, the
  merged diagram is mermaid source *this project generates*, and whether mermaid accepts it has no
  witness but a real render — a rejected source leaves an empty pane and no failing unit test.
  Caching `~/.cache/ms-playwright` on the lockfile hash is what made the cost bearable. Measured on
  the PR that added it: **32s cold, 20s warm** for the install step, **27–28s** for the checks
  themselves, ~1m19s for the whole job cold. `--with-deps` still runs on a hit, since the cache
  holds the browser and not the apt packages it links against.
  The harness has 31 fixed-duration waits, which is the shape of the bug the reload work hit — so
  the job was re-run **five times** before merging rather than trusted on one green tick. All five
  passed, and the checks step held at 27–28s each time. That is evidence of stability, not proof of
  it; the fix for any flake that does turn up is the one `closeAllPanels` got — wait on a real
  condition, not a longer sleep.
  Making `view` a **required status check** is branch protection in GitHub's UI, by hand, as
  `build` was.
- **No usage feedback yet.** Published, hand-verified from a `.vsix`, but nobody has lived with
  it. Milestone 7's diagram-type priorities are guesses until that changes.
- **Open VSX is still unregistered, and it gates the next version bump.** No `OVSX_PAT` secret
  exists and the `AkshayDMuley` namespace returns 404, so the release workflow's Open VSX step has
  silently skipped on every tag so far. Registration is blocked on Eclipse account creation as of
  2026-07-31. This is a **hard prerequisite for the next tag, whatever it is numbered**, not a
  nice-to-have: Open VSX does
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
- [x] **Blink mode** — timed alternation between the two. A CSS keyframe on the upper layer's
      opacity, `steps(1, end)` so it swaps outright — a crossfade would blur the very movement the
      mode exists to show. An animation rather than a `setInterval`: removing the class ends it,
      so there is no timer to clear when the mode changes or the panel is disposed, which matters
      because panels are kept alive while hidden (`retainContextWhenHidden`, above).
      **Pause removes the animation rather than setting `animation-play-state: paused`.** The
      first attempt paused it and set `opacity: 1` alongside, which looks obviously right and is
      wrong: a paused animation still applies its current keyframe, and keyframe values outrank
      normal declarations, so the pane froze blank half the time. Caught by the harness sampling
      the computed opacity — never by reading the CSS.
      `prefers-reduced-motion` **seeds** the paused state on entry rather than being enforced by a
      CSS media query. A media rule would also override an explicit Resume, leaving anyone who
      opted in with a dead button. Playwright can emulate the preference, so both halves — starts
      paused, Resume still works — are actually tested.
      Speeds top out at a 0.8s cycle (1.25Hz), well under the three-flashes-a-second threshold in
      WCAG 2.3.1; a unit test pins that no faster option can be added by accident.
      The legend animates in antiphase with the layers, since unlike the other stacked modes there
      is no static answer to which version is on screen.
- [x] **Export comparison as PNG/SVG.** The first feature that leaves the webview: compose, hand
      back to the host, write a file. `src/webview/export-image.ts` is the pure core — both
      diagrams nested in one SVG under their labels, at natural size.
      **Deliberately not a screenshot.** The export is the comparison, so it ignores pan, zoom and
      the current mode; blink has no still frame to capture anyway, and the alternative meant three
      composition paths for no gain.
      *Refined once semantic mode existed:* the rule is not "ignore the mode" but "export the
      comparison". Overlay, swipe and blink are ways of **looking** at two diagrams, so they still
      write both sides — but a merged diff is a comparison in its own right, one neither pane
      holds, so exporting it follows the rule rather than bending it. `composeComparison` and
      `composeMerged` now share one private layout, so the geometry of the two cannot drift; the
      thirteen tests written for the former still pass unedited, which is what says the
      generalisation was faithful.
      The merged export **draws its own key**: the on-screen legend is HTML in the panel header, so
      an image pasted into a pull request would otherwise arrive as unexplained green and red boxes.
      Only the kinds the diff actually holds are listed, matching what `mergeSource` does with
      `classDef`.
      *Two assumptions probed before building, both wrong:* mermaid's flowchart labels **are**
      `<foreignObject>`, but current Chromium rasterises them into a canvas without tainting it —
      so no `htmlLabels: false`, and on-screen rendering was left alone. Ten minutes of probing
      against a real render, in the same spirit as the `state.refs` and git-wording lessons above.
      *One that only the harness could catch:* the first version recovered the image size from the
      composed markup with `width="(\d+)"`, which silently fails on a diagram measuring
      `1866.28125` wide — the PNG came out **1×1**. `composeComparison` now returns its dimensions
      rather than leaving them to be parsed back out.
      The background is painted, not left transparent: a dark-theme render is light text, which
      disappears the moment a viewer composites it onto white.
      `showSaveDialog` is a native OS dialog outside the renderer, so **no automation here can
      complete the flow** — the seam is `writeExport`, exported so an integration test proves the
      bytes reaching disk in a real host for both formats. Everything before it is covered by the
      browser harness; the click itself is the one genuinely manual step in the project.

## Milestone 7 — Semantic diff (v2.0.0)

*The headline feature, and by far the most work. Deliberately last: it depends on stable
rendering, a test harness, and real usage feedback to know which diagram types matter.*

- [x] Parse both versions into a node/edge graph (start with `flowchart` only).
      `src/webview/flowchart-parse.ts` — hand-written, and not for want of trying mermaid's own:
      **mermaid 11 exposes no graph.** `mermaid.parse()` returns `{ diagramType, config }` and
      nothing else, and `Diagram.fromText` ships as a `.d.ts` over bundled chunks with no export
      path — `internals.d.ts` is marked "should not be used by external packages, definitions will
      change without notice". Probed before writing a line, in the same spirit as the `state.refs`
      and git-wording lessons above. Parsing ourselves also lands the work in the best-tested
      tier: pure, no DOM, no mermaid, so the whole thing is `npm test`.
      Node shapes and connectors are stored **verbatim** (`'[]'`, `'-.->'`) rather than as an
      enum, because the merged render regenerates mermaid source and an enum would need a lossy
      mapping back. Styling and interaction lines are collected into `unsupported` rather than
      rejected — a diagram with a `classDef` in it is still perfectly diffable, and refusing it
      would make the feature useless on real files.
      Two traps the tests caught: a lazy `-- … --` scan for inline edge labels also matches
      straight across `A --> B --> C`, reading `> B` as a label and two arrows as one edge; and
      the older `graph TD; A-->B; C-->D` style quietly produced a node called `B; C` until `;`
      was treated as a statement end.
- [x] Diff the graphs — added / removed / changed nodes and edges.
      `src/webview/flowchart-diff.ts`. Identity is the node **id**, and for an edge the pair it
      joins — keying on the label instead would report every reworded node as a removal plus an
      addition, and the merged diagram would draw the box twice. Parallel edges between the same
      pair match **by position**, the same pairing rule Milestone 5 chose for markdown fences.
      Output follows the newer version's order with each removal spliced back in after whatever
      preceded it, because that order becomes the order of the regenerated source: an unstable one
      would relayout the diagram on every refresh.
- [x] Render **one merged diagram** with change highlighting and a stable layout, so the
      change is visually obvious rather than requiring eye-comparison.
      `src/webview/flowchart-merge.ts` regenerates mermaid source for the union graph and hands it
      to the same `mermaid.render` the panes use, so mermaid still does the layout. A reworded node
      carries its old text — `Build image (was: Build)` — because the colour says *that* something
      changed and only the text says *what*.
      The merged diagram gets a **third pane**, not a borrowed side: rendering it into the left
      pane would clobber that side's cached source and measured box, and the next live edit would
      re-render the wrong thing into it.
      This is the mode that forced `isStacked` apart into two predicates. It was
      `mode !== 'sideBySide'` and did double duty — layout class *and* sync rule — and semantic is
      the first mode where those diverge: one merged diagram shares a single view like the stacked
      modes but must not be laid out on the stacked grid. `isStacked` is now a positive list and
      `sharesOneView` carries the sync rule, including the `remembered` trap that overlay→swipe
      already existed to close.
      *Two found only in the browser, as every mode before it:* mermaid applies `linkStyle` as an
      **inline style, not a class**, so a check counting `.removed` elements passed on nodes while
      saying nothing about edges; and the first harness fixture removed only an edge, so nothing
      carried the class at all and the check failed for a third reason again.
      *One found by the round-trip test the moment it first ran:* the parser unquoted node labels
      but not edge labels, so `-->|"yes"|` written by the emitter read back as `"yes"` with the
      quotes still on. Slice 1 shipped with that; nothing had ever written a label back out before.
- [x] Fall back cleanly to side-by-side for unsupported diagram types.
      A sequence or class diagram — or any source too broken to parse — lays the two panes back out
      and raises a notice saying semantic diff reads flowcharts only. The picker keeps showing
      Semantic, so the answer to "why is there no diff?" is on screen rather than inferred from a
      mode that silently reverted. Re-decided on every message, not only on entry, so editing a
      diagram back into a flowchart restores the merged view without reselecting the mode.
- [x] Extend to `sequenceDiagram`. `sequence-parse.ts` / `sequence-diff.ts` / `sequence-merge.ts`
      mirror the flowchart trio, and `semantic-diff.ts` is the new seam that picks between them —
      so `main.ts` asks one question instead of naming a parser, and a third type later touches
      neither the webview nor the export.
      **`classDef` is flowchart-only**, so a merged sequence diagram cannot style a message the way
      the flowchart one styles a node. Mermaid's sequence grammar has exactly one per-statement
      hook, `rect`, and a probe against a real render settled the design before a line was written:
      a band wraps a single message precisely, it nests correctly inside `alt` and `loop`, and
      `rgba` works — which matters, because a solid band swallows the message text on a dark canvas.
      The probe also found the rule the emitter is built around: **a `rect` around a participant
      declaration produces NaN geometry and garbles the whole diagram.** Participant changes are
      marked in the display label instead — `Customer (was: User)` — which is also the only way a
      participant nobody messages would show up as added at all.
      Blocks are diffed **recursively**, matched by keyword and sibling position, rather than by
      flattening the statement list. Flattening pairs the `alt` arm of one version against the
      `else` arm of the other, and can emit openings whose `end`s no longer balance.
      *The bug the tests caught, and the reason messages needed more than the ordinal keying edges
      use:* delete the middle of three messages between the same pair. Position alone cannot tell
      that from "the second was reworded and the third deleted" — it always reads it the second
      way, reporting a change to a message whose text never moved. Identical messages are anchored
      first; only the leftovers pair by position, which is what still reports a rewording as a
      change rather than as a removal plus an addition.
      `box` is **refused** rather than modelled, and the distinction is deliberate: it groups
      *participants*, so re-emitting a diagram without understanding it would silently regroup the
      cast. Falling back says "I can't diff this"; that would say something false.
      A pair whose diagram *type* changed between versions also falls back — that is a rewrite, not
      a diff, and merging it would mean reinterpreting one version in the other's terms.
- [x] Extend to `classDiagram`. The third trio — `class-parse.ts` / `class-diff.ts` /
      `class-merge.ts` — through the same `semantic-diff.ts` seam, which needed one new branch and
      nothing else. `main.ts` changed by one string, which is the seam paying for itself.
      **The probe earned its keep for the third time, and hardest here.** `classDef` + `cssClass` —
      the obvious flowchart-shaped route — *parses, renders, and applies no style whatsoever*.
      Copying `flowchart-merge.ts` would have shipped a mode that marked nothing while every unit
      test stayed green, because the source would have been perfectly valid. Only `style X …`
      works, and mermaid compiles it into a generated stylesheet rule rather than an inline
      attribute — so the harness check reads *computed* style, which is the only form of the check
      that can tell the two routes apart.
      Three more findings, each of which shaped the emitter: **relationships cannot be styled at
      all** (`linkStyle` is a parse error here), so a changed relationship says so in its label;
      **a colon inside a relationship label is a parse error**, so no marker may contain one; and
      **the class box is the finest unit that can be coloured**, so member changes are said in the
      member's own text in square brackets. A marker on a *method* lands in what mermaid reads as
      the return-type slot, so the old text has its parentheses stripped — with them it renders a
      stray trailing `: `.
      A member's identity is its **identifier**, not its signature: `+int age` → `+String age` is
      one changed member, and `+mate()` → `+mate(Animal other)` is a changed method. Keying on the
      text would report the commonest class-diagram edit there is as a removal plus an addition.
      A class whose members changed is itself `changed`, since the box is the only thing that can
      carry a colour.
      `namespace` is refused, as `box` is in sequence and for the same reason: it contains classes,
      so re-emitting one without modelling it would regroup the diagram.
      *Milestone 7 is complete.*

---

## Working agreement

- Every behavior change goes through the **`tdd` skill** (`.claude/skills/tdd/SKILL.md`):
  pure logic is test-first; VS Code/DOM glue is written directly with manual-verification notes.
  The key move is *extraction* — pull logic out of glue so it becomes testable.
- All changes ship via PR; `main` is protected.
- Bump the version and update `CHANGELOG.md` at each milestone boundary.
