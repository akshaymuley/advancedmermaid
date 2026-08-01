import type {
  ClassChange,
  ClassDiff,
  MemberChange,
  NoteChange,
  RelationshipChange,
} from './class-diff';
import type { ClassDiagram } from './class-parse';
import type { MergeColours } from './flowchart-merge';
import type { ChangeKind } from './reconcile';

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
 */
export function mergeClassSource(
  diff: ClassDiff,
  after: ClassDiagram,
  colours: MergeColours,
): string {
  const lines: string[] = ['classDiagram'];

  if (after.direction) {
    lines.push(`  direction ${after.direction}`);
  }

  for (const change of diff.classes) {
    lines.push(...classLines(change));
  }

  for (const change of diff.relationships) {
    lines.push(`  ${relationship(change)}`);
  }

  for (const change of diff.notes) {
    lines.push(`  ${note(change)}`);
  }

  // Written last, and this is the only styling in the output: whatever the source carried has been
  // dropped, because a `style` line from the newer version would fight the one written here for the
  // same class and the diff has to win.
  for (const change of diff.classes) {
    if (change.kind !== 'unchanged') {
      lines.push(`  style ${change.box.name} ${style(change.kind, colours)}`);
    }
  }

  return lines.join('\n');
}

/**
 * A tinted fill under a solid stroke. The fill is the stroke colour at low alpha via an 8-digit
 * hex — mermaid passes it through to CSS, so the box reads as green or red at a glance without the
 * member text inside it being swallowed.
 */
function style(kind: ChangeKind, colours: MergeColours): string {
  const colour = colours[kind as keyof MergeColours];
  return `fill:${colour}33,stroke:${colour},stroke-width:3px`;
}

function classLines(change: ClassChange): string[] {
  const { box } = change;
  const name = `${box.name}${box.generic ? `~${box.generic}~` : ''}`;
  const body: string[] = [];

  if (box.annotation) {
    body.push(`    <<${box.annotation}>>`);
  }
  for (const member of change.members) {
    body.push(`    ${memberText(member)}`);
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
function memberText({ kind, member, before }: MemberChange): string {
  if (kind === 'unchanged') {
    return member.text;
  }
  if (kind === 'changed' && before) {
    return `${member.text} [was ${withoutParens(before.text)}]`;
  }
  return `${member.text} [${kind}]`;
}

const withoutParens = (text: string): string => text.replace(/\([^)]*\)/g, '').trim();

/**
 * A relationship, with its change said in its label — the only place available, since a class
 * diagram cannot style a relationship at all.
 */
function relationship({ kind, relationship: link, before }: RelationshipChange): string {
  const from = link.fromCardinality === undefined ? '' : `"${link.fromCardinality}" `;
  const to = link.toCardinality === undefined ? '' : `"${link.toCardinality}" `;
  const head = `${link.from} ${from}${link.arrow} ${to}${link.to}`;

  const marker =
    kind === 'unchanged'
      ? undefined
      : kind === 'changed' && before?.label !== undefined && before.label !== link.label
        ? `(was ${before.label})`
        : `(${kind})`;

  const label = [link.label, marker].filter(Boolean).join(' ');

  return label === '' ? head : `${head} : ${label}`;
}

/** A note's text is a quoted string, so its marker can sit inside the quotes safely. */
function note({ kind, note: item, before }: NoteChange): string {
  const text =
    kind === 'changed' && before && before.text !== item.text
      ? `${item.text} (was ${before.text})`
      : item.text;
  const marked = kind === 'added' || kind === 'removed' ? `${text} (${kind})` : text;

  return item.of === undefined ? `note "${marked}"` : `note for ${item.of} "${marked}"`;
}
