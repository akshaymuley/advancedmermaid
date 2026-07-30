import { describe, it, expect } from 'vitest';
import { classifyGitFailure, describeGitFailure } from './git-errors';

const ctx = { ref: 'HEAD', file: 'diagram.mmd' };

describe('classifyGitFailure', () => {
  it('recognises an unknown ref from the message', () => {
    const err = new Error("fatal: invalid object name 'nope'.");
    expect(classifyGitFailure(err, ctx)).toEqual({ kind: 'unknownRef', ref: 'HEAD' });
  });

  it.each([
    'fatal: ambiguous argument "nope": unknown revision or path not in the working tree.',
    "fatal: bad revision 'nope'",
    "fatal: invalid object name 'nope'.",
  ])('recognises unknown-ref wording: %s', (message) => {
    expect(classifyGitFailure(new Error(message), ctx).kind).toBe('unknownRef');
  });

  it.each([
    "fatal: path 'diagram.mmd' does not exist in 'HEAD'",
    "fatal: path 'diagram.mmd' exists on disk, but not in 'HEAD'",
    // What the built-in git extension actually throws — it resolves the path against the ref's
    // tree itself and never reaches `git show`, so none of git's own wording appears. Every
    // other case here is raw CLI stderr, which is why this one went unnoticed: comparing a
    // brand-new diagram against HEAD reported "unknown" and opened no panel at all.
    'Git relative path not found. Was looking for samples/new.mmd among [\n  "README.md"\n]',
  ])('recognises a path missing at the ref: %s', (message) => {
    expect(classifyGitFailure(new Error(message), ctx)).toEqual({
      kind: 'pathNotInRef',
      ref: 'HEAD',
      file: 'diagram.mmd',
    });
  });

  it('recognises "not a git repository"', () => {
    const err = new Error('fatal: not a git repository (or any of the parent directories): .git');
    expect(classifyGitFailure(err, ctx)).toEqual({ kind: 'notARepository' });
  });

  it('reads stderr when the message itself is unhelpful', () => {
    const err = Object.assign(new Error('Failed to execute git'), {
      stderr: "fatal: path 'diagram.mmd' does not exist in 'HEAD'\n",
    });
    expect(classifyGitFailure(err, ctx).kind).toBe('pathNotInRef');
  });

  it('matches case-insensitively', () => {
    expect(classifyGitFailure(new Error("FATAL: INVALID OBJECT NAME 'x'"), ctx).kind).toBe(
      'unknownRef'
    );
  });

  it('falls back to unknown, preserving the original text', () => {
    const err = new Error('fatal: the disk caught fire');
    expect(classifyGitFailure(err, ctx)).toEqual({
      kind: 'unknown',
      detail: 'fatal: the disk caught fire',
    });
  });

  it('handles a thrown string', () => {
    expect(classifyGitFailure('something went wrong', ctx)).toEqual({
      kind: 'unknown',
      detail: 'something went wrong',
    });
  });

  it('handles a thrown undefined without crashing', () => {
    expect(classifyGitFailure(undefined, ctx).kind).toBe('unknown');
  });
});

describe('describeGitFailure', () => {
  it('names the ref that could not be resolved', () => {
    const message = describeGitFailure({ kind: 'unknownRef', ref: 'no-such-branch' });
    expect(message).toContain('no-such-branch');
  });

  it('names both the file and the ref when the path is missing', () => {
    const message = describeGitFailure({
      kind: 'pathNotInRef',
      ref: 'v1.0',
      file: 'diagram.mmd',
    });
    expect(message).toContain('diagram.mmd');
    expect(message).toContain('v1.0');
  });

  it('explains a missing git extension and a missing repository differently', () => {
    const noExtension = describeGitFailure({ kind: 'noGitExtension' });
    const noRepo = describeGitFailure({ kind: 'notARepository' });
    expect(noExtension).not.toBe(noRepo);
  });

  it('surfaces the underlying detail for an unknown failure', () => {
    expect(describeGitFailure({ kind: 'unknown', detail: 'the disk caught fire' })).toContain(
      'the disk caught fire'
    );
  });

  it('produces a message for every kind', () => {
    const kinds = [
      { kind: 'noGitExtension' },
      { kind: 'notARepository' },
      { kind: 'unknownRef', ref: 'HEAD' },
      { kind: 'pathNotInRef', ref: 'HEAD', file: 'a.mmd' },
      { kind: 'unknown', detail: 'boom' },
    ] as const;
    for (const failure of kinds) {
      expect(describeGitFailure(failure).length).toBeGreaterThan(0);
    }
  });
});
