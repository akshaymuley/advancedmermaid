import { describe, it, expect } from 'vitest';
import { composeComparison, composeMerged, type ExportSide, type MergedImage } from './export-image';

const side = (over: Partial<ExportSide> = {}): ExportSide => ({
  label: 'HEAD',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80" id="mmd-left-1"><rect/></svg>',
  width: 100,
  height: 80,
  ...over,
});

const parse = (result: { markup: string }): Document =>
  new DOMParser().parseFromString(result.markup, 'image/svg+xml');

const root = (result: { markup: string }): SVGSVGElement =>
  parse(result).documentElement as unknown as SVGSVGElement;

const nested = (result: { markup: string }): Element[] =>
  [...parse(result).documentElement.children].filter((child) => child.tagName === 'svg');

describe('composeComparison', () => {
  it('produces a parseable SVG document', () => {
    const document = parse(composeComparison({ left: side(), right: side() }));

    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.documentElement.tagName).toBe('svg');
  });

  it('is wide enough for both diagrams, the gap and the padding', () => {
    const markup = composeComparison({
      left: side({ width: 100 }),
      right: side({ width: 140 }),
      gap: 20,
      padding: 10,
    });

    expect(root(markup).getAttribute('width')).toBe('280'); // 10 + 100 + 20 + 140 + 10
  });

  it('is tall enough for the taller diagram, its label and the padding', () => {
    const markup = composeComparison({
      left: side({ height: 80 }),
      right: side({ height: 200 }),
      padding: 10,
      labelHeight: 24,
    });

    expect(root(markup).getAttribute('height')).toBe('244'); // 10 + 24 + 200 + 10
  });

  it('places the right diagram past the left one, not on top of it', () => {
    // The bug this catches is the obvious one: forgetting to offset the second side at all.
    const markup = composeComparison({
      left: side({ width: 100 }),
      right: side({ width: 140 }),
      gap: 20,
      padding: 10,
    });
    const [leftEl, rightEl] = nested(markup);

    expect(leftEl.getAttribute('x')).toBe('10');
    expect(rightEl.getAttribute('x')).toBe('130'); // 10 + 100 + 20
  });

  it('keeps each diagram at its own natural size', () => {
    const markup = composeComparison({
      left: side({ width: 100, height: 80 }),
      right: side({ width: 140, height: 200 }),
    });
    const [leftEl, rightEl] = nested(markup);

    expect([leftEl.getAttribute('width'), leftEl.getAttribute('height')]).toEqual(['100', '80']);
    expect([rightEl.getAttribute('width'), rightEl.getAttribute('height')]).toEqual(['140', '200']);
  });

  it('carries both pane labels, so the image says what it is comparing', () => {
    const markup = composeComparison({
      left: side({ label: 'v1.0.0' }),
      right: side({ label: 'Working Tree' }),
    });

    expect(markup.markup).toContain('v1.0.0');
    expect(markup.markup).toContain('Working Tree');
  });

  it('escapes labels rather than letting them break the document', () => {
    // Labels are file names and refs — arbitrary text that reaches the markup unfiltered.
    const markup = composeComparison({
      left: side({ label: 'a & b <c>' }),
      right: side({ label: '"quoted"' }),
    });

    expect(parse(markup).querySelector('parsererror')).toBeNull();
    expect(markup.markup).toContain('a &amp; b &lt;c&gt;');
  });

  it('paints a background, since a dark render on transparency is invisible', () => {
    // Exported onto transparency, light-on-dark text composites onto white in most viewers and
    // disappears entirely.
    const markup = composeComparison({ left: side(), right: side(), background: '#1e1e1e' });
    const rect = parse(markup).querySelector('rect');

    expect(rect?.getAttribute('fill')).toBe('#1e1e1e');
  });

  it('says so when a side has no diagram instead of leaving a hole', () => {
    const markup = composeComparison({
      left: side({ svg: undefined, width: 0, height: 0, label: 'HEAD (not present)' }),
      right: side(),
    });

    expect(nested(markup)).toHaveLength(1);
    expect(markup.markup).toContain('(no diagram)');
    expect(markup.markup).toContain('HEAD (not present)');
  });

  it('still has usable dimensions when neither side rendered', () => {
    const empty = side({ svg: undefined, width: 0, height: 0 });
    const markup = composeComparison({ left: empty, right: empty });

    expect(Number(root(markup).getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(root(markup).getAttribute('height'))).toBeGreaterThan(0);
  });

  it('reports the size it drew, matching the markup exactly', () => {
    // The caller rasterising this needs the numbers. Recovering them from the markup by regex is
    // what shipped a 1x1 PNG once: mermaid measures diagrams in fractions, and `\d+` doesn't
    // match `1866.28125`.
    const image = composeComparison({
      left: side({ width: 100.5, height: 80.25 }),
      right: side({ width: 140, height: 200 }),
    });

    expect(String(image.width)).toBe(root(image).getAttribute('width'));
    expect(String(image.height)).toBe(root(image).getAttribute('height'));
  });

  it('handles fractional diagram sizes, which mermaid produces routinely', () => {
    const image = composeComparison({
      left: side({ width: 1866.28125, height: 354 }),
      right: side({ width: 10.5, height: 12.75 }),
      gap: 0,
      padding: 0,
      labelHeight: 0,
    });

    expect(image.width).toBeCloseTo(1876.78125, 5);
    expect(image.height).toBe(354);
  });

  it('declares the SVG namespace, or nothing will render it as an image', () => {
    const markup = composeComparison({ left: side(), right: side() });

    expect(root(markup).getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
  });
});

describe('composeMerged', () => {
  const keys = [
    { label: 'Added', colour: '#1a7f37' },
    { label: 'Removed', colour: '#cf222e', dashed: true },
    { label: 'Changed', colour: '#9a6700' },
  ];

  const merged = (over: Partial<MergedImage> = {}) =>
    composeMerged({ diagram: side({ label: 'HEAD → Working Tree' }), legend: keys, ...over });

  it('produces a parseable SVG document holding the one diagram', () => {
    const image = merged();

    expect(parse(image).querySelector('parsererror')).toBeNull();
    expect(nested(image)).toHaveLength(1);
  });

  it('is only as wide as the diagram and its padding — there is no second side', () => {
    const image = merged({
      diagram: side({ width: 300 }),
      legend: keys,
      padding: 10,
    });

    expect(root(image).getAttribute('width')).toBe('320'); // 10 + 300 + 10
  });

  it('leaves room for the title and the legend above the diagram', () => {
    const image = merged({
      diagram: side({ height: 200 }),
      legend: keys,
      padding: 10,
      labelHeight: 24,
      legendHeight: 20,
    });

    expect(root(image).getAttribute('height')).toBe('264'); // 10 + 24 + 20 + 200 + 10
  });

  it('takes no legend room when there is no legend to draw', () => {
    const image = merged({
      diagram: side({ height: 200 }),
      legend: [],
      padding: 10,
      labelHeight: 24,
      legendHeight: 20,
    });

    expect(root(image).getAttribute('height')).toBe('244'); // 10 + 24 + 200 + 10, no legend row
  });

  it('titles the image with both sides, so it still says what it compares', () => {
    expect(parse(merged()).documentElement.textContent).toContain('HEAD → Working Tree');
  });

  it('escapes the title rather than letting it break the document', () => {
    const image = merged({ diagram: side({ label: 'a & b <c>' }), legend: keys });

    expect(parse(image).querySelector('parsererror')).toBeNull();
    expect(parse(image).documentElement.textContent).toContain('a & b <c>');
  });

  // The on-screen legend is HTML in the panel header and doesn't travel with the image. Pasted
  // into a pull request, an unexplained green box is just a green box.
  it('draws a key for each kind, in the colours the diagram was drawn with', () => {
    const image = merged();
    const text = parse(image).documentElement.textContent;

    for (const key of keys) {
      expect(text).toContain(key.label);
      expect(image.markup).toContain(key.colour);
    }
  });

  it('lists only the kinds it was given, so an unchanged kind is not implied', () => {
    const image = merged({ diagram: side(), legend: [{ label: 'Added', colour: '#1a7f37' }] });
    const text = parse(image).documentElement.textContent;

    expect(text).toContain('Added');
    expect(text).not.toContain('Removed');
    expect(text).not.toContain('Changed');
  });

  it('dashes the removed swatch, so colour is not the only signal', () => {
    const swatches = [...parse(merged()).documentElement.querySelectorAll('rect')];
    const dashed = swatches.filter((r) => r.getAttribute('stroke-dasharray'));

    expect(dashed).toHaveLength(1);
    expect(dashed[0].getAttribute('stroke')).toBe('#cf222e');
  });

  it('paints a background, since a dark render on transparency is invisible', () => {
    const image = merged({ diagram: side(), legend: keys, background: '#1e1e1e' });

    expect(parse(image).documentElement.querySelector('rect')?.getAttribute('fill')).toBe('#1e1e1e');
  });

  it('still has usable dimensions when the merged diagram never rendered', () => {
    const image = merged({ diagram: side({ svg: undefined, width: 0, height: 0 }), legend: keys });

    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
    expect(parse(image).documentElement.textContent).toContain('(no diagram)');
  });

  it('reports the size it drew, matching the markup exactly', () => {
    const image = merged();

    expect(root(image).getAttribute('width')).toBe(String(image.width));
    expect(root(image).getAttribute('height')).toBe(String(image.height));
  });

  it('declares the SVG namespace, or nothing will render it as an image', () => {
    expect(root(merged()).getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
  });
});
