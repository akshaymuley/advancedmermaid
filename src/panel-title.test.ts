import { describe, it, expect } from 'vitest';
import { panelTitle } from './panel-title';

const workingTree = { kind: 'workingTree' } as const;
const ref = (name: string) => ({ kind: 'ref', ref: name }) as const;

describe('panelTitle', () => {
  it('is just the file name for the everyday comparison', () => {
    expect(
      panelTitle({ name: 'diagram.mmd', sources: { left: ref('HEAD'), right: workingTree } })
    ).toBe('diagram.mmd');
  });

  it('names a non-HEAD ref, since those panels sit next to each other', () => {
    expect(
      panelTitle({ name: 'diagram.mmd', sources: { left: ref('v1.0.0'), right: workingTree } })
    ).toBe('diagram.mmd @ v1.0.0');
  });

  it('shows both refs when no working tree is involved', () => {
    expect(
      panelTitle({ name: 'diagram.mmd', sources: { left: ref('v1.0.0'), right: ref('main') } })
    ).toBe('diagram.mmd — v1.0.0 ↔ main');
  });

  it('names both refs even when one of them is HEAD', () => {
    // HEAD is only implicit when it is being compared against the working tree.
    expect(
      panelTitle({ name: 'diagram.mmd', sources: { left: ref('HEAD'), right: ref('main') } })
    ).toBe('diagram.mmd — HEAD ↔ main');
  });

  it('identifies the diagram when a Markdown file holds several', () => {
    expect(
      panelTitle({
        name: 'notes.md',
        sources: { left: ref('HEAD'), right: workingTree },
        fence: { index: 1, total: 3 },
      })
    ).toBe('notes.md — diagram 2 of 3');
  });

  it('leaves a single-fence Markdown file unadorned', () => {
    expect(
      panelTitle({
        name: 'notes.md',
        sources: { left: ref('HEAD'), right: workingTree },
        fence: { index: 0, total: 1 },
      })
    ).toBe('notes.md');
  });

  it('combines the diagram and the refs', () => {
    expect(
      panelTitle({
        name: 'notes.md',
        sources: { left: ref('v1.0.0'), right: ref('main') },
        fence: { index: 1, total: 2 },
      })
    ).toBe('notes.md — diagram 2 of 2 — v1.0.0 ↔ main');
  });
});
