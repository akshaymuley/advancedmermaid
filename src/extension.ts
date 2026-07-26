import * as vscode from 'vscode';
import * as path from 'path';
import { getGitContent, GitFailureError } from './git';
import { describeGitFailure } from './git-errors';
import { ComparePanel, Side, workingTreeSide } from './comparePanel';
import { isMermaidFile } from './mermaid-file';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidCompare.compareWithHead', (arg?: unknown) =>
      compareWithRef(context, toUri(arg), 'HEAD')
    ),
    vscode.commands.registerCommand('mermaidCompare.compareWithRef', async (arg?: unknown) => {
      const ref = await vscode.window.showInputBox({
        prompt: 'Git ref to compare against (branch, tag, or commit)',
        value: 'HEAD',
      });
      if (ref) {
        await compareWithRef(context, toUri(arg), ref);
      }
    })
  );
}

export function deactivate(): void {}

/** Commands can receive a Uri (editor title), a SourceControlResourceState (SCM view), or nothing (palette). */
function toUri(arg: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) {
    return arg;
  }
  if (arg && typeof arg === 'object' && 'resourceUri' in arg) {
    return (arg as { resourceUri: vscode.Uri }).resourceUri;
  }
  return vscode.window.activeTextEditor?.document.uri;
}

/**
 * The ref side of the comparison. A file that doesn't exist at the ref is not a failure —
 * it means the diagram is new, and empty-vs-diagram is exactly the comparison to show.
 */
async function loadRefSide(uri: vscode.Uri, ref: string): Promise<Side> {
  try {
    return { label: ref, content: await getGitContent(uri, ref) };
  } catch (err) {
    if (err instanceof GitFailureError && err.failure.kind === 'pathNotInRef') {
      return { label: `${ref} (not present)`, content: '' };
    }
    throw err;
  }
}

async function compareWithRef(
  context: vscode.ExtensionContext,
  uri: vscode.Uri | undefined,
  ref: string
): Promise<void> {
  if (!uri) {
    vscode.window.showErrorMessage('Mermaid Compare: no file selected.');
    return;
  }

  // The menu `when` clauses gate on resourceExtname, but the command palette bypasses them.
  if (!isMermaidFile(uri)) {
    vscode.window.showErrorMessage(
      `Mermaid Compare: ${path.basename(uri.fsPath)} is not a Mermaid file (.mmd or .mermaid).`
    );
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const loadLeft = (): Promise<Side> => loadRefSide(uri, ref);

  let left: Side;
  try {
    left = await loadLeft();
  } catch (err) {
    vscode.window.showErrorMessage(
      err instanceof GitFailureError
        ? `Mermaid Compare: ${describeGitFailure(err.failure)}`
        : `Mermaid Compare: could not read "${ref}" version of ${path.basename(uri.fsPath)}. ${
            err instanceof Error ? err.message : String(err)
          }`
    );
    return;
  }

  ComparePanel.show(
    context.extensionUri,
    { uri, ref, title: path.basename(uri.fsPath), left, right: workingTreeSide(document) },
    loadLeft
  );
}
