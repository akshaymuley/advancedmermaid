import { describe, it, expect } from 'vitest';
import {
  clampScale,
  computeFitView,
  dividerPercent,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  zoomAt,
  View,
} from './view-math';

const at = (x: number, y: number, scale: number): View => ({ x, y, scale });

describe('clampScale', () => {
  it('leaves a scale inside the range alone', () => {
    expect(clampScale(1.5)).toBe(1.5);
  });

  it('clamps to the limits', () => {
    expect(clampScale(0.001)).toBe(MIN_SCALE);
    expect(clampScale(1000)).toBe(MAX_SCALE);
  });

  it('falls back to 1 for a non-finite scale', () => {
    expect(clampScale(NaN)).toBe(1);
    expect(clampScale(Infinity)).toBe(MAX_SCALE);
  });
});

describe('panBy', () => {
  it('offsets x and y and leaves scale untouched', () => {
    expect(panBy(at(10, 20, 2), 5, -5)).toEqual(at(15, 15, 2));
  });

  it('does not mutate the input', () => {
    const view = at(10, 20, 2);
    panBy(view, 5, 5);
    expect(view).toEqual(at(10, 20, 2));
  });
});

describe('zoomAt', () => {
  it('scales by the factor', () => {
    expect(zoomAt(at(0, 0, 1), 2, { x: 0, y: 0 }).scale).toBe(2);
  });

  it('keeps the anchor point over the same content', () => {
    const anchor = { x: 100, y: 50 };
    const before = at(20, 10, 1);
    const after = zoomAt(before, 2, anchor);

    // The content coordinate under the anchor must be unchanged by the zoom.
    const contentX = (anchor.x - before.x) / before.scale;
    const contentY = (anchor.y - before.y) / before.scale;
    expect(after.x + contentX * after.scale).toBeCloseTo(anchor.x);
    expect(after.y + contentY * after.scale).toBeCloseTo(anchor.y);
  });

  it('clamps at the maximum', () => {
    expect(zoomAt(at(0, 0, MAX_SCALE / 2), 100, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
  });

  it('clamps at the minimum', () => {
    expect(zoomAt(at(0, 0, MIN_SCALE * 2), 0.001, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });

  it('is a no-op once already at a limit, with no anchor drift', () => {
    const atMax = at(37, 12, MAX_SCALE);
    expect(zoomAt(atMax, 2, { x: 100, y: 100 })).toEqual(atMax);

    const atMin = at(37, 12, MIN_SCALE);
    expect(zoomAt(atMin, 0.5, { x: 100, y: 100 })).toEqual(atMin);
  });

  it('does not mutate the input', () => {
    const view = at(10, 20, 1);
    zoomAt(view, 2, { x: 0, y: 0 });
    expect(view).toEqual(at(10, 20, 1));
  });
});

describe('computeFitView', () => {
  const viewport = { width: 400, height: 300 };

  it('scales a wide diagram to the width, minus padding on both sides', () => {
    // (400 - 2*20) / 720 = 0.5
    const fit = computeFitView({ width: 720, height: 100 }, viewport, 20);
    expect(fit.scale).toBeCloseTo(0.5);
  });

  it('scales a tall diagram to the height, minus padding on both sides', () => {
    // (300 - 2*20) / 520 = 0.5
    const fit = computeFitView({ width: 100, height: 520 }, viewport, 20);
    expect(fit.scale).toBeCloseTo(0.5);
  });

  it('centres the content in the pane', () => {
    const fit = computeFitView({ width: 720, height: 100 }, viewport, 20);
    expect(fit.x).toBeCloseTo((400 - 720 * fit.scale) / 2);
    expect(fit.y).toBeCloseTo((300 - 100 * fit.scale) / 2);
  });

  it('upscales a small diagram to fill the pane', () => {
    const fit = computeFitView({ width: 40, height: 30 }, viewport, 20);
    expect(fit.scale).toBeGreaterThan(1);
  });

  it('never exceeds the maximum scale', () => {
    const fit = computeFitView({ width: 1, height: 1 }, viewport);
    expect(fit.scale).toBe(MAX_SCALE);
  });

  it('never goes below the minimum scale', () => {
    const fit = computeFitView({ width: 1e6, height: 1e6 }, viewport);
    expect(fit.scale).toBe(MIN_SCALE);
  });

  it.each([
    ['zero-width content', { width: 0, height: 100 }, viewport],
    ['zero-height content', { width: 100, height: 0 }, viewport],
    ['negative content', { width: -10, height: 100 }, viewport],
    ['NaN content', { width: NaN, height: 100 }, viewport],
    ['infinite content', { width: Infinity, height: 100 }, viewport],
    ['zero-size viewport', { width: 100, height: 100 }, { width: 0, height: 0 }],
    ['NaN viewport', { width: 100, height: 100 }, { width: NaN, height: 300 }],
  ])('falls back to a safe view for %s', (_label, content, pane) => {
    expect(computeFitView(content, pane, 24)).toEqual({ x: 24, y: 24, scale: 1 });
  });

  it('falls back rather than producing a negative scale when padding exceeds the pane', () => {
    expect(computeFitView({ width: 100, height: 100 }, { width: 30, height: 30 }, 24)).toEqual({
      x: 24,
      y: 24,
      scale: 1,
    });
  });
});

describe('dividerPercent', () => {
  const rect = { left: 100, width: 400 };

  it('reports where in the pane the pointer is', () => {
    expect(dividerPercent(300, rect)).toBe(50);
    expect(dividerPercent(200, rect)).toBe(25);
  });

  it('pins to the edges rather than overshooting', () => {
    // A drag continues outside the panel; 140% would clip the layer away entirely and leave the
    // handle stranded off screen.
    expect(dividerPercent(900, rect)).toBe(100);
    expect(dividerPercent(-50, rect)).toBe(0);
  });

  it('reports the edges exactly', () => {
    expect(dividerPercent(100, rect)).toBe(0);
    expect(dividerPercent(500, rect)).toBe(100);
  });

  it('survives a pane with no width instead of returning NaN', () => {
    // Happens if a drag begins in the frame where the panel is still laying out.
    expect(dividerPercent(100, { left: 100, width: 0 })).toBe(50);
  });
});
