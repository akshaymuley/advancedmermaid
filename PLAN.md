# Mermaid Diagram Compare — project plan

Iterative delivery plan for the extension. Each milestone is independently shippable:
it ends with a working `.vsix` and a version bump. Order is deliberate — earlier
milestones remove friction that later ones would otherwise pay repeatedly.

**Status:** v1.0.0. Renders two refs side-by-side, opens framed, follows edits to the compared
file, and reports git failures by kind. Panes pan/zoom together or independently.
Milestones 1–3 complete; Milestone 4 Part 1 done and the extension has been hand-verified from a
packaged `.vsix`. Publishing is what remains — see Part 2 below.

---

## Where the code stands today

| File | Lines | Role |
|---|---|---|
| `src/extension.ts` | 93 | Command registration, `compareWithRef` orchestration |
| `src/git.ts` | 45 | Reads a file at a git ref; throws a classified `GitFailureError` |
| `src/git-errors.ts` | 67 | Pure failure classification + user-facing messages |
| `src/comparePanel.ts` | 184 | Webview panel singleton, CSP shell, edit tracking + refresh |
| `src/debounce.ts` | 45 | Pure debounce with `cancel()` / `flush()` |
| `src/webview/main.ts` | 304 | Mermaid render, per-pane pan/zoom, last-good-render fallback |
| `src/webview/view-math.ts` | 78 | Pure fit / zoom-anchor / clamp maths |
| `src/webview/panel-body.ts` | 28 | The panel DOM, shared by the real panel and the harness |
| `src/webview/diagram-source.ts` | 7 | `isBlankDiagram()` |
| `src/test/harness/main.ts` | 61 | Boots the webview outside VS Code for Playwright |
| `scripts/verify-view.mjs` | 266 | `npm run verify:view` — 34 browser checks + screenshots |
| `src/mermaid-file.ts` | 19 | `isMermaidFile()` — pure file-type guard |
| `src/test/vscode-mock.ts` | 64 | Shared `vscode` module mock (aliased in `vitest.config.ts`) |

Build is esbuild (two bundles: node CJS extension + IIFE browser webview).
CI runs `typecheck` + `test` + `build` on every PR. `main` is PR-protected.

### Known gaps (feeding the milestones below)

- **Single global panel.** Comparing a second file replaces the first.
- **`verify:view` is not in CI.** It needs a ~130 MB Chromium download, which isn't worth it on
  every PR yet. Revisit if the webview grows. (`test:integration` *is* in CI.)
- **No human has used this in VS Code yet.** The integration suite proves it starts and
  handshakes; it can't judge how anything looks.
- **Not publishable yet** — no icon, no CHANGELOG, no marketplace pipeline.

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

### Part 2 — publish (v1.0.0) — **next task, yours**

- [x] **Manual pass in a real VS Code.** Done from a packaged `.vsix` rather than F5 — that also
      exercises the `.vscodeignore` bundle, which F5 doesn't.
- [x] Bump to `1.0.0` and add the changelog entry. `[Unreleased]` was empty, so 1.0.0 is a
      release marker, not a behaviour change. The lockfile had been missed at 0.4.0 and is now
      back in step with `package.json`.
- [ ] Create the Marketplace publisher `akshaymuley`, generate the PAT, add the `VSCE_PAT`
      secret (see `RELEASING.md` — the all-organizations scope is the step that usually bites).
- [ ] `git tag v1.0.0 && git push origin v1.0.0`.
- [ ] Replace the harness screenshots in `docs/images/` with real captures from inside VS Code —
      the current ones are the genuine webview, but without the surrounding editor chrome.
- [ ] Consider Open VSX publishing alongside it (`ovsx`, separate `OVSX_PAT`).

## Milestone 5 — Broader inputs (v1.1.0)

- [ ] **Mermaid code blocks inside Markdown** — detect ```` ```mermaid ```` fences, and when a
      file has several, let the user pick which block to compare.
- [ ] **Compare two arbitrary refs** (not just working tree vs. ref).
- [ ] **Compare two arbitrary files.**
- [ ] Multiple concurrent panels instead of the current singleton, keyed by source URI.

## Milestone 6 — Visual diff modes (v1.2.0)

*Where the extension stops being "two renders" and starts being a diff tool.*

- [ ] **Overlay mode** — stack both renders with adjustable opacity (onion-skin).
- [ ] **Swipe mode** — draggable divider revealing old/new.
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
