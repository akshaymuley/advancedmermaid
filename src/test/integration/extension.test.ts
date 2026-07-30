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

const EXTENSION_ID = 'AkshayDMuley.advanced-mermaid';

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

describe('advanced-mermaid in a real VS Code host', () => {
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

  /**
   * Two different files, two panels. The panel used to be a singleton, so the second comparison
   * replaced the first and this file's other tests could never tell the difference — they only
   * ever opened one at a time.
   */
  it('keeps a panel per comparison instead of replacing the last one', async () => {
    await vscode.commands.executeCommand(
      'mermaidCompare.compareWithHead',
      workspaceFile('samples', 'pipeline.mmd')
    );
    await waitFor('the first panel', () => openTabTitles().includes('Compare: pipeline.mmd'));

    await vscode.commands.executeCommand(
      'mermaidCompare.compareWithHead',
      workspaceFile('samples', 'adr.md')
    );
    await waitFor('the second panel', () => openTabTitles().includes('Compare: adr.md'));

    const titles = openTabTitles();
    assert.ok(
      titles.includes('Compare: pipeline.mmd') && titles.includes('Compare: adr.md'),
      `both comparisons should stay open, saw: ${titles.join(', ')}`
    );
  });

  /**
   * A Markdown file with exactly one fence needs no picker, so this exercises the whole fence
   * path — classify, parse, extract both sides — without having to drive a QuickPick.
   */
  it('opens a compare panel for a single mermaid fence in Markdown', async () => {
    await vscode.commands.executeCommand(
      'mermaidCompare.compareWithHead',
      workspaceFile('samples', 'adr.md')
    );

    await waitFor('the panel title to be set by the webview handshake', () =>
      openTabTitles().includes('Compare: adr.md')
    );
  });

  async function assertNoPanelFor(...segments: string[]): Promise<void> {
    await vscode.commands.executeCommand('mermaidCompare.compareWithHead', workspaceFile(...segments));

    // Give a panel the chance to appear before concluding that none did.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.ok(
      !openTabTitles().some((title) => title.startsWith('Compare:')),
      `no compare panel expected for ${segments.join('/')}, saw: ${openTabTitles().join(', ')}`
    );
  }

  /**
   * Comparing a brand-new diagram against HEAD is a valid comparison — empty versus something.
   * The fixture has to be created here rather than committed, because the whole point is that it
   * is absent at HEAD.
   *
   * This is the case the unit tests could not reach: `classifyGitFailure` was written against git
   * CLI stderr, but the built-in git extension resolves the path against the ref's tree itself
   * and throws its own "relative path not found" wording, which fell through to `unknown` and
   * suppressed the panel entirely.
   */
  it('opens a panel for a file that does not exist at the ref', async () => {
    const uri = workspaceFile('samples', 'absent-at-head.mmd');
    await vscode.workspace.fs.writeFile(uri, Buffer.from('flowchart TD\n    New --> Compared\n'));

    try {
      await vscode.commands.executeCommand('mermaidCompare.compareWithHead', uri);
      await waitFor('a panel for a diagram that is new since HEAD', () =>
        openTabTitles().includes('Compare: absent-at-head.mmd')
      );
    } finally {
      await vscode.workspace.fs.delete(uri);
    }
  });

  it('refuses a file type it cannot read and opens no panel', async () => {
    await assertNoPanelFor('package.json');
  });

  it('opens no panel for a Markdown file with no mermaid fences', async () => {
    // CONTRIBUTING.md is prose only. Markdown is admitted by the `when` clauses now, so "no
    // diagram in here" is a distinct outcome from "wrong file type".
    await assertNoPanelFor('CONTRIBUTING.md');
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
