import type { SideSources } from './side-source';

export interface PanelTitleParts {
  /** File name, not the full path — the tab is narrow. */
  name: string;
  sources: SideSources;
  /** Which diagram, when a Markdown file holds more than one. */
  fence?: { index: number; total: number };
}

/**
 * The panel's tab title, which is also what the webview header shows.
 *
 * Several comparisons can be open at once, so the title has to carry whatever distinguishes this
 * one — and nothing more, because a tab that says everything says nothing. The everyday case,
 * HEAD against the working tree, stays just the file name.
 */
export function panelTitle({ name, sources, fence }: PanelTitleParts): string {
  const parts = [name];

  if (fence && fence.total > 1) {
    parts.push(`diagram ${fence.index + 1} of ${fence.total}`);
  }

  const { left, right } = sources;

  if (left.kind === 'ref' && right.kind === 'ref') {
    // Neither side is the working tree, so HEAD is no longer implied and both must be named.
    parts.push(`${left.ref} ↔ ${right.ref}`);
    return parts.join(' — ');
  }

  const against = left.kind === 'ref' ? left : right.kind === 'ref' ? right : undefined;
  return against && against.ref !== 'HEAD'
    ? `${parts.join(' — ')} @ ${against.ref}`
    : parts.join(' — ');
}
