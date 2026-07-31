import { describe, it, expect } from 'vitest';
import { panelKey } from './panel-key';
import type { SideSource, SideTarget, SideTargets } from './side-source';

const target = (path: string, source: SideSource, fence?: number): SideTarget => ({
  uri: { toString: () => `file:///repo/${path}`, fsPath: `/repo/${path}` },
  kind: path.endsWith('.md') ? 'markdown' : 'mermaid',
  fence,
  source,
});

const tree = (path: string, fence?: number) => target(path, { kind: 'workingTree' }, fence);
const at = (path: string, ref: string, fence?: number) =>
  target(path, { kind: 'ref', ref }, fence);

/** One file against a ref — the everyday comparison. */
const vsWorkingTree = (path: string, ref: string, fence?: number): SideTargets => ({
  left: at(path, ref, fence),
  right: tree(path, fence),
});

describe('panelKey', () => {
  it('is stable for the same comparison', () => {
    expect(panelKey(vsWorkingTree('notes.md', 'HEAD', 1))).toBe(
      panelKey(vsWorkingTree('notes.md', 'HEAD', 1))
    );
  });

  it('separates comparisons that differ by file, ref, or fence', () => {
    const keys = new Set([
      panelKey(vsWorkingTree('notes.md', 'HEAD', 0)),
      panelKey(vsWorkingTree('other.md', 'HEAD', 0)),
      panelKey(vsWorkingTree('notes.md', 'v1.0.0', 0)),
      panelKey(vsWorkingTree('notes.md', 'HEAD', 1)),
    ]);

    expect(keys.size).toBe(4);
  });

  it('separates a whole-file comparison from the first fence of a Markdown file', () => {
    // `.mmd` files carry no fence at all. If undefined collapsed onto 0, a diagram file and the
    // first block of a Markdown file could share a panel.
    expect(panelKey(vsWorkingTree('diagram.mmd', 'HEAD'))).not.toBe(
      panelKey(vsWorkingTree('diagram.mmd', 'HEAD', 0))
    );
  });

  it('tells the two directions of a ref-to-ref comparison apart', () => {
    // old↔new and new↔old put different diagrams on the left, so they are different panels.
    expect(panelKey({ left: at('a.mmd', 'v1.0.0'), right: at('a.mmd', 'main') })).not.toBe(
      panelKey({ left: at('a.mmd', 'main'), right: at('a.mmd', 'v1.0.0') })
    );
  });

  it('separates a ref-to-ref comparison from one against the working tree', () => {
    expect(panelKey(vsWorkingTree('a.mmd', 'main'))).not.toBe(
      panelKey({ left: at('a.mmd', 'main'), right: at('a.mmd', 'main') })
    );
  });

  it('separates two-file comparisons from each other and by direction', () => {
    const keys = new Set([
      panelKey({ left: tree('old.md'), right: tree('new.mmd') }),
      panelKey({ left: tree('new.mmd'), right: tree('old.md') }),
      panelKey({ left: tree('older.md'), right: tree('new.mmd') }),
    ]);

    expect(keys.size).toBe(3);
  });

  it("keys each side's fence separately, since two files number their diagrams alone", () => {
    expect(panelKey({ left: tree('old.md', 0), right: tree('new.md', 1) })).not.toBe(
      panelKey({ left: tree('old.md', 1), right: tree('new.md', 1) })
    );
  });

  it('does not let the boundary between the file and the ref move', () => {
    // The ref is whatever the user typed; git would reject one containing a space, but panelKey
    // sees the string first. Plain concatenation lets the same characters split two ways, so
    // these two distinct comparisons would quietly share a panel.
    expect(panelKey(vsWorkingTree('a', 'b c', 0))).not.toBe(panelKey(vsWorkingTree('a b', 'c', 0)));
  });

  it('is case-sensitive about the ref, since git is', () => {
    expect(panelKey(vsWorkingTree('notes.md', 'Main', 0))).not.toBe(
      panelKey(vsWorkingTree('notes.md', 'main', 0))
    );
  });
});
