/**
 * Classification of the ways reading a file at a git ref can fail, and the messages we show
 * for them. Pure — no `vscode` import — so it is testable without a live git extension.
 */
export type GitFailure =
  | { kind: 'noGitExtension' }
  | { kind: 'notARepository' }
  | { kind: 'unknownRef'; ref: string }
  | { kind: 'pathNotInRef'; ref: string; file: string }
  | { kind: 'unknown'; detail: string };

/** Wording is git's, not ours, so match loosely and always leave a fallback. */
const PATTERNS: ReadonlyArray<[RegExp, GitFailure['kind']]> = [
  [/does not exist in|exists on disk, but not in/i, 'pathNotInRef'],
  [/unknown revision|invalid object name|bad revision|ambiguous argument/i, 'unknownRef'],
  [/not a git repository/i, 'notARepository'],
];

export function classifyGitFailure(
  raw: unknown,
  ctx: { ref: string; file: string }
): GitFailure {
  const detail = textOf(raw);

  for (const [pattern, kind] of PATTERNS) {
    if (!pattern.test(detail)) {
      continue;
    }
    switch (kind) {
      case 'pathNotInRef':
        return { kind, ref: ctx.ref, file: ctx.file };
      case 'unknownRef':
        return { kind, ref: ctx.ref };
      default:
        return { kind: 'notARepository' };
    }
  }

  return { kind: 'unknown', detail };
}

export function describeGitFailure(failure: GitFailure): string {
  switch (failure.kind) {
    case 'noGitExtension':
      return 'the built-in Git extension is not available.';
    case 'notARepository':
      return 'this file is not inside a git repository.';
    case 'unknownRef':
      return `"${failure.ref}" is not a branch, tag, or commit in this repository.`;
    case 'pathNotInRef':
      return `${failure.file} does not exist at "${failure.ref}".`;
    case 'unknown':
      return failure.detail || 'the version could not be read.';
  }
}

/**
 * The git extension's errors carry the useful text on `stderr`, with a generic `message`.
 * Both are searched, so a match anywhere wins.
 */
function textOf(raw: unknown): string {
  if (raw instanceof Error) {
    const stderr = (raw as { stderr?: unknown }).stderr;
    return typeof stderr === 'string' ? `${raw.message}\n${stderr}`.trim() : raw.message;
  }
  return typeof raw === 'string' ? raw : String(raw);
}
