import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { getGitContent } from '../../git';

/**
 * These run inside a real VS Code. Everything asserted here is something the unit tests and the
 * browser harness structurally cannot reach: activation, command registration, the webview's
 * CSP and resource URIs, and the built-in git extension.
 *
 * `describe`/`it` are mocha globals — deliberately not imported, since this file is bundled.
 */

const EXTENSION_ID = 'akshaymuley.mermaid-diagram-compare';

function workspaceFile(...segments: string[]): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'the test workspace should be the repository itself');
  return vscode.Uri.joinPath(folder.uri, ...segments);
}

/** Titles of every open tab, across all groups. */
function openTabTitles(): string[] {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs.map((tab) => tab.label));
}

async function waitFor(
  description: string,
  predicate: () => boolean,
  timeoutMs = 15000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`timed out after ${timeoutMs}ms waiting for ${description}`);
}

async function closeAllPanels(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await new Promise((resolve) => setTimeout(resolve, 200));
}

describe('mermaid-diagram-compare in a real VS Code host', () => {
  before(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} should be present`);
    await extension.activate();
  });

  afterEach(closeAllPanels);

  it('activates and registers both commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('mermaidCompare.compareWithHead'),
      'compareWithHead should be registered'
    );
    assert.ok(
      commands.includes('mermaidCompare.compareWithRef'),
      'compareWithRef should be registered'
    );
  });

  /**
   * The strongest assertion available: the panel title is only set once the webview has posted
   * `ready`, so reaching it proves the panel opened, the CSP permitted the bundled script, the
   * dist/ resource URI resolved inside the webview, and the message round trip works.
   */
  it('opens a compare panel and completes the webview handshake', async () => {
    await vscode.commands.executeCommand(
      'mermaidCompare.compareWithHead',
      workspaceFile('samples', 'pipeline.mmd')
    );

    await waitFor('the panel title to be set by the webview handshake', () =>
      openTabTitles().includes('Compare: pipeline.mmd')
    );
  });

  it('refuses a non-Mermaid file and opens no panel', async () => {
    await vscode.commands.executeCommand(
      'mermaidCompare.compareWithHead',
      workspaceFile('README.md')
    );

    // Give a panel the chance to appear before concluding that none did.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.ok(
      !openTabTitles().some((title) => title.startsWith('Compare:')),
      `no compare panel expected, saw: ${openTabTitles().join(', ')}`
    );
  });

  it('reads a file at HEAD through the built-in git extension', async () => {
    const uri = workspaceFile('samples', 'pipeline.mmd');
    const committed = await getGitContent(uri, 'HEAD');
    const onDisk = (await vscode.workspace.openTextDocument(uri)).getText();

    assert.ok(committed.length > 0, 'HEAD version should not be empty');
    assert.ok(
      committed.includes('flowchart') || committed.includes('graph'),
      `expected mermaid source, got: ${committed.slice(0, 80)}`
    );
    assert.strictEqual(
      committed.replace(/\r\n/g, '\n'),
      onDisk.replace(/\r\n/g, '\n'),
      `${path.basename(uri.fsPath)} is committed unmodified, so HEAD and disk should agree`
    );
  });
});
