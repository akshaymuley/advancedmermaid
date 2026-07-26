import * as vscode from 'vscode';
import * as path from 'path';
import { classifyGitFailure, GitFailure } from './git-errors';

/** Minimal typings for the built-in vscode.git extension API. */
interface GitRepository {
  show(ref: string, path: string): Promise<string>;
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

/** Returns the content of `uri` at the given git ref via the built-in git extension. */
export async function getGitContent(uri: vscode.Uri, ref: string): Promise<string> {
  const gitExtension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
  if (!gitExtension) {
    throw new GitFailureError({ kind: 'noGitExtension' });
  }
  const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
  const git = exports.getAPI(1);

  const repository = git.getRepository(uri);
  if (!repository) {
    throw new GitFailureError({ kind: 'notARepository' });
  }

  try {
    return await repository.show(ref, uri.fsPath);
  } catch (err) {
    throw new GitFailureError(
      classifyGitFailure(err, { ref, file: path.basename(uri.fsPath) })
    );
  }
}
