import * as vscode from 'vscode';
import { getGitContent, GitFailureError, listRefs } from './git';
import { describeGitFailure } from './git-errors';
import { ComparePanel, PanelTarget, PanelTargets, Side, workingTreeSide } from './comparePanel';
import { selectDiagram } from './diagram-selection';
import { excludeGlob, orderCompareFiles } from './file-list';
import { classifySource } from './mermaid-file';
import { Fence, findMermaidFences } from './mermaid-fences';
import { fileLabels, panelTitle, TitleSide } from './panel-title';
import { orderRefs, RefChoice } from './ref-list';
import type { SideSource } from './side-source';

/** One side before its file has been read: which file, and which version of it. */
export interface SideRequest {
  uri: vscode.Uri;
  source: SideSource;
}

/** Exported alongside `compare` so the integration tests can build a side without a QuickPick. */
export const fromTree = (uri: vscode.Uri): SideRequest => ({ uri, source: { kind: 'workingTree' } });
export const fromRef = (uri: vscode.Uri, ref: string): SideRequest => ({
  uri,
  source: { kind: 'ref', ref },
});

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('mermaidCompare.compareWithHead', (arg?: unknown) => {
      const uri = activeUri(arg);
      return uri && compare(context.extensionUri, fromRef(uri, 'HEAD'), fromTree(uri));
    }),
    vscode.commands.registerCommand('mermaidCompare.compareWithRef', async (arg?: unknown) => {
      const uri = activeUri(arg);
      if (!uri) {
        return;
      }

      const chosen = await vscode.window.showInputBox({
        prompt: 'Git ref to compare against (branch, tag, or commit)',
        value: 'HEAD',
      });
      if (chosen) {
        await compare(context.extensionUri, fromRef(uri, chosen), fromTree(uri));
      }
    }),
    vscode.commands.registerCommand('mermaidCompare.compareBetweenRefs', async (arg?: unknown) => {
      const uri = activeUri(arg);
      if (!uri) {
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

      await compare(context.extensionUri, fromRef(uri, left), fromRef(uri, right));
    }),
    vscode.commands.registerCommand('mermaidCompare.compareWithFile', async (arg?: unknown) => {
      const uri = activeUri(arg);
      if (!uri) {
        return;
      }

      const other = await pickCompareFile(uri);
      if (!other) {
        return; // Cancelled.
      }

      // The picked file goes left, matching the convention that the other version is the older
      // one — as HEAD is when comparing against the working tree.
      await compare(context.extensionUri, fromTree(other), fromTree(uri));
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
 * The file's name alone — what messages and tab titles say. Split by hand, as in
 * `mermaid-file.ts`: the extension meets both path separators whatever platform it runs on.
 */
const basename = (uri: vscode.Uri): string => uri.fsPath.split(/[\\/]/).pop() ?? uri.fsPath;

/** The file a command was invoked on, complaining once if there isn't one. */
function activeUri(arg: unknown): vscode.Uri | undefined {
  const uri = toUri(arg);
  if (!uri) {
    vscode.window.showErrorMessage('Mermaid Compare: no file selected.');
  }
  return uri;
}

/**
 * The ref side of the comparison. A file that doesn't exist at the ref is not a failure —
 * it means the diagram is new, and empty-vs-diagram is exactly the comparison to show. The same
 * goes for a Markdown file that simply had fewer diagrams back then.
 */
async function loadRefSide(target: PanelTarget, ref: string): Promise<Side> {
  try {
    const text = await getGitContent(target.uri, ref);
    const { content, missing } = selectDiagram(text, target.kind, target.fence);
    return { label: missing ? `${ref} (no diagram ${(target.fence ?? 0) + 1})` : ref, content };
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
export async function pickFence(fences: Fence[], title = 'Which diagram?'): Promise<number | undefined> {
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
    { title, placeHolder: 'Select a mermaid block to compare' }
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

const COMPARABLE_GLOB = '**/*.{mmd,mermaid,md,markdown}';
const BROWSE = 'Open a file…';

/** What the Search view hides, so the picker hides it too. */
const hidden = (section: string): Record<string, boolean> =>
  vscode.workspace.getConfiguration(section).get<Record<string, boolean>>('exclude') ?? {};

/**
 * The other file to compare against: one from the workspace, or anything on disk.
 *
 * The workspace list is capped — past a few hundred entries a QuickPick is no longer how anyone
 * would find their file — and Browse is always there for what isn't in the workspace at all.
 */
export async function pickCompareFile(active: vscode.Uri): Promise<vscode.Uri | undefined> {
  const open = vscode.workspace.textDocuments
    .map((document) => document.uri)
    .filter((uri) => uri.scheme === 'file' && classifySource(uri));
  const found = await vscode.workspace.findFiles(
    COMPARABLE_GLOB,
    excludeGlob(hidden('files'), hidden('search')),
    500
  );

  const picked = await vscode.window.showQuickPick(
    [
      ...orderCompareFiles(active, open, found).map((choice) => ({
        label: vscode.workspace.asRelativePath(choice.uri),
        description: choice.open ? 'open' : undefined,
        uri: choice.uri,
      })),
      { label: BROWSE, description: 'a file outside the workspace', uri: undefined },
    ],
    { title: 'Compare against which file?', placeHolder: 'Select a Mermaid or Markdown file' }
  );

  if (!picked) {
    return undefined;
  }
  if (picked.label !== BROWSE) {
    return picked.uri;
  }

  const browsed = await vscode.window.showOpenDialog({
    title: 'Compare against which file?',
    canSelectMany: false,
    filters: { 'Mermaid diagrams': ['mmd', 'mermaid', 'md', 'markdown'] },
  });
  return browsed?.[0];
}

/** A side with its file read far enough to know which diagram it holds. */
interface ResolvedSide {
  target: PanelTarget;
  /** How many diagrams the file holds, which decides whether the title names one. */
  fenceCount: number;
}

interface ResolvedSides {
  left: ResolvedSide;
  right: ResolvedSide;
}

/**
 * Turns one requested side into a target: what kind of file it is, and which diagram within it.
 * Returns undefined when the file can't be compared or the user cancels the diagram pick — both
 * having already been reported.
 */
async function resolveSide({ uri, source }: SideRequest): Promise<ResolvedSide | undefined> {
  const name = basename(uri);

  // The menu `when` clauses gate on resourceExtname, but the command palette bypasses them, and
  // Browse can reach anything at all.
  const kind = classifySource(uri);
  if (!kind) {
    vscode.window.showErrorMessage(
      `Mermaid Compare: ${name} is not a Mermaid file (.mmd, .mermaid, .md or .markdown).`
    );
    return undefined;
  }

  if (kind === 'mermaid') {
    return { target: { uri, kind, source }, fenceCount: 1 };
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const fences = findMermaidFences(document.getText());
  if (fences.length === 0) {
    vscode.window.showErrorMessage(`Mermaid Compare: ${name} contains no \`\`\`mermaid blocks.`);
    return undefined;
  }

  const fence = await pickFence(fences, `Which diagram in ${name}?`);
  if (fence === undefined) {
    return undefined; // Cancelled.
  }
  return { target: { uri, kind, fence, source }, fenceCount: fences.length };
}

/**
 * Both sides, resolved.
 *
 * One file compared against itself resolves once and shares the answer: it is the same file, so
 * asking which diagram twice would be asking the same question twice. Two different files each
 * number their own diagrams, so each is asked separately.
 */
async function resolveSides(
  left: SideRequest,
  right: SideRequest
): Promise<ResolvedSides | undefined> {
  const one = await resolveSide(left);
  if (!one) {
    return undefined;
  }

  if (left.uri.toString() === right.uri.toString()) {
    return { left: one, right: { ...one, target: { ...one.target, source: right.source } } };
  }

  const two = await resolveSide(right);
  return two && { left: one, right: two };
}

/**
 * Renders one comparison. Takes `extensionUri` rather than the whole extension context: it is all
 * that's needed, and it lets the integration tests drive a comparison directly, which the
 * commands themselves can't offer them because they collect their sides from QuickPicks.
 */
export async function compare(
  extensionUri: vscode.Uri,
  leftRequest: SideRequest,
  rightRequest: SideRequest
): Promise<void> {
  const resolved = await resolveSides(leftRequest, rightRequest);
  if (!resolved) {
    return;
  }

  const targets: PanelTargets = { left: resolved.left.target, right: resolved.right.target };

  // Two files: a pane header reading "Working Tree" on both sides would say nothing about which
  // file it is showing. One file needs no such prefix — the header already names it.
  const labels = fileLabels(targets.left.uri.fsPath, targets.right.uri.fsPath);
  const prefix = (target: PanelTarget): string =>
    targets.left.uri.toString() === targets.right.uri.toString()
      ? ''
      : `${target === targets.left ? labels.left : labels.right} — `;

  const loadSide = async (target: PanelTarget): Promise<Side> => {
    const side =
      target.source.kind === 'workingTree'
        ? workingTreeSide(await vscode.workspace.openTextDocument(target.uri), target.fence)
        : await loadRefSide(target, target.source.ref);

    return { ...side, label: `${prefix(target)}${side.label}` };
  };

  let left: Side;
  let right: Side;
  try {
    [left, right] = await Promise.all([loadSide(targets.left), loadSide(targets.right)]);
  } catch (err) {
    vscode.window.showErrorMessage(
      err instanceof GitFailureError
        ? `Mermaid Compare: ${describeGitFailure(err.failure)}`
        : `Mermaid Compare: could not read ${describeFiles(targets)}. ${
            err instanceof Error ? err.message : String(err)
          }`
    );
    return;
  }

  ComparePanel.show(
    extensionUri,
    { targets, title: title(resolved, labels), left, right },
    loadSide
  );
}

const describeFiles = ({ left, right }: PanelTargets): string =>
  left.uri.toString() === right.uri.toString()
    ? basename(left.uri)
    : `${basename(left.uri)} or ${basename(right.uri)}`;

/** The tab title, with each side named just precisely enough to tell it from the other. */
function title(resolved: ResolvedSides, labels: { left: string; right: string }): string {
  const side = (which: 'left' | 'right'): TitleSide => {
    const { target, fenceCount } = resolved[which];
    return {
      name: labels[which],
      source: target.source,
      fence: target.fence === undefined ? undefined : { index: target.fence, total: fenceCount },
    };
  };

  return panelTitle({ left: side('left'), right: side('right') });
}
