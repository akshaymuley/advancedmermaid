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

// Every change kind in one pair: A reworded, L added, D dropped, and B->C replaced by a detour.
const SEMANTIC_BEFORE =
  'flowchart TD\n  A[Build] --> B[Unit tests]\n  B --> C[Deploy]\n  B --> D[Notify]';
const SEMANTIC_AFTER =
  'flowchart TD\n  A[Build image] --> B[Unit tests]\n  B --> L[Lint]\n  L --> C[Deploy]';

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

    // Mermaid's default is Trebuchet MS, which sat a few pixels from a panel drawn in the editor's
    // own font for five releases. Only a real render can say which font actually applied.
    const fonts = await page.evaluate(() => ({
      label: getComputedStyle(document.querySelector('#left-viewport .nodeLabel')).fontFamily,
      panel: getComputedStyle(document.body).fontFamily,
    }));
    check('the diagram is drawn in the editor font, not mermaid\'s own',
      fonts.label === fonts.panel, `${fonts.label} vs ${fonts.panel}`);
    // A CSS variable would satisfy the check above and still export as a default serif, since an
    // exported SVG has nothing to resolve it against.
    check('and that font is resolved, so it survives being exported',
      !fonts.label.includes('var('), fonts.label);

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

  console.log('\nsemantic mode');
  {
    /**
     * The one mode whose output is a diagram this project *generated*, so the browser is the only
     * place that can say whether mermaid accepts it. Every other mode fails visibly; a merged
     * render that mermaid rejects would just leave an empty pane.
     */
    const mergedText = () => page.textContent('#merged-viewport');

    await compare(page, SEMANTIC_BEFORE, SEMANTIC_AFTER);
    await page.selectOption('#mode', 'semantic');
    await settle(page);

    check('the merged pane is the one on screen', await page.isVisible('#merged-viewport'));
    check('and the two version panes are not',
      !(await page.isVisible('#left-viewport')) && !(await page.isVisible('#right-viewport')));
    check('mermaid accepted the generated source and drew it',
      await page.evaluate(() => !!document.querySelector('#merged-viewport svg')));

    const text = await mergedText();
    check('the merged diagram holds nodes from both versions',
      text.includes('Deploy') && text.includes('Unit tests'), text);
    check('and says what a reworded node used to say',
      text.includes('was: Build'), text);

    // classDef reaches the SVG as a class on the node group; if the styling block were dropped or
    // misnumbered the diagram would still render, just with nothing marked.
    const marked = await page.evaluate(() => ({
      added: document.querySelectorAll('#merged-viewport .added').length,
      removed: document.querySelectorAll('#merged-viewport .removed').length,
      changed: document.querySelectorAll('#merged-viewport .changed').length,
    }));
    check('the changes are actually marked up in the render',
      marked.added > 0 && marked.removed > 0 && marked.changed > 0, JSON.stringify(marked));

    // Edges take `linkStyle`, which mermaid applies as an inline style rather than as a class —
    // so the node check above says nothing about them, and a misnumbered linkStyle would style
    // the wrong edge or none at all while everything still rendered.
    const dashedLink = await page.evaluate(() =>
      [...document.querySelectorAll('#merged-viewport path')].some((p) =>
        (p.getAttribute('style') ?? '').includes('stroke-dasharray')));
    check('a removed edge is dashed too, so colour is not the only signal', dashedLink);

    check('the legend is showing', await page.isVisible('#semantic-legend'));
    check('and the notice is not, since the diff applied',
      !(await page.isVisible('#semantic-notice')));
    check('sync is pinned, there being one diagram to frame',
      await page.evaluate(() => document.getElementById('sync').disabled));

    // Semantic shares one view with the stacked modes but must not be laid out like them: the
    // stacked grid would put the merged pane on top of the two it replaces.
    check('the layout is semantic rather than stacked',
      await page.evaluate(() => {
        const panes = document.getElementById('panes').classList;
        return panes.contains('semantic') && !panes.contains('stacked');
      }));

    const framed = await fitsInPane(page, 'merged');
    check('the merged diagram is framed inside its pane', framed.ok, framed.reason);
    await page.screenshot({ path: path.join(shots, '9-semantic.png') });

    // Panning must move the merged diagram, not the panes hidden behind it.
    const before = await readView(page, 'merged');
    await page.mouse.move(600, 400);
    await page.mouse.down();
    await page.mouse.move(660, 430);
    await page.mouse.up();
    const after = await readView(page, 'merged');
    check('dragging pans the merged diagram', after.x !== before.x || after.y !== before.y,
      `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

    /**
     * Which composition Export uses is wiring, and wiring is what this file is for: the two
     * compositions are pure and unit-tested, but nothing there can say the right one was picked
     * for what is on screen.
     */
    const exportNow = async (format) => {
      await page.evaluate((f) => {
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'exportAs', format: f } }));
      }, format);
      await page.waitForTimeout(600);
      return page.evaluate(() =>
        [...window.__posted].reverse().find((m) => m.type === 'exportData'));
    };
    const describeSvg = (markup) => page.evaluate((m) => {
      const doc = new DOMParser().parseFromString(m, 'image/svg+xml');
      return {
        error: !!doc.querySelector('parsererror'),
        nested: [...doc.documentElement.children].filter((c) => c.tagName === 'svg').length,
        text: doc.documentElement.textContent,
      };
    }, markup);

    const mergedSvg = await exportNow('svg');
    const mergedDoc = await describeSvg(mergedSvg?.data ?? '');
    check('the exported SVG parses', !mergedDoc.error);
    check('exporting from Semantic writes the merged diagram, not the two versions',
      mergedDoc.nested === 1, `nested svg: ${mergedDoc.nested}`);
    check('still titled with both sides, so the image says what it compares',
      mergedDoc.text.includes('HEAD') && mergedDoc.text.includes('Working Tree'),
      mergedDoc.text.slice(0, 80));
    // The on-screen legend is HTML in the panel header; it cannot travel with the file.
    check('and carries its own key, which the panel legend cannot supply',
      ['Added', 'Removed', 'Changed'].every((k) => mergedDoc.text.includes(k)),
      mergedDoc.text.slice(0, 120));

    const mergedPng = Buffer.from((await exportNow('png'))?.data ?? '', 'base64');
    check('and rasterises to a real PNG rather than an empty canvas',
      mergedPng.subarray(1, 4).toString() === 'PNG' && mergedPng.length > 2000,
      `${mergedPng.length} bytes`);

    // The fallback. A sequence diagram can't be graphed, and the mode must say so rather than
    // showing an empty pane.
    await compare(page, 'sequenceDiagram\n  A ->> B: hi', 'sequenceDiagram\n  A ->> B: hello');
    await settle(page);
    check('an undiffable pair falls back to both versions side by side',
      (await page.isVisible('#left-viewport')) && (await page.isVisible('#right-viewport')));
    check('and says why', await page.isVisible('#semantic-notice'));
    check('with the legend put away', !(await page.isVisible('#semantic-legend')));
    check('while the picker still shows what was asked for',
      (await page.inputValue('#mode')) === 'semantic');
    await page.screenshot({ path: path.join(shots, '10-semantic-fallback.png') });

    // ...and back again, without needing the mode reselected.
    await compare(page, SEMANTIC_BEFORE, SEMANTIC_AFTER);
    await settle(page);
    check('editing back to a flowchart restores the merged diagram',
      (await page.isVisible('#merged-viewport')) && !(await page.isVisible('#semantic-notice')));

    // A fallback is showing two panes, so it must export two — the mode alone doesn't decide.
    await compare(page, 'sequenceDiagram\n  A ->> B: hi', 'sequenceDiagram\n  A ->> B: hello');
    await settle(page);
    const fallbackDoc = await describeSvg((await exportNow('svg'))?.data ?? '');
    check('a fallback exports both versions, matching what it is showing',
      fallbackDoc.nested === 2, `nested svg: ${fallbackDoc.nested}`);

    await compare(page, SEMANTIC_BEFORE, SEMANTIC_AFTER);
    await settle(page);
    await page.selectOption('#mode', 'sideBySide');
    await settle(page);
    check('leaving semantic puts the two panes back',
      (await page.isVisible('#left-viewport')) && !(await page.isVisible('#merged-viewport')));
    check('and hides the legend', !(await page.isVisible('#semantic-legend')));

    const backDoc = await describeSvg((await exportNow('svg'))?.data ?? '');
    check('and the export goes back to writing both versions',
      backDoc.nested === 2, `nested svg: ${backDoc.nested}`);
  }

  console.log('\nexport');
  {
    // Two different diagrams, so a composition that dropped or duplicated a side would show.
    await compare(page, VALID, WIDE);
    await settle(page);

    const lastPosted = (type) =>
      page.evaluate((t) => [...window.__posted].reverse().find((m) => m.type === t), type);
    const askFor = async (format) => {
      await page.evaluate((f) => {
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'exportAs', format: f } }));
      }, format);
      await page.waitForTimeout(600);
      return lastPosted('exportData');
    };

    await page.click('#export');
    check('Export asks the host where to put it, rather than guessing',
      (await lastPosted('export')) !== undefined);

    const svgExport = await askFor('svg');
    check('the host gets SVG back when the dialog settled on SVG',
      svgExport?.format === 'svg' && svgExport.data.startsWith('<svg'),
      JSON.stringify(svgExport?.data ?? '').slice(0, 60));

    const parsed = await page.evaluate((markup) => {
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      const root = doc.documentElement;
      return {
        error: !!doc.querySelector('parsererror'),
        nested: [...root.children].filter((c) => c.tagName === 'svg').length,
        text: root.textContent,
        width: Number(root.getAttribute('width')),
        height: Number(root.getAttribute('height')),
      };
    }, svgExport.data);

    check('the exported SVG parses', !parsed.error);
    check('and holds both diagrams', parsed.nested === 2, `nested svg: ${parsed.nested}`);
    check('and names both sides, so the image says what it compares',
      parsed.text.includes('HEAD') && parsed.text.includes('Working Tree'));
    check('at a size that fits them both', parsed.width > 200 && parsed.height > 50,
      `${parsed.width}x${parsed.height}`);

    // A dark render exported onto a white background is light text on white — invisible. The
    // first version fell back to white whenever the theme variable was missing, which is how
    // this check came to exist.
    const background = await page.evaluate((markup) => {
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      return doc.querySelector('rect')?.getAttribute('fill');
    }, svgExport.data);
    check('on a background matching the theme, not a hardcoded white',
      background === 'rgb(30, 30, 30)' || background === '#1e1e1e', background);

    // The other half of the font trap: the export leaves the webview, so a `var(--vscode-...)`
    // reference in the markup would resolve to nothing and the text would come out as a serif.
    check('carrying real font names rather than a variable nothing can resolve',
      /font-family:[^;}]+/.test(svgExport.data) && !svgExport.data.includes('var(--vscode-font'),
      (svgExport.data.match(/font-family:[^;}]+/) ?? ['none'])[0]);

    const pngExport = await askFor('png');
    const png = Buffer.from(pngExport?.data ?? '', 'base64');
    const isPng = png.subarray(1, 4).toString() === 'PNG';
    check('the host gets PNG bytes back when the dialog settled on PNG',
      pngExport?.format === 'png' && isPng, png.subarray(0, 8).toString('hex'));

    // The rasterisation is the part that can silently produce a blank image: mermaid's flowchart
    // labels are `<foreignObject>`, which some engines refuse to draw into a canvas.
    // Rounded, because a diagram's natural width is routinely fractional — 1866.28125 doubles to
    // 3732.5625, and a canvas is whole pixels.
    check('rasterised at 2x, so it survives being scaled down',
      png.readUInt32BE(16) === Math.round(parsed.width * 2) &&
        png.readUInt32BE(20) === Math.round(parsed.height * 2),
      `${png.readUInt32BE(16)}x${png.readUInt32BE(20)} vs svg ${parsed.width}x${parsed.height}`);
    check('and carries real image data rather than an empty canvas', png.length > 2000,
      `${png.length} bytes`);
  }

  console.log('\nhost messages');
  {
    const posted = await page.evaluate(() => window.__posted);
    check('the webview announced itself as ready', posted.some((m) => m.type === 'ready'));
    await page.click('#refresh');
    check('Refresh posts a refresh message to the host',
      (await page.evaluate(() => window.__posted)).some((m) => m.type === 'refresh'));

    /**
     * A reload can only restore a panel from what the webview handed to `setState`. The host and
     * the serializer are the extension host's business, but *whether the webview passes the state
     * on at all* is browser code, and this is the only place that runs it.
     */
    const kept = await page.evaluate(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'compare',
          title: 'restore me',
          left: { label: 'HEAD', content: 'flowchart TD\n A --> B' },
          right: { label: 'Working Tree', content: 'flowchart TD\n A --> C' },
          state: { version: 1, left: { uri: 'file:///a.mmd' }, right: { uri: 'file:///a.mmd' } },
        },
      }));
      await new Promise((resolve) => setTimeout(resolve, 300));
      return window.__state;
    });
    check('a compare message carrying state hands it to setState, so a reload can restore it',
      kept?.version === 1 && kept?.left?.uri === 'file:///a.mmd', JSON.stringify(kept));

    // Without this guard the first message of every panel — which has no state — would blank
    // whatever VS Code had kept.
    const survives = await page.evaluate(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'compare',
          title: 'no state here',
          left: { label: 'HEAD', content: 'flowchart TD\n A --> B' },
          right: { label: 'Working Tree', content: 'flowchart TD\n A --> D' },
        },
      }));
      await new Promise((resolve) => setTimeout(resolve, 300));
      return window.__state;
    });
    check('and a message without state leaves what was kept alone',
      survives?.version === 1, JSON.stringify(survives));
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
