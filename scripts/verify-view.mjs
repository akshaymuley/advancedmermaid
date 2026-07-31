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

  console.log('\noverlay mode');
  {
    // Left is the small VALID diagram, right the WIDE one, so "fits the larger" is meaningful.
    // Start from sync off: leaving overlay has to give that back, not silently keep them locked.
    await page.click('#sync');
    check('sync is off before overlaying', (await page.getAttribute('#sync', 'aria-pressed')) === 'false');

    await page.selectOption('#mode', 'overlay');
    await settle(page);

    check('the mode picker holds the selection', (await page.inputValue('#mode')) === 'overlay');
    check('the opacity slider appears with it', await page.isVisible('#opacity'));

    const stacked = await page.evaluate(() => {
      const box = (side) =>
        document.querySelector(`.pane[data-side="${side}"] .canvas`).getBoundingClientRect();
      const [a, b] = [box('left'), box('right')];
      return { same: Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 };
    });
    check('both panes occupy the same space', stacked.same);

    check('sync is forced on', (await page.getAttribute('#sync', 'aria-pressed')) === 'true');
    check('and the sync control is disabled while it is', await page.isDisabled('#sync'));
    check('so the two layers share one view',
      JSON.stringify(await readView(page, 'left')) === JSON.stringify(await readView(page, 'right')));

    const opacityOf = (side) =>
      page.evaluate((s) => getComputedStyle(document.getElementById(`${s}-viewport`)).opacity, side);
    check('the lower layer stays opaque', near(Number(await opacityOf('left')), 1, 0.01),
      await opacityOf('left'));
    check('the upper layer starts half faded', near(Number(await opacityOf('right')), 0.5, 0.01),
      await opacityOf('right'));

    await page.locator('#opacity').fill('20');
    await settle(page);
    check('the slider fades the upper layer', near(Number(await opacityOf('right')), 0.2, 0.01),
      await opacityOf('right'));

    await page.click('#fit');
    await settle(page);
    for (const side of ['left', 'right']) {
      const fit = await fitsInPane(page, side);
      check(`the ${side} layer fits the stacked canvas`, fit.ok, fit.reason);
    }
    await page.screenshot({ path: path.join(shots, '6-overlay.png') });

    await page.selectOption('#mode', 'sideBySide');
    await settle(page);
    check('leaving overlay restores two panes', !(await page.evaluate(() => {
      const box = (side) =>
        document.querySelector(`.pane[data-side="${side}"] .canvas`).getBoundingClientRect();
      return Math.abs(box('left').left - box('right').left) < 1;
    })));
    check('and hides the opacity slider', !(await page.isVisible('#opacity')));
    check('and gives back the sync setting it borrowed',
      (await page.getAttribute('#sync', 'aria-pressed')) === 'false');
    check('and re-enables the control', !(await page.isDisabled('#sync')));

    await page.click('#sync'); // Leave the panes synced for anything that follows.
  }

  console.log('\nswipe mode');
  {
    const dividerScreenX = () =>
      page.evaluate(() => document.getElementById('swipe-handle').getBoundingClientRect().left);
    const clipOf = (side) =>
      page.evaluate(
        (s) => getComputedStyle(document.querySelector(`.pane[data-side="${s}"] .canvas`)).clipPath,
        side
      );

    check('the divider is out of the way side by side', !(await page.isVisible('#swipe-handle')));

    await page.selectOption('#mode', 'swipe');
    await settle(page);
    check('selecting Swipe shows the divider', await page.isVisible('#swipe-handle'));
    check('the panes stack', await page.evaluate(() => {
      const box = (s) => document.querySelector(`.pane[data-side="${s}"] .canvas`).getBoundingClientRect();
      return Math.abs(box('left').left - box('right').left) < 1;
    }));
    check('the upper layer is clipped at the divider', (await clipOf('right')).includes('inset'),
      await clipOf('right'));
    check('the lower layer is not clipped', !(await clipOf('left')).includes('inset'),
      await clipOf('left'));
    check('no opacity slider in swipe — the divider is the control',
      !(await page.isVisible('#opacity')));
    await page.screenshot({ path: path.join(shots, '7-swipe.png') });

    // Drag the handle a quarter of the way left.
    const panes = await page.evaluate(() => {
      const r = document.getElementById('panes').getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const before = await dividerScreenX();
    await page.mouse.move(before + 5, panes.top + panes.height / 2);
    await page.mouse.down();
    await page.mouse.move(panes.left + panes.width * 0.25, panes.top + panes.height / 2, { steps: 8 });
    await page.mouse.up();
    await settle(page);

    const dragged = await dividerScreenX();
    check('dragging moves the divider', Math.abs(dragged - before) > 50, `${before} -> ${dragged}`);
    // Computed `clip-path` keeps the percentage rather than resolving it to pixels, so compare
    // in the units it actually reports.
    const clipPercent = async () =>
      Number((await clipOf('right')).match(/inset\(0px 0px 0px ([\d.]+)%\)/)?.[1] ?? -1);
    const asPercent = (screenX) => ((screenX + 5 - panes.left) / panes.width) * 100;

    check('and the clip follows it', near(await clipPercent(), asPercent(dragged), 1.5),
      `clip=${await clipOf('right')} handle=${asPercent(dragged).toFixed(1)}%`);

    const panned = await readView(page, 'left');
    check('dragging the divider does not pan the diagram underneath',
      JSON.stringify(panned) === JSON.stringify(await readView(page, 'right')));

    // The check this whole design hinges on: clip the transformed viewport instead of the
    // untransformed canvas and the divider drifts the moment anyone zooms.
    const heldAt = await dividerScreenX();
    await page.click('#zoom-in');
    await page.click('#zoom-in');
    await settle(page);
    check('the divider stays put when the diagrams zoom',
      near(await dividerScreenX(), heldAt, 1), `${heldAt} -> ${await dividerScreenX()}`);
    check('and the clip stays with it', near(await clipPercent(), asPercent(heldAt), 1.5),
      `clip=${await clipOf('right')} handle=${asPercent(heldAt).toFixed(1)}%`);

    await page.focus('#swipe-handle');
    const beforeKeys = await dividerScreenX();
    await page.keyboard.press('ArrowRight');
    check('arrow keys nudge the divider', (await dividerScreenX()) > beforeKeys);
    await page.keyboard.press('Home');
    check('Home pins it to the left edge',
      near(await dividerScreenX(), panes.left - 5, 2), `${await dividerScreenX()} vs ${panes.left}`);
    await page.keyboard.press('End');
    check('End pins it to the right edge',
      near(await dividerScreenX(), panes.left + panes.width - 5, 2));
    await page.keyboard.press('ArrowRight');
    check('and it does not overshoot the edge',
      near(await dividerScreenX(), panes.left + panes.width - 5, 2));

    await page.selectOption('#mode', 'sideBySide');
    await settle(page);
    check('leaving swipe hides the divider', !(await page.isVisible('#swipe-handle')));
    check('and unclips the upper layer', !(await clipOf('right')).includes('inset'),
      await clipOf('right'));
    check('and gives back the sync setting borrowed by the stacked modes',
      (await page.getAttribute('#sync', 'aria-pressed')) === 'true');
  }

  console.log('\nblink mode');
  {
    /**
     * Sample the upper layer's opacity across more than a full cycle. A declared animation and a
     * *running* one look identical in the stylesheet; only the values over time tell them apart.
     */
    const opacitiesOverTime = async (samples = 12, gapMs = 120) => {
      const seen = new Set();
      for (let i = 0; i < samples; i++) {
        seen.add(
          await page.evaluate(
            () => getComputedStyle(document.getElementById('right-viewport')).opacity
          )
        );
        await page.waitForTimeout(gapMs);
      }
      return [...seen].sort();
    };
    const animation = (selector, property) =>
      page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [selector, property]);

    await page.selectOption('#mode', 'blink');
    await page.selectOption('#blink-speed', '0.8s');
    await settle(page);

    check('selecting Blink shows its controls', await page.isVisible('#blink-controls'));
    check('and leaves the other modes\' controls alone',
      !(await page.isVisible('#opacity')) && !(await page.isVisible('#swipe-handle')));
    check('the panes stack', await page.evaluate(() => {
      const box = (s) => document.querySelector(`.pane[data-side="${s}"] .canvas`).getBoundingClientRect();
      return Math.abs(box('left').left - box('right').left) < 1;
    }));
    check('the speed picker drives the cycle length',
      (await animation('#right-viewport', 'animationDuration')) === '0.8s',
      await animation('#right-viewport', 'animationDuration'));
    await page.screenshot({ path: path.join(shots, '8-blink.png') });

    const running = await opacitiesOverTime();
    check('the layers actually alternate', running.length > 1, running.join(', '));
    check('and swap outright rather than fading through', running.every((v) => v === '0' || v === '1'),
      running.join(', '));

    const headers = await animation('#pane-headers header[data-side="left"]', 'animationName');
    check('the legend alternates with them, so it never names the wrong version',
      headers !== 'none', headers);

    await page.click('#blink-pause');
    await settle(page);
    const paused = await opacitiesOverTime(6);
    check('Pause stops it', paused.length === 1, paused.join(', '));
    check('and leaves the newer version whole rather than mid-cycle', paused[0] === '1', paused[0]);
    check('the button says how to undo itself', (await page.textContent('#blink-pause')) === 'Resume');

    await page.click('#blink-pause');
    await settle(page);
    check('Resume starts it again', (await opacitiesOverTime()).length > 1);

    // Reduced motion: the preference must be honoured on entry without disabling the mode.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.selectOption('#mode', 'sideBySide');
    await page.selectOption('#mode', 'blink');
    await settle(page);
    check('reduced motion starts blink paused rather than animating unasked',
      (await page.getAttribute('#blink-pause', 'aria-pressed')) === 'true');
    check('and it really is still', (await opacitiesOverTime(6)).length === 1);

    await page.click('#blink-pause');
    await settle(page);
    check('but opting in still works — the preference seeds the state, it does not veto it',
      (await opacitiesOverTime()).length > 1);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.selectOption('#mode', 'sideBySide');
    await settle(page);
    check('leaving blink stops the animation',
      (await animation('#right-viewport', 'animationName')) === 'none',
      await animation('#right-viewport', 'animationName'));
    check('and hides its controls', !(await page.isVisible('#blink-controls')));
    check('and gives back the sync setting',
      (await page.getAttribute('#sync', 'aria-pressed')) === 'true');
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
