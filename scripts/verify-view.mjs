/**
 * Drives the webview harness in a real browser and asserts the view controls behave.
 *
 * The webview is the one part of this extension that unit tests can only reach obliquely: the
 * maths lives in src/webview/view-math.ts and is tested directly, but whether the buttons are
 * wired to it, whether a diagram actually ends up framed, and whether the panes really do
 * decouple can only be answered by rendering the thing. Run with `npm run verify:view`.
 *
 * Not part of `npm test` — it needs `npx playwright install chromium` first.
 */
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { compare, openHarness, readView, root, settle } from './harness-helpers.mjs';

const shots = path.join(root, 'dist', 'view-screenshots');

const VALID = 'flowchart TD\n  A[Start] --> B[Middle]\n  B --> C[End]';
const BROKEN = 'flowchart TD\n  A[Start] -->';
const WIDE = `flowchart LR\n${Array.from({ length: 12 }, (_, i) => `  N${i} --> N${i + 1}`).join('\n')}`;

let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function near(actual, expected, tolerance = 1) {
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Does the rendered diagram actually sit inside its pane?
 *
 * This is the check that matters and the one the transform maths can't make on its own: a fit
 * computed from the wrong content size still produces a plausible-looking scale.
 */
async function fitsInPane(page, side) {
  return page.evaluate((s) => {
    const svg = document.querySelector(`#${s}-viewport svg`);
    const canvas = document.querySelector(`.pane[data-side="${s}"] .canvas`);
    if (!svg || !canvas) {
      return { ok: false, reason: 'no svg' };
    }
    const a = svg.getBoundingClientRect();
    const b = canvas.getBoundingClientRect();
    const slack = 1;
    return {
      ok:
        a.left >= b.left - slack &&
        a.right <= b.right + slack &&
        a.top >= b.top - slack &&
        a.bottom <= b.bottom + slack,
      reason: `svg ${Math.round(a.width)}x${Math.round(a.height)} at (${Math.round(a.left - b.left)}, ${Math.round(a.top - b.top)}) in pane ${Math.round(b.width)}x${Math.round(b.height)}`,
    };
  }, side);
}

async function main() {
  await rm(shots, { recursive: true, force: true });
  await mkdir(shots, { recursive: true });

  const browser = await chromium.launch();
  const page = await openHarness(browser);

  page.on('pageerror', (err) => {
    failures++;
    console.log(`  FAIL uncaught page error — ${err.message}`);
  });

  console.log('\nfirst render');
  {
    const view = await readView(page, 'left');
    const pane = await page.evaluate(() => document.querySelector('.canvas').clientWidth);
    check('is not the old hardcoded 40/40/1', !(near(view.x, 40) && near(view.y, 40) && near(view.scale, 1)),
      JSON.stringify(view));
    check('is scaled to fit rather than left at 1', view.scale !== 1, `scale=${view.scale}`);
    check('is horizontally centred', view.x > 0 && view.x < pane, `x=${view.x}, pane=${pane}`);
    check('both panes agree while synced',
      JSON.stringify(view) === JSON.stringify(await readView(page, 'right')));

    for (const side of ['left', 'right']) {
      const fit = await fitsInPane(page, side);
      check(`the ${side} diagram is wholly inside its pane`, fit.ok, fit.reason);
    }
    await page.screenshot({ path: path.join(shots, '1-first-render-fit.png') });
  }

  console.log('\nzoom buttons');
  {
    const before = await readView(page, 'left');
    await page.click('#zoom-in');
    const zoomedIn = await readView(page, 'left');
    check('zoom in scales up by 1.2', near(zoomedIn.scale, before.scale * 1.2, 0.001),
      `${before.scale} -> ${zoomedIn.scale}`);

    await page.click('#zoom-out');
    check('zoom out returns to the previous scale', near((await readView(page, 'left')).scale, before.scale, 0.001));

    check('the readout tracks the scale',
      (await page.textContent('#zoom-level')) === `${Math.round(before.scale * 100)}%`,
      await page.textContent('#zoom-level'));
  }

  console.log('\nzoom clamping');
  {
    for (let i = 0; i < 40; i++) {
      await page.click('#zoom-in');
    }
    const maxed = await readView(page, 'left');
    check('stops at the maximum scale', near(maxed.scale, 8, 0.001), `scale=${maxed.scale}`);
    await page.click('#zoom-in');
    check('zooming past the maximum is a no-op',
      JSON.stringify(await readView(page, 'left')) === JSON.stringify(maxed));

    for (let i = 0; i < 60; i++) {
      await page.click('#zoom-out');
    }
    const mined = await readView(page, 'left');
    check('stops at the minimum scale', near(mined.scale, 0.1, 0.001), `scale=${mined.scale}`);
  }

  console.log('\nfit button and keyboard');
  {
    await page.click('#fit');
    const fitted = await readView(page, 'left');
    check('Fit reframes after the view has been mangled', fitted.scale > 0.1 && fitted.scale < 8,
      `scale=${fitted.scale}`);

    await page.click('#zoom-in');
    await page.keyboard.press('0');
    check('pressing 0 fits', JSON.stringify(await readView(page, 'left')) === JSON.stringify(fitted));

    await page.keyboard.press('+');
    check('pressing + zooms in', (await readView(page, 'left')).scale > fitted.scale);
    await page.keyboard.press('-');
    check('pressing - zooms back out', near((await readView(page, 'left')).scale, fitted.scale, 0.001));
  }

  console.log('\nsync toggle');
  {
    await page.click('#fit');
    check('sync starts on', (await page.getAttribute('#sync', 'aria-pressed')) === 'true');

    await page.click('#sync');
    check('toggles off', (await page.getAttribute('#sync', 'aria-pressed')) === 'false');

    // Zoom with the wheel over the right pane only; the left must stay put.
    const left = await readView(page, 'left');
    await page.hover('.pane[data-side="right"] .canvas');
    await page.mouse.wheel(0, -300);
    await settle(page);
    check('the unlocked panes diverge',
      (await readView(page, 'right')).scale !== (await readView(page, 'left')).scale);
    check('the untouched pane is unchanged',
      JSON.stringify(await readView(page, 'left')) === JSON.stringify(left));
    check('the readout shows both scales', (await page.textContent('#zoom-level')).includes('/'),
      await page.textContent('#zoom-level'));
    await page.screenshot({ path: path.join(shots, '2-unsynced.png') });

    const right = await readView(page, 'right');
    await page.click('#sync');
    check('re-syncing adopts the pane last interacted with',
      JSON.stringify(await readView(page, 'left')) === JSON.stringify(right),
      `left=${JSON.stringify(await readView(page, 'left'))} right=${JSON.stringify(right)}`);
  }

  console.log('\nmilestone 2 behaviour (never verified in a browser until now)');
  {
    await compare(page, '', VALID);
    await settle(page);
    check('a blank side renders the (empty) placeholder',
      (await page.textContent('#left-viewport')).includes('(empty)'));
    check('no parse error is shown for blank source',
      (await page.locator('#left-viewport .render-error').count()) === 0);
    await page.screenshot({ path: path.join(shots, '3-empty-side.png') });

    await compare(page, VALID, VALID);
    await settle(page);
    const good = await page.innerHTML('#right-viewport');
    check('a valid diagram renders an svg', good.includes('<svg'));

    await compare(page, VALID, BROKEN);
    await settle(page);
    check('a broken edit keeps the last good render',
      (await page.innerHTML('#right-viewport')).includes('<svg'));
    check('and raises the error badge', await page.isVisible('#right-badge'));
    check('with the parse error in its tooltip',
      ((await page.getAttribute('#right-badge', 'title')) ?? '').length > 0);
    await page.screenshot({ path: path.join(shots, '4-broken-edit-keeps-render.png') });

    await compare(page, VALID, WIDE);
    await settle(page);
    check('fixing the source clears the badge', !(await page.isVisible('#right-badge')));
  }

  console.log('\nfit with mismatched diagram sizes');
  {
    await page.click('#fit');
    await settle(page);
    check('both panes share a scale so the sizes stay comparable',
      near((await readView(page, 'left')).scale, (await readView(page, 'right')).scale, 0.001));
    for (const side of ['left', 'right']) {
      const fit = await fitsInPane(page, side);
      check(`the ${side} diagram still fits when the two differ in size`, fit.ok, fit.reason);
    }
    await page.screenshot({ path: path.join(shots, '5-fit-mismatched-sizes.png') });
  }

  console.log('\nhost messages');
  {
    const posted = await page.evaluate(() => window.__posted);
    check('the webview announced itself as ready', posted.some((m) => m.type === 'ready'));
    await page.click('#refresh');
    check('Refresh posts a refresh message to the host',
      (await page.evaluate(() => window.__posted)).some((m) => m.type === 'refresh'));
  }

  await browser.close();

  console.log(`\n${checks - failures}/${checks} checks passed`);
  console.log(`screenshots: ${shots}`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
