/**
 * Minimal stand-in for the `vscode` module, wired up via the alias in `vitest.config.ts`.
 *
 * Deliberately shallow: it exports only what tests actually touch. Grow it as tests need
 * more; do not pre-build the API surface. This is the single shared mock — extend this file
 * rather than re-inventing one per test.
 */

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string
  ) {}

  static file(fsPath: string): Uri {
    return new Uri('file', fsPath.replace(/\\/g, '/'));
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, [base.path.replace(/\/$/, ''), ...segments].join('/'));
  }

  get fsPath(): string {
    return this.path;
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export const ViewColumn = {
  Active: -1,
  Beside: -2,
  One: 1,
  Two: 2,
} as const;

export const window = {
  activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
  showErrorMessage: (_message: string): Promise<undefined> => Promise.resolve(undefined),
  showInputBox: (_options?: unknown): Promise<string | undefined> => Promise.resolve(undefined),
  showQuickPick: (_items?: unknown, _options?: unknown): Promise<undefined> =>
    Promise.resolve(undefined),
  createWebviewPanel: (..._args: unknown[]): unknown => {
    throw new Error('vscode-mock: createWebviewPanel is not stubbed; stub it in your test.');
  },
};

export const workspace = {
  openTextDocument: (_uri: Uri): Promise<unknown> => {
    throw new Error('vscode-mock: openTextDocument is not stubbed; stub it in your test.');
  },
};

export const extensions = {
  getExtension: (_id: string): undefined => undefined,
};

export const commands = {
  registerCommand: (_command: string, _callback: (...args: never[]) => unknown): { dispose(): void } => ({
    dispose() {},
  }),
  executeCommand: (_command: string, ..._args: unknown[]): Promise<undefined> =>
    Promise.resolve(undefined),
};
