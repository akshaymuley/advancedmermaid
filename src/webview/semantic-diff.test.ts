import { describe, it, expect } from 'vitest';
import { mergeDiagrams } from './semantic-diff';
import type { MergeColours } from './flowchart-merge';

const COLOURS: MergeColours = {
  added: '#1a7f37',
  removed: '#cf222e',
  changed: '#9a6700',
  text: '#1f2328',
};

const merge = (before: string, after: string) => mergeDiagrams(before, after, COLOURS);

describe('mergeDiagrams', () => {
  describe('picking a reader', () => {
    it('merges two flowcharts', () => {
      const result = merge('flowchart TD\n  A --> B', 'flowchart TD\n  A --> C');

      expect(result?.source.startsWith('flowchart TD')).toBe(true);
    });

    it('merges two sequence diagrams', () => {
      const result = merge('sequenceDiagram\n  A ->> B: hi', 'sequenceDiagram\n  A ->> B: hello');

      expect(result?.source.startsWith('sequenceDiagram')).toBe(true);
    });

    it('refuses a type neither reader understands', () => {
      expect(merge('classDiagram\n  Animal <|-- Duck', 'classDiagram\n  Animal <|-- Dog')).toBeNull();
    });

    /**
     * Two versions of *different* diagram types is not a diff, it is a rewrite. Merging them would
     * mean picking one type and silently reinterpreting the other version in it.
     */
    it('refuses a pair whose type changed between versions', () => {
      expect(merge('flowchart TD\n  A --> B', 'sequenceDiagram\n  A ->> B: hi')).toBeNull();
    });

    it('refuses a sequence diagram using syntax the parser will not guess at', () => {
      const boxed = 'sequenceDiagram\n  box Team\n    participant A\n  end\n  A ->> B: hi';

      expect(merge(boxed, boxed)).toBeNull();
    });

    it('refuses an empty or blank pair rather than merging nothing', () => {
      expect(merge('', '')).toBeNull();
      expect(merge('   \n', 'flowchart TD\n  A --> B')).toBeNull();
    });
  });

  describe('the legend it hands back', () => {
    it('lists only the kinds the diff actually holds', () => {
      const result = merge('flowchart TD\n  A --> B', 'flowchart TD\n  A --> B\n  B --> C');

      expect(result?.kinds).toEqual(['added']);
    });

    it('lists several kinds in a fixed order, whatever order they occur in', () => {
      const result = merge(
        'flowchart TD\n  A[One] --> B\n  B --> C',
        'flowchart TD\n  A[Uno] --> B\n  B --> D',
      );

      expect(result?.kinds).toEqual(['added', 'removed', 'changed']);
    });

    it('reports the same kinds for a sequence diagram', () => {
      const result = merge(
        'sequenceDiagram\n  A ->> B: one\n  A ->> B: two',
        'sequenceDiagram\n  A ->> B: one changed\n  A ->> B: three',
      );

      expect(result?.kinds).toContain('changed');
    });

    it('hands back no kinds at all when the two versions match', () => {
      const result = merge('sequenceDiagram\n  A ->> B: hi', 'sequenceDiagram\n  A ->> B: hi');

      expect(result?.kinds).toEqual([]);
    });
  });
});
