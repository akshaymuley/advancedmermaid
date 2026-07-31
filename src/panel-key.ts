import type { SideSource, SideTarget, SideTargets } from './side-source';

const describeSource = (source: SideSource): string =>
  source.kind === 'workingTree' ? 'tree' : `ref ${source.ref}`;

/** The three things that decide which diagram a pane shows. */
const parts = (side: SideTarget): string[] => [
  side.uri.toString(),
  side.fence === undefined ? 'whole' : String(side.fence),
  describeSource(side.source),
];

/**
 * The key a compare panel is filed under, so the same comparison reveals its existing panel while
 * a different one opens its own.
 *
 * Every part is length-prefixed rather than joined by a separator: a path and a ref are arbitrary
 * text and can contain whatever delimiter we picked, which would let one comparison masquerade as
 * another and silently steal its panel. Left and right are kept in order, since swapping them
 * puts a different diagram on the left.
 */
export function panelKey({ left, right }: SideTargets): string {
  return [...parts(left), ...parts(right)].map((part) => `${part.length}:${part}`).join('');
}
