import { describe, it, expect, vi, afterEach } from 'vitest';
import { extensions, Uri } from 'vscode';
import { GitFailureError, listRefs } from './git';

const FILE = Uri.file('/repo/diagram.mmd');
const REFS = [{ name: 'main', type: 0 }];

interface FakeOptions {
  /** Repositories the API can find, by the order it is asked. `null` means "not found yet". */
  repositories: (object | null)[];
  state?: 'uninitialized' | 'initialized';
  /** Whether becoming initialized is ever announced. False models a scan that never finishes. */
  announces?: boolean;
  isActive?: boolean;
}

/**
 * Stands in for the built-in `vscode.git` extension. The interesting axis is *when* the
 * repository becomes findable, which is what `repositories` sequences.
 */
function fakeGit(options: FakeOptions) {
  const { repositories, state = 'initialized', announces = true, isActive = true } = options;
  let asked = 0;
  const listeners: ((state: string) => void)[] = [];

  const api = {
    state,
    onDidChangeState(listener: (state: string) => void) {
      listeners.push(listener);
      // Announce asynchronously, as the real extension does when its scan completes.
      if (announces) {
        setTimeout(() => listener('initialized'), 0);
      }
      return { dispose: () => {} };
    },
    getRepository() {
      const found = repositories[Math.min(asked, repositories.length - 1)];
      asked++;
      return found;
    },
  };

  const exports = { getAPI: () => api };
  const activate = vi.fn(async () => exports);

  vi.spyOn(extensions, 'getExtension').mockReturnValue({
    isActive,
    exports: isActive ? exports : undefined,
    activate,
  } as never);

  return { activate, asked: () => asked };
}

const repository = { getRefs: async () => REFS, show: async () => '' };

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('listRefs', () => {
  it('reports a missing git extension rather than throwing something opaque', async () => {
    vi.spyOn(extensions, 'getExtension').mockReturnValue(undefined);

    await expect(listRefs(FILE)).rejects.toMatchObject({ failure: { kind: 'noGitExtension' } });
  });

  it('reads the refs when the repository is already known', async () => {
    fakeGit({ repositories: [repository] });

    expect(await listRefs(FILE)).toEqual(REFS);
  });

  it('activates the git extension when it has not started yet', async () => {
    const git = fakeGit({ repositories: [repository], isActive: false });

    expect(await listRefs(FILE)).toEqual(REFS);
    expect(git.activate).toHaveBeenCalled();
  });

  it('waits for repository discovery instead of reporting "not a repository"', async () => {
    // The flake this exists to kill: right after a window opens, the git extension is still
    // scanning and `getRepository` answers null for a repository that plainly exists.
    const git = fakeGit({ repositories: [null, repository], state: 'uninitialized' });

    expect(await listRefs(FILE)).toEqual(REFS);
    expect(git.asked()).toBe(2);
  });

  it('reports a genuinely untracked file once the scan has finished', async () => {
    const git = fakeGit({ repositories: [null], state: 'uninitialized' });

    await expect(listRefs(FILE)).rejects.toMatchObject({ failure: { kind: 'notARepository' } });
    expect(git.asked()).toBe(2);
  });

  it('does not wait at all once the extension reports itself initialized', async () => {
    // Nothing more is coming, so waiting would just delay the error by the timeout.
    fakeGit({ repositories: [null], state: 'initialized', announces: false });

    await expect(listRefs(FILE)).rejects.toMatchObject({ failure: { kind: 'notARepository' } });
  });

  it('gives up waiting rather than hanging on a scan that never completes', async () => {
    vi.useFakeTimers();
    fakeGit({ repositories: [null], state: 'uninitialized', announces: false });

    const pending = listRefs(FILE);
    const settled = expect(pending).rejects.toMatchObject({ failure: { kind: 'notARepository' } });
    await vi.advanceTimersByTimeAsync(30_000);

    await settled;
  });

  it('surfaces the failure as a GitFailureError, so callers can switch on the kind', async () => {
    vi.spyOn(extensions, 'getExtension').mockReturnValue(undefined);

    await expect(listRefs(FILE)).rejects.toBeInstanceOf(GitFailureError);
  });
});
