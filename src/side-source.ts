import type { SourceKind } from './mermaid-file';

/**
 * Where one pane's diagram comes from. Kept in its own module, free of `vscode`, so the pure
 * modules that reason about it (`panel-key`, `panel-title`) don't have to import the host.
 */
export type SideSource = { kind: 'workingTree' } | { kind: 'ref'; ref: string };

/**
 * Everything one pane shows: which file, how to read it, which diagram within it, and which
 * version. The two sides are independent, so a comparison can span two different files.
 *
 * `uri` is structurally typed rather than a `vscode.Uri` to keep this module host-free — the same
 * move `panel-key` and `mermaid-file` already make.
 */
export interface SideTarget {
  uri: { toString(): string; fsPath: string };
  kind: SourceKind;
  /** Which ```mermaid fence, for Markdown. Undefined means the whole file is the diagram. */
  fence?: number;
  source: SideSource;
}

export interface SideTargets {
  left: SideTarget;
  right: SideTarget;
}

/**
 * Whether an edit to `uri` should refresh this comparison.
 *
 * True only for a file some pane is reading from the working tree. A pane pinned to a ref is a
 * fixed commit: the file being open and edited says nothing about it, so a comparison between two
 * refs never follows the editor at all — and in a two-file comparison, an edit refreshes the
 * pane showing that file, not the other one.
 */
export function tracksDocument({ left, right }: SideTargets, uri: string): boolean {
  const tracks = (side: SideTarget): boolean =>
    side.source.kind === 'workingTree' && side.uri.toString() === uri;

  return tracks(left) || tracks(right);
}
