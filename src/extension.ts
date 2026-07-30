import * as vscode from 'vscode';
import * as path from 'path';
import { getGitContent, GitFailureError, listRefs } from './git';
import { describeGitFailure } from './git-errors';
import { ComparePanel, Side, workingTreeSide } from './comparePanel';
import { selectDiagram } from './diagram-selection';
import { classifySource, SourceKind } from './mermaid-file';
import { Fence, findMermaidFences } from './mermaid-fences';
import { panelTitle } from './panel-title';
import { orderRefs, RefChoice } from './ref-list';
import type { SideSource, SideSources } from './side-source';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidCompare.compareWithHead', (arg?: unknown) =>
      compare(context.extensionUri, toUri(arg), againstWorkingTree('HEAD'))
    ),
    vscode.commands.registerCommand('mermaidCompare.compareWithRef', async (arg?: unknown) => {
      const ref = await vscode.window.showInputBox({
        prompt: 'Git ref to compare against (branch, tag, or commit)',
        value: 'HEAD',
      });
      if (ref) {
        await compare(context.extensionUri, toUri(arg), againstWorkingTree(ref));
      }
    }),
    vscode.commands.registerCommand('mermaidCompare.compareBetweenRefs', async (arg?: unknown) => {
      const uri = toUri(arg);
      if (!uri) {
        vscode.window.showErrorMessage('Mermaid Compare: no file selected.');
        return;
      }

      const left = await pickRef(uri, 'Compare from (the older side)');
      if (!left) {
        return; // Cancelled.
      }
      const right = await pickRef(uri, `Compare ${left} to`);
      if (!right) {
        return;
      }

      await compare(context.extensionUri, uri, {
        left: { kind: 'ref', ref: left },
        right: { kind: 'ref', ref: right },
      });
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

const REF_KIND_LABEL: Record<RefChoice['kind'], string> = {
  branch: 'branch',
  tag: 'tag',
  remote: 'remote',
};

const ENTER_MANUALLY = 'Enter a ref manually…';

/**
 * One of the repository's refs, or whatever the user types. Falls back to a plain input box if
 * the refs can't be read at all — a comparison shouldn't be blocked by a listing failure.
 */
export async function pickRef(uri: vscode.Uri, title: string): Promise<string | undefined> {
  let choices: RefChoice[] = [];
  try {
    choices = orderRefs(await listRefs(uri));
  } catch {
    return vscode.window.showInputBox({ prompt: title, value: 'HEAD' });
  }

  const picked = await vscode.window.showQuickPick(
    [
      ...choices.map((choice) => ({ label: choice.name, description: REF_KIND_LABEL[choice.kind] })),
      { label: ENTER_MANUALLY, description: 'a commit hash, HEAD~2, …' },
    ],
    { title, placeHolder: 'Select a branch, tag, or commit' }
  );

  if (!picked) {
    return undefined;
  }
  return picked.label === ENTER_MANUALLY
    ? vscode.window.showInputBox({ prompt: title, value: 'HEAD' })
    : picked.label;
}

/** Working tree against a ref — the everyday comparison. */
const againstWorkingTree = (ref: string): SideSources => ({
  left: { kind: 'ref', ref },
  right: { kind: 'workingTree' },
});

/**
 * Renders one comparison. Takes `extensionUri` rather than the whole extension context: it is all
 * that's needed, and it lets the integration tests drive a ref-to-ref comparison directly, which
 * the command itself can't offer them because it collects its two refs from QuickPicks.
 */
export async function compare(
  extensionUri: vscode.Uri,
  uri: vscode.Uri | undefined,
  sources: SideSources
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
  let fenceInfo: { index: number; total: number } | undefined;
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
    fenceInfo = { index: fence, total: fences.length };
  }

  const loadSide = (source: SideSource): Promise<Side> =>
    source.kind === 'workingTree'
      ? Promise.resolve(workingTreeSide(document, fence))
      : loadRefSide(uri, source.ref, kind, fence);

  let left: Side;
  let right: Side;
  try {
    [left, right] = await Promise.all([loadSide(sources.left), loadSide(sources.right)]);
  } catch (err) {
    vscode.window.showErrorMessage(
      err instanceof GitFailureError
        ? `Mermaid Compare: ${describeGitFailure(err.failure)}`
        : `Mermaid Compare: could not read ${name}. ${
            err instanceof Error ? err.message : String(err)
          }`
    );
    return;
  }

  ComparePanel.show(
    extensionUri,
    { uri, sources, title: panelTitle({ name, sources, fence: fenceInfo }), fence, left, right },
    loadSide
  );
}
