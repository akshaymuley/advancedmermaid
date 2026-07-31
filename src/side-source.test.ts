import { describe, it, expect } from 'vitest';
import { tracksDocument, type SideTarget } from './side-source';

const target = (path: string, source: SideTarget['source']): SideTarget => ({
  uri: { toString: () => `file:///repo/${path}`, fsPath: `/repo/${path}` },
  kind: path.endsWith('.md') ? 'markdown' : 'mermaid',
  source,
});

const tree = (path: string) => target(path, { kind: 'workingTree' });
const at = (path: string, ref: string) => target(path, { kind: 'ref', ref });

describe('tracksDocument', () => {
  it('tracks the file a working-tree pane is showing', () => {
    const targets = { left: at('diagram.mmd', 'HEAD'), right: tree('diagram.mmd') };

    expect(tracksDocument(targets, 'file:///repo/diagram.mmd')).toBe(true);
  });

  it('tracks either side, whichever holds the working tree', () => {
    const targets = { left: tree('diagram.mmd'), right: at('diagram.mmd', 'HEAD') };

    expect(tracksDocument(targets, 'file:///repo/diagram.mmd')).toBe(true);
  });

  it('tracks both files of a two-file comparison', () => {
    const targets = { left: tree('old.md'), right: tree('new.mmd') };

    expect(tracksDocument(targets, 'file:///repo/old.md')).toBe(true);
    expect(tracksDocument(targets, 'file:///repo/new.mmd')).toBe(true);
  });

  it('ignores a document neither pane is showing', () => {
    const targets = { left: at('diagram.mmd', 'HEAD'), right: tree('diagram.mmd') };

    expect(tracksDocument(targets, 'file:///repo/elsewhere.mmd')).toBe(false);
  });

  it('ignores edits to the file behind a comparison between two refs', () => {
    // A fixed pair of commits. Editing the file says nothing about either side, so reacting
    // would re-render the panel under the user for no reason.
    const targets = { left: at('diagram.mmd', 'v1.0.0'), right: at('diagram.mmd', 'main') };

    expect(tracksDocument(targets, 'file:///repo/diagram.mmd')).toBe(false);
  });

  it('ignores edits even when both refs are HEAD', () => {
    // HEAD is still a commit, not the working tree.
    const targets = { left: at('diagram.mmd', 'HEAD'), right: at('diagram.mmd', 'HEAD') };

    expect(tracksDocument(targets, 'file:///repo/diagram.mmd')).toBe(false);
  });

  it('tracks only the working-tree side when the other ref pane shows a different file', () => {
    const targets = { left: at('old.md', 'v1.0.0'), right: tree('new.mmd') };

    expect(tracksDocument(targets, 'file:///repo/new.mmd')).toBe(true);
    expect(tracksDocument(targets, 'file:///repo/old.md')).toBe(false);
  });
});
