/**
 * Shared plumbing for driving harness/index.html in Chromium.
 * Used by verify-view.mjs (assertions) and make-screenshots.mjs (README images).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const harnessUrl = pathToFileURL(path.join(root, 'harness', 'index.html')).href;

/** Post a compare message, exactly as the panel would. */
export const compare = (page, left, right, title = 'harness.mmd') =>
  page.evaluate(
    ([l, r, t]) =>
      window.__compare({
        title: t,
        left: { label: 'HEAD', content: l },
        right: { label: 'Working Tree', content: r },
      }),
    [left, right, title]
  );

/** The webview renders asynchronously; settle before measuring or capturing. */
export const settle = (page) => page.waitForTimeout(300);

/** Open the harness and wait until the webview module is live. */
export async function openHarness(browser, viewport = { width: 1200, height: 700 }) {
  const page = await browser.newPage({ viewport });
  await page.goto(harnessUrl);
  await page.waitForFunction(() => typeof window.__compare === 'function');
  await settle(page);
  return page;
}

/** Parse the `matrix(...)` a viewport's transform computes to. */
export const readView = (page, side) =>
  page.evaluate((s) => {
    const matrix = new DOMMatrix(
      getComputedStyle(document.getElementById(`${s}-viewport`)).transform
    );
    return { x: matrix.m41, y: matrix.m42, scale: matrix.a };
  }, side);
