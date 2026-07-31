import { describe, it, expect } from 'vitest';
import { parseFlowchart } from './flowchart-parse';

describe('parseFlowchart', () => {
  describe('the header', () => {
    it('reads the keyword and direction as written', () => {
      const chart = parseFlowchart('flowchart TD\n');
      expect(chart?.keyword).toBe('flowchart');
      expect(chart?.direction).toBe('TD');
    });

    it('accepts graph as well as flowchart, since both render the same diagram', () => {
      expect(parseFlowchart('graph LR\n')?.keyword).toBe('graph');
      expect(parseFlowchart('graph LR\n')?.direction).toBe('LR');
    });

    it('leaves the direction absent when the header omits one', () => {
      const chart = parseFlowchart('flowchart\n  A --> B\n');
      expect(chart).not.toBeNull();
      expect(chart?.direction).toBeUndefined();
    });

    it('looks past blank lines and comments for the header', () => {
      expect(parseFlowchart('\n%% a note\nflowchart TD\n')?.keyword).toBe('flowchart');
    });

    it('returns null for a diagram type it cannot graph, so the caller can fall back', () => {
      expect(parseFlowchart('sequenceDiagram\n  A ->> B: hi\n')).toBeNull();
      expect(parseFlowchart('classDiagram\n  Animal <|-- Duck\n')).toBeNull();
      expect(parseFlowchart('')).toBeNull();
    });

    it('does not mistake a word merely starting with the keyword for a header', () => {
      expect(parseFlowchart('flowchartish TD\n')).toBeNull();
    });
  });

  describe('nodes', () => {
    const nodes = (body: string) => parseFlowchart(`flowchart TD\n${body}\n`)?.nodes;

    it('reads a declared label and keeps the brackets that gave it its shape', () => {
      expect(nodes('  A[Start]')).toEqual([{ id: 'A', label: 'Start', shape: '[]' }]);
    });

    it('keeps each shape distinct, since re-emitting the wrong one redraws the diagram', () => {
      expect(nodes('  B(Round)')?.[0].shape).toBe('()');
      expect(nodes('  C{Decision}')?.[0].shape).toBe('{}');
      expect(nodes('  D([Stadium])')?.[0].shape).toBe('([])');
      expect(nodes('  E[[Subroutine]]')?.[0].shape).toBe('[[]]');
      expect(nodes('  F[(Database)]')?.[0].shape).toBe('[()]');
      expect(nodes('  G((Circle))')?.[0].shape).toBe('(())');
      expect(nodes('  H{{Hexagon}}')?.[0].shape).toBe('{{}}');
      expect(nodes('  I[/Parallelogram/]')?.[0].shape).toBe('[//]');
      expect(nodes('  J[\\Trapezoid\\]')?.[0].shape).toBe('[\\\\]');
    });

    it('declares a bare id with no label and no shape', () => {
      expect(nodes('  A --> B')).toEqual([{ id: 'A' }, { id: 'B' }]);
    });

    it('lists each node once, in the order it was first seen', () => {
      expect(nodes('  A --> B\n  B --> A')?.map((n) => n.id)).toEqual(['A', 'B']);
    });

    // A diagram commonly wires the graph up first and labels the nodes underneath, so the
    // declaration that carries the label is often not the one that introduces the id.
    it('fills in a label declared after the node was first used', () => {
      expect(nodes('  A --> B\n  A[Start]')).toEqual([
        { id: 'A', label: 'Start', shape: '[]' },
        { id: 'B' },
      ]);
    });

    it('takes a quoted label whole, so connector characters inside it are just text', () => {
      expect(nodes('  A["a --> b"]')).toEqual([{ id: 'A', label: 'a --> b', shape: '[]' }]);
    });
  });

  describe('edges', () => {
    const edges = (body: string) => parseFlowchart(`flowchart TD\n${body}\n`)?.edges;

    it('records the connector exactly as written', () => {
      expect(edges('  A --> B')).toEqual([{ from: 'A', to: 'B', connector: '-->' }]);
      expect(edges('  A --- B')?.[0].connector).toBe('---');
      expect(edges('  A -.-> B')?.[0].connector).toBe('-.->');
      expect(edges('  A ==> B')?.[0].connector).toBe('==>');
      expect(edges('  A --o B')?.[0].connector).toBe('--o');
      expect(edges('  A --x B')?.[0].connector).toBe('--x');
      expect(edges('  A <--> B')?.[0].connector).toBe('<-->');
    });

    it('keeps a lengthened connector as written, since its length sets the rank distance', () => {
      expect(edges('  A ----> B')?.[0].connector).toBe('---->');
    });

    it('reads a label written after the connector', () => {
      expect(edges('  A -->|yes| B')).toEqual([
        { from: 'A', to: 'B', connector: '-->', label: 'yes' },
      ]);
    });

    it('reads a label written inside the connector', () => {
      expect(edges('  A -- yes --> B')).toEqual([
        { from: 'A', to: 'B', connector: '-->', label: 'yes' },
      ]);
      expect(edges('  A == no ==> B')?.[0]).toEqual({
        from: 'A',
        to: 'B',
        connector: '==>',
        label: 'no',
      });
    });

    // Node labels were unquoted from the start and edge labels were not, which only showed up
    // when the merged render wrote a label back out and read it in again as `"yes"` with quotes.
    it('unquotes an edge label, the same as a node label', () => {
      expect(edges('  A -->|"yes"| B')?.[0].label).toBe('yes');
      expect(edges('  A -- "no" --> B')?.[0].label).toBe('no');
    });

    // The trap here is the lazy scan: an unguarded "-- anything --" also matches across
    // `A --> B --> C`, which would swallow `> B` as an edge label.
    it('does not read a chain of plain arrows as one labelled edge', () => {
      expect(edges('  A --> B --> C')).toEqual([
        { from: 'A', to: 'B', connector: '-->' },
        { from: 'B', to: 'C', connector: '-->' },
      ]);
    });

    it('expands an & on either side into every pairing', () => {
      expect(edges('  A & B --> C & D')).toEqual([
        { from: 'A', to: 'C', connector: '-->' },
        { from: 'A', to: 'D', connector: '-->' },
        { from: 'B', to: 'C', connector: '-->' },
        { from: 'B', to: 'D', connector: '-->' },
      ]);
    });

    it('reads nodes declared inline in the middle of a chain', () => {
      const chart = parseFlowchart('flowchart TD\n  A[Start] --> B{Ok?} --> C[End]\n');
      expect(chart?.nodes).toEqual([
        { id: 'A', label: 'Start', shape: '[]' },
        { id: 'B', label: 'Ok?', shape: '{}' },
        { id: 'C', label: 'End', shape: '[]' },
      ]);
      expect(chart?.edges).toHaveLength(2);
    });

    it('keeps parallel edges between the same pair rather than collapsing them', () => {
      expect(edges('  A -->|yes| B\n  A -->|no| B')).toHaveLength(2);
    });

    // The older `graph TD; A-->B; C-->D` style. Without this the line is read as one chain and
    // `B; C` becomes a node id — wrong quietly, which is the worst way to be wrong.
    it('treats a semicolon as the end of a statement, not as part of a node id', () => {
      const chart = parseFlowchart('flowchart TD\n  A --> B; C --> D;\n');
      expect(chart?.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C', 'D']);
      expect(chart?.edges).toEqual([
        { from: 'A', to: 'B', connector: '-->' },
        { from: 'C', to: 'D', connector: '-->' },
      ]);
    });
  });

  describe('subgraphs', () => {
    it('records the block, its title, and the nodes declared inside it', () => {
      const chart = parseFlowchart(
        'flowchart TD\n  subgraph ci [Continuous integration]\n    A --> B\n  end\n  B --> C\n',
      );
      expect(chart?.subgraphs).toEqual([
        { id: 'ci', title: 'Continuous integration', members: ['A', 'B'] },
      ]);
      expect(chart?.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C']);
      expect(chart?.edges).toHaveLength(2);
    });

    it('uses the bare name as the id when the block declares no separate title', () => {
      const chart = parseFlowchart('flowchart TD\n  subgraph Build\n    A --> B\n  end\n');
      expect(chart?.subgraphs).toEqual([{ id: 'Build', title: undefined, members: ['A', 'B'] }]);
    });

    it('links a nested block to its parent and leaves its nodes out of the outer members', () => {
      const chart = parseFlowchart(
        'flowchart TD\n  subgraph outer\n    A --> B\n    subgraph inner\n      C --> D\n    end\n  end\n',
      );
      expect(chart?.subgraphs).toEqual([
        { id: 'outer', title: undefined, members: ['A', 'B'] },
        { id: 'inner', title: undefined, members: ['C', 'D'], parent: 'outer' },
      ]);
    });

    it('does not turn the subgraph or end keywords into nodes', () => {
      const chart = parseFlowchart('flowchart TD\n  subgraph one\n    A\n  end\n');
      expect(chart?.nodes).toEqual([{ id: 'A' }]);
    });
  });

  describe('lines it keeps but does not model', () => {
    it('collects styling and interaction lines instead of failing on them', () => {
      const source = [
        'flowchart TD',
        '  A --> B',
        '  classDef done fill:#0f0',
        '  class A done',
        '  style B stroke:#333',
        '  linkStyle 0 stroke:#f00',
        '  click A "https://example.com"',
      ].join('\n');

      const chart = parseFlowchart(source);
      expect(chart?.unsupported).toEqual([
        'classDef done fill:#0f0',
        'class A done',
        'style B stroke:#333',
        'linkStyle 0 stroke:#f00',
        'click A "https://example.com"',
      ]);
      expect(chart?.nodes).toEqual([{ id: 'A' }, { id: 'B' }]);
    });

    // Left unmodelled rather than dropped: it changes the rendered layout, so slice 2 needs to
    // know it was there, but it describes no node or edge.
    it('keeps a direction statement inside a subgraph out of the node list', () => {
      const chart = parseFlowchart(
        'flowchart TD\n  subgraph one\n    direction LR\n    A --> B\n  end\n',
      );
      expect(chart?.nodes).toEqual([{ id: 'A' }, { id: 'B' }]);
      expect(chart?.unsupported).toEqual(['direction LR']);
    });
  });

  // The project's own sample: `-- yes -->` labels, two shapes, and a graph that converges.
  // One assertion over a whole real diagram catches what the single-construct tests each miss.
  it('parses samples/pipeline.mmd whole', () => {
    const chart = parseFlowchart(
      [
        'flowchart TD',
        '    A[Commit pushed] --> B{CI triggered?}',
        '    B -- yes --> C[Build]',
        '    B -- no --> Z[Done]',
        '    C --> D[Unit tests]',
        '    D --> E{Pass?}',
        '    E -- yes --> F[Deploy to staging]',
        '    E -- no --> G[Notify author]',
        '    F --> Z',
        '    G --> Z',
      ].join('\n'),
    );

    expect(chart?.nodes).toEqual([
      { id: 'A', label: 'Commit pushed', shape: '[]' },
      { id: 'B', label: 'CI triggered?', shape: '{}' },
      { id: 'C', label: 'Build', shape: '[]' },
      { id: 'Z', label: 'Done', shape: '[]' },
      { id: 'D', label: 'Unit tests', shape: '[]' },
      { id: 'E', label: 'Pass?', shape: '{}' },
      { id: 'F', label: 'Deploy to staging', shape: '[]' },
      { id: 'G', label: 'Notify author', shape: '[]' },
    ]);
    expect(chart?.edges).toEqual([
      { from: 'A', to: 'B', connector: '-->' },
      { from: 'B', to: 'C', connector: '-->', label: 'yes' },
      { from: 'B', to: 'Z', connector: '-->', label: 'no' },
      { from: 'C', to: 'D', connector: '-->' },
      { from: 'D', to: 'E', connector: '-->' },
      { from: 'E', to: 'F', connector: '-->', label: 'yes' },
      { from: 'E', to: 'G', connector: '-->', label: 'no' },
      { from: 'F', to: 'Z', connector: '-->' },
      { from: 'G', to: 'Z', connector: '-->' },
    ]);
  });
});
