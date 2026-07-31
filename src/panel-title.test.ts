import { describe, it, expect } from 'vitest';
import { fileLabels, panelTitle, type TitleSide } from './panel-title';

const workingTree = { kind: 'workingTree' } as const;
const ref = (name: string) => ({ kind: 'ref', ref: name }) as const;

const side = (name: string, source: TitleSide['source'], fence?: TitleSide['fence']): TitleSide => ({
  name,
  source,
  fence,
});

describe('panelTitle', () => {
  it('is just the file name for the everyday comparison', () => {
    expect(
      panelTitle({ left: side('diagram.mmd', ref('HEAD')), right: side('diagram.mmd', workingTree) })
    ).toBe('diagram.mmd');
  });

  it('names a non-HEAD ref, since those panels sit next to each other', () => {
    expect(
      panelTitle({
        left: side('diagram.mmd', ref('v1.0.0')),
        right: side('diagram.mmd', workingTree),
      })
    ).toBe('diagram.mmd @ v1.0.0');
  });

  it('shows both refs when no working tree is involved', () => {
    expect(
      panelTitle({ left: side('diagram.mmd', ref('v1.0.0')), right: side('diagram.mmd', ref('main')) })
    ).toBe('diagram.mmd — v1.0.0 ↔ main');
  });

  it('names both refs even when one of them is HEAD', () => {
    // HEAD is only implicit when it is being compared against the working tree.
    expect(
      panelTitle({ left: side('diagram.mmd', ref('HEAD')), right: side('diagram.mmd', ref('main')) })
    ).toBe('diagram.mmd — HEAD ↔ main');
  });

  it('identifies the diagram when a Markdown file holds several', () => {
    expect(
      panelTitle({
        left: side('notes.md', ref('HEAD'), { index: 1, total: 3 }),
        right: side('notes.md', workingTree, { index: 1, total: 3 }),
      })
    ).toBe('notes.md — diagram 2 of 3');
  });

  it('leaves a single-fence Markdown file unadorned', () => {
    expect(
      panelTitle({
        left: side('notes.md', ref('HEAD'), { index: 0, total: 1 }),
        right: side('notes.md', workingTree, { index: 0, total: 1 }),
      })
    ).toBe('notes.md');
  });

  it('combines the diagram and the refs', () => {
    expect(
      panelTitle({
        left: side('notes.md', ref('v1.0.0'), { index: 1, total: 2 }),
        right: side('notes.md', ref('main'), { index: 1, total: 2 }),
      })
    ).toBe('notes.md — diagram 2 of 2 — v1.0.0 ↔ main');
  });

  it('names both files when the comparison spans two of them', () => {
    // Nothing is shared, so nothing can be implied: each side has to say what it is.
    expect(
      panelTitle({ left: side('old.md', workingTree), right: side('new.mmd', workingTree) })
    ).toBe('old.md ↔ new.mmd');
  });

  it('identifies the diagram within whichever file holds several', () => {
    expect(
      panelTitle({
        left: side('old.md', workingTree, { index: 2, total: 4 }),
        right: side('new.mmd', workingTree),
      })
    ).toBe('old.md (diagram 3 of 4) ↔ new.mmd');
  });

  it('names the ref a two-file comparison pins one side to', () => {
    expect(
      panelTitle({ left: side('old.md', ref('v1.0.0')), right: side('new.mmd', workingTree) })
    ).toBe('old.md @ v1.0.0 ↔ new.mmd');
  });

});

describe('fileLabels', () => {
  it('uses bare file names when they already differ', () => {
    // The tab is narrow: say no more than it takes to tell the two sides apart.
    expect(fileLabels('/repo/docs/old.md', '/repo/new.mmd')).toEqual({
      left: 'old.md',
      right: 'new.mmd',
    });
  });

  it('adds the folder when both files are named the same', () => {
    // Versioned copies of one diagram are the obvious two-file comparison, and `diagram.mmd ↔
    // diagram.mmd` would say nothing at all.
    expect(fileLabels('/repo/v1/diagram.mmd', '/repo/v2/diagram.mmd')).toEqual({
      left: 'v1/diagram.mmd',
      right: 'v2/diagram.mmd',
    });
  });

  it('leaves one file compared against itself as a single name', () => {
    // The everyday comparison: both sides are the same path, so panelTitle's same-file rules
    // apply and nothing needs disambiguating.
    expect(fileLabels('/repo/diagram.mmd', '/repo/diagram.mmd')).toEqual({
      left: 'diagram.mmd',
      right: 'diagram.mmd',
    });
  });

  it('handles Windows separators, whichever platform it runs on', () => {
    expect(fileLabels('C:\\repo\\v1\\diagram.mmd', 'C:\\repo\\v2\\diagram.mmd')).toEqual({
      left: 'v1/diagram.mmd',
      right: 'v2/diagram.mmd',
    });
  });

  it('falls back to the bare name when there is no folder to add', () => {
    expect(fileLabels('diagram.mmd', '/repo/diagram.mmd')).toEqual({
      left: 'diagram.mmd',
      right: 'repo/diagram.mmd',
    });
  });
});
