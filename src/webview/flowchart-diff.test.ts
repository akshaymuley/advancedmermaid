import { describe, it, expect } from 'vitest';
import { parseFlowchart, type Flowchart } from './flowchart-parse';
import { diffFlowcharts } from './flowchart-diff';

/** Diffs are far easier to read written as the two sources they came from. */
const chart = (source: string): Flowchart => {
  const parsed = parseFlowchart(source);
  if (!parsed) {
    throw new Error(`not a flowchart: ${source}`);
  }
  return parsed;
};

const diff = (before: string, after: string) => diffFlowcharts(chart(before), chart(after));

describe('diffFlowcharts', () => {
  describe('nodes', () => {
    it('calls a node kept on both sides unchanged', () => {
      expect(diff('flowchart TD\n A[One]', 'flowchart TD\n A[One]').nodes).toEqual([
        { kind: 'unchanged', node: { id: 'A', label: 'One', shape: '[]' } },
      ]);
    });

    it('marks a node only the newer version has as added', () => {
      const result = diff('flowchart TD\n A --> B', 'flowchart TD\n A --> B --> C');
      expect(result.nodes.find((n) => n.node.id === 'C')?.kind).toBe('added');
    });

    it('marks a node only the older version has as removed', () => {
      const result = diff('flowchart TD\n A --> B --> C', 'flowchart TD\n A --> B');
      expect(result.nodes.find((n) => n.node.id === 'C')?.kind).toBe('removed');
    });

    // The point of keying on the id: a reworded node is one node that changed, not a removal plus
    // an addition, which would draw the same box twice in the merged diagram.
    it('marks a reworded node as changed and keeps what it used to say', () => {
      expect(diff('flowchart TD\n A[Old]', 'flowchart TD\n A[New]').nodes).toEqual([
        {
          kind: 'changed',
          node: { id: 'A', label: 'New', shape: '[]' },
          before: { id: 'A', label: 'Old', shape: '[]' },
        },
      ]);
    });

    it('treats a reshaped node as changed too, since the shape is what it renders as', () => {
      expect(diff('flowchart TD\n A[Same]', 'flowchart TD\n A{Same}').nodes[0].kind).toBe(
        'changed',
      );
    });
  });

  describe('edges', () => {
    it('pairs edges by the nodes they join', () => {
      expect(diff('flowchart TD\n A --> B', 'flowchart TD\n A --> B').edges).toEqual([
        { kind: 'unchanged', edge: { from: 'A', to: 'B', connector: '-->' } },
      ]);
    });

    it('marks an edge added, removed, or changed by its label', () => {
      const result = diff(
        'flowchart TD\n A --> B\n B --> C',
        'flowchart TD\n A -->|now| B\n B --> D',
      );
      expect(result.edges).toEqual([
        {
          kind: 'changed',
          edge: { from: 'A', to: 'B', connector: '-->', label: 'now' },
          before: { from: 'A', to: 'B', connector: '-->' },
        },
        { kind: 'removed', edge: { from: 'B', to: 'C', connector: '-->' } },
        { kind: 'added', edge: { from: 'B', to: 'D', connector: '-->' } },
      ]);
    });

    it('notices a changed connector even when the two ends and the label are the same', () => {
      expect(diff('flowchart TD\n A --> B', 'flowchart TD\n A -.-> B').edges[0].kind).toBe(
        'changed',
      );
    });

    // An edge reversed is not an edge kept: the arrow is the meaning.
    it('treats a reversed edge as one removed and one added', () => {
      const kinds = diff('flowchart TD\n A --> B', 'flowchart TD\n B --> A').edges.map(
        (e) => e.kind,
      );
      expect(kinds.sort()).toEqual(['added', 'removed']);
    });

    it('pairs parallel edges between the same nodes by their order', () => {
      const result = diff(
        'flowchart TD\n A -->|one| B\n A -->|two| B',
        'flowchart TD\n A -->|one| B\n A -->|three| B',
      );
      expect(result.edges.map((e) => e.kind)).toEqual(['unchanged', 'changed']);
    });
  });

  describe('ordering', () => {
    // The merged source has to come out the same every time, or an unchanged comparison
    // re-renders with a different layout on every refresh.
    it('follows the newer version, splicing each removal in after what preceded it', () => {
      const result = diff('flowchart TD\n A --> B --> C --> D', 'flowchart TD\n A --> B --> D');
      expect(result.nodes.map((n) => `${n.kind}:${n.node.id}`)).toEqual([
        'unchanged:A',
        'unchanged:B',
        'removed:C',
        'unchanged:D',
      ]);
    });

    it('puts a removal first when it was first in the older version', () => {
      const result = diff('flowchart TD\n X --> A --> B', 'flowchart TD\n A --> B');
      expect(result.nodes.map((n) => n.node.id)).toEqual(['X', 'A', 'B']);
    });
  });

  describe('identical', () => {
    it('reports two equal diagrams as identical', () => {
      expect(diff('flowchart TD\n A --> B', 'flowchart TD\n A --> B').identical).toBe(true);
    });

    it('is not fooled by a diagram that only gained an edge', () => {
      expect(diff('flowchart TD\n A --> B', 'flowchart TD\n A --> B\n A --> C').identical).toBe(
        false,
      );
    });

    // Layout-only rewrites still render differently, so they are not "identical" to a reader.
    it('counts a direction change as a difference', () => {
      expect(diff('flowchart TD\n A --> B', 'flowchart LR\n A --> B').identical).toBe(false);
    });
  });

  it('diffs a realistic edit to the project sample', () => {
    const before = [
      'flowchart TD',
      '    A[Commit pushed] --> B{CI triggered?}',
      '    B -- yes --> C[Build]',
      '    C --> D[Unit tests]',
    ].join('\n');
    const after = [
      'flowchart TD',
      '    A[Commit pushed] --> B{CI triggered?}',
      '    B -- yes --> C[Build image]',
      '    C --> L[Lint]',
      '    L --> D[Unit tests]',
    ].join('\n');

    const result = diffFlowcharts(chart(before), chart(after));

    expect(result.nodes).toEqual([
      { kind: 'unchanged', node: { id: 'A', label: 'Commit pushed', shape: '[]' } },
      { kind: 'unchanged', node: { id: 'B', label: 'CI triggered?', shape: '{}' } },
      {
        kind: 'changed',
        node: { id: 'C', label: 'Build image', shape: '[]' },
        before: { id: 'C', label: 'Build', shape: '[]' },
      },
      { kind: 'added', node: { id: 'L', label: 'Lint', shape: '[]' } },
      { kind: 'unchanged', node: { id: 'D', label: 'Unit tests', shape: '[]' } },
    ]);
    expect(result.edges).toEqual([
      { kind: 'unchanged', edge: { from: 'A', to: 'B', connector: '-->' } },
      { kind: 'unchanged', edge: { from: 'B', to: 'C', connector: '-->', label: 'yes' } },
      { kind: 'removed', edge: { from: 'C', to: 'D', connector: '-->' } },
      { kind: 'added', edge: { from: 'C', to: 'L', connector: '-->' } },
      { kind: 'added', edge: { from: 'L', to: 'D', connector: '-->' } },
    ]);
    expect(result.identical).toBe(false);
  });
});
