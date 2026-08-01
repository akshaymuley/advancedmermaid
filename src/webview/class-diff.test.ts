import { describe, it, expect } from 'vitest';
import { parseClassDiagram, type ClassDiagram } from './class-parse';
import { diffClassDiagrams } from './class-diff';

const chart = (body: string): ClassDiagram => {
  const parsed = parseClassDiagram(`classDiagram\n${body}`);
  if (!parsed) {
    throw new Error(`fixture did not parse:\n${body}`);
  }
  return parsed;
};

const diff = (before: string, after: string) => diffClassDiagrams(chart(before), chart(after));
const summary = (changes: { kind: string }[], name: (c: never) => string) =>
  changes.map((c) => `${c.kind}:${name(c as never)}`);

describe('diffClassDiagrams', () => {
  describe('classes', () => {
    it('reports an untouched diagram as identical', () => {
      const result = diff('  Animal <|-- Duck', '  Animal <|-- Duck');

      expect(result.identical).toBe(true);
      expect(result.classes.every((c) => c.kind === 'unchanged')).toBe(true);
    });

    it('reports an added and a removed class', () => {
      const result = diff('  class A\n  class B', '  class A\n  class C');

      expect(summary(result.classes, (c: { box: { name: string } }) => c.box.name)).toEqual([
        'unchanged:A',
        'removed:B',
        'added:C',
      ]);
      expect(result.identical).toBe(false);
    });

    it('reports a class whose annotation changed', () => {
      const result = diff('  class S\n  <<interface>> S', '  class S\n  <<abstract>> S');

      expect(result.classes[0].kind).toBe('changed');
      expect(result.classes[0].before?.annotation).toBe('interface');
    });
  });

  describe('members', () => {
    const members = (before: string, after: string) =>
      diff(`  class A {\n${before}\n  }`, `  class A {\n${after}\n  }`).classes[0];

    /**
     * The headline case for this diagram type: a field keeps its identity when its type changes,
     * so it reads as one changed member rather than as a removal plus an addition.
     */
    it('reports a retyped field as changed, carrying what it was', () => {
      const changed = members('    +int age', '    +String age');

      expect(changed.kind).toBe('changed');
      expect(changed.members[0].kind).toBe('changed');
      expect(changed.members[0].before?.text).toBe('+int age');
    });

    it('reports an added and a removed member', () => {
      const changed = members('    +int age\n    +String tail', '    +int age\n    +bool wings');

      expect(summary(changed.members, (m: { member: { name: string } }) => m.member.name)).toEqual([
        'unchanged:age',
        'removed:tail',
        'added:wings',
      ]);
    });

    it('reports a changed method signature as a change, not a replacement', () => {
      const changed = members('    +mate()', '    +mate(Animal other)');

      expect(changed.members[0].kind).toBe('changed');
      expect(changed.members[0].before?.text).toBe('+mate()');
    });

    // The class box is the finest thing mermaid can colour, so a member change has to raise the
    // class it belongs to — otherwise nothing on screen would mark it.
    it('marks the class as changed when only a member changed', () => {
      expect(members('    +int age', '    +int age\n    +bool wings').kind).toBe('changed');
    });

    it('leaves a class whose members all match as unchanged', () => {
      expect(members('    +int age', '    +int age').kind).toBe('unchanged');
    });
  });

  describe('relationships', () => {
    it('reports an added relationship', () => {
      const result = diff('  A <|-- B', '  A <|-- B\n  A <|-- C');

      expect(result.relationships.filter((r) => r.kind === 'added')).toHaveLength(1);
    });

    it('splices a removed relationship back where it was', () => {
      const result = diff('  A <|-- B\n  A <|-- C\n  A <|-- D', '  A <|-- B\n  A <|-- D');

      expect(
        summary(result.relationships, (r: { relationship: { to: string } }) => r.relationship.to),
      ).toEqual(['unchanged:B', 'removed:C', 'unchanged:D']);
    });

    /**
     * The arrow kind is part of what *changed*, not part of identity: an association becoming a
     * composition is the same relationship, restated. Keying on the arrow would report it twice
     * and draw both.
     */
    it('reports a relationship whose arrow changed as changed', () => {
      const result = diff('  A --> B', '  A *-- B');

      expect(result.relationships[0].kind).toBe('changed');
      expect(result.relationships[0].before?.arrow).toBe('-->');
    });

    it('reports a changed label and changed cardinality', () => {
      expect(diff('  A --> B : owns', '  A --> B : holds').relationships[0].kind).toBe('changed');
      expect(diff('  A "1" --> B', '  A "0..*" --> B').relationships[0].kind).toBe('changed');
    });

    it('tells parallel relationships apart by position', () => {
      const result = diff('  A --> B : one\n  A --> B : two', '  A --> B : one');

      expect(
        summary(result.relationships, (r: { relationship: { label?: string } }) =>
          String(r.relationship.label),
        ),
      ).toEqual(['unchanged:one', 'removed:two']);
    });
  });

  describe('notes', () => {
    it('reports a reworded note as changed', () => {
      const result = diff('  class A\n  note for A "old"', '  class A\n  note for A "new"');

      expect(result.notes[0].kind).toBe('changed');
      expect(result.notes[0].before?.text).toBe('old');
    });
  });

  describe('identical', () => {
    it('is false when only a member changed deep inside a class', () => {
      const result = diff('  class A {\n    +int x\n  }', '  class A {\n    +String x\n  }');

      expect(result.identical).toBe(false);
    });

    it('is true for two copies of a diagram with members, relationships and notes', () => {
      const source = '  class A {\n    +int x\n  }\n  A <|-- B : uses\n  note for B "hi"';

      expect(diff(source, source).identical).toBe(true);
    });
  });
});
