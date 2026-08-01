import { describe, it, expect } from 'vitest';
import { parseClassDiagram, type ClassDiagram } from './class-parse';
import { diffClassDiagrams } from './class-diff';
import { mergeClassSource } from './class-merge';
import type { MergeColours } from './flowchart-merge';

const COLOURS: MergeColours = {
  added: '#1a7f37',
  removed: '#cf222e',
  changed: '#9a6700',
  text: '#1f2328',
};

const chart = (body: string): ClassDiagram => {
  const parsed = parseClassDiagram(`classDiagram\n${body}`);
  if (!parsed) {
    throw new Error(`fixture did not parse:\n${body}`);
  }
  return parsed;
};

const merge = (before: string, after: string): string => {
  const newer = chart(after);
  return mergeClassSource(diffClassDiagrams(chart(before), newer), newer, COLOURS);
};

const lines = (source: string) => source.split('\n').map((line) => line.trim());

describe('mergeClassSource', () => {
  it('starts with the header and keeps the direction', () => {
    const source = merge('  direction LR\n  class A', '  direction LR\n  class A');

    expect(source.split('\n')[0]).toBe('classDiagram');
    expect(lines(source)).toContain('direction LR');
  });

  it('leaves an unchanged diagram unstyled, so the changes are the loud part', () => {
    const source = merge('  A <|-- B', '  A <|-- B');

    expect(source).not.toContain('style ');
    expect(lines(source)).toContain('A <|-- B');
  });

  describe('marking classes', () => {
    /**
     * `style` is the only thing that works. The flowchart-shaped route — `classDef` plus
     * `cssClass` — parses, renders, and marks nothing at all: a probe against real mermaid showed
     * it applying no visible style. Copying the flowchart merge here would have shipped a feature
     * that marked nothing while every unit test stayed green.
     */
    it('styles an added class, and does not use classDef', () => {
      const source = merge('  class A', '  class A\n  class B');

      expect(lines(source)).toContain('style B fill:#1a7f3733,stroke:#1a7f37,stroke-width:3px');
      expect(source).not.toContain('classDef');
      expect(source).not.toContain('cssClass');
    });

    it('styles a removed class, keeping it in the diagram', () => {
      const source = merge('  class A\n  class B', '  class A');

      expect(lines(source)).toContain('class B');
      expect(source).toContain('style B fill:#cf222e33,stroke:#cf222e');
    });

    it('styles a class whose member changed, since the box is the finest unit mermaid colours', () => {
      const source = merge('  class A {\n    +int x\n  }', '  class A {\n    +String x\n  }');

      expect(source).toContain('style A fill:#9a670033,stroke:#9a6700');
    });
  });

  describe('marking members', () => {
    /**
     * Square brackets, and never a colon inside one. A `(was: …)` marker is read as a *method
     * signature* — the probe rendered `+String gender` as `gender(was: +int gender)` — and a colon
     * inside a relationship label is an outright parse error.
     */
    it('says what a changed field used to be', () => {
      const source = merge('  class A {\n    +int age\n  }', '  class A {\n    +String age\n  }');

      expect(lines(source)).toContain('+String age [was +int age]');
    });

    it('marks an added and a removed member', () => {
      const source = merge(
        '  class A {\n    +int age\n    +String tail\n  }',
        '  class A {\n    +int age\n    +bool wings\n  }',
      );

      expect(lines(source)).toContain('+bool wings [added]');
      expect(lines(source)).toContain('+String tail [removed]');
    });

    /**
     * A method's marker lands in what mermaid reads as the return-type slot, so the old text must
     * not carry its own parentheses — with them, the probe rendered a trailing `: ]`.
     */
    it('strips the parentheses from a changed method signature', () => {
      const source = merge(
        '  class A {\n    +mate()\n  }',
        '  class A {\n    +mate(Animal other)\n  }',
      );

      const marked = lines(source).find((l) => l.startsWith('+mate('));
      expect(marked).toBe('+mate(Animal other) [was +mate]');
      expect(marked).not.toContain('()]');
    });

    it('leaves the members of a wholly new class unmarked, the box already saying it', () => {
      const source = merge('  class A', '  class A\n  class B {\n    +int x\n  }');

      expect(lines(source)).toContain('+int x');
      expect(source).not.toContain('[added]');
    });

    it('keeps an annotation and a generic', () => {
      const source = merge(
        '  class Shape~T~ {\n    <<interface>>\n    +area() float\n  }',
        '  class Shape~T~ {\n    <<interface>>\n    +area() float\n  }',
      );

      expect(lines(source)).toContain('class Shape~T~ {');
      expect(lines(source)).toContain('<<interface>>');
    });
  });

  describe('marking relationships', () => {
    /**
     * Relationships cannot be styled at all — `linkStyle` is a parse error in a class diagram — so
     * the only place left to say anything is the label.
     */
    it('marks an added relationship in its label rather than styling it', () => {
      const source = merge('  class A\n  class B', '  A <|-- B');

      expect(lines(source)).toContain('A <|-- B : (added)');
      expect(source).not.toContain('linkStyle');
    });

    it('appends the marker to an existing label', () => {
      const source = merge('  class A\n  class B', '  A <|-- B : quacks');

      expect(lines(source)).toContain('A <|-- B : quacks (added)');
    });

    it('keeps a removed relationship, marked', () => {
      const source = merge('  A <|-- B : quacks', '  class A\n  class B');

      expect(lines(source)).toContain('A <|-- B : quacks (removed)');
    });

    it('says what a changed relationship used to be, without a colon in the marker', () => {
      const source = merge('  A --> B : owns', '  A *-- B : holds');

      const marked = lines(source).find((l) => l.startsWith('A *--')) ?? '';
      expect(marked).toBe('A *-- B : holds (was owns)');
      // The colon that separates the label is fine; one *inside* the marker is the parse error.
      expect(marked.slice(marked.indexOf('('))).not.toContain(':');
    });

    it('keeps cardinality on both ends', () => {
      const source = merge('  A "1" --> "0..*" B : owns', '  A "1" --> "0..*" B : owns');

      expect(lines(source)).toContain('A "1" --> "0..*" B : owns');
    });
  });

  describe('notes and unmodelled lines', () => {
    it('carries a note and marks a reworded one', () => {
      const source = merge('  class A\n  note for A "old"', '  class A\n  note for A "new"');

      expect(lines(source)).toContain('note for A "new (was old)"');
    });

    it('drops the styling lines it could not model, having written its own', () => {
      const source = merge('  class A\n  style A fill:#f00', '  class A\n  style A fill:#f00');

      expect(source).not.toContain('fill:#f00');
    });
  });

  /**
   * The round trip, which has caught a real bug in both previous merges the first time it ran.
   */
  describe('round trip', () => {
    it('emits source its own parser can read', () => {
      const source = merge(
        '  class Animal {\n    +int age\n  }\n  Animal <|-- Duck : quacks',
        '  class Animal {\n    +String age\n    +mate(Animal o) bool\n  }\n  Animal <|-- Duck : quacks\n  Animal <|-- Fish',
      );

      expect(parseClassDiagram(source)).not.toBeNull();
    });

    it('emits a diagram whose class bodies still close', () => {
      const source = merge(
        '  class A {\n    +int x\n  }\n  class B',
        '  class A {\n    +int x\n    +int y\n  }\n  class B {\n    +bool z\n  }',
      );

      const opens = lines(source).filter((l) => l.endsWith('{')).length;
      const closes = lines(source).filter((l) => l === '}').length;
      expect(opens).toBe(closes);
      expect(parseClassDiagram(source)).not.toBeNull();
    });
  });
});
