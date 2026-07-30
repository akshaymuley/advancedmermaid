import * as vscode from 'vscode';
import * as path from 'path';
import { getGitContent, GitFailureError } from './git';
import { describeGitFailure } from './git-errors';
import { ComparePanel, Side, workingTreeSide } from './comparePanel';
import { selectDiagram } from './diagram-selection';
import { classifySource, SourceKind } from './mermaid-file';
import { Fence, findMermaidFences } from './mermaid-fences';

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
 * it means the diagram is new, and empty-vs-diagram is exactly the comparison to show. The same
 * goes for a Markdown file that simply had fewer diagrams back then.
 */
async function loadRefSide(
  uri: vscode.Uri,
  ref: string,
  kind: SourceKind,
  fence?: number
): Promise<Side> {
  try {
    const text = await getGitContent(uri, ref);
    const { content, missing } = selectDiagram(text, kind, fence);
    return { label: missing ? `${ref} (no diagram ${(fence ?? 0) + 1})` : ref, content };
  } catch (err) {
    if (err instanceof GitFailureError && err.failure.kind === 'pathNotInRef') {
      return { label: `${ref} (not present)`, content: '' };
    }
    throw err;
  }
}

/**
 * Which diagram to compare. One fence is unambiguous; several need the user. Cancelling the pick
 * aborts silently, matching how an empty ref from `showInputBox` does.
 */
export async function pickFence(fences: Fence[]): Promise<number | undefined> {
  if (fences.length === 1) {
    return 0;
  }

  const picked = await vscode.window.showQuickPick(
    fences.map((fence) => ({
      label: fence.heading ?? `Diagram ${fence.index + 1}`,
      description: `line ${fence.line + 1}`,
      detail: fence.content.split('\n').find((line) => line.trim() !== '') ?? '(empty)',
      index: fence.index,
    })),
    { title: 'Which diagram?', placeHolder: 'Select a mermaid block to compare' }
  );

  return picked?.index;
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

  const name = path.basename(uri.fsPath);

  // The menu `when` clauses gate on resourceExtname, but the command palette bypasses them.
  const kind = classifySource(uri);
  if (!kind) {
    vscode.window.showErrorMessage(
      `Mermaid Compare: ${name} is not a Mermaid file (.mmd, .mermaid, .md or .markdown).`
    );
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);

  let fence: number | undefined;
  let title = name;
  if (kind === 'markdown') {
    const fences = findMermaidFences(document.getText());
    if (fences.length === 0) {
      vscode.window.showErrorMessage(`Mermaid Compare: ${name} contains no \`\`\`mermaid blocks.`);
      return;
    }

    fence = await pickFence(fences);
    if (fence === undefined) {
      return; // Cancelled.
    }
    if (fences.length > 1) {
      title = `${name} — diagram ${fence + 1} of ${fences.length}`;
    }
  }

  const loadLeft = (): Promise<Side> => loadRefSide(uri, ref, kind, fence);

  let left: Side;
  try {
    left = await loadLeft();
  } catch (err) {
    vscode.window.showErrorMessage(
      err instanceof GitFailureError
        ? `Mermaid Compare: ${describeGitFailure(err.failure)}`
        : `Mermaid Compare: could not read "${ref}" version of ${name}. ${
            err instanceof Error ? err.message : String(err)
          }`
    );
    return;
  }

  ComparePanel.show(
    context.extensionUri,
    { uri, ref, title, fence, left, right: workingTreeSide(document, fence) },
    loadLeft
  );
}
