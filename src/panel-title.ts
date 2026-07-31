import type { SideSource } from './side-source';

export interface TitleSide {
  /** File label, not the full path — the tab is narrow. See `fileLabels`. */
  name: string;
  source: SideSource;
  /** Which diagram, when a file holds more than one. */
  fence?: { index: number; total: number };
}

export interface PanelTitleParts {
  left: TitleSide;
  right: TitleSide;
}

const diagram = (fence: TitleSide['fence']): string | undefined =>
  fence && fence.total > 1 ? `diagram ${fence.index + 1} of ${fence.total}` : undefined;

/** One side of a two-file title: everything that side is, since nothing is shared. */
const describeSide = ({ name, source, fence }: TitleSide): string => {
  const which = diagram(fence);
  const at = source.kind === 'ref' ? ` @ ${source.ref}` : '';
  return `${name}${which ? ` (${which})` : ''}${at}`;
};

/**
 * The panel's tab title, which is also what the webview header shows.
 *
 * Several comparisons can be open at once, so the title has to carry whatever distinguishes this
 * one — and nothing more, because a tab that says everything says nothing. The everyday case,
 * HEAD against the working tree, stays just the file name.
 */
export function panelTitle({ left, right }: PanelTitleParts): string {
  if (left.name !== right.name) {
    // Two different files: the sides share nothing, so neither can be implied by the other.
    return `${describeSide(left)} ↔ ${describeSide(right)}`;
  }

  const parts = [left.name];
  const which = diagram(left.fence ?? right.fence);
  if (which) {
    parts.push(which);
  }

  if (left.source.kind === 'ref' && right.source.kind === 'ref') {
    // Neither side is the working tree, so HEAD is no longer implied and both must be named.
    parts.push(`${left.source.ref} ↔ ${right.source.ref}`);
    return parts.join(' — ');
  }

  const against = left.source.kind === 'ref' ? left.source : right.source;
  return against.kind === 'ref' && against.ref !== 'HEAD'
    ? `${parts.join(' — ')} @ ${against.ref}`
    : parts.join(' — ');
}

const split = (path: string): string[] => path.split(/[\\/]/).filter((part) => part !== '');

/**
 * What to call each file in the title. Bare names normally, but versioned copies of one diagram
 * are the obvious two-file comparison and `diagram.mmd ↔ diagram.mmd` would say nothing — so
 * equal names borrow their folder.
 *
 * Paths are split by hand, as in `mermaid-file.ts`: the extension meets both separators whatever
 * platform it runs on.
 */
export function fileLabels(left: string, right: string): { left: string; right: string } {
  const label = (path: string, disambiguate: boolean): string => {
    const parts = split(path);
    const wanted = disambiguate ? 2 : 1;
    return parts.slice(Math.max(0, parts.length - wanted)).join('/');
  };

  // One file compared against a ref reaches here with the same path twice; there is nothing to
  // disambiguate, and panelTitle's same-name rules are what should apply.
  const same = left !== right && label(left, false) === label(right, false);
  return { left: label(left, same), right: label(right, same) };
}
