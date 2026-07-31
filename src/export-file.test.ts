import { describe, it, expect } from 'vitest';
import { exportFileName, formatFor } from './export-file';

describe('exportFileName', () => {
  it('builds a name from the comparison title', () => {
    expect(exportFileName('diagram.mmd', 'svg')).toBe('diagram.mmd.svg');
  });

  it('strips the separators a path would take literally', () => {
    // `fileLabels` puts a folder in the title when two files share a name, so `/` really does
    // reach here — and a save dialog would read it as a directory that doesn't exist.
    expect(exportFileName('v1/diagram.mmd ↔ v2/diagram.mmd', 'png')).toBe(
      'v1-diagram.mmd-v2-diagram.mmd.png'
    );
  });

  it('drops characters Windows refuses in a file name', () => {
    expect(exportFileName('a:b*c?d"e<f>g|h', 'svg')).toBe('a-b-c-d-e-f-g-h.svg');
  });

  it('keeps the parts of a title that carry meaning', () => {
    expect(exportFileName('notes.md — diagram 2 of 2 — v1.0.0 ↔ main', 'svg')).toBe(
      'notes.md-diagram-2-of-2-v1.0.0-main.svg'
    );
  });

  it('does not run separators together or leave them dangling', () => {
    expect(exportFileName('  spaced   out  ', 'png')).toBe('spaced-out.png');
  });

  it('falls back to something rather than naming a file after nothing', () => {
    expect(exportFileName('↔', 'svg')).toBe('comparison.svg');
    expect(exportFileName('', 'png')).toBe('comparison.png');
  });
});

describe('formatFor', () => {
  it('takes the format from the extension the user chose', () => {
    // The save dialog offers both filters, so the chosen name is the answer — there is no second
    // question to ask.
    expect(formatFor('/tmp/a.png')).toBe('png');
    expect(formatFor('C:\\out\\a.svg')).toBe('svg');
  });

  it('is case-insensitive, as file systems tend to be about extensions', () => {
    expect(formatFor('/tmp/a.PNG')).toBe('png');
  });

  it('falls back to svg when the name says nothing', () => {
    // Vector loses nothing; a mis-guessed PNG would.
    expect(formatFor('/tmp/comparison')).toBe('svg');
    expect(formatFor('/tmp/a.txt')).toBe('svg');
  });
});
