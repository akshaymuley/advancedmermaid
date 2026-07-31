import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { getGitContent, listRefs } from '../../git';
import { orderRefs } from '../../ref-list';
import { compare, fromRef, fromTree, restoreComparison } from '../../extension';
import { writeExport } from '../../comparePanel';

/**
 * These run inside a real VS Code. Everything asserted here is something the unit tests and the
 * browser harness structurally cannot reach: activation, command registration, the webview's
 * CSP and resource URIs, and the built-in git extension.
 *
 * `describe`/`it` are mocha globals — deliberately not imported, since this file is bundled.
 */

const EXTENSION_ID = 'AkshayDMuley.advanced-mermaid';

/** The extension's install root, which is all `compare` needs from the context. */
function extensionUri(): vscode.Uri {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, 'the extension should be present');
  return extension.extensionUri;
}

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

  it('activates and registers every command', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'mermaidCompare.compareWithHead',
      'mermaidCompare.compareWithRef',
      'mermaidCompare.compareBetweenRefs',
      'mermaidCompare.compareWithFile',
    ]) {
      assert.ok(commands.includes(command), `${command} should be registered`);
    }
  });

  /**
   * The refs come from the built-in git extension. `state.refs` is empty in a freshly opened
   * window — established by probing a running host — so `listRefs` has to ask for them, and this
   * pins that down: a silent empty list would leave the ref picker showing nothing but the
   * manual-entry escape hatch.
   */
  it('lists the repository refs through the git extension', async () => {
    const refs = await listRefs(workspaceFile('samples', 'pipeline.mmd'));
    const choices = orderRefs(refs);

    assert.ok(refs.length > 0, 'the repository should report at least one ref');
    // Deliberately not asserting a *local* branch: CI checks out a detached HEAD, so the only
    // refs there are remotes. Offering those is correct — it's the environment where you most
    // want to compare two branches without checking either out.
    assert.ok(
      choices.length > 0 && choices.every((choice) => choice.name.length > 0),
      `expected named, pickable refs, got: ${JSON.stringify(refs.slice(0, 5))}`
    );
  });

  /**
   * `git.ts` waits on these two before believing "no repository", because discovery is
   * asynchronous and a plainly tracked file reports nothing for a moment after a window opens.
   * The unit tests drive a fake API, so they would go on passing if the real one ever dropped
   * them — leaving the wait silently doing nothing. Only a real host can check the shape.
   */
  it('exposes the discovery state the repository lookup waits on', async () => {
    const git = vscode.extensions.getExtension('vscode.git');
    assert.ok(git, 'the built-in git extension should be present');
    const api = (git.isActive ? git.exports : await git.activate()).getAPI(1);

    assert.strictEqual(
      typeof api.onDidChangeState,
      'function',
      'the git API should still announce state changes'
    );
    assert.ok(
      api.state === 'initialized' || api.state === 'uninitialized',
      `unexpected git API state: ${JSON.stringify(api.state)}`
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

  /**
   * Two refs, no working tree. Driven through `compare` rather than the command, because the
   * command's job is to collect the two refs from QuickPicks and that can't be driven from here.
   */
  it('compares one file between two refs', async () => {
    const uri = workspaceFile('samples', 'pipeline.mmd');
    await compare(extensionUri(), fromRef(uri, 'HEAD~1'), fromRef(uri, 'HEAD'));

    await waitFor('a panel naming both refs', () =>
      openTabTitles().includes('Compare: pipeline.mmd — HEAD~1 ↔ HEAD')
    );
  });

  /**
   * A smoke test, and honest about it: editing the file while a ref-to-ref panel is open must not
   * disturb or close it. It cannot see *whether* a refresh ran, because a refresh would produce
   * the same two ref-sourced panes and the same title — `tracksDocument` is unit-tested in
   * `side-source.test.ts` for that. What this does cover is the wiring around it: that the edit
   * path doesn't throw or dispose the panel when neither side is the working tree.
   */
  it('survives edits to the file it is comparing between two refs', async () => {
    const uri = workspaceFile('samples', 'scratch-refs.mmd');
    await vscode.workspace.fs.writeFile(uri, Buffer.from('flowchart TD\n    A --> B\n'));

    try {
      await compare(extensionUri(), fromRef(uri, 'HEAD'), fromRef(uri, 'HEAD'));
      await waitFor('the ref-to-ref panel', () =>
        openTabTitles().includes('Compare: scratch-refs.mmd — HEAD ↔ HEAD')
      );

      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);
      await editor.edit((builder) =>
        builder.insert(new vscode.Position(document.lineCount, 0), '    B --> C\n')
      );

      // Well past the 300 ms refresh debounce.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.ok(
        openTabTitles().includes('Compare: scratch-refs.mmd — HEAD ↔ HEAD'),
        'the panel should still be showing the same two refs'
      );
    } finally {
      await vscode.workspace.fs.delete(uri);
    }
  });

  /**
   * Two different files in one panel — a `.mmd` against a fence inside a `.md`, so both reading
   * paths are exercised at once. Driven through `compare` for the same reason as the ref-to-ref
   * test: the command's job is the file picker, which can't be driven from here.
   */
  it('compares two different files', async () => {
    await compare(
      extensionUri(),
      fromTree(workspaceFile('samples', 'pipeline.mmd')),
      fromTree(workspaceFile('samples', 'adr.md'))
    );

    await waitFor('a panel naming both files', () =>
      openTabTitles().includes('Compare: pipeline.mmd ↔ adr.md')
    );
  });

  /**
   * The two-file counterpart of the ref-to-ref edit test, and honest in the same way: the title
   * doesn't change when a pane re-renders, so this covers the wiring — that an edit to the *left*
   * file, which is no longer "the file being compared" in the old single-URI sense, is routed
   * without throwing or disposing the panel. Which side an edit belongs to is unit-tested in
   * `side-source.test.ts`.
   */
  it('survives edits to either file of a two-file comparison', async () => {
    const left = workspaceFile('samples', 'scratch-left.mmd');
    const right = workspaceFile('samples', 'scratch-right.mmd');
    await vscode.workspace.fs.writeFile(left, Buffer.from('flowchart TD\n    A --> B\n'));
    await vscode.workspace.fs.writeFile(right, Buffer.from('flowchart TD\n    A --> C\n'));

    try {
      await compare(extensionUri(), fromTree(left), fromTree(right));
      const title = 'Compare: scratch-left.mmd ↔ scratch-right.mmd';
      await waitFor('the two-file panel', () => openTabTitles().includes(title));

      const document = await vscode.workspace.openTextDocument(left);
      const editor = await vscode.window.showTextDocument(document);
      await editor.edit((builder) =>
        builder.insert(new vscode.Position(document.lineCount, 0), '    B --> D\n')
      );

      // Well past the 300 ms refresh debounce.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.ok(
        openTabTitles().includes(title),
        'the panel should still be comparing the same two files'
      );
    } finally {
      await vscode.workspace.fs.delete(left);
      await vscode.workspace.fs.delete(right);
    }
  });

  /**
   * The export flow ends at `showSaveDialog`, which is a native OS dialog outside the renderer —
   * no automation here can click it. So the half that *can* be checked is checked properly: the
   * bytes that reach disk in a real host, for both formats. Everything before it (composing the
   * SVG, rasterising it) is covered by the browser harness.
   */
  it('writes an exported comparison to disk in both formats', async () => {
    const svgTarget = workspaceFile('samples', 'export-test.svg');
    const pngTarget = workspaceFile('samples', 'export-test.png');
    // A 1x1 PNG, base64, exactly as the webview would post it.
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    try {
      await writeExport(svgTarget, 'svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
      await writeExport(pngTarget, 'png', pngBase64);

      const svgBytes = Buffer.from(await vscode.workspace.fs.readFile(svgTarget));
      assert.ok(
        svgBytes.toString('utf8').startsWith('<svg'),
        `expected SVG text, got: ${svgBytes.subarray(0, 20).toString('utf8')}`
      );

      const pngBytes = Buffer.from(await vscode.workspace.fs.readFile(pngTarget));
      assert.strictEqual(
        pngBytes.subarray(1, 4).toString('utf8'),
        'PNG',
        'PNG must be decoded from base64, not written as the base64 text itself'
      );
      assert.ok(pngBytes.length < pngBase64.length, 'decoded bytes should be shorter than base64');
    } finally {
      for (const target of [svgTarget, pngTarget]) {
        await vscode.workspace.fs.delete(target).then(undefined, () => undefined);
      }
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

  /**
   * Restoring after a window reload.
   *
   * The reload itself cannot be tested from in here — it would kill the run that is asserting on
   * it — so the seam is `restoreComparison`, which is everything up to VS Code deciding to call
   * it. That last step is the manual check, as the native save dialog is for export.
   */
  describe('restoring a panel after a reload', () => {
    /** A panel in the state VS Code hands the serializer: created, but with an empty webview. */
    const restoredPanel = (): vscode.WebviewPanel =>
      vscode.window.createWebviewPanel(
        'mermaidCompare',
        'Mermaid Compare',
        vscode.ViewColumn.Active,
        {}
      );

    const stateFor = (file: string) => ({
      version: 1,
      left: { uri: workspaceFile('samples', file).toString(), kind: 'mermaid', source: { kind: 'ref', ref: 'HEAD' } },
      right: { uri: workspaceFile('samples', file).toString(), kind: 'mermaid', source: { kind: 'workingTree' } },
    });

    it('rebuilds the comparison the state describes', async () => {
      await restoreComparison(extensionUri(), restoredPanel(), stateFor('pipeline.mmd'));

      await waitFor('the restored panel to finish its handshake', () =>
        openTabTitles().includes('Compare: pipeline.mmd')
      );
    });

    /**
     * The registry is keyed by comparison, and a restored panel has to be filed under that key
     * like any other — otherwise re-running the comparison opens a second tab for it, which is
     * the collision `panel-key.ts` exists to prevent.
     */
    it('files the restored panel under its key, so the same comparison does not open twice', async () => {
      await restoreComparison(extensionUri(), restoredPanel(), stateFor('pipeline.mmd'));
      await waitFor('the restored panel', () => openTabTitles().includes('Compare: pipeline.mmd'));

      await vscode.commands.executeCommand(
        'mermaidCompare.compareWithHead',
        workspaceFile('samples', 'pipeline.mmd')
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      const matching = openTabTitles().filter((title) => title === 'Compare: pipeline.mmd');
      assert.strictEqual(matching.length, 1, `expected one panel, saw ${matching.length}`);
    });

    it('closes the panel rather than leaving it empty when the state means nothing', async () => {
      const panel = restoredPanel();
      await restoreComparison(extensionUri(), panel, { version: 99, left: {}, right: {} });

      // Disposing an already-disposed panel is a no-op; disposing a live one is not, so a panel
      // still on screen here would show up as a lingering tab.
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.ok(
        !openTabTitles().includes('Mermaid Compare'),
        `an unreadable state should leave no panel, saw: ${openTabTitles().join(', ')}`
      );
    });

    it('closes the panel when the file it names is gone', async () => {
      const panel = restoredPanel();
      await restoreComparison(extensionUri(), panel, {
        version: 1,
        left: {
          uri: workspaceFile('samples', 'deleted-since.mmd').toString(),
          kind: 'mermaid',
          source: { kind: 'workingTree' },
        },
        right: {
          uri: workspaceFile('samples', 'deleted-since.mmd').toString(),
          kind: 'mermaid',
          source: { kind: 'ref', ref: 'HEAD' },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.ok(
        !openTabTitles().includes('Mermaid Compare'),
        `a missing file should leave no panel, saw: ${openTabTitles().join(', ')}`
      );
    });
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
