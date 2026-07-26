# Mermaid Diagram Compare — project plan

Iterative delivery plan for the extension. Each milestone is independently shippable:
it ends with a working `.vsix` and a version bump. Order is deliberate — earlier
milestones remove friction that later ones would otherwise pay repeatedly.

**Status:** v0.2.0. Renders two refs side-by-side with synced pan/zoom, follows edits to the
compared file, and reports git failures by kind. Not yet published.
Milestones 1 and 2 complete.

---

## Where the code stands today

| File | Lines | Role |
|---|---|---|
| `src/extension.ts` | 93 | Command registration, `compareWithRef` orchestration |
| `src/git.ts` | 45 | Reads a file at a git ref; throws a classified `GitFailureError` |
| `src/git-errors.ts` | 67 | Pure failure classification + user-facing messages |
| `src/comparePanel.ts` | 193 | Webview panel singleton, HTML/CSP, edit tracking + refresh |
| `src/debounce.ts` | 45 | Pure debounce with `cancel()` / `flush()` |
| `src/webview/main.ts` | 153 | Mermaid render, shared pan/zoom, last-good-render fallback |
| `src/webview/diagram-source.ts` | 7 | `isBlankDiagram()` |
| `src/mermaid-file.ts` | 19 | `isMermaidFile()` — pure file-type guard |
| `src/test/vscode-mock.ts` | 64 | Shared `vscode` module mock (aliased in `vitest.config.ts`) |

Build is esbuild (two bundles: node CJS extension + IIFE browser webview).
CI runs `typecheck` + `test` + `build` on every PR. `main` is PR-protected.

### Known gaps (feeding the milestones below)

- **View controls are minimal** — only "Reset view" (hardcoded to `x:40, y:40, scale:1`).
  No fit-to-view, no zoom buttons, no per-pane independent mode.
- **Single global panel.** Comparing a second file replaces the first.
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

- [ ] **Fit to view** — compute scale/offset so the larger diagram fits its pane; button + keybinding.
      (Pure function `computeFitView(content, viewport)` — prime TDD target.)
- [ ] Fit on first render instead of the hardcoded `x:40, y:40, scale:1`.
- [ ] Zoom in/out buttons and a zoom-level readout; keyboard shortcuts (`+`/`-`/`0`).
- [ ] **Sync toggle** — let the two panes pan/zoom independently when unlocked.
- [ ] Clamp zoom to a sane range so the diagram can't be lost off-canvas.

## Milestone 4 — Publish (v1.0.0)

*Ship it. Everything above is enough to be genuinely useful.*

- [ ] Extension icon (128×128 PNG) + `icon` field in `package.json`.
- [ ] Demo GIF for the README (replaces the existing `<!-- TODO: demo GIF -->`).
- [ ] `CHANGELOG.md` following Keep a Changelog.
- [ ] GitHub Action: on tag push, `vsce package` + publish to the VS Code Marketplace
      (needs a `VSCE_PAT` repo secret).
- [ ] Consider Open VSX publishing alongside it.

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
