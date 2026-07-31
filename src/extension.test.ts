import { describe, it, expect, vi, afterEach } from 'vitest';
import { Uri, window, workspace } from 'vscode';
import { pickCompareFile, pickFence } from './extension';
import type { Fence } from './mermaid-fences';

const fence = (index: number, extra: Partial<Fence> = {}): Fence => ({
  index,
  content: `flowchart TD\n  A${index} --> B`,
  line: index * 10,
  ...extra,
});

/**
 * Stand in for the documents VS Code has open. Defined rather than assigned because the real
 * `workspace.textDocuments` is read-only, and `tsc` typechecks this file against the real API
 * even though Vitest runs it against the mock.
 */
const openDocuments = (...uris: Uri[]): void => {
  Object.defineProperty(workspace, 'textDocuments', {
    value: uris.map((uri) => ({ uri })),
    configurable: true,
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  openDocuments();
});

describe('pickFence', () => {
  it('takes the only fence without prompting', async () => {
    const prompt = vi.spyOn(window, 'showQuickPick');

    expect(await pickFence([fence(0)])).toBe(0);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('returns the index carried by the chosen item', async () => {
    // The list order and the fence index can't be assumed equal by the caller, so the index
    // travels on the item itself rather than being inferred from the pick's position.
    vi.spyOn(window, 'showQuickPick').mockResolvedValue({ index: 1 } as never);

    expect(await pickFence([fence(0), fence(1)])).toBe(1);
  });

  it('aborts when the pick is cancelled', async () => {
    vi.spyOn(window, 'showQuickPick').mockResolvedValue(undefined);

    expect(await pickFence([fence(0), fence(1)])).toBeUndefined();
  });

  it('labels each fence by its heading, falling back to its position', async () => {
    const prompt = vi.spyOn(window, 'showQuickPick').mockResolvedValue(undefined);

    await pickFence([fence(0, { heading: 'Deploy' }), fence(1)]);

    expect(prompt.mock.calls[0][0]).toEqual([
      { label: 'Deploy', description: 'line 1', detail: 'flowchart TD', index: 0 },
      { label: 'Diagram 2', description: 'line 11', detail: 'flowchart TD', index: 1 },
    ]);
  });

  it('describes an empty fence rather than showing a blank row', async () => {
    const prompt = vi.spyOn(window, 'showQuickPick').mockResolvedValue(undefined);

    await pickFence([fence(0, { content: '' }), fence(1, { content: '\n  \n' })]);

    const items = prompt.mock.calls[0][0] as unknown as Array<{ detail: string }>;
    expect(items.map((item) => item.detail)).toEqual(['(empty)', '(empty)']);
  });
});

describe('pickCompareFile', () => {
  const active = Uri.file('/repo/active.mmd');
  /** The items pickCompareFile offered, in order. */
  const offered = (prompt: { mock: { calls: unknown[][] } }): { label: string }[] =>
    prompt.mock.calls[0][0] as { label: string }[];

  it('returns the file carried by the chosen item', async () => {
    const chosen = Uri.file('/repo/docs/other.md');
    openDocuments(chosen);
    vi.spyOn(window, 'showQuickPick').mockResolvedValue({
      label: 'docs/other.md',
      uri: chosen,
    } as never);

    expect(await pickCompareFile(active)).toBe(chosen);
  });

  it('aborts when the pick is cancelled', async () => {
    vi.spyOn(window, 'showQuickPick').mockResolvedValue(undefined);

    expect(await pickCompareFile(active)).toBeUndefined();
  });

  it('offers open files, then the workspace, then a way out of it', async () => {
    openDocuments(Uri.file('/repo/open.md'));
    vi.spyOn(workspace, 'findFiles').mockResolvedValue([
      Uri.file('/repo/found.mmd'),
      Uri.file('/repo/open.md'),
    ]);
    const prompt = vi.spyOn(window, 'showQuickPick').mockResolvedValue(undefined);

    await pickCompareFile(active);

    expect(offered(prompt).map((item) => item.label)).toEqual([
      '/repo/open.md',
      '/repo/found.mmd',
      'Open a file…',
    ]);
  });

  it('never offers the file being compared, or a document it cannot read', async () => {
    // `textDocuments` holds every open document, including the one the command was invoked on
    // and whatever else the user has open.
    openDocuments(active, Uri.file('/repo/src/main.ts'));
    const prompt = vi.spyOn(window, 'showQuickPick').mockResolvedValue(undefined);

    await pickCompareFile(active);

    expect(offered(prompt).map((item) => item.label)).toEqual(['Open a file…']);
  });

  it('falls through to the open dialog when asked to browse', async () => {
    const browsed = Uri.file('/elsewhere/old.mmd');
    vi.spyOn(window, 'showQuickPick').mockResolvedValue({ label: 'Open a file…' } as never);
    const dialog = vi.spyOn(window, 'showOpenDialog').mockResolvedValue([browsed]);

    expect(await pickCompareFile(active)).toBe(browsed);
    expect(dialog).toHaveBeenCalled();
  });

  it('aborts when the open dialog is dismissed', async () => {
    vi.spyOn(window, 'showQuickPick').mockResolvedValue({ label: 'Open a file…' } as never);
    vi.spyOn(window, 'showOpenDialog').mockResolvedValue(undefined);

    expect(await pickCompareFile(active)).toBeUndefined();
  });
});
