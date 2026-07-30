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

/** The repository containing `uri`, or a classified failure explaining why there isn't one. */
async function repositoryFor(uri: vscode.Uri): Promise<GitRepository> {
  const gitExtension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
  if (!gitExtension) {
    throw new GitFailureError({ kind: 'noGitExtension' });
  }
  const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();

  const repository = exports.getAPI(1).getRepository(uri);
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
