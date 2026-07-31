import * as vscode from 'vscode';
import * as path from 'path';
import { debounce } from './debounce';
import { selectDiagram } from './diagram-selection';
import { exportFileName, formatFor, type ExportFormat } from './export-file';
import { classifySource } from './mermaid-file';
import { panelKey } from './panel-key';
import { toPanelState } from './panel-state';
import { tracksDocument, type SideTarget } from './side-source';
import { PANEL_BODY_HTML } from './webview/panel-body';

/** How long to wait after the last keystroke before re-rendering the working-tree pane. */
const REFRESH_DELAY_MS = 300;

export interface Side {
  label: string;
  content: string;
}

/** A `SideTarget` carrying a real `vscode.Uri`, so the host can open the file it names. */
export interface PanelTarget extends SideTarget {
  uri: vscode.Uri;
}

export interface PanelTargets {
  left: PanelTarget;
  right: PanelTarget;
}

export interface CompareData {
  /**
   * What each pane shows: its file, its diagram within that file, and its version. The two are
   * independent, so a comparison can span two files — and each is tracked separately, so an edit
   * refreshes the pane showing that file.
   */
  targets: PanelTargets;
  title: string;
  left: Side;
  right: Side;
}

/** Re-reads one side. Injected so the panel never has to know about git. */
export type LoadSide = (target: PanelTarget) => Promise<Side>;

export class ComparePanel {
  /**
   * Open panels by `panelKey`. Re-running the same comparison reveals its panel; a different
   * file, ref, or fence gets its own, so two diagrams from one Markdown file can sit side by
   * side.
   */
  private static readonly open = new Map<string, ComparePanel>();

  private ready = false;
  private disposed = false;
  /** Where an in-flight export is headed, held between the save dialog and the webview's reply. */
  private pendingExport: vscode.Uri | undefined;
  private pending: CompareData | undefined;
  private data: CompareData;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly scheduleRefresh = debounce(() => void this.refreshWorkingTree(), REFRESH_DELAY_MS);

  /** Shared with the serializer registration, which only restores panels of a matching type. */
  static readonly viewType = 'mermaidCompare';

  private static webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'dist'),
        vscode.Uri.joinPath(extensionUri, 'media'),
      ],
    };
  }

  static show(extensionUri: vscode.Uri, data: CompareData, loadSide: LoadSide): void {
    const key = panelKey(data.targets);
    const existing = ComparePanel.open.get(key);
    if (existing) {
      existing.update(data, loadSide);
      existing.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ComparePanel.viewType,
      'Mermaid Compare',
      vscode.ViewColumn.Active,
      { ...ComparePanel.webviewOptions(extensionUri), retainContextWhenHidden: true }
    );
    ComparePanel.open.set(key, new ComparePanel(panel, extensionUri, data, loadSide, key));
  }

  /**
   * Take over a panel VS Code restored after a reload, rather than creating one.
   *
   * Filing it under its `panelKey` is the part that isn't optional: a restored panel missing from
   * the registry would let the same comparison open a second tab, which is the exact collision
   * `panel-key.ts` exists to prevent.
   *
   * A restored panel arrives with an empty webview — its options and HTML have to be set again.
   */
  static adopt(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    data: CompareData,
    loadSide: LoadSide
  ): void {
    const key = panelKey(data.targets);

    // A comparison the user reopened before its panel was restored already holds this key. Two
    // panels showing one comparison helps nobody; the restored one goes.
    if (ComparePanel.open.has(key)) {
      panel.dispose();
      return;
    }

    panel.webview.options = ComparePanel.webviewOptions(extensionUri);
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
      panel.webview.onDidReceiveMessage(
        (message: { type?: string; format?: ExportFormat; data?: string; message?: string }) => {
          if (message.type === 'ready') {
            this.ready = true;
            this.flush();
          } else if (message.type === 'refresh') {
            void this.refreshBothSides();
          } else if (message.type === 'export') {
            void this.askWhereToExport();
          } else if (message.type === 'exportData' && message.format && message.data) {
            void this.finishExport(message.format, message.data);
          } else if (message.type === 'exportFailed') {
            this.pendingExport = undefined;
            vscode.window.showErrorMessage(
              `Mermaid Compare: could not build the image. ${message.message ?? ''}`
            );
          }
        }
      ),
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

  /** Whether an edit to this document should refresh this panel. */
  private tracks(document: vscode.TextDocument): boolean {
    return tracksDocument(this.data.targets, document.uri.toString());
  }

  private update(data: CompareData, loadSide: LoadSide): void {
    this.scheduleRefresh.cancel();
    this.loadSide = loadSide;
    this.data = data;
    this.pending = data;
    this.flush();
  }

  /**
   * Re-read the editor sides only — the cheap path taken while the user types. Each working-tree
   * pane reads its own file, since the two sides need not be the same one.
   */
  private async refreshWorkingTree(): Promise<void> {
    const read = async (which: 'left' | 'right'): Promise<Side> => {
      const target = this.data.targets[which];
      if (target.source.kind !== 'workingTree') {
        return this.data[which];
      }
      const document = await vscode.workspace.openTextDocument(target.uri);
      return workingTreeSide(document, target.fence);
    };

    const [left, right] = await Promise.all([read('left'), read('right')]);
    this.update({ ...this.data, left, right }, this.loadSide);
  }

  /**
   * Ask where the image should go, then ask the webview to build it.
   *
   * The order is forced: only the webview can rasterise a PNG, and only the host can offer a save
   * dialog — so the format has to be settled first and carried across. Whichever extension the
   * user picks *is* the format, which is why the dialog asks nothing else.
   */
  private async askWhereToExport(): Promise<void> {
    const target = await vscode.window.showSaveDialog({
      title: 'Export comparison',
      defaultUri: vscode.Uri.joinPath(
        vscode.Uri.file(path.dirname(this.data.targets.right.uri.fsPath)),
        exportFileName(this.data.title, 'svg')
      ),
      filters: { 'SVG image': ['svg'], 'PNG image': ['png'] },
    });

    if (!target) {
      return; // Cancelled.
    }

    this.pendingExport = target;
    void this.panel.webview.postMessage({ type: 'exportAs', format: formatFor(target.fsPath) });
  }

  /** The webview has built the image; write it where the dialog said. */
  private async finishExport(format: ExportFormat, data: string): Promise<void> {
    const target = this.pendingExport;
    this.pendingExport = undefined;
    if (!target) {
      return; // The panel was closed, or the dialog cancelled, between request and reply.
    }

    try {
      await writeExport(target, format, data);
      vscode.window.showInformationMessage(
        `Mermaid Compare: exported to ${path.basename(target.fsPath)}.`
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        `Mermaid Compare: could not write ${path.basename(target.fsPath)}. ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /** Re-read both sides, including a fresh `git show` — the Refresh button. */
  private async refreshBothSides(): Promise<void> {
    this.scheduleRefresh.cancel();
    try {
      const [left, right] = await Promise.all([
        this.loadSide(this.data.targets.left),
        this.loadSide(this.data.targets.right),
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
    // The state rides along so the webview can hand it to `setState`. That is the only route by
    // which VS Code will give it back to the serializer after a reload — the host cannot store it
    // against the panel itself.
    void this.panel.webview.postMessage({
      type: 'compare',
      title,
      left,
      right,
      state: toPanelState(this.data.targets),
    });
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

/**
 * Write an exported comparison.
 *
 * Exported on its own so the integration tests can prove the bytes that reach disk in a real host:
 * the flow they can't drive is `showSaveDialog`, which is a native OS dialog outside the renderer.
 * PNG arrives base64-encoded, since a webview message is JSON and cannot carry bytes.
 */
export async function writeExport(
  target: vscode.Uri,
  format: ExportFormat,
  data: string
): Promise<void> {
  const bytes =
    format === 'png' ? Buffer.from(data, 'base64') : Buffer.from(data, 'utf8');

  await vscode.workspace.fs.writeFile(target, bytes);
}

export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
