/**
 * Where one pane's diagram comes from. Kept in its own module, free of `vscode`, so the pure
 * modules that reason about it (`panel-key`, `panel-title`) don't have to import the host.
 */
export type SideSource = { kind: 'workingTree' } | { kind: 'ref'; ref: string };

export interface SideSources {
  left: SideSource;
  right: SideSource;
}

/**
 * Whether edits to the compared file should refresh this comparison.
 *
 * False for a comparison between two refs: that is a fixed pair of commits, so the file being
 * open and edited says nothing about it and reacting would be pure waste.
 */
export function followsEditor({ left, right }: SideSources): boolean {
  return left.kind === 'workingTree' || right.kind === 'workingTree';
}
