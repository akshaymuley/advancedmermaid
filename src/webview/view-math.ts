/**
 * Pan/zoom arithmetic for the compare panes. Pure — no DOM — so the interesting decisions are
 * testable and the webview module is left holding only event wiring.
 */
export interface View {
  x: number;
  y: number;
  scale: number;
}

export interface Box {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

export function clampScale(scale: number): number {
  if (Number.isNaN(scale)) {
    return 1;
  }
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function panBy(view: View, dx: number, dy: number): View {
  return { x: view.x + dx, y: view.y + dy, scale: view.scale };
}

/**
 * Zoom about `anchor` (in pane coordinates), keeping whatever content sits under it in place.
 *
 * The scale is clamped *before* the offsets are derived from it, so hitting a limit leaves the
 * view exactly as it was rather than sliding the diagram under a cursor that isn't zooming.
 */
export function zoomAt(view: View, factor: number, anchor: { x: number; y: number }): View {
  const scale = clampScale(view.scale * factor);
  const effective = scale / view.scale;
  return {
    x: anchor.x - (anchor.x - view.x) * effective,
    y: anchor.y - (anchor.y - view.y) * effective,
    scale,
  };
}

/**
 * Scale and centre `content` so it fits inside `viewport` with `padding` on every side.
 *
 * Upscaling is allowed: when comparing diagrams, a small one filling its pane is more useful
 * than one pinned at 100% in the corner.
 */
export function computeFitView(content: Box, viewport: Box, padding = 24): View {
  const available = {
    width: viewport.width - padding * 2,
    height: viewport.height - padding * 2,
  };

  if (!isPositive(content) || !isPositive(available)) {
    return { x: padding, y: padding, scale: 1 };
  }

  const scale = clampScale(
    Math.min(available.width / content.width, available.height / content.height)
  );

  return {
    x: (viewport.width - content.width * scale) / 2,
    y: (viewport.height - content.height * scale) / 2,
    scale,
  };
}

/** Guards against a zero/negative/NaN/Infinity box turning into a garbage CSS transform. */
function isPositive(box: Box): boolean {
  return (
    Number.isFinite(box.width) && Number.isFinite(box.height) && box.width > 0 && box.height > 0
  );
}
