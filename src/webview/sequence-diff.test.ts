import { describe, it, expect } from 'vitest';
import { parseSequence, type Sequence } from './sequence-parse';
import { diffSequences, type BlockChange, type StatementChange } from './sequence-diff';

const chart = (source: string): Sequence => {
  const parsed = parseSequence(`sequenceDiagram\n${source}`);
  if (!parsed) {
    throw new Error(`fixture did not parse:\n${source}`);
  }
  return parsed;
};

const diff = (before: string, after: string) => diffSequences(chart(before), chart(after));

/** Every statement change flattened to `kind:text`, so a test reads like the diagram does. */
const summarise = (changes: StatementChange[]): string[] =>
  changes.flatMap((change) => {
    const { statement } = change;
    if (statement.type === 'block') {
      return [
        `${change.kind}:${statement.keyword}`,
        ...((change as BlockChange).sections ?? []).flatMap((s) => summarise(s.statements)),
      ];
    }
    const text = statement.type === 'message' ? statement.text : statement.text;
    return [`${change.kind}:${text}`];
  });

describe('diffSequences', () => {
  describe('messages', () => {
    it('reports an untouched exchange as unchanged', () => {
      const result = diff('  A ->> B: hi', '  A ->> B: hi');

      expect(summarise(result.statements)).toEqual(['unchanged:hi']);
      expect(result.identical).toBe(true);
    });

    it('reports an added message', () => {
      const result = diff('  A ->> B: one', '  A ->> B: one\n  A ->> B: two');

      expect(summarise(result.statements)).toEqual(['unchanged:one', 'added:two']);
      expect(result.identical).toBe(false);
    });

    /**
     * Reworded, not removed-and-added. A message's identity is the pair it joins, for the same
     * reason a flowchart node's is its id: the text is exactly what an edit changes, so keying on
     * it would report every rewording twice and say nothing about what it used to be.
     */
    it('reports a reworded message as changed, carrying what it said before', () => {
      const result = diff('  A ->> B: Retry once', '  A ->> B: Retry twice');

      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].kind).toBe('changed');
      expect(result.statements[0].before).toMatchObject({ text: 'Retry once' });
    });

    it('reports a changed arrow, since a dotted reply is a different message', () => {
      const result = diff('  A ->> B: ok', '  A -->> B: ok');

      expect(result.statements[0].kind).toBe('changed');
    });

    // Order is the diagram here, not merely its layout: a removal has to come back where it was.
    it('splices a removed message back where it used to be', () => {
      const result = diff(
        '  A ->> B: one\n  A ->> B: two\n  A ->> B: three',
        '  A ->> B: one\n  A ->> B: three',
      );

      expect(summarise(result.statements)).toEqual([
        'unchanged:one',
        'removed:two',
        'unchanged:three',
      ]);
    });

    it('tells repeated messages between the same pair apart by position', () => {
      const result = diff('  A ->> B: ping\n  A ->> B: ping', '  A ->> B: ping');

      expect(summarise(result.statements)).toEqual(['unchanged:ping', 'removed:ping']);
    });

    it('treats a message to a different participant as a removal and an addition', () => {
      const result = diff('  A ->> B: hi', '  A ->> C: hi');

      expect(summarise(result.statements).sort()).toEqual(['added:hi', 'removed:hi']);
    });
  });

  describe('participants', () => {
    it('reports one added and one removed', () => {
      const result = diff(
        '  participant A\n  participant B\n  A ->> B: hi',
        '  participant A\n  participant C\n  A ->> C: hi',
      );

      expect(result.participants.map((c) => `${c.kind}:${c.participant.id}`)).toEqual([
        'unchanged:A',
        'removed:B',
        'added:C',
      ]);
    });

    it('reports a renamed participant as changed rather than replaced', () => {
      const result = diff(
        '  participant A as Alice\n  A ->> A: think',
        '  participant A as Alicia\n  A ->> A: think',
      );

      expect(result.participants[0]).toMatchObject({ kind: 'changed' });
      expect(result.participants[0].before).toMatchObject({ label: 'Alice' });
      expect(result.identical).toBe(false);
    });
  });

  describe('blocks', () => {
    it('diffs inside a block that both versions have', () => {
      const result = diff(
        '  loop retry\n    A ->> B: one\n  end',
        '  loop retry\n    A ->> B: one\n    A ->> B: two\n  end',
      );

      expect(summarise(result.statements)).toEqual([
        'unchanged:loop',
        'unchanged:one',
        'added:two',
      ]);
    });

    it('marks everything inside a block that is entirely new', () => {
      const result = diff('  A ->> B: hi', '  A ->> B: hi\n  opt maybe\n    A ->> B: extra\n  end');

      expect(summarise(result.statements)).toEqual([
        'unchanged:hi',
        'added:opt',
        'added:extra',
      ]);
    });

    it('marks everything inside a block that is gone', () => {
      const result = diff('  A ->> B: hi\n  opt maybe\n    A ->> B: extra\n  end', '  A ->> B: hi');

      expect(summarise(result.statements)).toEqual([
        'unchanged:hi',
        'removed:opt',
        'removed:extra',
      ]);
    });

    it('diffs each branch of an alt against the matching branch', () => {
      const result = diff(
        '  alt ok\n    A ->> B: yes\n  else no\n    A ->> B: nope\n  end',
        '  alt ok\n    A ->> B: yes\n  else no\n    A ->> B: never\n  end',
      );

      expect(summarise(result.statements)).toEqual([
        'unchanged:alt',
        'unchanged:yes',
        'changed:never',
      ]);
    });

    it('reports a retitled block as changed while still diffing inside it', () => {
      const result = diff(
        '  loop every minute\n    A ->> B: poll\n  end',
        '  loop every hour\n    A ->> B: poll\n  end',
      );

      expect(summarise(result.statements)).toEqual(['changed:loop', 'unchanged:poll']);
    });

    it('recurses through nested blocks', () => {
      const result = diff(
        '  loop outer\n    alt inner\n      A ->> B: deep\n    end\n  end',
        '  loop outer\n    alt inner\n      A ->> B: deeper\n    end\n  end',
      );

      expect(summarise(result.statements)).toEqual([
        'unchanged:loop',
        'unchanged:alt',
        'changed:deeper',
      ]);
    });

    // A branch appearing in only one version still has to be reported, or its messages would
    // vanish from the merged diagram entirely.
    it('handles an alt that gained a branch', () => {
      const result = diff(
        '  alt ok\n    A ->> B: yes\n  end',
        '  alt ok\n    A ->> B: yes\n  else no\n    A ->> B: nope\n  end',
      );

      expect(summarise(result.statements)).toEqual([
        'changed:alt',
        'unchanged:yes',
        'added:nope',
      ]);
    });
  });

  describe('notes', () => {
    it('reports a reworded note as changed', () => {
      const result = diff('  Note over A,B: before', '  Note over A,B: after');

      expect(result.statements[0]).toMatchObject({ kind: 'changed' });
    });

    it('treats a note that moved to another participant as removed and added', () => {
      const result = diff('  Note over A: here', '  Note over B: here');

      expect(summarise(result.statements).sort()).toEqual(['added:here', 'removed:here']);
    });
  });

  describe('identical', () => {
    it('is false when only a participant changed', () => {
      expect(diff('  participant A as Al\n  A ->> A: x', '  participant A as Alf\n  A ->> A: x')
        .identical).toBe(false);
    });

    it('is true for two copies of a diagram with blocks and notes', () => {
      const source = '  alt ok\n    A ->> B: yes\n  end\n  Note over A,B: done';

      expect(diff(source, source).identical).toBe(true);
    });
  });
});
