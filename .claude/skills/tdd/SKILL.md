---
name: tdd
description: Test-driven development workflow for the mermaid-diagram-compare VS Code extension. Use this whenever adding a feature, fixing a bug, refactoring, or changing behavior in src/ — even if the user doesn't mention tests. Also use when the user asks to "add tests", "set up testing", or mentions TDD, red/green, Vitest, or test coverage.
---

# TDD for mermaid-diagram-compare

Write the test first, watch it fail, then write the minimal code to pass. A test you never saw fail proves nothing — it may pass for the wrong reason or test nothing at all. That's the core loop; everything below adapts it to this specific codebase.

## Testability map — decide the tier first

This extension has three kinds of code, and the TDD discipline differs by tier. Before writing anything, decide which tier the change lives in:

| Tier | What | Where today | Discipline |
|------|------|-------------|------------|
| **Pure logic** | Data transforms, parsing, math, formatting. No `vscode` or DOM imports. | `toUri` arg resolution, zoom/pan math, error-message formatting, nonce generation | **Strict TDD.** Failing Vitest test first, always. |
| **VS Code glue** | Thin wiring over the `vscode` API | `git.ts`, `comparePanel.ts`, command registration in `extension.ts` | Extract any logic into pure functions and TDD those. The remaining thin wiring may be written directly; cover it with an integration test when it grows branches, and note what you verified manually. |
| **Webview/DOM** | Browser-side rendering with mermaid | `src/webview/main.ts` | Extract logic (e.g., zoom anchoring math) into pure modules and TDD those with Vitest + jsdom. Direct DOM/mermaid wiring may be written directly with manual verification via F5. |

The most valuable move in this codebase is usually **extraction**: when a change touches glue or webview code, pull the decision-making into a pure function in its own file (e.g., `src/webview/view-math.ts`, `src/uri-resolution.ts`) and TDD that. The glue shrinks to a few untestable lines, which is fine.

## One-time setup (do this if `vitest.config.ts` doesn't exist)

Unit tests: Vitest with jsdom, mocking the `vscode` module via alias.

```
npm i -D vitest jsdom
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { vscode: path.resolve(__dirname, 'src/test/vscode-mock.ts') },
  },
});
```

`src/test/vscode-mock.ts` — a minimal hand-rolled mock exporting only what tests touch (`Uri`, `window`, `workspace`, `extensions`, `commands`). Grow it as tests need; don't pre-build the whole API.

Add scripts to `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Exclude `*.test.ts` and `src/test/` from the esbuild bundle and `.vscodeignore` if needed.

Integration tests (`@vscode/test-electron` + mocha) exist for exercising real VS Code behavior — command registration, the git extension API, webview creation. Set them up only when a change actually needs them (see "When to write an integration test" below); don't scaffold speculatively.

## The loop

1. **RED** — Write one test for the next small behavior. Run `npm test` and **read the failure**. It must fail because the behavior is missing, not because of a typo or import error. Say in one line why it failed.
2. **GREEN** — Write the simplest code that passes. Resist adding the next feature while you're in there.
3. **Verify** — `npm test` passes, and `npm run typecheck` is clean.
4. **REFACTOR** — Only now improve names, remove duplication, extract helpers. Tests stay green.
5. Repeat per behavior. Small steps: one test, one behavior.

**Example (this repo):** to fix "SCM context menu passes a resource state, not a Uri":

```ts
// src/uri-resolution.test.ts
import { describe, it, expect } from 'vitest';
import { resolveUri } from './uri-resolution';
import { Uri } from 'vscode'; // resolves to the mock

it('unwraps a SourceControlResourceState to its resourceUri', () => {
  const uri = Uri.file('/repo/diagram.mmd');
  expect(resolveUri({ resourceUri: uri })).toBe(uri);
});
```

Run it, watch it fail (`resolveUri` doesn't exist), then extract the logic from `toUri` in `extension.ts` into `src/uri-resolution.ts` and make it pass.

## When to write an integration test

Reach for `@vscode/test-electron` only when the behavior *is* the VS Code interaction: a command doesn't appear, activation fails, the real git extension returns something unexpected. These are slow; one integration test per user-visible flow is plenty. Everything with logic in it should already be unit-tested by the time you get here.

## Bug fixes

A bug fix starts with a failing test that reproduces the bug — this is non-negotiable even in glue code if the bug is reproducible in a pure function after extraction. If the bug is purely in wiring (wrong `when` clause in package.json, CSP string), fix it directly and state how you verified it (F5, manual command run).

## What not to test

- `package.json` contributes, CSS, the HTML template string — verify manually via F5.
- Mermaid's own rendering output — trust the library; test *your* handling of its success/failure.
- The `vscode` mock itself.

## Done means

- New logic has tests that you watched fail first.
- `npm test` and `npm run typecheck` both pass with clean output.
- Anything exempted from tests (glue/DOM wiring) is listed with how it was manually verified.
- Tests assert on real behavior of your code, not on mock call counts, except where the interaction *is* the contract (e.g., "posts a `compare` message to the webview").
