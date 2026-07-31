import { describe, it, expect } from 'vitest';
import { parseFlowchart, type Flowchart } from './flowchart-parse';
import { diffFlowcharts } from './flowchart-diff';
import { mergeSource, type MergeColours } from './flowchart-merge';

const COLOURS: MergeColours = {
  added: '#2ea043',
  removed: '#f85149',
  changed: '#d29922',
  text: '#333333',
};

const chart = (source: string): Flowchart => {
  const parsed = parseFlowchart(source);
  if (!parsed) {
    throw new Error(`not a flowchart: ${source}`);
  }
  return parsed;
};

/** Merge two sources the way the webview will: parse both, diff, emit. */
const merge = (before: string, after: string): string => {
  const newer = chart(after);
  return mergeSource(diffFlowcharts(chart(before), newer), newer, COLOURS);
};

/** The emitted statements, without the trailing styling block, for readable assertions. */
const statements = (source: string): string[] =>
  source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^(classDef|class|linkStyle)\b/.test(line));

describe('mergeSource', () => {
  describe('the diagram it emits', () => {
    it('keeps the newer version’s header, since that is the layout being reviewed', () => {
      expect(merge('flowchart TD\n A', 'flowchart LR\n A').split('\n')[0]).toBe('flowchart LR');
      expect(merge('graph TD\n A', 'graph TD\n A').split('\n')[0]).toBe('graph TD');
    });

    it('re-emits each node with the shape it was declared with', () => {
      const source = merge('flowchart TD\n A[One]', 'flowchart TD\n A[One]\n B{Two}\n C([Three])');
      expect(statements(source)).toEqual([
        'flowchart TD',
        'A["One"]',
        'B{"Two"}',
        'C(["Three"])',
      ]);
    });

    it('emits a node that never declared a label as a bare id', () => {
      expect(statements(merge('flowchart TD\n A --> B', 'flowchart TD\n A --> B'))).toEqual([
        'flowchart TD',
        'A',
        'B',
        'A --> B',
      ]);
    });

    it('quotes every label so a bracket or an arrow inside one is just text', () => {
      const source = merge('flowchart TD\n A["a --> b"]', 'flowchart TD\n A["a --> b"]');
      expect(source).toContain('A["a --> b"]');
    });

    // Mermaid has no backslash escape inside a label; `#quot;` is its own entity form. A raw quote
    // can't be written in source, so this goes through a hand-built graph — the label could still
    // reach us that way once anything but the parser builds one.
    it('escapes a quotation mark in a label rather than ending the label early', () => {
      const quoted: Flowchart = {
        keyword: 'flowchart',
        direction: 'TD',
        nodes: [{ id: 'A', label: 'say "hi"', shape: '[]' }],
        edges: [],
        subgraphs: [],
        unsupported: [],
      };

      const source = mergeSource(diffFlowcharts(quoted, quoted), quoted, COLOURS);
      expect(source).toContain('A["say #quot;hi#quot;"]');
    });

    it('writes edges with their connector and any label in the pipe form', () => {
      const source = merge('flowchart TD\n A --> B', 'flowchart TD\n A -.->|yes| B');
      expect(statements(source)).toContain('A -.->|"yes"| B');
    });
  });

  describe('what it highlights', () => {
    it('marks an added node and leaves an unchanged one unstyled', () => {
      const source = merge('flowchart TD\n A --> B', 'flowchart TD\n A --> B --> C');
      expect(source).toContain('class C added');
      expect(source).not.toMatch(/^\s*class A\b/m);
    });

    it('keeps a removed node in the diagram, marked as removed', () => {
      const source = merge('flowchart TD\n A --> B --> C', 'flowchart TD\n A --> B');
      expect(statements(source)).toContain('C');
      expect(source).toContain('class C removed');
    });

    it('says what a changed node used to say, since a colour alone cannot', () => {
      const source = merge('flowchart TD\n C[Build]', 'flowchart TD\n C[Build image]');
      expect(source).toContain('C["Build image (was: Build)"]');
      expect(source).toContain('class C changed');
    });

    it('does not claim a was-label for a node that only changed shape', () => {
      const source = merge('flowchart TD\n A[Same]', 'flowchart TD\n A{Same}');
      expect(source).toContain('A{"Same"}');
      expect(source).not.toContain('(was:');
      expect(source).toContain('class A changed');
    });

    it('groups every node of one kind into a single class statement', () => {
      const source = merge('flowchart TD\n A', 'flowchart TD\n A\n B\n C');
      expect(source).toContain('class B,C added');
    });

    it('defines a class only for the kinds it actually used', () => {
      const source = merge('flowchart TD\n A --> B', 'flowchart TD\n A --> B');
      expect(source).not.toContain('classDef');
    });

    // linkStyle indexes edges by the order they were emitted, so the numbering has to be taken
    // from the emitted list rather than from the diff's edges.
    it('styles a changed edge by its position among the emitted edges', () => {
      const source = merge(
        'flowchart TD\n A --> B\n B --> C',
        'flowchart TD\n A --> B\n B -.-> C',
      );
      expect(source).toMatch(/linkStyle 1 stroke:#d29922/);
      expect(source).not.toMatch(/linkStyle 0\b/);
    });

    it('dashes a removal as well as colouring it, so colour is not the only signal', () => {
      const source = merge('flowchart TD\n A --> B', 'flowchart TD\n A\n B');
      expect(source).toMatch(/classDef removed[^\n]*stroke-dasharray/);
      expect(source).toMatch(/linkStyle 0[^\n]*stroke-dasharray/);
    });
  });

  describe('subgraphs', () => {
    it('rebuilds the newer version’s blocks around their members', () => {
      const source = merge(
        'flowchart TD\n A --> B',
        'flowchart TD\n subgraph ci [CI]\n   A --> B\n end\n B --> C',
      );
      expect(statements(source)).toEqual([
        'flowchart TD',
        'subgraph ci ["CI"]',
        'A',
        'B',
        'end',
        'C',
        'A --> B',
        'B --> C',
      ]);
    });

    // The block a removed node lived in may not exist any more, and inventing one would be a
    // bigger lie than moving the node out.
    it('puts a removed node at the top level rather than inside a block', () => {
      const source = merge(
        'flowchart TD\n subgraph old\n   X\n end\n A',
        'flowchart TD\n A',
      );
      const lines = statements(source);
      expect(lines).toContain('X');
      expect(lines).not.toContain('subgraph old');
    });
  });

  describe('round trip', () => {
    // The payoff of having a parser: emitted source that is subtly unparseable — a quoting slip,
    // a shape written back wrong — fails here even when every string assertion above passes.
    it('emits source that parses back to the union of both versions', () => {
      const before = [
        'flowchart TD',
        '    A[Commit pushed] --> B{CI triggered?}',
        '    B -- yes --> C[Build]',
        '    C --> D[Unit tests]',
        '    subgraph ci [Continuous integration]',
        '      C',
        '    end',
      ].join('\n');
      const after = [
        'flowchart TD',
        '    A[Commit pushed] --> B{CI triggered?}',
        '    B -- yes --> C[Build image]',
        '    C -.->|new| L([Lint])',
        '    L --> D[Unit tests]',
        '    subgraph ci [Continuous integration]',
        '      C',
        '    end',
      ].join('\n');

      const reparsed = parseFlowchart(merge(before, after));

      expect(reparsed).not.toBeNull();
      expect(reparsed?.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C', 'D', 'L']);
      expect(reparsed?.subgraphs.map((s) => s.id)).toEqual(['ci']);
      expect(reparsed?.edges).toEqual(
        expect.arrayContaining([
          { from: 'A', to: 'B', connector: '-->' },
          { from: 'C', to: 'L', connector: '-.->', label: 'new' },
          { from: 'C', to: 'D', connector: '-->' },
        ]),
      );
    });

    it('is stable — the same comparison emits the same source every time', () => {
      const before = 'flowchart TD\n A --> B --> C';
      const after = 'flowchart TD\n A --> B\n B --> D';
      expect(merge(before, after)).toBe(merge(before, after));
    });
  });
});
