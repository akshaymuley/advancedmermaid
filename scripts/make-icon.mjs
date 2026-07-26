/**
 * Renders media/icon.svg to media/icon.png at 128x128, plus a 32x32 proof so the mark can be
 * checked at the size the Marketplace list actually shows it. Uses the Chromium that Playwright
 * already installs for `npm run verify:view`.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'media', 'icon.svg');
const target = path.join(root, 'media', 'icon.png');
const proof = path.join(root, 'dist', 'icon-32.png');

const svg = await readFile(source, 'utf8');
const browser = await chromium.launch();

async function render(size, outfile) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  );
  await writeFile(outfile, await page.screenshot({ omitBackground: true }));
  await page.close();
  console.log(`${size}x${size} -> ${path.relative(root, outfile)}`);
}

await render(128, target);
await render(32, proof);
await browser.close();
