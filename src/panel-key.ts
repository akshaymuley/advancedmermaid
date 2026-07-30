import type { SideSource, SideSources } from './side-source';

/** Identifies one comparison: which file, which two sources, and which diagram within it. */
export interface PanelSource {
  uri: { toString(): string };
  sources: SideSources;
  /** Which ```mermaid fence, for Markdown. Undefined means the whole file is the diagram. */
  fence?: number;
}

const describe = (source: SideSource): string =>
  source.kind === 'workingTree' ? 'tree' : `ref ${source.ref}`;

/**
 * The key a compare panel is filed under, so the same comparison reveals its existing panel while
 * a different one opens its own.
 *
 * Parts are length-prefixed rather than joined by a separator: a URI and a ref are arbitrary text
 * and can contain whatever delimiter we picked, which would let one comparison masquerade as
 * another and silently steal its panel. Left and right are kept in order, since swapping them
 * puts a different diagram on the left.
 */
export function panelKey({ uri, sources, fence }: PanelSource): string {
  return [
    uri.toString(),
    describe(sources.left),
    describe(sources.right),
    fence === undefined ? 'whole' : String(fence),
  ]
    .map((part) => `${part.length}:${part}`)
    .join('');
}
