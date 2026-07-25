import * as vscode from 'vscode';

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

/** Returns the content of `uri` at the given git ref via the built-in git extension. */
export async function getGitContent(uri: vscode.Uri, ref: string): Promise<string> {
  const gitExtension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
  if (!gitExtension) {
    throw new Error('The built-in Git extension is not available.');
  }
  const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
  const git = exports.getAPI(1);

  const repository = git.getRepository(uri);
  if (!repository) {
    throw new Error('File is not inside a git repository.');
  }

  return repository.show(ref, uri.fsPath);
}
