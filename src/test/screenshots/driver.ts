import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Runs inside the extension host so scripts/make-vscode-screenshots.mjs can put the UI into an
 * exact state before capturing it. Driving the same states through the command palette from
 * outside proved unreliable: Quick Open swallows keystrokes, and the palette entries are gated on
 * `resourceExtname`, so a command typed before the editor is active silently isn't there.
 *
 * Coordination is a marker file per step in AM_SHOT_DIR — the capture script waits for `ready`,
 * writes `break` when it wants the diagram broken, and writes `done` to release the host.
 */

const shotDir = process.env.AM_SHOT_DIR;

const marker = (name: string): string => path.join(shotDir!, name);
const write = (name: string): void => fs.writeFileSync(marker(name), '');
const exists = (name: string): boolean => fs.existsSync(marker(name));

function waitForMarker(name: string, timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = setInterval(() => {
      if (exists(name)) {
        clearInterval(poll);
        resolve();
      } else if (Date.now() > deadline) {
        clearInterval(poll);
        reject(new Error(`driver timed out waiting for the "${name}" marker`));
      }
    }, 200);
  });
}

export async function run(): Promise<void> {
  if (!shotDir) throw new Error('AM_SHOT_DIR is not set');

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error('the screenshot driver expects the repository as the workspace');

  // Belt and braces with the settings: on a profile where chat has already been shown, the
  // auxiliary bar can still come back on startup.
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');

  const uri = vscode.Uri.joinPath(folder.uri, 'samples', 'pipeline.mmd');
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: false });
  await vscode.commands.executeCommand('mermaidCompare.compareWithHead', uri);

  write('ready');

  // The last-good-render behaviour needs a *sequenced* edit: a good render first, then a broken
  // one. A WorkspaceEdit fires the same change events as typing, so the panel's 300 ms debounced
  // refresh runs exactly as it would for a user.
  await waitForMarker('break');

  const edit = new vscode.WorkspaceEdit();
  edit.insert(uri, document.lineAt(document.lineCount - 1).range.end, '\n    X -->');
  await vscode.workspace.applyEdit(edit);

  write('broken');

  // Hold the host open until the captures are done. The edit is never saved, so the working tree
  // is untouched when the window is killed.
  await waitForMarker('done');
}
