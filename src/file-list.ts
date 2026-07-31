/**
 * One glob excluding everything the given settings maps switch on, for `findFiles`.
 *
 * `findFiles` takes a single exclude pattern that *replaces* the defaults rather than adding to
 * them, so hardcoding one hides nothing the user asked to hide and shows everything they didn't —
 * a workspace with a build directory in it fills the picker with artifacts. Layering
 * `files.exclude` under `search.exclude` is what the Search view itself does.
 *
 * Undefined when nothing is enabled, which tells `findFiles` to apply its own defaults.
 */
export function excludeGlob(...maps: Record<string, boolean>[]): string | undefined {
  const merged: Record<string, boolean> = Object.assign({}, ...maps);
  const patterns = Object.keys(merged).filter((pattern) => merged[pattern]);

  return patterns.length ? `{${patterns.join(',')}}` : undefined;
}

/** Just enough of a `vscode.Uri` to identify and display a file, so this stays host-free. */
export interface FileUri {
  toString(): string;
  fsPath: string;
}

export interface FileChoice<T extends FileUri> {
  uri: T;
  /** Whether the file is already open, which is worth saying in the pick list. */
  open: boolean;
}

/**
 * The files offered as the other side of a comparison.
 *
 * Open files come first: comparing against something already on screen is the common case, and
 * the workspace list can be long. The file being compared is never offered — that is what the
 * other three commands do, and it would render two identical panes. Within each group the
 * incoming order is kept; `findFiles` has already sorted by path.
 */
export function orderCompareFiles<T extends FileUri>(
  active: T,
  open: readonly T[],
  found: readonly T[]
): FileChoice<T>[] {
  const seen = new Set<string>([active.toString()]);
  const choices: FileChoice<T>[] = [];

  for (const [uris, isOpen] of [
    [open, true],
    [found, false],
  ] as const) {
    for (const uri of uris) {
      if (seen.has(uri.toString())) {
        continue;
      }
      seen.add(uri.toString());
      choices.push({ uri, open: isOpen });
    }
  }

  return choices;
}
