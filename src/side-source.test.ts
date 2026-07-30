import { describe, it, expect } from 'vitest';
import { followsEditor } from './side-source';

const tree = { kind: 'workingTree' } as const;
const ref = (name: string) => ({ kind: 'ref', ref: name }) as const;

describe('followsEditor', () => {
  it('follows the editor when a pane shows the working tree', () => {
    expect(followsEditor({ left: ref('HEAD'), right: tree })).toBe(true);
    expect(followsEditor({ left: tree, right: ref('HEAD') })).toBe(true);
  });

  it('does not follow the editor for a comparison between two refs', () => {
    // A fixed pair of commits. Editing the file says nothing about either side.
    expect(followsEditor({ left: ref('v1.0.0'), right: ref('main') })).toBe(false);
  });

  it('does not follow the editor even when both refs are HEAD', () => {
    // HEAD is still a commit, not the working tree.
    expect(followsEditor({ left: ref('HEAD'), right: ref('HEAD') })).toBe(false);
  });
});
