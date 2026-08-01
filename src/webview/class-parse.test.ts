import { describe, it, expect } from 'vitest';
import { parseClassDiagram } from './class-parse';

const chart = (body: string) => parseClassDiagram(`classDiagram\n${body}\n`);
const classes = (body: string) => chart(body)?.classes ?? [];
const relationships = (body: string) => chart(body)?.relationships ?? [];

describe('parseClassDiagram', () => {
  describe('recognising the diagram', () => {
    it('reads an empty class diagram', () => {
      expect(parseClassDiagram('classDiagram\n')).toEqual({
        classes: [],
        relationships: [],
        notes: [],
        unsupported: [],
      });
    });

    it('accepts the v2 header and a direction', () => {
      expect(parseClassDiagram('classDiagram-v2\n  direction LR\n')?.direction).toBe('LR');
    });

    it('skips leading blanks and comments', () => {
      expect(parseClassDiagram('\n%% note\nclassDiagram\n  class A\n')).not.toBeNull();
    });

    it('returns null for anything that is not a class diagram', () => {
      expect(parseClassDiagram('flowchart TD\n  A --> B')).toBeNull();
      expect(parseClassDiagram('sequenceDiagram\n  A ->> B: hi')).toBeNull();
      expect(parseClassDiagram('')).toBeNull();
    });

    /**
     * `namespace` groups classes, so re-emitting one without modelling it would regroup the
     * diagram. Same call as `box` in sequence: falling back says "I can't diff this", emitting a
     * regrouped diagram says something false.
     */
    it('refuses a diagram using namespaces', () => {
      expect(parseClassDiagram('classDiagram\n  namespace Zoo {\n    class Duck\n  }\n')).toBeNull();
    });
  });

  describe('classes', () => {
    it('reads a bare class', () => {
      expect(classes('  class Animal')).toEqual([{ name: 'Animal', members: [] }]);
    });

    it('reads a generic parameter, kept as written for re-emitting', () => {
      expect(classes('  class Shape~T~')[0]).toMatchObject({ name: 'Shape', generic: 'T' });
    });

    it('reads an annotation declared on its own line', () => {
      expect(classes('  class Shape\n  <<interface>> Shape')[0].annotation).toBe('interface');
    });

    it('reads an annotation declared inside the body', () => {
      expect(classes('  class Shape {\n    <<interface>>\n    +area() float\n  }')[0]).toMatchObject({
        annotation: 'interface',
      });
    });

    it('reads members from a body block', () => {
      const [animal] = classes('  class Animal {\n    +int age\n    +mate() bool\n  }');

      expect(animal.members.map((m) => m.text)).toEqual(['+int age', '+mate() bool']);
    });

    it('reads a member declared with the colon shorthand', () => {
      expect(classes('  class Animal\n  Animal : +int age')[0].members[0].text).toBe('+int age');
    });

    // A class mentioned only by a relationship still has to exist, since mermaid draws a box for
    // it and the merged diagram has to say whether that box is new.
    it('infers a class mentioned only in a relationship', () => {
      expect(classes('  Animal <|-- Duck').map((c) => c.name)).toEqual(['Animal', 'Duck']);
    });

    it('does not re-infer a class already declared', () => {
      const found = classes('  class Animal {\n    +int age\n  }\n  Animal <|-- Duck');

      expect(found.map((c) => c.name)).toEqual(['Animal', 'Duck']);
      expect(found[0].members).toHaveLength(1);
    });
  });

  describe('members', () => {
    const members = (body: string) => classes(`  class A {\n${body}\n  }`)[0].members;

    /**
     * A member's identity is its name — `age` — not its whole text. Keying on the text would
     * report every retyped field as a removal plus an addition, which is exactly the edit this
     * feature exists to show.
     */
    it('names a field by its identifier, ignoring type and visibility', () => {
      expect(members('    +int age')[0]).toMatchObject({ name: 'age', kind: 'field' });
      expect(members('    -String gender')[0]).toMatchObject({ name: 'gender', kind: 'field' });
    });

    it('names a method by its identifier, ignoring its arguments', () => {
      expect(members('    +mate(Animal other) bool')[0]).toMatchObject({
        name: 'mate',
        kind: 'method',
      });
    });

    it('gives two overloads of one name the same identity, so a signature change is a change', () => {
      const [before] = members('    +mate()');
      const [after] = members('    +mate(Animal other)');

      expect(before.name).toBe(after.name);
      expect(before.text).not.toBe(after.text);
    });

    it('keeps static and abstract markers in the text', () => {
      expect(members('    +count() int$')[0].text).toBe('+count() int$');
    });
  });

  describe('relationships', () => {
    it('reads inheritance', () => {
      expect(relationships('  Animal <|-- Duck')).toEqual([
        { from: 'Animal', to: 'Duck', arrow: '<|--' },
      ]);
    });

    // Verbatim, as flowchart connectors and sequence arrows are: the merged render writes them
    // back out, and an enum would need a lossy mapping back.
    it('keeps every arrow form as written', () => {
      for (const arrow of ['<|--', '*--', 'o--', '-->', '--', '..>', '..|>', '<|..', '..']) {
        expect(relationships(`  A ${arrow} B`)[0]?.arrow).toBe(arrow);
      }
    });

    it('reads a label', () => {
      expect(relationships('  Animal <|-- Duck : quacks')[0].label).toBe('quacks');
    });

    it('reads cardinality on either side', () => {
      expect(relationships('  Customer "1" --> "0..*" Ticket : books')[0]).toEqual({
        from: 'Customer',
        to: 'Ticket',
        arrow: '-->',
        fromCardinality: '1',
        toCardinality: '0..*',
        label: 'books',
      });
    });
  });

  describe('notes and unmodelled lines', () => {
    it('reads a note attached to a class', () => {
      expect(chart('  class A\n  note for A "careful"')?.notes).toEqual([
        { of: 'A', text: 'careful' },
      ]);
    });

    it('reads a standalone note', () => {
      expect(chart('  note "read me"')?.notes).toEqual([{ text: 'read me' }]);
    });

    /**
     * Styling lines are carried rather than refused, as `classDef` and `click` are for flowcharts:
     * a diagram with styling in it is still perfectly diffable, and refusing it would make the
     * feature useless on real files.
     */
    it('carries styling and interaction lines without refusing the diagram', () => {
      const parsed = chart('  class A\n  style A fill:#f00\n  click A href "x"');

      expect(parsed?.unsupported).toEqual(['style A fill:#f00', 'click A href "x"']);
      expect(parsed?.classes).toHaveLength(1);
    });
  });

  it('reads a whole diagram in one piece', () => {
    const parsed = parseClassDiagram(`classDiagram
  direction LR
  class Animal {
    <<interface>>
    +int age
    +mate(Animal other) bool
  }
  class Duck
  Animal <|-- Duck : quacks
  Customer "1" --> "0..*" Duck : owns
  note for Duck "new this release"`);

    expect(parsed?.direction).toBe('LR');
    expect(parsed?.classes.map((c) => c.name)).toEqual(['Animal', 'Duck', 'Customer']);
    expect(parsed?.classes[0].annotation).toBe('interface');
    expect(parsed?.relationships).toHaveLength(2);
    expect(parsed?.notes).toHaveLength(1);
  });
});
