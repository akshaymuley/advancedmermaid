import { describe, it, expect } from 'vitest';
import { selectDiagram } from './diagram-selection';

const MARKDOWN = ['# One', '```mermaid', 'flowchart TD', '```', '# Two', '```mermaid', 'graph LR', '```'].join(
  '\n'
);

describe('selectDiagram', () => {
  it('returns a mermaid file whole', () => {
    expect(selectDiagram('flowchart TD\n  A --> B', 'mermaid')).toEqual({
      content: 'flowchart TD\n  A --> B',
      missing: false,
    });
  });

  it('ignores the fence index for a mermaid file', () => {
    expect(selectDiagram('flowchart TD', 'mermaid', 3)).toEqual({
      content: 'flowchart TD',
      missing: false,
    });
  });

  it('picks the requested fence out of a markdown file', () => {
    expect(selectDiagram(MARKDOWN, 'markdown', 1)).toEqual({ content: 'graph LR', missing: false });
  });

  it('defaults to the first fence when no index is given', () => {
    expect(selectDiagram(MARKDOWN, 'markdown')).toEqual({
      content: 'flowchart TD',
      missing: false,
    });
  });

  it('reports a fence that is not there', () => {
    // The version at the ref has fewer diagrams than the working tree, or the user just deleted
    // one. Empty content lets the webview show its existing "(empty)" placeholder.
    expect(selectDiagram(MARKDOWN, 'markdown', 5)).toEqual({ content: '', missing: true });
    expect(selectDiagram('# No diagrams here', 'markdown', 0)).toEqual({
      content: '',
      missing: true,
    });
  });

  it('reports a missing fence for an empty file at the ref', () => {
    expect(selectDiagram('', 'markdown', 0)).toEqual({ content: '', missing: true });
  });
});
