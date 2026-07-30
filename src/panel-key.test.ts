import { describe, it, expect } from 'vitest';
import { panelKey } from './panel-key';

const uri = (value: string) => ({ toString: () => value });

describe('panelKey', () => {
  it('is stable for the same comparison', () => {
    const source = { uri: uri('file:///repo/notes.md'), ref: 'HEAD', fence: 1 };

    expect(panelKey(source)).toBe(panelKey({ ...source }));
  });

  it('separates comparisons that differ by file, ref, or fence', () => {
    const base = { uri: uri('file:///repo/notes.md'), ref: 'HEAD', fence: 0 };
    const keys = new Set([
      panelKey(base),
      panelKey({ ...base, uri: uri('file:///repo/other.md') }),
      panelKey({ ...base, ref: 'v1.0.0' }),
      panelKey({ ...base, fence: 1 }),
    ]);

    expect(keys.size).toBe(4);
  });

  it('separates a whole-file comparison from the first fence of a Markdown file', () => {
    // `.mmd` files carry no fence at all. If undefined collapsed onto 0, a diagram file and the
    // first block of a Markdown file could share a panel.
    const base = { uri: uri('file:///repo/diagram.mmd'), ref: 'HEAD' };

    expect(panelKey(base)).not.toBe(panelKey({ ...base, fence: 0 }));
  });

  it('does not let the boundary between the file and the ref move', () => {
    // The ref is whatever the user typed into showInputBox; git would reject one containing a
    // space, but panelKey sees the string first. Plain concatenation lets the same characters
    // split two ways, so these two distinct comparisons would quietly share a panel.
    const a = panelKey({ uri: uri('file:///repo/a'), ref: 'b c', fence: 0 });
    const b = panelKey({ uri: uri('file:///repo/a b'), ref: 'c', fence: 0 });

    expect(a).not.toBe(b);
  });

  it('is case-sensitive about the ref, since git is', () => {
    const base = { uri: uri('file:///repo/notes.md'), fence: 0 };

    expect(panelKey({ ...base, ref: 'Main' })).not.toBe(panelKey({ ...base, ref: 'main' }));
  });
});
