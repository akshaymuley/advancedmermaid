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

/** One entry in the merged export's key. */
export interface LegendKey {
  label: string;
  colour: string;
  /** Drawn dashed as well as coloured, so the key doesn't rely on telling green from red. */
  dashed?: boolean;
}

export interface MergedImage {
  /** The merged diagram. Its `label` is the image's title — `HEAD → Working Tree`. */
  diagram: ExportSide;
  /**
   * The kinds actually present in the diff. Empty draws no key at all: listing a kind nothing on
   * screen uses would say a change happened that didn't.
   */
  legend: LegendKey[];
  background?: string;
  foreground?: string;
  padding?: number;
  labelHeight?: number;
  legendHeight?: number;
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
  return compose([left, right], { background, foreground, gap, padding, labelHeight });
}

/**
 * The merged semantic diff as one image, under its title and its key.
 *
 * Not a departure from the rule above, though it looks like one. Pan, zoom, overlay, swipe and
 * blink are ways of *looking* at two diagrams, so the export ignores them. The merged diagram
 * isn't a way of looking — it **is** a comparison, one neither pane holds, so exporting it is
 * exporting the comparison.
 *
 * The key is drawn here rather than taken from the panel: the on-screen one is HTML and doesn't
 * travel, and an unexplained green box pasted into a pull request is just a green box.
 */
export function composeMerged({
  diagram,
  legend,
  background = '#ffffff',
  foreground = '#333333',
  padding = 24,
  labelHeight = 28,
  legendHeight = 24,
}: MergedImage): ComparisonImageResult {
  return compose([diagram], {
    background,
    foreground,
    gap: 0,
    padding,
    labelHeight,
    legend,
    legendHeight,
  });
}

interface Layout {
  background: string;
  foreground: string;
  gap: number;
  padding: number;
  labelHeight: number;
  legend?: LegendKey[];
  legendHeight?: number;
}

/**
 * Lay diagrams out left to right, each under its own label, optionally over a key.
 *
 * One function for both entry points so their geometry cannot drift: the comparison is this with
 * two sides and no key, the merged export is this with one side and a key.
 */
function compose(sides: ExportSide[], layout: Layout): ComparisonImageResult {
  const { background, foreground, gap, padding, labelHeight } = layout;
  const legend = layout.legend ?? [];
  const legendRow = legend.length > 0 ? (layout.legendHeight ?? 0) : 0;

  const sizes = sides.map(sizeOf);
  const width =
    padding * 2 + sizes.reduce((sum, size) => sum + size.width, 0) + gap * (sides.length - 1);
  const height =
    padding * 2 + labelHeight + legendRow + Math.max(...sizes.map((size) => size.height));

  const top = padding + labelHeight + legendRow;

  const place = (side: ExportSide, x: number, size: { width: number; height: number }): string => {
    const label = `<text x="${x}" y="${padding + labelHeight - 8}" font-family="sans-serif" font-size="13" fill="${foreground}">${escape(side.label)}</text>`;

    if (!side.svg || side.width <= 0 || side.height <= 0) {
      return `${label}<text x="${x}" y="${top + 24}" font-family="sans-serif" font-size="13" fill="${foreground}" opacity="0.6">(no diagram)</text>`;
    }

    // A nested <svg> positions and clips its content without touching the diagram's own markup,
    // so mermaid's ids and inline styles travel unchanged.
    return `${label}<svg x="${x}" y="${top}" width="${size.width}" height="${size.height}" viewBox="0 0 ${side.width} ${side.height}" overflow="visible">${body(side.svg)}</svg>`;
  };

  let x = padding;
  const placed = sides.map((side, i) => {
    const markup = place(side, x, sizes[i]);
    x += sizes[i].width + gap;
    return markup;
  });

  const markup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${background}"/>`,
    ...placed,
    drawLegend(legend, padding, padding + labelHeight, foreground),
    '</svg>',
  ].join('');

  return { markup, width, height };
}

const SWATCH = 12;

/** A row of outlined swatches and their names, laid out by an estimate of the text width. */
function drawLegend(legend: LegendKey[], left: number, top: number, foreground: string): string {
  let x = left;

  return legend
    .map((key) => {
      const dash = key.dashed ? ' stroke-dasharray="3 2"' : '';
      const swatch = `<rect x="${x}" y="${top}" width="${SWATCH}" height="${SWATCH}" fill="none" stroke="${key.colour}" stroke-width="2"${dash}/>`;
      const text = `<text x="${x + SWATCH + 6}" y="${top + SWATCH - 1}" font-family="sans-serif" font-size="12" fill="${foreground}">${escape(key.label)}</text>`;

      // No text measurement without a DOM, and this module stays pure. Seven pixels a character at
      // 12px is generous enough that the keys never collide.
      x += SWATCH + 6 + key.label.length * 7 + 20;
      return swatch + text;
    })
    .join('');
}
