import { describe, it, expect } from 'vitest';
import { findMermaidFences } from './mermaid-fences';

describe('findMermaidFences', () => {
  it('finds a single mermaid fence and strips its markers', () => {
    const text = ['# Notes', '', '```mermaid', 'flowchart TD', '  A --> B', '```', ''].join('\n');

    expect(findMermaidFences(text)).toEqual([
      { index: 0, content: 'flowchart TD\n  A --> B', heading: 'Notes', line: 2 },
    ]);
  });

  it('returns nothing for a document with no mermaid fences', () => {
    expect(findMermaidFences('# Title\n\nJust prose.\n')).toEqual([]);
    expect(findMermaidFences('')).toEqual([]);
  });

  it('ignores fenced blocks in other languages', () => {
    const text = ['```ts', 'const a = 1;', '```', '', '```', 'plain', '```'].join('\n');

    expect(findMermaidFences(text)).toEqual([]);
  });

  it('numbers several fences in document order and tracks the heading above each', () => {
    const text = [
      '## Deploy', //
      '```mermaid',
      'flowchart LR',
      '```',
      '## Rollback',
      '```mermaid',
      'sequenceDiagram',
      '```',
    ].join('\n');

    expect(findMermaidFences(text)).toEqual([
      { index: 0, content: 'flowchart LR', heading: 'Deploy', line: 1 },
      { index: 1, content: 'sequenceDiagram', heading: 'Rollback', line: 5 },
    ]);
  });

  it('omits the heading when a fence has none above it', () => {
    expect(findMermaidFences('```mermaid\nflowchart TD\n```')).toEqual([
      { index: 0, content: 'flowchart TD', line: 0 },
    ]);
  });

  it('matches the info string case-insensitively', () => {
    expect(findMermaidFences('```Mermaid\nflowchart TD\n```')).toHaveLength(1);
  });

  it('accepts tilde fences', () => {
    expect(findMermaidFences('~~~mermaid\nflowchart TD\n~~~')).toEqual([
      { index: 0, content: 'flowchart TD', line: 0 },
    ]);
  });

  it('does not treat a mermaid block shown as an example inside a longer fence as a diagram', () => {
    // Documentation that demonstrates the syntax wraps it in four backticks. The inner block is
    // sample text, not a diagram to render — but a genuine fence after it still is, which is what
    // pins down that the outer block was consumed as a unit rather than closed early.
    const text = [
      '````',
      '```mermaid',
      'not a diagram',
      '```',
      '````',
      '```mermaid',
      'flowchart TD',
      '```',
    ].join('\n');

    expect(findMermaidFences(text)).toEqual([{ index: 0, content: 'flowchart TD', line: 5 }]);
  });

  it('reads an unterminated fence to the end of the document', () => {
    // Half-typed, which is exactly when live refresh runs.
    expect(findMermaidFences('```mermaid\nflowchart TD\n  A --> B')).toEqual([
      { index: 0, content: 'flowchart TD\n  A --> B', line: 0 },
    ]);
  });

  it('strips the indentation of a fence nested in a list item', () => {
    const text = ['- Step one:', '', '  ```mermaid', '  flowchart TD', '    A --> B', '  ```'].join(
      '\n'
    );

    expect(findMermaidFences(text)[0].content).toBe('flowchart TD\n  A --> B');
  });

  it('handles CRLF line endings', () => {
    const text = '# Notes\r\n```mermaid\r\nflowchart TD\r\n```\r\n';

    expect(findMermaidFences(text)).toEqual([
      { index: 0, content: 'flowchart TD', heading: 'Notes', line: 1 },
    ]);
  });

  it('keeps an empty fence, so the caller can show its own placeholder', () => {
    expect(findMermaidFences('```mermaid\n```')).toEqual([{ index: 0, content: '', line: 0 }]);
  });
});
