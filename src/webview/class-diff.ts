import { byOrdinal, reconcile, type ChangeKind } from './reconcile';
import type {
  ClassBox,
  ClassDiagram,
  ClassMember,
  ClassNote,
  Relationship,
} from './class-parse';

export interface MemberChange {
  kind: ChangeKind;
  /** The newer version, or the older one when it was removed. */
  member: ClassMember;
  /** What it used to be. Only present for `changed`. */
  before?: ClassMember;
}

export interface ClassChange {
  kind: ChangeKind;
  box: ClassBox;
  before?: ClassBox;
  /** The diff of what the box holds. */
  members: MemberChange[];
}

export interface RelationshipChange {
  kind: ChangeKind;
  relationship: Relationship;
  before?: Relationship;
}

export interface NoteChange {
  kind: ChangeKind;
  note: ClassNote;
  before?: ClassNote;
}

export interface ClassDiff {
  classes: ClassChange[];
  relationships: RelationshipChange[];
  notes: NoteChange[];
  /** True when the two versions would render the same diagram. */
  identical: boolean;
}

/**
 * What changed between two versions of the same class diagram.
 *
 * Identity follows the rule the other two diffs already set: a class is its name, a member is its
 * identifier, a relationship is the pair it joins. What is *displayed* — a member's type, a
 * relationship's arrow and label — is what changed, never what identifies. Keying on any of it
 * would report an ordinary edit as a removal plus an addition and draw the thing twice.
 *
 * A class whose members changed is itself `changed`, even when its own declaration is untouched.
 * That is not bookkeeping: a probe against real mermaid showed the class box is the finest thing
 * that can be coloured, so a member change that didn't raise its class would go unmarked on screen.
 */
export function diffClassDiagrams(before: ClassDiagram, after: ClassDiagram): ClassDiff {
  const classes = reconcile(
    before.classes,
    after.classes,
    () => (box: ClassBox) => box.name,
    sameDeclaration,
  ).map(({ kind, item, was }): ClassChange => {
    const members = diffMembers(was?.members ?? [], item.members, kind);
    const settled = kind === 'unchanged' && members.every((m) => m.kind === 'unchanged');

    return {
      kind: settled ? 'unchanged' : kind === 'unchanged' ? 'changed' : kind,
      box: item,
      ...(kind === 'changed' && was ? { before: was } : {}),
      members,
    };
  });

  const relationships = reconcile(
    before.relationships,
    after.relationships,
    byOrdinal((relationship: Relationship) => `${relationship.from}\0${relationship.to}`),
    (a, b) =>
      a.arrow === b.arrow &&
      a.label === b.label &&
      a.fromCardinality === b.fromCardinality &&
      a.toCardinality === b.toCardinality,
  ).map(({ kind, item, was }): RelationshipChange => ({
    kind,
    relationship: item,
    ...(kind === 'changed' && was ? { before: was } : {}),
  }));

  const notes = reconcile(
    before.notes,
    after.notes,
    byOrdinal((note: ClassNote) => `n\0${note.of ?? ''}`),
    (a, b) => a.text === b.text,
  ).map(({ kind, item, was }): NoteChange => ({
    kind,
    note: item,
    ...(kind === 'changed' && was ? { before: was } : {}),
  }));

  const still = (change: { kind: ChangeKind }) => change.kind === 'unchanged';

  return {
    classes,
    relationships,
    notes,
    identical: classes.every(still) && relationships.every(still) && notes.every(still),
  };
}

/** A class's own declaration, leaving its contents to `diffMembers`. */
const sameDeclaration = (a: ClassBox, b: ClassBox): boolean =>
  a.annotation === b.annotation && a.generic === b.generic;

/**
 * Members of one class.
 *
 * A class that is wholly added or removed passes that kind down, so the merged render can mark the
 * box and leave its contents unmarked rather than labelling every line of a new class as new.
 */
function diffMembers(
  before: ClassMember[],
  after: ClassMember[],
  enclosing: ChangeKind,
): MemberChange[] {
  if (enclosing === 'added' || enclosing === 'removed') {
    return after.map((member) => ({ kind: 'unchanged', member }));
  }

  return reconcile(
    before,
    after,
    byOrdinal((member: ClassMember) => `${member.kind}\0${member.name}`),
    (a, b) => a.text === b.text,
  ).map(({ kind, item, was }): MemberChange => ({
    kind,
    member: item,
    ...(kind === 'changed' && was ? { before: was } : {}),
  }));
}
