/**
 * Records docs/images/demo.gif — the animated hero for the README and the Marketplace listing.
 *
 * The listing had three still PNGs for a tool whose whole value is watching a diagram change:
 * overlay, swipe, blink and the merged semantic diff cannot be shown in a still. This captures the
 * real thing rather than a mock-up, reusing the CDP setup from make-vscode-screenshots.mjs —
 * VS Code launched with --remote-debugging-port, Playwright attached to the workbench, and the
 * panel driven from inside the extension host by src/test/screenshots/driver.ts.
 *
 * No ffmpeg, which is what blocked a demo at Milestone 4: `gifenc` encodes and `pngjs` decodes
 * Playwright's PNG buffers, both pure JS devDependencies.
 *
 * Run with `npm run make:demo`.
 */
import { chromium } from 'playwright';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
// gifenc ships CommonJS, so its exports arrive on the default rather than as named ones.
import gifenc from 'gifenc';
import { PNG } from 'pngjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { root } from './harness-helpers.mjs';

const outFile = path.join(root, 'docs', 'images', 'demo.gif');
const sampleFile = path.join(root, 'samples', 'pipeline.mmd');
const PORT = 9223;

/** Frame rate and window. Bigger and smoother both cost file size, which the Marketplace pays. */
const FPS = 8;
const DELAY_MS = Math.round(1000 / FPS);
const CONTENT = { width: 1000, height: 620 };

/** Fewer colours than a photo needs; a diagram is flat fill and text. */
const PALETTE_SIZE = 128;

/** The working-tree version — the difference is what the demo is showing. */
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

async function waitForDebugPort(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`VS Code never opened a debugging port on ${PORT}`);
}

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

/** The compare panel's webview, identified by its toolbar rather than by an opaque URL. */
async function webviewFrame(page, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        if (await frame.evaluate(() => !!document.getElementById('mode'))) return frame;
      } catch {
        // Detached or still navigating.
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error('the compare webview never appeared');
}

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
const profileDir = await mkdtemp(path.join(os.tmpdir(), 'advanced-mermaid-demo-'));
const shotDir = await mkdtemp(path.join(os.tmpdir(), 'advanced-mermaid-demo-steps-'));
let vscode;
let browser;

try {
  await mkdir(path.dirname(outFile), { recursive: true });
  await mkdir(path.join(profileDir, 'User'), { recursive: true });

  // The same disposable profile the screenshots use: fixed theme, no chrome that dates the image.
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
        'window.commandCenter': false,
        'chat.commandCenter.enabled': false,
        'workbench.layoutControl.enabled': false,
        'workbench.secondarySideBar.defaultVisibility': 'hidden',
        'window.titleBarStyle': 'native',
        'window.menuBarVisibility': 'hidden',
      },
      null,
      2
    )
  );

  await writeFile(sampleFile, WORKING_TREE);

  const executable = await downloadAndUnzipVSCode();
  console.log('launching VS Code');

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

  const cdp = await page.context().newCDPSession(page);
  const pin = () =>
    cdp.send('Emulation.setDeviceMetricsOverride', { ...CONTENT, deviceScaleFactor: 1, mobile: false });
  await pin();

  await awaitMarker(shotDir, 'ready');
  const view = await webviewFrame(page);

  // Hide the explorer. It costs a third of the frame in a hero image, and what it shows is this
  // repository's own clutter — `.claude`, a stale .vsix — rather than anything about the product.
  await page.keyboard.press('Control+B');
  await page.waitForTimeout(1500);

  const frames = [];
  /** Grab one frame. Playwright clears the metrics override around a screenshot, so re-pin. */
  const grab = async () => {
    await pin();
    frames.push(await page.screenshot());
  };
  /** Hold the current state for a beat, so a viewer can read it before the next change. */
  const hold = async (seconds) => {
    for (let i = 0; i < Math.round(seconds * FPS); i++) {
      await grab();
    }
  };

  console.log('recording');

  await view.click('#fit');
  await page.waitForTimeout(400);
  await hold(1.6); // Side by side: the starting point.

  // Overlay, then fade the upper layer down and back — the onion skin.
  await view.selectOption('#mode', 'overlay');
  await page.waitForTimeout(500);
  await hold(0.6);
  for (const value of [80, 60, 40, 20, 40, 60, 80, 100]) {
    await view.fill('#opacity', String(value));
    await view.dispatchEvent('#opacity', 'input');
    await grab();
    await grab();
  }

  // Swipe: drag the divider across the diagram.
  await view.selectOption('#mode', 'swipe');
  await page.waitForTimeout(500);
  await hold(0.5);
  await view.focus('#swipe-handle');
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('ArrowLeft');
    await grab();
  }
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('ArrowRight');
    await grab();
  }

  // Blink: the mode that catches a node which moved only slightly.
  await view.selectOption('#mode', 'blink');
  await page.waitForTimeout(400);
  await hold(2.4);

  // Semantic last, and held longest: one merged diagram is the thing nothing else does.
  await view.selectOption('#mode', 'semantic');
  await page.waitForTimeout(900);
  await view.click('#fit');
  await page.waitForTimeout(400);
  await hold(3.4);

  console.log(`encoding ${frames.length} frames`);

  const encoder = GIFEncoder();
  for (const buffer of frames) {
    const { data, width, height } = PNG.sync.read(buffer);
    const palette = quantize(data, PALETTE_SIZE);
    const index = applyPalette(data, palette);
    encoder.writeFrame(index, width, height, { palette, delay: DELAY_MS });
  }
  encoder.finish();

  await writeFile(outFile, Buffer.from(encoder.bytes()));
  const { size } = await import('node:fs/promises').then((fs) => fs.stat(outFile));
  console.log(`${path.relative(root, outFile)} — ${(size / 1024 / 1024).toFixed(2)} MB`);
} finally {
  await signal(shotDir, 'done').catch(() => {});
  if (browser) await browser.close().catch(() => {});

  if (vscode) {
    const exited = new Promise((resolve) => vscode.once('exit', resolve));
    vscode.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
  }

  await writeFile(sampleFile, original);

  for (const dir of [profileDir, shotDir]) {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }).catch((err) =>
      console.warn(`could not remove ${dir}: ${err.message}`)
    );
  }
}
