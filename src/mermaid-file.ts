const MERMAID_EXTENSIONS = ['.mmd', '.mermaid'];

/**
 * True if the path names a Mermaid source file.
 *
 * Structurally typed on `fsPath` rather than taking a `vscode.Uri`, so this stays a pure
 * function with no host dependency. Path splitting is hand-rolled instead of using `path`
 * because the extension runs on both POSIX and Windows separators regardless of the
 * platform the tests happen to run on.
 */
export function isMermaidFile(uri: { fsPath: string }): boolean {
  const basename = uri.fsPath.split(/[\\/]/).pop() ?? '';
  const dot = basename.lastIndexOf('.');
  // dot <= 0 covers both "no extension" (Makefile) and dotfiles with no basename (".mmd").
  if (dot <= 0) {
    return false;
  }
  return MERMAID_EXTENSIONS.includes(basename.slice(dot).toLowerCase());
}
