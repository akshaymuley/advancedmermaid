import * as vscode from 'vscode';
import { debounce } from './debounce';
import { selectDiagram } from './diagram-selection';
import { classifySource } from './mermaid-file';
import { panelKey } from './panel-key';
import { followsEditor, type SideSource, type SideSources } from './side-source';
import { PANEL_BODY_HTML } from './webview/panel-body';

/** How long to wait after the last keystroke before re-rendering the working-tree pane. */
const REFRESH_DELAY_MS = 300;

export interface Side {
  label: string;
  content: string;
}

export interface CompareData {
  /** The file being compared; tracked so edits to it can refresh the panel. */
  uri: vscode.Uri;
  /** Where each pane's diagram comes from. Either may be the working tree, or neither. */
  sources: SideSources;
  title: string;
  /**
   * Which ```mermaid fence to show, for Markdown sources. Undefined for `.mmd` / `.mermaid`.
   * Held here so a refresh re-reads the same diagram after an edit shifts the line numbers.
   */
  fence?: number;
  left: Side;
  right: Side;
}

/** Re-reads one side. Injected so the panel never has to know about git. */
export type LoadSide = (source: SideSource) => Promise<Side>;

export class ComparePanel {
  /**
   * Open panels by `panelKey`. Re-running the same comparison reveals its panel; a different
   * file, ref, or fence gets its own, so two diagrams from one Markdown file can sit side by
   * side.
   */
  private static readonly open = new Map<string, ComparePanel>();

  private ready = false;
  private disposed = false;
  private pending: CompareData | undefined;
  private data: CompareData;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly scheduleRefresh = debounce(() => void this.refreshWorkingTree(), REFRESH_DELAY_MS);

  static show(extensionUri: vscode.Uri, data: CompareData, loadSide: LoadSide): void {
    const key = panelKey(data);
    const existing = ComparePanel.open.get(key);
    if (existing) {
      existing.update(data, loadSide);
      existing.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'mermaidCompare',
      'Mermaid Compare',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      }
    );
    ComparePanel.open.set(key, new ComparePanel(panel, extensionUri, data, loadSide, key));
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    data: CompareData,
    private loadSide: LoadSide,
    private readonly key: string
  ) {
    this.data = data;
    this.pending = data;
    panel.webview.html = this.getHtml(panel.webview, extensionUri);

    this.disposables.push(
      panel.webview.onDidReceiveMessage((message: { type?: string }) => {
        if (message.type === 'ready') {
          this.ready = true;
          this.flush();
        } else if (message.type === 'refresh') {
          void this.refreshBothSides();
        }
      }),
      // Follow edits to the compared file. Saving flushes immediately; typing is debounced so
      // half-finished diagrams don't re-render on every keystroke.
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (this.tracks(event.document)) {
          this.scheduleRefresh();
        }
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (this.tracks(document)) {
          this.scheduleRefresh.flush();
        }
      })
    );

    panel.onDidDispose(() => {
      this.disposed = true;
      ComparePanel.open.delete(this.key);
      this.scheduleRefresh.cancel();
      this.disposables.forEach((d) => d.dispose());
    });
  }

  /**
   * Whether an edit to this document should refresh this panel. A comparison between two refs is
   * a fixed pair of commits: the file being open and edited says nothing about it, so it stays
   * put rather than re-rendering under the user.
   */
  private tracks(document: vscode.TextDocument): boolean {
    return (
      followsEditor(this.data.sources) && document.uri.toString() === this.data.uri.toString()
    );
  }

  private update(data: CompareData, loadSide: LoadSide): void {
    this.scheduleRefresh.cancel();
    this.loadSide = loadSide;
    this.data = data;
    this.pending = data;
    this.flush();
  }

  /** Re-read the editor side only — the cheap path taken while the user types. */
  private async refreshWorkingTree(): Promise<void> {
    const document = await vscode.workspace.openTextDocument(this.data.uri);
    const side = (which: 'left' | 'right'): Side =>
      this.data.sources[which].kind === 'workingTree'
        ? workingTreeSide(document, this.data.fence)
        : this.data[which];

    this.update({ ...this.data, left: side('left'), right: side('right') }, this.loadSide);
  }

  /** Re-read both sides, including a fresh `git show` — the Refresh button. */
  private async refreshBothSides(): Promise<void> {
    this.scheduleRefresh.cancel();
    try {
      const [left, right] = await Promise.all([
        this.loadSide(this.data.sources.left),
        this.loadSide(this.data.sources.right),
      ]);
      this.update({ ...this.data, left, right }, this.loadSide);
    } catch (err) {
      // Keep the panel up; a failed refresh shouldn't cost the user their current view.
      vscode.window.showErrorMessage(
        `Mermaid Compare: refresh failed. ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private flush(): void {
    // A refresh can still be in flight when the user closes the panel; touching a disposed
    // webview throws.
    if (this.disposed || !this.ready || !this.pending) {
      return;
    }
    const { title, left, right } = this.pending;
    this.panel.title = `Compare: ${title}`;
    void this.panel.webview.postMessage({ type: 'compare', title, left, right });
    this.pending = undefined;
  }

  private getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.css'));
    const nonce = getNonce();

    // 'unsafe-inline' styles are required: mermaid injects <style> into the generated SVG.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Mermaid Compare</title>
</head>
<body>
${PANEL_BODY_HTML}
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/** The working-tree side of the comparison, labelled by whether the buffer is saved. */
export function workingTreeSide(document: vscode.TextDocument, fence?: number): Side {
  const kind = classifySource(document.uri) ?? 'mermaid';
  const { content, missing } = selectDiagram(document.getText(), kind, fence);
  const label = document.isDirty ? 'Editor (unsaved)' : 'Working Tree';

  // The fence can vanish mid-edit — while the user is retyping the ``` line, say. Saying so beats
  // a bare "(empty)" pane that looks like the extension broke.
  return { label: missing ? `${label} (no diagram ${(fence ?? 0) + 1})` : label, content };
}

export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
