import * as vscode from 'vscode';
import * as path from 'path';
import { getGitContent } from './git';
import { ComparePanel } from './comparePanel';

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

async function compareWithRef(
  context: vscode.ExtensionContext,
  uri: vscode.Uri | undefined,
  ref: string
): Promise<void> {
  if (!uri) {
    vscode.window.showErrorMessage('Mermaid Compare: no file selected.');
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const current = document.getText();

  let old: string;
  try {
    old = await getGitContent(uri, ref);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Mermaid Compare: could not read "${ref}" version of ${path.basename(uri.fsPath)}. ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return;
  }

  ComparePanel.show(context.extensionUri, {
    title: path.basename(uri.fsPath),
    left: { label: ref, content: old },
    right: { label: document.isDirty ? 'Editor (unsaved)' : 'Working Tree', content: current },
  });
}
