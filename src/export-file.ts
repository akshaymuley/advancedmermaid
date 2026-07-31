/**
 * Naming and format rules for an exported comparison. Pure — no `vscode` — so the string handling
 * is testable on its own, as `panel-title.ts` and `file-list.ts` already are.
 */
export type ExportFormat = 'svg' | 'png';

/** Illegal on Windows, plus the separators a path would take literally. */
const UNUSABLE = /[\\/:*?"<>|]/g;

/**
 * A default file name built from the comparison's title.
 *
 * The title is not a file name and was never meant to be one: it carries `↔`, `@`, spaces, and —
 * when two compared files share a base name — a folder and its `/`. Everything a path or a
 * Windows file system would object to collapses to a hyphen; if that leaves nothing readable, the
 * name falls back rather than producing something like `-.svg`.
 */
export function exportFileName(title: string, format: ExportFormat): string {
  const cleaned = title
    .replace(UNUSABLE, ' ')
    .replace(/[^\w. ]+/g, ' ') // ↔, —, and anything else decorative
    .trim()
    .replace(/\s+/g, '-');

  return `${cleaned || 'comparison'}.${format}`;
}

/**
 * The format implied by the chosen file name.
 *
 * The save dialog offers both filters, so whichever extension the user picked *is* the answer and
 * there is no second question to ask. Anything unrecognised gets SVG: it is the lossless one, so
 * guessing it wrong costs nothing.
 */
export function formatFor(path: string): ExportFormat {
  return path.toLowerCase().endsWith('.png') ? 'png' : 'svg';
}
