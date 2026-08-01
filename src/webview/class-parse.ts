/** One field or method inside a class box. */
export interface ClassMember {
  /** The line exactly as written — `+int age`, `+mate(Animal other) bool`. Re-emitted verbatim. */
  text: string;
  /**
   * The identifier alone, which is the diff's identity for a member. Keying on the whole text
   * would report every retyped field as a removal plus an addition — precisely the edit this
   * feature exists to show as a change.
   */
  name: string;
  kind: 'field' | 'method';
}

export interface ClassBox {
  /** The class name. This is the diff's identity for a class. */
  name: string;
  /** `~T~` as written, without the tildes. */
  generic?: string;
  /** `<<interface>>` without the guillemets, from either declaration form. */
  annotation?: string;
  members: ClassMember[];
}

export interface Relationship {
  from: string;
  to: string;
  /** The arrow exactly as written: `<|--`, `*--`, `..>`, `..|>`. */
  arrow: string;
  label?: string;
  /** The quoted multiplicity beside each end, without its quotes. */
  fromCardinality?: string;
  toCardinality?: string;
}

export interface ClassNote {
  /** The class it is attached to, when it names one. */
  of?: string;
  text: string;
}

export interface ClassDiagram {
  /** `TB`, `LR`, … as written; absent when the diagram declares none. */
  direction?: string;
  classes: ClassBox[];
  relationships: Relationship[];
  notes: ClassNote[];
  /**
   * Lines kept but not modelled — `style`, `cssClass`, `classDef`, `click`, `link`, `callback`.
   * Collected rather than rejected, the same call `flowchart-parse.ts` makes: a diagram with
   * styling in it is still perfectly diffable.
   */
  unsupported: string[];
}

const HEADER = /^classDiagram(?:-v2)?\s*$/;
const COMMENT = /^\s*%%/;
const DIRECTION = /^direction\s+(\S+)$/;

/**
 * `namespace` groups classes, so a merged diagram that didn't understand it would regroup the
 * cast — the same reason `box` is refused in a sequence diagram.
 */
const NAMESPACE = /^namespace\b/;

const CLASS = /^class\s+([A-Za-z_]\w*)(?:~([^~]+)~)?\s*(\{)?\s*$/;
const ANNOTATION_LINE = /^<<([^>]+)>>\s*(\w+)?$/;
const MEMBER_SHORTHAND = /^([A-Za-z_]\w*)\s*:\s*(.+)$/;
const NOTE_FOR = /^note\s+for\s+(\w+)\s+"([^"]*)"$/;
const NOTE = /^note\s+"([^"]*)"$/;
const UNMODELLED = /^(?:style|cssClass|classDef|click|link|callback|class\s+"\S+")\b/;

/**
 * Every relationship arrow, longest first so `<|--` is never read as `<|` with a stray `--`, and
 * `..|>` never as `..` with a stray `|>`.
 */
const ARROWS = [
  '<|--',
  '--|>',
  '<|..',
  '..|>',
  '*--',
  '--*',
  'o--',
  '--o',
  '-->',
  '<--',
  '..>',
  '<..',
  '--',
  '..',
];

/** `Customer "1" --> "0..*" Ticket : books` — the whole relationship line, ends optional. */
const RELATIONSHIP = new RegExp(
  `^([A-Za-z_]\\w*)\\s*(?:"([^"]*)"\\s*)?(${ARROWS.map(escape).join('|')})\\s*(?:"([^"]*)"\\s*)?([A-Za-z_]\\w*)\\s*(?::\\s*(.*))?$`,
);

function escape(arrow: string): string {
  return arrow.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A class diagram's classes, members and relationships, or `null` if the source isn't one.
 *
 * Hand-written for the same reasons the other two parsers are: mermaid 11 exposes no graph, and
 * keeping the parse here puts it in the best-tested tier — pure, no DOM, no mermaid.
 *
 * `null` means "show the two versions side by side instead", and covers three cases: not a class
 * diagram, one using `namespace`, and one whose class body never closes.
 */
export function parseClassDiagram(text: string): ClassDiagram | null {
  const lines = text.split(/\r?\n/);
  let start = 0;

  while (start < lines.length && (lines[start].trim() === '' || COMMENT.test(lines[start]))) {
    start++;
  }

  if (start >= lines.length || !HEADER.test(lines[start].trim())) {
    return null;
  }

  const classes = new Map<string, ClassBox>();
  const relationships: Relationship[] = [];
  const notes: ClassNote[] = [];
  const unsupported: string[] = [];
  let direction: string | undefined;

  /** The class whose `{ … }` body we are inside, if any. */
  let open: ClassBox | undefined;

  /** Mermaid draws a box for any class a relationship names, so a mention has to declare one. */
  const declare = (name: string): ClassBox => {
    const existing = classes.get(name);
    if (existing) {
      return existing;
    }
    const box: ClassBox = { name, members: [] };
    classes.set(name, box);
    return box;
  };

  for (const line of lines.slice(start + 1)) {
    const statement = line.trim();

    if (statement === '' || COMMENT.test(statement)) {
      continue;
    }

    if (open) {
      if (statement === '}') {
        open = undefined;
        continue;
      }

      const annotation = ANNOTATION_LINE.exec(statement);
      if (annotation) {
        open.annotation = annotation[1].trim();
        continue;
      }

      open.members.push(member(statement));
      continue;
    }

    if (NAMESPACE.test(statement)) {
      return null;
    }

    const heading = DIRECTION.exec(statement);
    if (heading) {
      direction = heading[1];
      continue;
    }

    if (UNMODELLED.test(statement)) {
      unsupported.push(statement);
      continue;
    }

    const noteFor = NOTE_FOR.exec(statement);
    if (noteFor) {
      notes.push({ of: noteFor[1], text: noteFor[2] });
      continue;
    }

    const standalone = NOTE.exec(statement);
    if (standalone) {
      notes.push({ text: standalone[1] });
      continue;
    }

    const declaration = CLASS.exec(statement);
    if (declaration) {
      const box = declare(declaration[1]);
      if (declaration[2] !== undefined) {
        box.generic = declaration[2];
      }
      if (declaration[3] === '{') {
        open = box;
      }
      continue;
    }

    const annotation = ANNOTATION_LINE.exec(statement);
    if (annotation && annotation[2]) {
      declare(annotation[2]).annotation = annotation[1].trim();
      continue;
    }

    const relationship = RELATIONSHIP.exec(statement);
    if (relationship) {
      const [, from, fromCardinality, arrow, toCardinality, to, label] = relationship;
      declare(from);
      declare(to);
      relationships.push({
        from,
        to,
        arrow,
        ...(fromCardinality === undefined ? {} : { fromCardinality }),
        ...(toCardinality === undefined ? {} : { toCardinality }),
        ...(label === undefined || label.trim() === '' ? {} : { label: label.trim() }),
      });
      continue;
    }

    // `Animal : +int age` — a member without a body block. Checked after relationships, since a
    // labelled relationship also holds a colon.
    const shorthand = MEMBER_SHORTHAND.exec(statement);
    if (shorthand) {
      declare(shorthand[1]).members.push(member(shorthand[2].trim()));
      continue;
    }

    unsupported.push(statement);
  }

  // A body that never closed means the source is broken, and emitting it would produce something
  // mermaid rejects.
  if (open) {
    return null;
  }

  return {
    ...(direction === undefined ? {} : { direction }),
    classes: [...classes.values()],
    relationships,
    notes,
    unsupported,
  };
}

/**
 * A member line, reduced to the identifier the diff keys on.
 *
 * Visibility (`+`, `-`, `#`, `~`) and type are stripped for the *name* only; `text` keeps the line
 * exactly as written, because the merged render writes it back out.
 */
function member(text: string): ClassMember {
  const paren = text.indexOf('(');
  const kind = paren === -1 ? 'field' : 'method';
  const head = paren === -1 ? text : text.slice(0, paren);

  // The identifier is the last word of the head: `+int age` → `age`, `+mate` → `mate`. A field
  // declares its type first, a method declares it after the argument list.
  const words = head.replace(/^[+\-#~]/, '').trim().split(/\s+/).filter(Boolean);
  const name = words[words.length - 1] ?? text;

  return { text, name, kind };
}
