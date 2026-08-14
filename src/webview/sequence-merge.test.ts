import { describe, it, expect } from 'vitest';
import { parseSequence, type Sequence } from './sequence-parse';
import { diffSequences } from './sequence-diff';
import { mergeSequenceSource } from './sequence-merge';
import type { MergeColours } from './flowchart-merge';

const COLOURS: MergeColours = {
  added: '#1a7f37',
  removed: '#cf222e',
  changed: '#9a6700',
  text: '#1f2328',
};

const chart = (source: string): Sequence => {
  const parsed = parseSequence(`sequenceDiagram\n${source}`);
  if (!parsed) {
    throw new Error(`fixture did not parse:\n${source}`);
  }
  return parsed;
};

const merge = (before: string, after: string): string => {
  const newer = chart(after);
  return mergeSequenceSource(diffSequences(chart(before), newer), newer, COLOURS);
};

const lines = (source: string) => source.split('\n').map((line) => line.trim());

describe('mergeSequenceSource', () => {
  it('starts with the header, so mermaid knows what it is reading', () => {
    expect(merge('  A ->> B: hi', '  A ->> B: hi').split('\n')[0]).toBe('sequenceDiagram');
  });

  it('writes the participants back in their original order', () => {
    const source = merge(
      '  participant A as Alice\n  actor B\n  A ->> B: hi',
      '  participant A as Alice\n  actor B\n  A ->> B: hi',
    );

    expect(lines(source)).toContain('participant A as Alice');
    expect(lines(source)).toContain('actor B');
  });

  it('leaves an unchanged diagram unbanded, so the changes are the loud part', () => {
    const source = merge('  A ->> B: hi', '  A ->> B: hi');

    expect(source).not.toContain('rect ');
    expect(lines(source)).toContain('A ->> B: hi');
  });

  describe('banding', () => {
    it('wraps an added message in a band of its own', () => {
      const source = merge('  A ->> B: one', '  A ->> B: one\n  A ->> B: two');

      expect(source).toContain('rect rgba(26, 127, 55');
      expect(lines(source).filter((l) => l === 'end')).toHaveLength(1);
      expect(source.indexOf('rect')).toBeLessThan(source.indexOf('A ->> B: two'));
    });

    it('wraps a removed message, keeping it where it used to be', () => {
      const source = merge('  A ->> B: one\n  A ->> B: two', '  A ->> B: one');

      expect(source).toContain('A ->> B: two');
      expect(source).toContain('rect rgba(207, 34, 46');
    });

    /**
     * Translucent, not solid. The probe that settled this showed a solid band swallowing the
     * message text on a dark canvas — the same trap the exported image's painted background
     * exists to avoid.
     */
    it('bands with a translucent tint rather than a solid slab', () => {
      const source = merge('  A ->> B: one', '  A ->> B: two');

      expect(source).toMatch(/rect rgba\(\d+, \d+, \d+, 0\.\d+\)/);
    });

    // The single most important rule here, and the reason participants are handled separately:
    // a `rect` around a participant declaration renders NaN geometry and garbles the diagram.
    it('never bands a participant declaration', () => {
      const source = merge('  participant A\n  A ->> A: x', '  participant A\n  participant B\n  A ->> B: x');

      const declaration = lines(source).findIndex((l) => l.startsWith('participant B'));
      expect(declaration).toBeGreaterThan(-1);
      expect(lines(source)[declaration - 1]).not.toMatch(/^rect /);
    });

    it('marks an added participant in its label instead', () => {
      const source = merge('  A ->> A: x', '  participant B as Bob\n  A ->> B: x');

      expect(lines(source)).toContain('participant B as Bob (added)');
    });

    it('marks a renamed participant with what it used to be called', () => {
      const source = merge('  participant A as Alice\n  A ->> A: x', '  participant A as Alicia\n  A ->> A: x');

      expect(lines(source)).toContain('participant A as Alicia (was: Alice)');
    });
  });

  describe('reworded messages', () => {
    /**
     * A reworded message carries its old text, exactly as a reworded flowchart node does: the
     * colour reports *that* something changed, and only the text reports *what*.
     */
    it('says what the message used to say', () => {
      const source = merge('  A ->> B: Retry once', '  A ->> B: Retry twice');

      expect(lines(source)).toContain('A ->> B: Retry twice (was: Retry once)');
    });

    it(`leaves an unchanged message's text alone`, () => {
      expect(merge('  A ->> B: hi', '  A ->> B: hi')).toContain('A ->> B: hi');
      expect(merge('  A ->> B: hi', '  A ->> B: hi')).not.toContain('was:');
    });
  });

  describe('blocks', () => {
    it('puts a block back together, bands and all', () => {
      const source = merge(
        '  loop retry\n    A ->> B: one\n  end',
        '  loop retry\n    A ->> B: one\n    A ->> B: two\n  end',
      );

      expect(lines(source)).toContain('loop retry');
      // The block's own `end`, plus the band's.
      expect(lines(source).filter((l) => l === 'end')).toHaveLength(2);
    });

    it('keeps alt and else as one block', () => {
      const source = merge(
        '  alt ok\n    A ->> B: yes\n  else no\n    A ->> B: nope\n  end',
        '  alt ok\n    A ->> B: yes\n  else no\n    A ->> B: never\n  end',
      );

      expect(lines(source)).toContain('alt ok');
      expect(lines(source)).toContain('else no');
    });

    it('bands a whole block that only one version has', () => {
      const source = merge('  A ->> B: hi', '  A ->> B: hi\n  opt maybe\n    A ->> B: extra\n  end');

      const order = lines(source);
      expect(order.findIndex((l) => l.startsWith('rect'))).toBeLessThan(
        order.findIndex((l) => l === 'opt maybe'),
      );
    });

    it('nests bands inside blocks without unbalancing them', () => {
      const source = merge(
        '  loop outer\n    alt inner\n      A ->> B: deep\n    end\n  end',
        '  loop outer\n    alt inner\n      A ->> B: deeper\n    end\n  end',
      );

      const ends = lines(source).filter((l) => l === 'end').length;
      const openers = lines(source).filter((l) => /^(loop|alt|opt|par|critical|break|rect) /.test(l))
        .length;
      expect(ends).toBe(openers);
    });
  });

  describe('notes and other statements', () => {
    it('writes a note back where it was', () => {
      const source = merge('  Note over A,B: hi', '  Note over A,B: hi');

      expect(lines(source)).toContain('Note over A,B: hi');
    });

    it(`carries a reworded note's old text too`, () => {
      const source = merge('  Note over A,B: before', '  Note over A,B: after');

      expect(lines(source)).toContain('Note over A,B: after (was: before)');
    });

    it('keeps activation shorthand on the message it belonged to', () => {
      const source = merge('  A ->>+ B: go\n  B -->>- A: done', '  A ->>+ B: go\n  B -->>- A: done');

      expect(lines(source)).toContain('A ->>+ B: go');
      expect(lines(source)).toContain('B -->>- A: done');
    });

    it('passes unmodelled lines straight through', () => {
      expect(lines(merge('  autonumber\n  A ->> B: hi', '  autonumber\n  A ->> B: hi'))).toContain(
        'autonumber',
      );
    });
  });

  /**
   * The round trip. This is what caught the flowchart merge writing edge labels it could not read
   * back, the first time it ran — nothing had ever parsed its own output before.
   */
  describe('round trip', () => {
    it('emits source its own parser can read', () => {
      const source = merge(
        '  participant A as Alice\n  A ->> B: one\n  loop retry\n    B -->> A: two\n  end',
        '  participant A as Alice\n  A ->> B: one changed\n  loop retry\n    B -->> A: two\n    A ->> B: three\n  end',
      );

      expect(parseSequence(source)).not.toBeNull();
    });

    it('emits a diagram whose blocks still balance after banding', () => {
      const source = merge(
        '  alt a\n    A ->> B: x\n  else b\n    A ->> B: y\n  end',
        '  alt a\n    A ->> B: x2\n  else b\n    A ->> B: y\n    A ->> B: z\n  end',
      );

      expect(parseSequence(source)).not.toBeNull();
    });
  });

  /** One version on its own, banded — what Side by side renders into each pane. */
  describe('one side at a time', () => {
    const side = (before: string, after: string, which: 'before' | 'after'): string => {
      const older = chart(before);
      const newer = chart(after);
      const diff = diffSequences(older, newer);
      return mergeSequenceSource(diff, which === 'before' ? older : newer, COLOURS, which);
    };

    const BEFORE = '  participant U as User\n  U ->> S: Place order\n  S -->> U: Receipt';
    const AFTER = '  participant U as Customer\n  U ->> S: Place order now\n  S ->> S: Reserve';

    it('leaves an added message out of the older side', () => {
      const older = side(BEFORE, AFTER, 'before');
      expect(older).not.toContain('Reserve');
      expect(lines(older)).toContain('S -->> U: Receipt');
    });

    it('leaves a removed message out of the newer side', () => {
      const newer = side(BEFORE, AFTER, 'after');
      expect(newer).not.toContain('Receipt');
      expect(lines(newer)).toContain('S ->> S: Reserve');
    });

    it('bands only what the older side can show — removed and changed, never added', () => {
      const older = side(BEFORE, AFTER, 'before');
      expect(older).toContain('rgba(207, 34, 46'); // removed
      expect(older).toContain('rgba(154, 103, 0'); // changed
      expect(older).not.toContain('rgba(26, 127, 55'); // added
    });

    it('bands only what the newer side can show — added and changed, never removed', () => {
      const newer = side(BEFORE, AFTER, 'after');
      expect(newer).toContain('rgba(26, 127, 55');
      expect(newer).toContain('rgba(154, 103, 0');
      expect(newer).not.toContain('rgba(207, 34, 46');
    });

    it('says each version’s own message text, never what it used to say', () => {
      expect(lines(side(BEFORE, AFTER, 'before'))).toContain('U ->> S: Place order');
      expect(lines(side(BEFORE, AFTER, 'after'))).toContain('U ->> S: Place order now');
      expect(side(BEFORE, AFTER, 'before')).not.toContain('(was:');
      expect(side(BEFORE, AFTER, 'after')).not.toContain('(was:');
    });

    /**
     * A participant is the one thing a band cannot mark — `rect` around a declaration produces NaN
     * geometry — so the marker stays a word, and each side says what it is from where it stands.
     */
    it('marks a participant in words, from that side’s point of view', () => {
      expect(lines(side(BEFORE, AFTER, 'before'))).toContain('participant U as User');
      expect(lines(side(BEFORE, AFTER, 'after'))).toContain('participant U as Customer');

      // Declared but never messaged, so the parser can't infer it back — this is exactly the
      // participant that would otherwise appear with nothing to say it arrived or left.
      const gained = '  participant A\n  participant B\n  participant C\n  A ->> B: hi';
      const lost = '  participant A\n  participant B\n  A ->> B: hi';
      expect(lines(side(lost, gained, 'after'))).toContain('participant C as C (added)');
      expect(lines(side(gained, lost, 'before'))).toContain('participant C as C (removed)');
    });

    it('keeps blocks balanced on each side', () => {
      const before = '  alt a\n    A ->> B: x\n  else b\n    A ->> B: y\n  end';
      const after = '  alt a\n    A ->> B: x2\n  end';

      for (const which of ['before', 'after'] as const) {
        expect(parseSequence(side(before, after, which))).not.toBeNull();
      }
    });

    /** A branch only the older version had is its own section, and belongs only to that side. */
    it('keeps a dropped branch on the older side and off the newer', () => {
      const before = '  alt a\n    A ->> B: x\n  else b\n    A ->> B: gone\n  end';
      const after = '  alt a\n    A ->> B: x\n  end';

      expect(side(before, after, 'before')).toContain('gone');
      expect(side(before, after, 'after')).not.toContain('gone');
    });

    it('bands nothing when the two versions agree', () => {
      const same = '  A ->> B: hi';
      for (const which of ['before', 'after'] as const) {
        expect(side(same, same, which)).not.toContain('rect ');
      }
    });
  });
});
