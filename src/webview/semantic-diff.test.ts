import { describe, it, expect } from 'vitest';
import { annotateDiagrams, mergeDiagrams } from './semantic-diff';
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

    it('merges two class diagrams', () => {
      const result = merge('classDiagram\n  Animal <|-- Duck', 'classDiagram\n  Animal <|-- Dog');

      expect(result?.source.startsWith('classDiagram')).toBe(true);
    });

    it('refuses a type no reader understands', () => {
      expect(merge('erDiagram\n  CUSTOMER ||--o{ ORDER : places', 'erDiagram\n  CUSTOMER ||--o{ ITEM : places')).toBeNull();
      expect(merge('stateDiagram-v2\n  [*] --> Idle', 'stateDiagram-v2\n  [*] --> Busy')).toBeNull();
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

describe('annotateDiagrams', () => {
  const annotate = (before: string, after: string) => annotateDiagrams(before, after, COLOURS);

  describe('picking a reader', () => {
    it('annotates two flowcharts', () => {
      const result = annotate('flowchart TD\n  A --> B', 'flowchart TD\n  A --> C');

      expect(result?.left.startsWith('flowchart TD')).toBe(true);
      expect(result?.right.startsWith('flowchart TD')).toBe(true);
    });

    it('annotates two sequence diagrams', () => {
      const result = annotate(
        'sequenceDiagram\n  A ->> B: hi',
        'sequenceDiagram\n  A ->> B: hello',
      );

      expect(result?.left).toContain('A ->> B: hi');
      expect(result?.right).toContain('A ->> B: hello');
    });

    it('annotates two class diagrams', () => {
      const result = annotate('classDiagram\n  Animal <|-- Duck', 'classDiagram\n  Animal <|-- Dog');

      expect(result?.left).toContain('Duck');
      expect(result?.right).toContain('Dog');
    });

    it('refuses a type neither reader understands', () => {
      expect(annotate('erDiagram\n  A ||--o{ B : has', 'erDiagram\n  A ||--o{ C : has')).toBeNull();
    });

    it('refuses a pair whose type changed, the same as the merged diff does', () => {
      expect(annotate('flowchart TD\n  A --> B', 'sequenceDiagram\n  A ->> B: hi')).toBeNull();
    });
  });

  /**
   * The guard that keeps an always-on mode honest. The emitters regenerate source from what the
   * parser modelled, and they do not write styling back — so annotating a diagram whose author
   * coloured it would quietly repaint their work in the diff's colours. Semantic mode may do that,
   * having been asked to; Side by side is on by default and may not.
   */
  describe('refusing to redraw a diagram that would lose something', () => {
    it('refuses when either side carries its own flowchart styling', () => {
      const plain = 'flowchart TD\n  A --> B';
      const styled = 'flowchart TD\n  A --> B\n  classDef hot fill:#f00\n  class A hot';

      expect(annotate(styled, plain)).toBeNull();
      expect(annotate(plain, styled)).toBeNull();
      expect(annotate(plain, plain)).not.toBeNull();
    });

    it('refuses when either side carries its own class-diagram styling', () => {
      const plain = 'classDiagram\n  class A';
      const styled = 'classDiagram\n  class A\n  style A fill:#f00';

      expect(annotate(plain, styled)).toBeNull();
      expect(annotate(plain, plain)).not.toBeNull();
    });

    it('still merges what it refuses to annotate, since that mode was asked for', () => {
      const plain = 'flowchart TD\n  A --> B';
      const styled = 'flowchart TD\n  A --> B\n  classDef hot fill:#f00\n  class A hot';

      expect(annotate(plain, styled)).toBeNull();
      expect(merge(plain, styled)).not.toBeNull();
    });
  });

  describe('what it reports', () => {
    it('marks removals on the left and additions on the right, never the other way', () => {
      const result = annotate(
        'flowchart TD\n  A[Build] --> B[Test]\n  B --> C[Deploy]',
        'flowchart TD\n  A[Build image] --> B[Test]\n  B --> L[Lint]',
      );

      expect(result?.left).toContain('classDef removed');
      expect(result?.left).not.toContain('classDef added');
      expect(result?.right).toContain('classDef added');
      expect(result?.right).not.toContain('classDef removed');
    });

    it('names the kinds present, in a fixed order, and only those', () => {
      const result = annotate('flowchart TD\n  A --> B', 'flowchart TD\n  A --> B\n  B --> C');

      expect(result?.kinds).toEqual(['added']);
    });

    it('hands back no kinds at all when the two versions match', () => {
      const same = 'flowchart TD\n  A[One] --> B[Two]';

      expect(annotate(same, same)?.kinds).toEqual([]);
    });
  });
});
