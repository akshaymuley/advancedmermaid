import type {
  ClassChange,
  ClassDiff,
  MemberChange,
  NoteChange,
  RelationshipChange,
} from './class-diff';
import type { ClassDiagram } from './class-parse';
import type { MergeColours } from './flowchart-merge';
import { visible, type ChangeKind, type Side } from './reconcile';

/**
 * One mermaid source showing both versions of a class diagram at once, changes marked.
 *
 * Four things a probe against real mermaid 11.16 settled, each of which would otherwise have been
 * a plausible guess that shipped broken:
 *
 * 1. **`classDef` + `cssClass` marks nothing.** It is the flowchart-shaped route, it parses, it
 *    renders — and no style reaches the box. `style X …` is the one thing that works, so that is
 *    what this emits.
 * 2. **Relationships cannot be styled at all** — `linkStyle` is a parse error here. The only place
 *    left to say a relationship changed is its label.
 * 3. **A colon inside a relationship label is a parse error**, so no marker may contain one.
 * 4. **The class box is the finest unit that can be coloured.** Member changes are therefore said
 *    in the member's own text, in square brackets — and a marker on a *method* lands in what
 *    mermaid reads as the return-type slot, so the old text must not carry its own parentheses.
 *
 * With `side` given, this writes that version by itself for one Side by side pane: what it could
 * not show is dropped, and what survives is written as that version had it. Nothing then reports
 * what a member used to be, since the pane beside it is showing exactly that.
 */
export function mergeClassSource(
  diff: ClassDiff,
  diagram: ClassDiagram,
  colours: MergeColours,
  side?: Side,
): string {
  const lines: string[] = ['classDiagram'];

  if (diagram.direction) {
    lines.push(`  direction ${diagram.direction}`);
  }

  const classes = diff.classes.filter((change) => visible(change.kind, side));

  for (const change of classes) {
    lines.push(...classLines(change, side));
  }

  for (const change of diff.relationships) {
    if (visible(change.kind, side)) {
      lines.push(`  ${relationship(change, side)}`);
    }
  }

  for (const change of diff.notes) {
    if (visible(change.kind, side)) {
      lines.push(`  ${note(change, side)}`);
    }
  }

  // Written last, and this is the only styling in the output: whatever the source carried has been
  // dropped, because a `style` line from the newer version would fight the one written here for the
  // same class and the diff has to win.
  for (const change of classes) {
    if (change.kind !== 'unchanged') {
      lines.push(`  style ${boxFor(change, side).name} ${style(change.kind, colours)}`);
    }
  }

  return lines.join('\n');
}

/** The box as `side` had it — the older declaration when one side is being written alone. */
const boxFor = (change: ClassChange, side?: Side) =>
  (side === 'before' && change.before) || change.box;

/**
 * A tinted fill under a solid stroke. The fill is the stroke colour at low alpha via an 8-digit
 * hex — mermaid passes it through to CSS, so the box reads as green or red at a glance without the
 * member text inside it being swallowed.
 */
function style(kind: ChangeKind, colours: MergeColours): string {
  const colour = colours[kind as keyof MergeColours];
  return `fill:${colour}33,stroke:${colour},stroke-width:3px`;
}

function classLines(change: ClassChange, side?: Side): string[] {
  const box = boxFor(change, side);
  const name = `${box.name}${box.generic ? `~${box.generic}~` : ''}`;
  const body: string[] = [];

  if (box.annotation) {
    body.push(`    <<${box.annotation}>>`);
  }
  for (const member of change.members) {
    if (visible(member.kind, side)) {
      body.push(`    ${memberText(member, side)}`);
    }
  }

  return body.length === 0
    ? [`  class ${name}`]
    : [`  class ${name} {`, ...body, '  }'];
}

/**
 * A member, with its change said in square brackets.
 *
 * Never a colon inside the brackets, and never parentheses in the "was" text: mermaid reads
 * anything after a method's argument list as its return type, and a second pair of parentheses in
 * there comes out as a stray `: `.
 */
function memberText({ kind, member, before }: MemberChange, side?: Side): string {
  const item = (side === 'before' && before) || member;

  if (kind === 'unchanged') {
    return item.text;
  }
  // On one side there is nothing to say it was: the pane beside it holds the other version.
  if (kind === 'changed') {
    return side === undefined && before
      ? `${member.text} [was ${withoutParens(before.text)}]`
      : item.text;
  }
  return `${item.text} [${kind}]`;
}

const withoutParens = (text: string): string => text.replace(/\([^)]*\)/g, '').trim();

/**
 * A relationship, with its change said in its label — the only place available, since a class
 * diagram cannot style a relationship at all.
 */
function relationship({ kind, relationship: link, before }: RelationshipChange, side?: Side): string {
  const item = (side === 'before' && before) || link;
  const from = item.fromCardinality === undefined ? '' : `"${item.fromCardinality}" `;
  const to = item.toCardinality === undefined ? '' : `"${item.toCardinality}" `;
  const head = `${item.from} ${from}${item.arrow} ${to}${item.to}`;

  const marker =
    kind === 'unchanged'
      ? undefined
      : side === undefined &&
          kind === 'changed' &&
          before?.label !== undefined &&
          before.label !== link.label
        ? `(was ${before.label})`
        : `(${kind})`;

  const label = [item.label, marker].filter(Boolean).join(' ');

  return label === '' ? head : `${head} : ${label}`;
}

/** A note's text is a quoted string, so its marker can sit inside the quotes safely. */
function note({ kind, note: item, before }: NoteChange, side?: Side): string {
  const shown = (side === 'before' && before) || item;
  const text =
    side === undefined && kind === 'changed' && before && before.text !== item.text
      ? `${item.text} (was ${before.text})`
      : shown.text;
  const marked = kind === 'added' || kind === 'removed' ? `${text} (${kind})` : text;

  return shown.of === undefined ? `note "${marked}"` : `note for ${shown.of} "${marked}"`;
}
