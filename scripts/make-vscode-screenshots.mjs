/**
 * Generates the README / Marketplace screenshots into docs/images/, captured from a real
 * VS Code rather than the harness.
 *
 * VS Code is Electron, so launching it with --remote-debugging-port lets Playwright attach over
 * CDP and drive the actual workbench: real theme, real chrome, real webview. page.screenshot()
 * then captures the window without needing focus, which an OS-level screen grab would.
 *
 * Reuses playwright and @vscode/test-electron, both already devDependencies. Run it with
 * `npm run make:screenshots:vscode`. scripts/make-screenshots.mjs remains the fast headless
 * route for iterating on webview styling.
 */
import { chromium } from 'playwright';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { root, settle } from './harness-helpers.mjs';

const outDir = path.join(root, 'docs', 'images');
const sampleFile = path.join(root, 'samples', 'pipeline.mmd');
const PORT = 9222;
/**
 * Size of the captured content. VS Code restores its own window bounds and ignores
 * --window-size, so this is applied over CDP once attached instead.
 */
const CONTENT = { width: 1440, height: 900 };

/**
 * The working-tree version, shown in the right pane. HEAD's version is the committed sample, so
 * the difference — an integration-test step and a signing step — is what the comparison shows.
 */
const WORKING_TREE = `flowchart TD
    A[Commit pushed] --> B{CI triggered?}
    B -- yes --> C[Build]
    B -- no --> Z[Done]
    C --> D[Unit tests]
    D --> I[Integration tests]
    I --> E{Pass?}
    E -- yes --> S[Sign artifact]
    S --> F[Deploy to staging]
    E -- no --> G[Notify author]
    F --> Z
    G --> Z
`;

/**
 * Playwright clears the metrics override around each screenshot, so re-apply it every time or
 * only the first image comes out at the target size.
 */
async function shot(page, cdp, name) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    ...CONTENT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.waitForTimeout(500); // Let the workbench relayout before capturing.
  const file = path.join(outDir, `${name}.png`);
  await writeFile(file, await page.screenshot());
  console.log(`  ${path.relative(root, file)}`);
}

/** Wait for the Electron main window to expose its debugging port. */
async function waitForDebugPort(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`VS Code never opened a debugging port on ${PORT}`);
}

/** The workbench is one of several CDP targets; the others are the shared and extension hosts. */
async function workbenchPage(browser, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (page.url().includes('workbench')) return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('no workbench page appeared over CDP');
}

/**
 * Compare panel webviews are nested two iframes deep and their URLs are opaque, so identify the
 * frame by the toolbar it contains (ids from src/webview/panel-body.ts).
 */
async function webviewFrame(page, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        if (await frame.evaluate(() => !!document.getElementById('fit'))) return frame;
      } catch {
        // Frame detached or still navigating.
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error('the compare webview never appeared');
}

/** Marker-file handshake with the in-host driver (src/test/screenshots/driver.ts). */
const marker = (dir, name) => path.join(dir, name);
const signal = (dir, name) => writeFile(marker(dir, name), '');

async function awaitMarker(dir, name, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(marker(dir, name))) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`the driver never signalled "${name}"`);
}

const original = await readFile(sampleFile, 'utf8');
const profileDir = await mkdtemp(path.join(os.tmpdir(), 'advanced-mermaid-shots-'));
const shotDir = await mkdtemp(path.join(os.tmpdir(), 'advanced-mermaid-steps-'));
let vscode;
let browser;

try {
  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(profileDir, 'User'), { recursive: true });

  // A disposable profile keeps captures reproducible: fixed theme, no minimap, no first-run
  // banners, no update notifications drifting into frame.
  await writeFile(
    path.join(profileDir, 'User', 'settings.json'),
    JSON.stringify(
      {
        'workbench.colorTheme': 'Default Dark Modern',
        'workbench.startupEditor': 'none',
        'workbench.tips.enabled': false,
        'editor.minimap.enabled': false,
        'window.zoomLevel': 0,
        'update.mode': 'none',
        'telemetry.telemetryLevel': 'off',
        'git.openRepositoryInParentFolders': 'always',
        // Keep the frame about the extension: no chat panel, no command centre announcing
        // "[Extension Development Host]", no layout controls.
        'window.commandCenter': false,
        'chat.commandCenter.enabled': false,
        'workbench.layoutControl.enabled': false,
        'workbench.secondarySideBar.defaultVisibility': 'hidden',
        // A native title bar is drawn by the OS rather than the web contents, so it falls
        // outside page.screenshot() — which takes the "[Extension Development Host]" prefix and
        // the account/chat buttons with it. VS Code hardcodes that prefix; no setting removes it.
        'window.titleBarStyle': 'native',
        'window.menuBarVisibility': 'hidden',
      },
      null,
      2
    )
  );

  // The right pane needs to differ from HEAD, so give the working tree the changed diagram.
  await writeFile(sampleFile, WORKING_TREE);

  const executable = await downloadAndUnzipVSCode();
  console.log('launching VS Code');

  // Note: no --disable-extensions. It would take the built-in git extension with it, and
  // compareWithHead reads the ref through vscode.git. A throwaway --extensions-dir keeps
  // installed extensions out instead.
  vscode = spawn(
    executable,
    [
      root,
      `--extensionDevelopmentPath=${root}`,
      `--user-data-dir=${profileDir}`,
      `--extensions-dir=${path.join(profileDir, 'extensions')}`,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--no-sandbox',
      `--extensionTestsPath=${path.join(root, 'dist', 'test', 'screenshots.js')}`,
      `--remote-debugging-port=${PORT}`,
    ],
    { stdio: 'ignore', env: { ...process.env, AM_SHOT_DIR: shotDir } }
  );

  await waitForDebugPort();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = await workbenchPage(browser);

  // Pin the captured size. The workbench relayouts to match, so the panes are sized for the
  // image rather than for whatever bounds VS Code happened to restore.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    ...CONTENT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // The driver opens the file and runs the compare command through the API, then signals.
  await awaitMarker(shotDir, 'ready');
  const view = await webviewFrame(page);
  await settle(page);

  console.log('writing screenshots');

  // 1. The core proposition: the same diagram either side, differences visible at a glance.
  await view.click('#fit');
  await settle(page);
  await shot(page, cdp, 'compare');

  // 2. Panes unlocked, each framed on its own.
  await view.click('#sync');
  await view.click('#fit');
  await settle(page);
  await shot(page, cdp, 'independent-panes');

  // Re-sync before the last shot so it shows the default state.
  await view.click('#sync');
  await view.click('#fit');
  await settle(page);

  // 3. Mid-edit: invalid source keeps the last good render and flags it, rather than blanking.
  await signal(shotDir, 'break');
  await awaitMarker(shotDir, 'broken');
  await page.waitForTimeout(900); // past the panel's 300 ms refresh debounce
  await shot(page, cdp, 'live-edit');
} finally {
  await signal(shotDir, 'done').catch(() => {}); // Release the driver so the host can exit.
  if (browser) await browser.close().catch(() => {});

  if (vscode) {
    // Discards the unsaved editor buffer along with the window. Wait for it to actually go:
    // Windows keeps the profile's SQLite files locked until the process is gone.
    const exited = new Promise((resolve) => vscode.once('exit', resolve));
    vscode.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
  }

  await writeFile(sampleFile, original);

  // Best-effort: a locked profile file must not mask whatever actually went wrong above.
  for (const dir of [profileDir, shotDir]) {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }).catch((err) =>
      console.warn(`could not remove ${dir}: ${err.message}`)
    );
  }
}
