import * as vscode from 'vscode';
import * as path from 'path';
import { classifyGitFailure, GitFailure } from './git-errors';
import type { RawRef } from './ref-list';

/** Minimal typings for the built-in vscode.git extension API. */
interface GitRepository {
  show(ref: string, path: string): Promise<string>;
  /**
   * Note `state.refs` is empty in a freshly opened window — verified against a running extension
   * host — so refs have to be asked for rather than read off the cached state.
   */
  getRefs(query: Record<string, never>): Promise<RawRef[]>;
}
interface GitApi {
  getRepository(uri: vscode.Uri): GitRepository | null;
  /** `uninitialized` until the extension has finished scanning the workspace for repositories. */
  state: 'uninitialized' | 'initialized';
  onDidChangeState(listener: (state: string) => void): { dispose(): void };
}
interface GitExtensionExports {
  getAPI(version: 1): GitApi;
}

/** Everything `getGitContent` rejects with, so callers switch on `failure.kind`. */
export class GitFailureError extends Error {
  constructor(readonly failure: GitFailure) {
    super(failure.kind);
    this.name = 'GitFailureError';
  }
}

/**
 * How long to wait for the git extension to finish finding the workspace's repositories before
 * concluding there isn't one. Generous: the cost of waiting too long is a slow error, while the
 * cost of not waiting is claiming a tracked file isn't in a repository.
 */
const DISCOVERY_TIMEOUT_MS = 30_000;

/**
 * Resolves once the git extension has finished its initial scan — or once the timeout is up,
 * because a comparison should fail with a message rather than hang forever.
 */
function whenInitialized(api: GitApi): Promise<void> {
  if (api.state === 'initialized') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      subscription.dispose();
      resolve();
    };
    const timer = setTimeout(done, DISCOVERY_TIMEOUT_MS);
    const subscription = api.onDidChangeState((state) => {
      if (state === 'initialized') {
        done();
      }
    });
  });
}

/**
 * The repository containing `uri`, or a classified failure explaining why there isn't one.
 *
 * `getRepository` answers from whatever the extension has discovered *so far*, and discovery is
 * asynchronous: for a short window after a window opens, a plainly tracked file reports no
 * repository at all. So a miss is only believed once the extension says it has finished looking —
 * otherwise "Compare with HEAD" run too eagerly after startup fails with "not a git repository",
 * which is both wrong and self-correcting a second later, the worst kind of error to debug.
 */
async function repositoryFor(uri: vscode.Uri): Promise<GitRepository> {
  const gitExtension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
  if (!gitExtension) {
    throw new GitFailureError({ kind: 'noGitExtension' });
  }
  const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
  const api = exports.getAPI(1);

  let repository = api.getRepository(uri);
  if (!repository) {
    await whenInitialized(api);
    repository = api.getRepository(uri);
  }

  if (!repository) {
    throw new GitFailureError({ kind: 'notARepository' });
  }
  return repository;
}

/** Every branch and tag in the repository containing `uri`, for the ref pickers. */
export async function listRefs(uri: vscode.Uri): Promise<RawRef[]> {
  return (await repositoryFor(uri)).getRefs({});
}

/** Returns the content of `uri` at the given git ref via the built-in git extension. */
export async function getGitContent(uri: vscode.Uri, ref: string): Promise<string> {
  const repository = await repositoryFor(uri);

  try {
    return await repository.show(ref, uri.fsPath);
  } catch (err) {
    throw new GitFailureError(
      classifyGitFailure(err, { ref, file: path.basename(uri.fsPath) })
    );
  }
}
