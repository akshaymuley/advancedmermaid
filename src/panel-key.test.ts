import { describe, it, expect } from 'vitest';
import { panelKey } from './panel-key';
import type { SideSources } from './side-source';

const uri = (value: string) => ({ toString: () => value });
const vsWorkingTree = (ref: string): SideSources => ({
  left: { kind: 'ref', ref },
  right: { kind: 'workingTree' },
});
const refs = (left: string, right: string): SideSources => ({
  left: { kind: 'ref', ref: left },
  right: { kind: 'ref', ref: right },
});

describe('panelKey', () => {
  it('is stable for the same comparison', () => {
    const source = { uri: uri('file:///repo/notes.md'), sources: vsWorkingTree('HEAD'), fence: 1 };

    expect(panelKey(source)).toBe(panelKey({ ...source }));
  });

  it('separates comparisons that differ by file, ref, or fence', () => {
    const base = { uri: uri('file:///repo/notes.md'), sources: vsWorkingTree('HEAD'), fence: 0 };
    const keys = new Set([
      panelKey(base),
      panelKey({ ...base, uri: uri('file:///repo/other.md') }),
      panelKey({ ...base, sources: vsWorkingTree('v1.0.0') }),
      panelKey({ ...base, fence: 1 }),
    ]);

    expect(keys.size).toBe(4);
  });

  it('separates a whole-file comparison from the first fence of a Markdown file', () => {
    // `.mmd` files carry no fence at all. If undefined collapsed onto 0, a diagram file and the
    // first block of a Markdown file could share a panel.
    const base = { uri: uri('file:///repo/diagram.mmd'), sources: vsWorkingTree('HEAD') };

    expect(panelKey(base)).not.toBe(panelKey({ ...base, fence: 0 }));
  });

  it('tells the two directions of a ref-to-ref comparison apart', () => {
    // old↔new and new↔old put different diagrams on the left, so they are different panels.
    const base = { uri: uri('file:///repo/diagram.mmd'), fence: 0 };

    expect(panelKey({ ...base, sources: refs('v1.0.0', 'main') })).not.toBe(
      panelKey({ ...base, sources: refs('main', 'v1.0.0') })
    );
  });

  it('separates a ref-to-ref comparison from one against the working tree', () => {
    const base = { uri: uri('file:///repo/diagram.mmd'), fence: 0 };

    expect(panelKey({ ...base, sources: vsWorkingTree('main') })).not.toBe(
      panelKey({ ...base, sources: refs('main', 'main') })
    );
  });

  it('does not let the boundary between the file and the ref move', () => {
    // The ref is whatever the user typed; git would reject one containing a space, but panelKey
    // sees the string first. Plain concatenation lets the same characters split two ways, so
    // these two distinct comparisons would quietly share a panel.
    const a = panelKey({ uri: uri('file:///repo/a'), sources: vsWorkingTree('b c'), fence: 0 });
    const b = panelKey({ uri: uri('file:///repo/a b'), sources: vsWorkingTree('c'), fence: 0 });

    expect(a).not.toBe(b);
  });

  it('is case-sensitive about the ref, since git is', () => {
    const base = { uri: uri('file:///repo/notes.md'), fence: 0 };

    expect(panelKey({ ...base, sources: vsWorkingTree('Main') })).not.toBe(
      panelKey({ ...base, sources: vsWorkingTree('main') })
    );
  });
});
