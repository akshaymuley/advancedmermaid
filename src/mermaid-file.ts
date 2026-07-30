/** What kind of Mermaid source a file holds, if any. */
export type SourceKind = 'mermaid' | 'markdown';

const EXTENSIONS: Record<string, SourceKind> = {
  '.mmd': 'mermaid',
  '.mermaid': 'mermaid',
  '.md': 'markdown',
  '.markdown': 'markdown',
};

/**
 * Whether the path names a file this extension can compare, and how to read it: `mermaid` files
 * are a diagram outright, `markdown` files contain zero or more ```mermaid fences.
 *
 * Structurally typed on `fsPath` rather than taking a `vscode.Uri`, so this stays a pure
 * function with no host dependency. Path splitting is hand-rolled instead of using `path`
 * because the extension runs on both POSIX and Windows separators regardless of the
 * platform the tests happen to run on.
 */
export function classifySource(uri: { fsPath: string }): SourceKind | undefined {
  const basename = uri.fsPath.split(/[\\/]/).pop() ?? '';
  const dot = basename.lastIndexOf('.');
  // dot <= 0 covers both "no extension" (Makefile) and dotfiles with no basename (".mmd").
  if (dot <= 0) {
    return undefined;
  }
  return EXTENSIONS[basename.slice(dot).toLowerCase()];
}
