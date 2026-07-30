import { describe, it, expect } from 'vitest';
import { orderRefs, RefType } from './ref-list';

const local = (name: string) => ({ name, type: RefType.Head });
const remote = (name: string) => ({ name, type: RefType.RemoteHead, remote: name.split('/')[0] });
const tag = (name: string) => ({ name, type: RefType.Tag });

describe('orderRefs', () => {
  it('puts local branches first, then tags, then remotes', () => {
    const ordered = orderRefs([remote('origin/main'), tag('v1.0.0'), local('main')]);

    expect(ordered).toEqual([
      { name: 'main', kind: 'branch' },
      { name: 'v1.0.0', kind: 'tag' },
      { name: 'origin/main', kind: 'remote' },
    ]);
  });

  it('keeps the repository order within each group', () => {
    const ordered = orderRefs([local('zebra'), local('alpha'), local('middle')]);

    expect(ordered.map((ref) => ref.name)).toEqual(['zebra', 'alpha', 'middle']);
  });

  it('drops refs with no name', () => {
    // A detached HEAD comes back as a ref with a commit but no name; it can't be picked.
    expect(orderRefs([{ type: RefType.Head }, local('main')])).toEqual([
      { name: 'main', kind: 'branch' },
    ]);
  });

  it('keeps only the first ref of a given name', () => {
    expect(orderRefs([local('main'), local('main')])).toHaveLength(1);
  });

  it('does not confuse a tag with a branch of the same name', () => {
    // git allows both; they are different refs and both should be offerable.
    const ordered = orderRefs([local('release'), tag('release')]);

    expect(ordered).toHaveLength(2);
  });

  it('ignores ref types it does not know', () => {
    expect(orderRefs([{ name: 'odd', type: 99 }, local('main')])).toEqual([
      { name: 'main', kind: 'branch' },
    ]);
  });

  it('returns nothing for a repository with no refs', () => {
    expect(orderRefs([])).toEqual([]);
  });
});
