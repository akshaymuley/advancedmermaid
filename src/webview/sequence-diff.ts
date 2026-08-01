import { byOrdinal, reconcile, type ChangeKind } from './reconcile';
import type { Block, Message, Participant, Section, Sequence, Statement } from './sequence-parse';

export interface ParticipantChange {
  kind: ChangeKind;
  /** The newer version, or the older one when it was removed. */
  participant: Participant;
  /** What it used to be. Only present for `changed`. */
  before?: Participant;
}

export interface StatementChange {
  kind: ChangeKind;
  /** The newer version, or the older one when it was removed. */
  statement: Statement;
  /** What it used to be. Only present for `changed`. */
  before?: Statement;
}

/** A block's own change, plus the diff of what it contains. */
export interface BlockChange extends StatementChange {
  statement: Block;
  sections: SectionChange[];
}

export interface SectionChange {
  title?: string;
  statements: StatementChange[];
}

export interface SequenceDiff {
  participants: ParticipantChange[];
  statements: StatementChange[];
  /** True when the two versions would render the same diagram. */
  identical: boolean;
}

export const isBlockChange = (change: StatementChange): change is BlockChange =>
  change.statement.type === 'block';

/**
 * What changed between two versions of the same sequence diagram.
 *
 * A participant's identity is its id and a message's is the pair it joins — the same calls
 * `flowchart-diff.ts` makes for nodes and edges, for the same reason: the display text is exactly
 * what an edit changes, so keying on it would report every rewording as a removal plus an addition.
 *
 * Blocks are diffed **recursively**, matched by keyword and position among their siblings, rather
 * than by flattening everything into one list. Flattening is where a diff of nested structure goes
 * wrong: it can pair the `alt` arm of one version against the `else` arm of the other, and it can
 * produce a result whose block openings and `end`s no longer balance — which the merged render
 * would then emit as source mermaid refuses.
 */
export function diffSequences(before: Sequence, after: Sequence): SequenceDiff {
  const participants = reconcile(
    before.participants,
    after.participants,
    () => (participant: Participant) => participant.id,
    (a, b) => a.label === b.label && a.keyword === b.keyword,
  ).map(({ kind, item, was }): ParticipantChange => ({
    kind,
    participant: item,
    ...(kind === 'changed' && was ? { before: was } : {}),
  }));

  const statements = diffStatements(before.statements, after.statements);

  return {
    participants,
    statements,
    identical:
      participants.every((change) => change.kind === 'unchanged') && settled(statements),
  };
}

/** True when nothing in this list, or anything nested inside it, differs. */
function settled(changes: StatementChange[]): boolean {
  return changes.every(
    (change) =>
      change.kind === 'unchanged' &&
      (!isBlockChange(change) || change.sections.every((s) => settled(s.statements))),
  );
}

/**
 * Identity for everything except messages: the type, what it is attached to, and its position
 * among others like it — the ordinal pairing already used for parallel flowchart edges.
 *
 * The type is part of the key, so a note and a message occupying the same position are never
 * matched against each other. Blocks key on their keyword alone: their contents are diffed on the
 * way in rather than deciding whether the block itself matched.
 */
const otherKey = byOrdinal((statement: Statement) => {
  switch (statement.type) {
    case 'note':
      return `n\0${statement.placement}\0${statement.of}`;
    case 'block':
      return `b\0${statement.keyword}`;
    default:
      return `o\0${statement.text}`;
  }
});

/**
 * Messages need more than an ordinal, and the reason is worth stating: position alone cannot tell
 * "the second message was deleted" from "the second was reworded and the third deleted". Both
 * leave one fewer message between the same pair, and a purely positional key always reads it the
 * second way — reporting a change to a message whose text never moved.
 *
 * So identical messages are anchored first, in order, and only what is left over is paired by
 * position. That leftover pairing is what still reports a rewording as `changed` rather than as a
 * removal plus an addition.
 */
function alignMessages(before: Statement[], after: Statement[]): Map<Statement, string> {
  const keys = new Map<Statement, string>();
  const messages = (list: Statement[]): Message[] =>
    list.filter((statement): statement is Message => statement.type === 'message');

  const pairOf = (message: Message): string => `${message.from}\0${message.to}`;
  const pairs = new Set([...messages(before), ...messages(after)].map(pairOf));

  for (const pair of pairs) {
    const older = messages(before).filter((m) => pairOf(m) === pair);
    const newer = messages(after).filter((m) => pairOf(m) === pair);
    const claimed = new Set<Message>();
    let anchor = 0;

    // Anchor pass: a message whose arrow and text both survived is the same message, wherever it
    // sits among its neighbours.
    for (const message of newer) {
      const match = older.find(
        (candidate) =>
          !claimed.has(candidate) &&
          candidate.arrow === message.arrow &&
          candidate.text === message.text,
      );
      if (match) {
        claimed.add(match);
        const key = `m\0${pair}\0=\0${anchor++}`;
        keys.set(match, key);
        keys.set(message, key);
      }
    }

    // Whatever neither version could anchor lines up by position: that is a rewording.
    const spareOlder = older.filter((message) => !claimed.has(message));
    const spareNewer = newer.filter((message) => !keys.has(message));
    spareOlder.forEach((message, index) => keys.set(message, `m\0${pair}\0~\0${index}`));
    spareNewer.forEach((message, index) => keys.set(message, `m\0${pair}\0~\0${index}`));
  }

  return keys;
}

function diffStatements(before: Statement[], after: Statement[]): StatementChange[] {
  const aligned = alignMessages(before, after);

  // One key space for the whole list: messages come from the alignment above, everything else from
  // its ordinal. Both are numbered per list, which is why `reconcile` takes a factory.
  const statementKey = () => {
    const ordinal = otherKey();
    return (statement: Statement) =>
      aligned.get(statement) ?? ordinal(statement);
  };

  return reconcile(before, after, statementKey, sameStatement).map(
    ({ kind, item, was }): StatementChange => {
      if (item.type !== 'block') {
        return { kind, statement: item, ...(kind === 'changed' && was ? { before: was } : {}) };
      }

      // A block matched in both versions: the block itself is unchanged unless a section title
      // moved, and everything interesting is inside it.
      if (was && was.type === 'block') {
        const matched: BlockChange = {
          kind,
          statement: item,
          ...(kind === 'changed' ? { before: was } : {}),
          sections: diffSections(was.sections, item.sections),
        };
        return matched;
      }

      // Added or removed wholesale — everything inside inherits that, so the merged render can
      // band the whole block rather than leaving its contents unmarked.
      const whole: BlockChange = {
        kind,
        statement: item,
        sections: item.sections.map((s) => inherit(s, kind)),
      };
      return whole;
    },
  );
}

/**
 * Sections are matched by position, not by title. A retitled `else` is still the same branch, and
 * pairing on the title would report both arms as replaced the moment one was reworded.
 */
function diffSections(before: Section[], after: Section[]): SectionChange[] {
  const sections: SectionChange[] = after.map((section, index) => ({
    ...(section.title === undefined ? {} : { title: section.title }),
    statements: diffStatements(before[index]?.statements ?? [], section.statements),
  }));

  // A branch the newer version dropped still has to be reported, or its messages would vanish from
  // the merged diagram rather than being shown as removed.
  for (const section of before.slice(after.length)) {
    sections.push(inherit(section, 'removed'));
  }

  return sections;
}

/** A whole section at one kind — for a block that only one version has. */
const inherit = (section: Section, kind: ChangeKind): SectionChange => ({
  ...(section.title === undefined ? {} : { title: section.title }),
  statements: section.statements.map((statement) =>
    statement.type === 'block'
      ? { kind, statement, sections: statement.sections.map((s) => inherit(s, kind)) }
      : { kind, statement },
  ),
});

function sameStatement(a: Statement, b: Statement): boolean {
  if (a.type !== b.type) {
    return false;
  }
  if (a.type === 'message' && b.type === 'message') {
    return a.arrow === b.arrow && a.text === b.text && a.activate === b.activate &&
      a.deactivate === b.deactivate;
  }
  if (a.type === 'note' && b.type === 'note') {
    return a.text === b.text;
  }
  if (a.type === 'block' && b.type === 'block') {
    // The contents are diffed separately; what makes the *block* itself changed is its own text —
    // a retitled loop, or an alt that gained a branch.
    return (
      a.sections.length === b.sections.length &&
      a.sections.every((section, index) => section.title === b.sections[index].title)
    );
  }
  return a.type === 'other' && b.type === 'other' && a.text === b.text;
}
