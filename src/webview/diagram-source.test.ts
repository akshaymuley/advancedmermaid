import { describe, it, expect } from 'vitest';
import { isBlankDiagram } from './diagram-source';

describe('isBlankDiagram', () => {
  it.each(['', '   ', '\n\n', '\t \r\n  \n'])('treats %j as blank', (content) => {
    expect(isBlankDiagram(content)).toBe(true);
  });

  it('treats real diagram source as non-blank', () => {
    expect(isBlankDiagram('flowchart TD\n  A --> B')).toBe(false);
  });

  it('treats leading whitespace around real content as non-blank', () => {
    expect(isBlankDiagram('\n  flowchart TD\n  A --> B\n')).toBe(false);
  });
});
