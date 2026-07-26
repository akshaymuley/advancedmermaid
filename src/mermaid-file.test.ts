import { describe, it, expect } from 'vitest';
import { isMermaidFile } from './mermaid-file';

describe('isMermaidFile', () => {
  it('accepts .mmd', () => {
    expect(isMermaidFile({ fsPath: '/repo/diagram.mmd' })).toBe(true);
  });

  it('accepts .mermaid', () => {
    expect(isMermaidFile({ fsPath: '/repo/diagram.mermaid' })).toBe(true);
  });

  it('accepts uppercase extensions', () => {
    expect(isMermaidFile({ fsPath: '/repo/DIAGRAM.MMD' })).toBe(true);
    expect(isMermaidFile({ fsPath: '/repo/diagram.Mermaid' })).toBe(true);
  });

  it('accepts Windows-style paths', () => {
    expect(isMermaidFile({ fsPath: 'C:\\repo\\diagram.mmd' })).toBe(true);
  });

  it('rejects other extensions', () => {
    expect(isMermaidFile({ fsPath: '/repo/notes.md' })).toBe(false);
    expect(isMermaidFile({ fsPath: '/repo/notes.txt' })).toBe(false);
  });

  it('rejects a mermaid extension that is not the final one', () => {
    expect(isMermaidFile({ fsPath: '/repo/diagram.mmd.txt' })).toBe(false);
  });

  it('rejects files with no extension', () => {
    expect(isMermaidFile({ fsPath: '/repo/Makefile' })).toBe(false);
  });

  it('rejects a directory name containing .mmd', () => {
    expect(isMermaidFile({ fsPath: '/repo/.mmd/notes.txt' })).toBe(false);
  });

  it('rejects a bare extension with no basename', () => {
    expect(isMermaidFile({ fsPath: '/repo/.mmd' })).toBe(false);
  });
});
