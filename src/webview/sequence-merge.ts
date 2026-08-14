import type { MergeColours } from './flowchart-merge';
import { visible, type ChangeKind, type Side } from './reconcile';
import {
  isBlockChange,
  type ParticipantChange,
  type SectionChange,
  type SequenceDiff,
  type StatementChange,
} from './sequence-diff';
import type { Block, Message, Note, Sequence, Statement } from './sequence-parse';

/**
 * How much of the band colour to lay down. Enough to read as green or red at a glance, little
 * enough to leave the message text on top of it legible — a solid band swallows it on a dark
 * canvas, which is the same trap the exported image's painted background exists to avoid.
 */
const TINT = 0.25;

/**
 * One mermaid source showing both versions of a sequence diagram at once, changes banded.
 *
 * The mechanism differs from the flowchart merge for a reason worth recording: `classDef` is
 * flowchart-only, so there is no way to give a message a class. Mermaid's sequence grammar offers
 * exactly one per-statement visual hook, `rect`, and a probe against a real render settled how far
 * it goes — it bands a single message precisely, it nests correctly inside `alt` and `loop`, and it
 * accepts `rgba`.
 *
 * The same probe found the rule this file is built around: **a `rect` around a participant
 * declaration produces NaN geometry and garbles the whole diagram**. Participant changes are
 * therefore marked in the display label instead, never banded.
 *
 * With `side` given, this writes that version by itself for one Side by side pane — the statements
 * it could not show are dropped, and each survivor is written as that version had it. Nothing then
 * reports what a message used to say: the pane beside it is already showing exactly that.
 */
export function mergeSequenceSource(
  diff: SequenceDiff,
  sequence: Sequence,
  colours: MergeColours,
  side?: Side,
): string {
  const band = (kind: ChangeKind): string | undefined =>
    kind === 'unchanged' ? undefined : `rect ${tint(colours[kind])}`;

  const lines: string[] = ['sequenceDiagram'];

  for (const change of diff.participants) {
    if (visible(change.kind, side)) {
      lines.push(`  ${declaration(change, side)}`);
    }
  }

  const emit = (changes: StatementChange[], indent: string): void => {
    for (const change of changes) {
      if (!visible(change.kind, side)) {
        continue;
      }

      const opener = band(change.kind);
      const inner = opener ? `${indent}  ` : indent;

      if (opener) {
        lines.push(`${indent}${opener}`);
      }

      if (isBlockChange(change)) {
        // A retitled block is `changed`, so the older side has to take its keyword and its section
        // titles from what it used to be — the diff's sections carry the newer titles.
        const older = side === 'before' && change.before?.type === 'block' ? change.before : undefined;
        emitBlock(older?.keyword ?? change.statement.keyword, change.sections, inner, older);
      } else {
        lines.push(`${inner}${statement(change, side)}`);
      }

      if (opener) {
        lines.push(`${indent}end`);
      }
    }
  };

  /** A block and its sections, divided by whichever keyword divides blocks of its kind. */
  const emitBlock = (
    keyword: string,
    sections: SectionChange[],
    indent: string,
    older?: Block,
  ): void => {
    sections.forEach((section, index) => {
      const opener = index === 0 ? keyword : DIVIDERS[keyword] ?? keyword;
      const title = older?.sections[index]?.title ?? section.title;
      lines.push(`${indent}${opener}${title ? ` ${title}` : ''}`);
      emit(section.statements, `${indent}  `);
    });
    lines.push(`${indent}end`);
  };

  emit(diff.statements, '  ');

  return lines.join('\n');
}

/** Which keyword opens the second and later sections of each kind of block. */
const DIVIDERS: Record<string, string | undefined> = {
  alt: 'else',
  par: 'and',
  critical: 'option',
};

/**
 * `#1a7f37` as `rgba(26, 127, 55, 0.25)`.
 *
 * Mermaid's `rect` takes a literal colour — it cannot resolve a CSS variable, which is the same
 * reason `flowchart-merge.ts` is handed literal colours rather than reading the theme itself.
 */
function tint(hex: string): string {
  const value = hex.replace('#', '');
  const channel = (at: number): number => parseInt(value.slice(at, at + 2), 16);

  return `rgba(${channel(0)}, ${channel(2)}, ${channel(4)}, ${TINT})`;
}

/**
 * A participant, with its change said in words.
 *
 * This is the one place the merged diagram reports a change as text rather than as colour, and it
 * is not a stylistic choice: banding a declaration breaks mermaid's layout outright. A participant
 * nobody messages would otherwise appear in the merged diagram with nothing to say it was added.
 */
function declaration({ kind, participant, before }: ParticipantChange, side?: Side): string {
  const item = (side === 'before' && before) || participant;
  const label = item.label ?? item.id;

  // Added and removed still read as words on a single side: it is the only mark a participant can
  // carry, and "this one goes away" is worth saying even when the pane beside it shows the absence.
  const marked =
    kind === 'added' || kind === 'removed'
      ? `${label} (${kind})`
      : side === undefined &&
          kind === 'changed' &&
          before?.label !== undefined &&
          before.label !== participant.label
        ? `${label} (was: ${before.label})`
        : label;

  // `as` is only needed when the display text differs from the id — but once a marker is on it, it
  // always does.
  return marked === item.id
    ? `${item.keyword} ${item.id}`
    : `${item.keyword} ${item.id} as ${marked}`;
}

function statement(change: StatementChange, side?: Side): string {
  const item = (side === 'before' && change.before) || change.statement;

  // On one side there is no "before" to report — the other pane is holding it.
  const was = side === undefined ? change.before : undefined;

  switch (item.type) {
    case 'message':
      return message(item, was);
    case 'note':
      return note(item, was);
    case 'other':
      return item.text;
    default:
      // Unreachable: `emit` sends blocks to `emitBlock` rather than here. Typed out rather than
      // cast away, so a new statement kind fails the build instead of emitting a blank line.
      throw new Error(`no way to write back a ${item.type}`);
  }
}

/**
 * A reworded message says what it used to say, for the same reason a reworded flowchart node does:
 * the band reports *that* something changed, and only the text reports *what*.
 */
function message(item: Message, before?: Statement): string {
  const activation = item.activate ? '+' : item.deactivate ? '-' : '';
  const previous = before?.type === 'message' && before.text !== item.text ? before.text : undefined;
  const text = previous === undefined ? item.text : `${item.text} (was: ${previous})`;

  return `${item.from} ${item.arrow}${activation} ${item.to}: ${text}`;
}

function note(item: Note, before?: Statement): string {
  const previous = before?.type === 'note' && before.text !== item.text ? before.text : undefined;
  const text = previous === undefined ? item.text : `${item.text} (was: ${previous})`;

  return `Note ${item.placement} ${item.of}: ${text}`;
}
