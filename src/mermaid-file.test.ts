import { describe, it, expect } from 'vitest';
import { classifySource } from './mermaid-file';

describe('classifySource', () => {
  it('classifies .mmd and .mermaid as mermaid sources', () => {
    expect(classifySource({ fsPath: '/repo/diagram.mmd' })).toBe('mermaid');
    expect(classifySource({ fsPath: '/repo/diagram.mermaid' })).toBe('mermaid');
  });

  it('classifies .md and .markdown as markdown sources', () => {
    expect(classifySource({ fsPath: '/repo/notes.md' })).toBe('markdown');
    expect(classifySource({ fsPath: '/repo/notes.markdown' })).toBe('markdown');
  });

  it('is case-insensitive', () => {
    expect(classifySource({ fsPath: '/repo/DIAGRAM.MMD' })).toBe('mermaid');
    expect(classifySource({ fsPath: '/repo/diagram.Mermaid' })).toBe('mermaid');
    expect(classifySource({ fsPath: '/repo/README.MD' })).toBe('markdown');
  });

  it('accepts Windows-style paths', () => {
    expect(classifySource({ fsPath: 'C:\\repo\\diagram.mmd' })).toBe('mermaid');
    expect(classifySource({ fsPath: 'C:\\repo\\notes.md' })).toBe('markdown');
  });

  it('rejects other extensions', () => {
    expect(classifySource({ fsPath: '/repo/notes.txt' })).toBeUndefined();
  });

  it('rejects a known extension that is not the final one', () => {
    expect(classifySource({ fsPath: '/repo/diagram.mmd.txt' })).toBeUndefined();
    expect(classifySource({ fsPath: '/repo/notes.md.bak' })).toBeUndefined();
  });

  it('rejects files with no extension', () => {
    expect(classifySource({ fsPath: '/repo/Makefile' })).toBeUndefined();
  });

  it('rejects a directory name containing .mmd', () => {
    expect(classifySource({ fsPath: '/repo/.mmd/notes.txt' })).toBeUndefined();
  });

  it('rejects a bare extension with no basename', () => {
    expect(classifySource({ fsPath: '/repo/.mmd' })).toBeUndefined();
    expect(classifySource({ fsPath: '/repo/.md' })).toBeUndefined();
  });
});
