import * as vscode from 'vscode';

export interface CompareData {
  title: string;
  left: { label: string; content: string };
  right: { label: string; content: string };
}

export class ComparePanel {
  private static current: ComparePanel | undefined;

  private ready = false;
  private pending: CompareData | undefined;

  static show(extensionUri: vscode.Uri, data: CompareData): void {
    if (ComparePanel.current) {
      ComparePanel.current.update(data);
      ComparePanel.current.panel.reveal();
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
    ComparePanel.current = new ComparePanel(panel, extensionUri, data);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    data: CompareData
  ) {
    this.pending = data;
    panel.webview.html = this.getHtml(panel.webview, extensionUri);
    panel.webview.onDidReceiveMessage((message: { type?: string }) => {
      if (message.type === 'ready') {
        this.ready = true;
        this.flush();
      }
    });
    panel.onDidDispose(() => {
      ComparePanel.current = undefined;
    });
  }

  private update(data: CompareData): void {
    this.pending = data;
    this.flush();
  }

  private flush(): void {
    if (!this.ready || !this.pending) {
      return;
    }
    this.panel.title = `Compare: ${this.pending.title}`;
    void this.panel.webview.postMessage({ type: 'compare', ...this.pending });
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
  <div id="toolbar">
    <span id="doc-title"></span>
    <button id="reset">Reset view</button>
  </div>
  <div id="panes">
    <section class="pane">
      <header id="left-label"></header>
      <div class="canvas"><div class="viewport" id="left-viewport"></div></div>
    </section>
    <section class="pane">
      <header id="right-label"></header>
      <div class="canvas"><div class="viewport" id="right-viewport"></div></div>
    </section>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
