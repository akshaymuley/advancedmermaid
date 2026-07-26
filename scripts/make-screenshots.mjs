/**
 * Generates the README / Marketplace screenshots into docs/images/.
 *
 * These are the real webview, driven through harness/index.html — the same code the extension
 * ships — but rendered against the harness's stand-in theme and without the surrounding VS Code
 * chrome. Good enough to show what the extension does; a real capture from inside VS Code would
 * be better, and PLAN.md records that as an open item.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compare, openHarness, root, settle } from './harness-helpers.mjs';

const outDir = path.join(root, 'docs', 'images');

const BEFORE = `flowchart TD
  A[Pull request] --> B[Lint]
  B --> C[Unit tests]
  C --> D[Build]
  D --> E[Deploy]`;

const AFTER = `flowchart TD
  A[Pull request] --> B[Lint]
  B --> C[Unit tests]
  C --> I[Integration tests]
  I --> D[Build]
  D --> S[Sign artifact]
  S --> E[Deploy]`;

const MID_EDIT = `flowchart TD
  A[Pull request] --> B[Lint]
  B --> C[Unit tests]
  C --> I[Integration tests]
  I --> D[Build]
  D --> S[Sign artifact]
  S -->`;

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await writeFile(file, await page.screenshot());
  console.log(`  ${path.relative(root, file)}`);
}

const browser = await chromium.launch();
const page = await openHarness(browser, { width: 1280, height: 720 });
await mkdir(outDir, { recursive: true });

console.log('writing screenshots');

// 1. The core proposition: the same diagram either side, differences visible at a glance.
await compare(page, BEFORE, AFTER, 'deploy-pipeline.mmd');
await settle(page);
await page.click('#fit');
await settle(page);
await shot(page, 'compare');

// 2. Mid-edit: invalid source keeps the last good render and flags it, rather than blanking.
await compare(page, BEFORE, MID_EDIT, 'deploy-pipeline.mmd');
await settle(page);
await shot(page, 'live-edit');

// 3. Panes unlocked, each framed on its own.
await compare(page, BEFORE, AFTER, 'deploy-pipeline.mmd');
await settle(page);
await page.click('#sync');
await page.click('#fit');
await settle(page);
await shot(page, 'independent-panes');

await browser.close();
