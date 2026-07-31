/**
 * Composes the two rendered diagrams into one SVG document for export.
 *
 * Pure — strings and geometry, no DOM — so the layout is testable without a browser. The webview
 * hands it the SVG markup it already has on screen; rasterising the result to PNG is the caller's
 * job, since that needs a canvas.
 */
export interface ExportSide {
  label: string;
  /** The diagram's SVG markup, or undefined when the pane holds no diagram. */
  svg?: string;
  width: number;
  height: number;
}

export interface ComparisonImage {
  left: ExportSide;
  right: ExportSide;
  /** Painted behind everything: a dark-theme render on transparency is invisible. */
  background?: string;
  /** Colour for the pane labels, which are not part of either diagram. */
  foreground?: string;
  gap?: number;
  padding?: number;
  labelHeight?: number;
}

/** Labels are file names and refs — arbitrary text on its way into markup. */
const escape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A pane with nothing in it still occupies space, so the other side isn't left lopsided. */
const PLACEHOLDER = { width: 160, height: 60 };

const sizeOf = (side: ExportSide): { width: number; height: number } =>
  side.svg && side.width > 0 && side.height > 0
    ? { width: side.width, height: side.height }
    : PLACEHOLDER;

/**
 * Strips the XML prologue mermaid's serialised output may carry. A nested `<svg>` is legal;
 * a nested `<?xml …?>` is not, and would fail the whole document.
 */
const body = (svg: string): string => svg.replace(/^\s*<\?xml[^>]*\?>/, '').trim();

export interface ComparisonImageResult {
  markup: string;
  /**
   * The composed size, returned rather than left to be read back out of the markup. A caller
   * rasterising this needs the numbers, and recovering them by regex is exactly the kind of thing
   * that works until a diagram measures 1866.28125 wide.
   */
  width: number;
  height: number;
}

/**
 * Both diagrams side by side at their natural sizes, each under its pane label.
 *
 * Deliberately not a snapshot of the current view: pan, zoom and the stacked modes are ways of
 * *looking*, while the exported file is the comparison itself — and blink has no still frame to
 * capture at all.
 */
export function composeComparison({
  left,
  right,
  background = '#ffffff',
  foreground = '#333333',
  gap = 32,
  padding = 24,
  labelHeight = 28,
}: ComparisonImage): ComparisonImageResult {
  const sizes = [sizeOf(left), sizeOf(right)];
  const width = padding * 2 + sizes[0].width + gap + sizes[1].width;
  const height = padding * 2 + labelHeight + Math.max(sizes[0].height, sizes[1].height);

  const place = (side: ExportSide, x: number, size: { width: number; height: number }): string => {
    const label = `<text x="${x}" y="${padding + labelHeight - 8}" font-family="sans-serif" font-size="13" fill="${foreground}">${escape(side.label)}</text>`;
    const top = padding + labelHeight;

    if (!side.svg || side.width <= 0 || side.height <= 0) {
      return `${label}<text x="${x}" y="${top + 24}" font-family="sans-serif" font-size="13" fill="${foreground}" opacity="0.6">(no diagram)</text>`;
    }

    // A nested <svg> positions and clips its content without touching the diagram's own markup,
    // so mermaid's ids and inline styles travel unchanged.
    return `${label}<svg x="${x}" y="${top}" width="${size.width}" height="${size.height}" viewBox="0 0 ${side.width} ${side.height}" overflow="visible">${body(side.svg)}</svg>`;
  };

  const markup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${background}"/>`,
    place(left, padding, sizes[0]),
    place(right, padding + sizes[0].width + gap, sizes[1]),
    '</svg>',
  ].join('');

  return { markup, width, height };
}
