import { describe, it, expect, vi, afterEach } from 'vitest';
import { window } from 'vscode';
import { pickFence } from './extension';
import type { Fence } from './mermaid-fences';

const fence = (index: number, extra: Partial<Fence> = {}): Fence => ({
  index,
  content: `flowchart TD\n  A${index} --> B`,
  line: index * 10,
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
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
