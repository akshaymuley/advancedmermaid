import { describe, it, expect } from 'vitest';
import { parseSequence, type Block, type Message, type Statement } from './sequence-parse';

/** The statements of a diagram body, with the header supplied. */
const body = (source: string) => parseSequence(`sequenceDiagram\n${source}\n`)?.statements;

const messages = (source: string): Message[] =>
  (body(source) ?? []).filter((s): s is Message => s.type === 'message');

describe('parseSequence', () => {
  describe('recognising the diagram', () => {
    it('reads an empty sequence diagram', () => {
      expect(parseSequence('sequenceDiagram\n')).toEqual({
        participants: [],
        statements: [],
      });
    });

    it('skips leading blank lines and comments, as the flowchart parser does', () => {
      expect(parseSequence('\n%% a note\nsequenceDiagram\n  A ->> B: hi')).not.toBeNull();
    });

    // The same contract as parseFlowchart: "this isn't mine" is a routine answer, and the caller's
    // response is to try the next parser or fall back to two panes.
    it('returns null for anything that is not a sequence diagram', () => {
      expect(parseSequence('flowchart TD\n  A --> B')).toBeNull();
      expect(parseSequence('classDiagram\n  Animal <|-- Duck')).toBeNull();
      expect(parseSequence('')).toBeNull();
      expect(parseSequence('sequenceDiagramish\n')).toBeNull();
    });
  });

  describe('participants', () => {
    it('records a participant and its display name', () => {
      const chart = parseSequence('sequenceDiagram\n  participant A as Alice\n');

      expect(chart?.participants).toEqual([{ id: 'A', label: 'Alice', keyword: 'participant' }]);
    });

    it('keeps actor as written, since it draws a different shape', () => {
      const chart = parseSequence('sequenceDiagram\n  actor A\n');

      expect(chart?.participants).toEqual([{ id: 'A', keyword: 'actor' }]);
    });

    // A diagram need not declare anyone: mermaid creates participants in order of first mention,
    // and that order is part of the layout, so it has to be recovered.
    it('infers undeclared participants from the messages, in order of first mention', () => {
      const chart = parseSequence('sequenceDiagram\n  B ->> A: hi\n  A ->> C: onward\n');

      expect(chart?.participants.map((p) => p.id)).toEqual(['B', 'A', 'C']);
    });

    it('does not re-infer someone already declared', () => {
      const chart = parseSequence('sequenceDiagram\n  participant A as Alice\n  A ->> B: hi\n');

      expect(chart?.participants.map((p) => p.id)).toEqual(['A', 'B']);
      expect(chart?.participants[0].label).toBe('Alice');
    });
  });

  describe('messages', () => {
    it('reads sender, receiver, arrow and text', () => {
      expect(messages('  A ->> B: Send request')).toEqual([
        { type: 'message', from: 'A', to: 'B', arrow: '->>', text: 'Send request' },
      ]);
    });

    // Stored verbatim for the same reason flowchart connectors are: the merged render writes them
    // back out, and an enum would need a lossy mapping back.
    it('keeps every arrow form exactly as written', () => {
      const forms = ['->', '-->', '->>', '-->>', '<<->>', '<<-->>', '-x', '--x', '-)', '--)'];

      for (const arrow of forms) {
        expect(messages(`  A ${arrow} B: text`)[0]?.arrow).toBe(arrow);
      }
    });

    it('reads a message with no text', () => {
      expect(messages('  A ->> B:')[0]).toEqual({
        type: 'message',
        from: 'A',
        to: 'B',
        arrow: '->>',
        text: '',
      });
    });

    // A colon inside the text is ordinary — "Retry: once more" — and only the first one separates.
    it('splits on the first colon only', () => {
      expect(messages('  A ->> B: Retry: once more')[0]?.text).toBe('Retry: once more');
    });

    it('records activation shorthand as a flag rather than part of the target', () => {
      expect(messages('  A ->>+ B: start')[0]).toMatchObject({ to: 'B', activate: true });
      expect(messages('  A -->>- B: done')[0]).toMatchObject({ to: 'B', deactivate: true });
    });

    it('reads participants whose names sit against the arrow', () => {
      expect(messages('  A->>B: tight')[0]).toMatchObject({ from: 'A', to: 'B' });
    });
  });

  describe('notes and standalone statements', () => {
    it('reads a note over two participants', () => {
      expect(body('  Note over A,B: They agree')).toEqual([
        { type: 'note', placement: 'over', of: 'A,B', text: 'They agree' },
      ]);
    });

    it('reads a note to one side', () => {
      expect(body('  Note right of A: thinking')).toEqual([
        { type: 'note', placement: 'right of', of: 'A', text: 'thinking' },
      ]);
    });

    it('keeps activate and deactivate as statements of their own', () => {
      expect(body('  activate B\n  deactivate B')).toEqual([
        { type: 'other', text: 'activate B' },
        { type: 'other', text: 'deactivate B' },
      ]);
    });
  });

  describe('blocks', () => {
    const blocks = (source: string) =>
      (body(source) ?? []).filter((s): s is Block => s.type === 'block');

    // The opening line's title belongs to the *first section*, not to the block: `alt ok / else
    // not` is one block whose two branches are each titled, and a separate block title would be a
    // second copy of the first of them, free to drift.
    it('reads a loop and what it contains', () => {
      const [block] = blocks('  loop Every minute\n    A ->> B: poll\n  end');

      expect(block).toMatchObject({ type: 'block', keyword: 'loop' });
      expect(block.sections[0].title).toBe('Every minute');
      expect(block.sections[0].statements).toEqual([
        { type: 'message', from: 'A', to: 'B', arrow: '->>', text: 'poll' },
      ]);
    });

    // alt/else is one block with two sections, not two blocks: the branches belong together, and
    // the merged render has to put them back inside one `alt … else … end`.
    it('reads alt and else as sections of one block', () => {
      const [block] = blocks('  alt is ok\n    A ->> B: yes\n  else is not\n    A ->> B: no\n  end');

      expect(block.sections.map((s) => s.title)).toEqual(['is ok', 'is not']);
      expect(block.sections[1].statements).toEqual([
        { type: 'message', from: 'A', to: 'B', arrow: '->>', text: 'no' },
      ]);
    });

    it('reads every block keyword that takes a section divider', () => {
      expect(blocks('  opt maybe\n    A ->> B: x\n  end')[0].keyword).toBe('opt');
      expect(blocks('  par one\n    A ->> B: x\n  and two\n    A ->> B: y\n  end')[0].sections)
        .toHaveLength(2);
      expect(
        blocks('  critical do\n    A ->> B: x\n  option fails\n    A ->> B: y\n  end')[0].sections,
      ).toHaveLength(2);
      expect(blocks('  break oops\n    A ->> B: x\n  end')[0].keyword).toBe('break');
    });

    it('nests blocks inside one another', () => {
      const [outer] = blocks('  loop retry\n    alt ok\n      A ->> B: x\n    end\n  end');
      const inner = outer.sections[0].statements[0] as Block;

      expect(inner.type).toBe('block');
      expect(inner.keyword).toBe('alt');
      expect(inner.sections[0].statements).toHaveLength(1);
    });

    it('infers participants mentioned only inside a block', () => {
      const chart = parseSequence('sequenceDiagram\n  loop x\n    A ->> B: hi\n  end\n');

      expect(chart?.participants.map((p) => p.id)).toEqual(['A', 'B']);
    });

    // An `end` with nothing open, or a block never closed, is broken source rather than a diagram
    // type we don't handle. Refusing it keeps the merged render from emitting something worse.
    it('refuses unbalanced blocks', () => {
      expect(parseSequence('sequenceDiagram\n  A ->> B: hi\n  end\n')).toBeNull();
      expect(parseSequence('sequenceDiagram\n  loop forever\n    A ->> B: hi\n')).toBeNull();
    });
  });

  describe('things it does not model', () => {
    // autonumber and links change nothing about who says what to whom, so they ride along as
    // unsupported rather than making the whole diagram undiffable — the same call the flowchart
    // parser makes for classDef and click.
    it('keeps unmodelled lines rather than refusing the diagram', () => {
      const chart = parseSequence('sequenceDiagram\n  autonumber\n  A ->> B: hi\n');

      expect(chart?.statements).toEqual([
        { type: 'other', text: 'autonumber' },
        { type: 'message', from: 'A', to: 'B', arrow: '->>', text: 'hi' },
      ]);
    });

    /**
     * `box` is refused outright, unlike `autonumber`. The difference is what a wrong guess costs:
     * a box *contains* its participants, so re-emitting the diagram without understanding it would
     * either drop the grouping or move people out of it. Falling back to two panes says "I can't
     * diff this"; emitting a diagram that quietly regroups the cast says something false.
     */
    it('refuses a diagram grouping participants into a box', () => {
      expect(
        parseSequence('sequenceDiagram\n  box Team\n    participant A\n  end\n  A ->> B: hi\n'),
      ).toBeNull();
    });
  });

  it('reads a whole diagram in one piece', () => {
    const chart = parseSequence(`sequenceDiagram
  participant U as User
  participant S as Service
  U ->>+ S: Place order
  alt in stock
    S -->> U: Confirmed
  else sold out
    S --x U: Rejected
  end
  Note over U,S: receipt follows
  S -->>- U: Receipt`);

    expect(chart?.participants.map((p) => p.label)).toEqual(['User', 'Service']);
    expect((chart?.statements ?? []).map((s: Statement) => s.type)).toEqual([
      'message',
      'block',
      'note',
      'message',
    ]);
  });
});
