import { describe, it, expect } from 'vitest';
import { excludeGlob, orderCompareFiles } from './file-list';

const uri = (path: string) => ({ toString: () => `file:///repo/${path}`, fsPath: `/repo/${path}` });
const paths = (choices: ReturnType<typeof orderCompareFiles>) =>
  choices.map((choice) => choice.uri.fsPath);

describe('orderCompareFiles', () => {
  it('lists open files before the rest of the workspace', () => {
    // Comparing against something already open is the common case, and the workspace list can be
    // long enough to scroll.
    const choices = orderCompareFiles(uri('active.mmd'), [uri('open.md')], [
      uri('a.mmd'),
      uri('open.md'),
    ]);

    expect(paths(choices)).toEqual(['/repo/open.md', '/repo/a.mmd']);
  });

  it('marks which choices are already open', () => {
    const choices = orderCompareFiles(uri('active.mmd'), [uri('open.md')], [uri('a.mmd')]);

    expect(choices.map((choice) => choice.open)).toEqual([true, false]);
  });

  it('never offers the file being compared', () => {
    // Comparing a file against itself is what the other three commands already do, and it would
    // render two identical panes here.
    const choices = orderCompareFiles(uri('active.mmd'), [uri('active.mmd')], [
      uri('active.mmd'),
      uri('a.mmd'),
    ]);

    expect(paths(choices)).toEqual(['/repo/a.mmd']);
  });

  it('lists a file once however many lists it appears in', () => {
    const choices = orderCompareFiles(uri('active.mmd'), [uri('open.md'), uri('open.md')], [
      uri('open.md'),
    ]);

    expect(paths(choices)).toEqual(['/repo/open.md']);
  });

  it('keeps the order each list arrived in', () => {
    // `findFiles` sorts by path already; re-sorting here would only fight it.
    const choices = orderCompareFiles(
      uri('active.mmd'),
      [uri('z.md'), uri('b.md')],
      [uri('y.mmd'), uri('c.mmd')]
    );

    expect(paths(choices)).toEqual(['/repo/z.md', '/repo/b.md', '/repo/y.mmd', '/repo/c.mmd']);
  });

  it('is empty when the workspace holds nothing else to compare', () => {
    expect(orderCompareFiles(uri('active.mmd'), [uri('active.mmd')], [])).toEqual([]);
  });
});

describe('excludeGlob', () => {
  it('combines the enabled patterns into one brace glob', () => {
    expect(excludeGlob({ '**/.git': true }, { '**/node_modules': true })).toBe(
      '{**/.git,**/node_modules}'
    );
  });

  it('drops patterns the user has switched off', () => {
    // `files.exclude` entries are toggled by value, not by removal.
    expect(excludeGlob({ '**/.git': true, '**/dist': false })).toBe('{**/.git}');
  });

  it('lets a later map override an earlier one, as VS Code layers them', () => {
    expect(excludeGlob({ '**/dist': true }, { '**/dist': false })).toBeUndefined();
  });

  it('is undefined when nothing is excluded, which means "apply the defaults"', () => {
    expect(excludeGlob({}, { '**/dist': false })).toBeUndefined();
  });
});
