/** Identifies one comparison: which file, against which ref, and which diagram within it. */
export interface PanelSource {
  uri: { toString(): string };
  ref: string;
  /** Which ```mermaid fence, for Markdown. Undefined means the whole file is the diagram. */
  fence?: number;
}

/**
 * The key a compare panel is filed under, so the same comparison reveals its existing panel while
 * a different one opens its own.
 *
 * Parts are length-prefixed rather than joined by a separator: a URI is arbitrary text and can
 * contain whatever delimiter we picked, which would let one comparison masquerade as another and
 * silently steal its panel.
 */
export function panelKey({ uri, ref, fence }: PanelSource): string {
  return [uri.toString(), ref, fence === undefined ? 'whole' : String(fence)]
    .map((part) => `${part.length}:${part}`)
    .join('');
}
