/** Someone the diagram sends messages between. */
export interface Participant {
  /** The identifier as written. This is the diff's identity for a participant. */
  id: string;
  /** The display name from `as Alice`, when one was given. */
  label?: string;
  /** `participant` or `actor`, kept apart because they draw different shapes. */
  keyword: 'participant' | 'actor';
}

/** One arrow between two participants. */
export interface Message {
  type: 'message';
  from: string;
  to: string;
  /** The arrow exactly as written: `->>`, `-->>`, `--x`, `-)`, `<<->>`. */
  arrow: string;
  text: string;
  /** `A ->>+ B` — the shorthand that starts an activation on the receiver. */
  activate?: true;
  /** `A -->>- B` — the shorthand that ends one. */
  deactivate?: true;
}

export interface Note {
  type: 'note';
  placement: 'over' | 'left of' | 'right of';
  /** Whom the note is placed against, as written — `A` or `A,B`. */
  of: string;
  text: string;
}

/** A line kept verbatim: `autonumber`, `activate B`, anything that isn't a message or a note. */
export interface Other {
  type: 'other';
  text: string;
}

/** One branch of a block — the whole of a `loop`, or one arm of an `alt`. */
export interface Section {
  /** The text after the keyword that opened this section. */
  title?: string;
  statements: Statement[];
}

/**
 * A `loop … end`, an `alt … else … end`, and the rest.
 *
 * Sections rather than a flat list because the branches belong together: the merged render has to
 * put them back inside one block, and a diff that matched them separately could pair the `alt` arm
 * of one version against the `else` arm of the other.
 */
export interface Block {
  type: 'block';
  /** `loop`, `alt`, `opt`, `par`, `critical`, `break`, `rect`, as written. */
  keyword: string;
  sections: Section[];
}

export type Statement = Message | Note | Other | Block;

export interface Sequence {
  participants: Participant[];
  statements: Statement[];
}

const HEADER = /^sequenceDiagram\s*$/;
const COMMENT = /^\s*%%/;

const DECLARATION = /^(participant|actor)\s+(.+)$/;
const NOTE = /^Note\s+(over|left of|right of)\s+([^:]+):?\s*(.*)$/i;

/**
 * Every arrow form, longest first so `<<-->>` is never read as `<<--` with a stray `>>`.
 * Stored verbatim by the caller: the merged render writes these back out, and an enum would need a
 * lossy mapping back — the same call `flowchart-parse.ts` makes for connectors.
 */
const ARROWS = [
  '<<-->>',
  '<<->>',
  '-->>',
  '--)',
  '-->',
  '--x',
  '->>',
  '-)',
  '->',
  '-x',
];

/** Keywords that open a block, and the keyword that divides one of that kind into sections. */
const BLOCKS: Record<string, string | undefined> = {
  loop: undefined,
  alt: 'else',
  opt: undefined,
  par: 'and',
  critical: 'option',
  break: undefined,
  rect: undefined,
};

/**
 * `box` groups participants rather than statements. Modelling it means understanding which
 * participants belong to it; re-emitting it without that would silently regroup the cast, which is
 * worse than saying "I can't diff this" — so a diagram using it falls back to two panes.
 */
const BOX = /^box\b/;

const DIVIDERS = new Set(Object.values(BLOCKS).filter((word): word is string => word !== undefined));

/**
 * A sequence diagram's participants and statements, or `null` if the source isn't one.
 *
 * Hand-written for the same reasons `parseFlowchart` is: mermaid 11 exposes no graph, and keeping
 * the parse here puts the extension's diagram understanding in its best-tested tier — pure, no
 * DOM, no mermaid.
 *
 * `null` covers three cases that are all the same to the caller: not a sequence diagram, one using
 * syntax this doesn't model, and one whose blocks don't balance. Each means "show the two versions
 * side by side instead".
 */
export function parseSequence(text: string): Sequence | null {
  const lines = text.split(/\r?\n/);
  let start = 0;

  while (start < lines.length && (lines[start].trim() === '' || COMMENT.test(lines[start]))) {
    start++;
  }

  if (start >= lines.length || !HEADER.test(lines[start].trim())) {
    return null;
  }

  const participants: Participant[] = [];
  const declared = new Set<string>();
  const root: Statement[] = [];

  /** The blocks currently open, innermost last. Statements land in the innermost open section. */
  const open: Block[] = [];
  const current = (): Statement[] => {
    const block = open[open.length - 1];
    return block ? block.sections[block.sections.length - 1].statements : root;
  };

  /**
   * Mermaid creates a participant at first mention, and that order decides the column order — so
   * an undeclared one still has to be recorded, in exactly the order it was first spoken to.
   */
  const mention = (id: string): void => {
    if (id !== '' && !declared.has(id)) {
      declared.add(id);
      participants.push({ id, keyword: 'participant' });
    }
  };

  for (const line of lines.slice(start + 1)) {
    const statement = line.trim();

    if (statement === '' || COMMENT.test(statement)) {
      continue;
    }

    if (BOX.test(statement)) {
      return null;
    }

    if (statement === 'end') {
      if (open.length === 0) {
        return null;
      }
      open.pop();
      continue;
    }

    const declaration = DECLARATION.exec(statement);
    if (declaration) {
      const [, keyword, rest] = declaration;
      const named = /^(\S+)\s+as\s+(.+)$/.exec(rest.trim());
      const [id, label] = named ? [named[1], named[2].trim()] : [rest.trim(), undefined];

      // A second declaration of someone already mentioned fills in what the mention couldn't know,
      // rather than adding them twice — the same rule `flowchart-parse.ts` applies to node labels.
      const existing = participants.find((p) => p.id === id);
      if (existing) {
        existing.keyword = keyword as Participant['keyword'];
        if (label !== undefined) {
          existing.label = label;
        }
      } else {
        declared.add(id);
        participants.push({
          id,
          ...(label === undefined ? {} : { label }),
          keyword: keyword as Participant['keyword'],
        });
      }
      continue;
    }

    const divider = DIVIDERS.has(statement.split(/\s+/)[0]) ? statement.split(/\s+/)[0] : undefined;
    if (divider) {
      const block = open[open.length - 1];
      if (!block || BLOCKS[block.keyword] !== divider) {
        return null;
      }
      const title = statement.slice(divider.length).trim();
      block.sections.push({ ...(title === '' ? {} : { title }), statements: [] });
      continue;
    }

    const keyword = statement.split(/\s+/)[0];
    if (keyword in BLOCKS) {
      const title = statement.slice(keyword.length).trim();
      const block: Block = {
        type: 'block',
        keyword,
        sections: [{ ...(title === '' ? {} : { title }), statements: [] }],
      };
      current().push(block);
      open.push(block);
      continue;
    }

    const note = NOTE.exec(statement);
    if (note) {
      const [, placement, of, noteText] = note;
      for (const id of of.split(',')) {
        mention(id.trim());
      }
      current().push({
        type: 'note',
        placement: placement.toLowerCase() as Note['placement'],
        of: of.trim(),
        text: noteText.trim(),
      });
      continue;
    }

    const message = readMessage(statement);
    if (message) {
      mention(message.from);
      mention(message.to);
      current().push(message);
      continue;
    }

    current().push({ type: 'other', text: statement });
  }

  // A block left open is broken source, and emitting it would produce a diagram mermaid rejects.
  if (open.length > 0) {
    return null;
  }

  return { participants, statements: root };
}

/** `A ->>+ B: text`, split on the first arrow that isn't inside a name and the first colon after. */
function readMessage(statement: string): Message | null {
  const colon = statement.indexOf(':');
  const head = colon === -1 ? statement : statement.slice(0, colon);
  const text = colon === -1 ? '' : statement.slice(colon + 1).trim();

  for (const arrow of ARROWS) {
    const at = head.indexOf(arrow);
    if (at === -1) {
      continue;
    }

    const from = head.slice(0, at).trim();
    let to = head.slice(at + arrow.length).trim();
    if (from === '') {
      continue;
    }

    // `+`/`-` bind to the arrow, not to the name: `A ->>+ B` activates B, it doesn't talk to `+B`.
    const activation = to.startsWith('+') ? 'activate' : to.startsWith('-') ? 'deactivate' : undefined;
    if (activation) {
      to = to.slice(1).trim();
    }
    if (to === '') {
      continue;
    }

    return {
      type: 'message',
      from,
      to,
      arrow,
      text,
      ...(activation === 'activate' ? { activate: true as const } : {}),
      ...(activation === 'deactivate' ? { deactivate: true as const } : {}),
    };
  }

  return null;
}
