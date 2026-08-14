/** How one item fared between two versions of a diagram. */
export type ChangeKind = 'added' | 'removed' | 'changed' | 'unchanged';

/**
 * Which version is being written on its own, when one is.
 *
 * Side by side already shows both versions, so each pane holds only what that version had: the
 * older one cannot show an addition and the newer cannot show a removal. Absent means the merged
 * diagram, which shows everything.
 *
 * Here beside `ChangeKind` rather than in any one emitter, because all three speak it and none of
 * them owns it.
 */
export type Side = 'before' | 'after';

/** Whether a change is part of `side`'s version at all. Everything, for the merged diagram. */
export const visible = (kind: ChangeKind, side?: Side): boolean =>
  side === 'before' ? kind !== 'added' : side === 'after' ? kind !== 'removed' : true;

export interface Reconciled<T> {
  kind: ChangeKind;
  item: T;
  /**
   * The item this one matched in the older version, when it matched anything — present for
   * `unchanged` as well as `changed`. A caller reporting "what it used to be" wants only the
   * changed ones; a caller that has to recurse into the pair (a block against the block it
   * matched) needs the unchanged ones too.
   */
  was?: T;
}

/**
 * Match two lists by identity, then place the unmatched leftovers from `before` back among them.
 *
 * `identity` is a *factory* because a key can depend on how many like it have already been seen —
 * parallel edges between one pair of nodes, or repeated messages between one pair of participants,
 * are told apart by their order among that pair. Each list has to be numbered on its own; sharing
 * one counter would give the two versions of the same first item different keys and match nothing.
 *
 * Shared by the flowchart and sequence diffs. The ordering rule below is why: the result becomes
 * the order of a regenerated mermaid source, so an unstable one would relayout the diagram on
 * every refresh. In a sequence diagram it matters twice over — there, order *is* the diagram.
 */
export function reconcile<T>(
  before: T[],
  after: T[],
  identity: () => (item: T) => string,
  same: (a: T, b: T) => boolean,
): Reconciled<T>[] {
  const keyBefore = identity();
  const previous = new Map<string, T>();
  for (const item of before) {
    previous.set(keyBefore(item), item);
  }

  const keyAfter = identity();
  const keys = new Map<T, string>();
  const result: Reconciled<T>[] = after.map((item) => {
    const key = keyAfter(item);
    keys.set(item, key);
    const was = previous.get(key);

    if (!was) {
      return { kind: 'added', item };
    }
    return same(was, item)
      ? { kind: 'unchanged', item, was }
      : { kind: 'changed', item, was };
  });

  // Walk the older version in order, keeping a cursor just past the last entry that survived, and
  // drop each removal there. That puts a removed item back where it used to be rather than in a
  // heap at the end, which is what makes the merged diagram readable.
  const surviving = new Set(result.map((entry) => keys.get(entry.item)));
  let cursor = 0;
  const keyAgain = identity();

  for (const item of before) {
    const key = keyAgain(item);
    if (surviving.has(key)) {
      cursor = result.findIndex((entry) => keys.get(entry.item) === key) + 1;
      continue;
    }
    result.splice(cursor, 0, { kind: 'removed', item });
    cursor++;
  }

  return result;
}

/**
 * Identity by position among items sharing a name — the positional pairing rule the extension
 * already uses for Markdown fences and parallel flowchart edges.
 *
 * Joined with NUL rather than a space, because the name is built from things the diagram's author
 * wrote: a participant called `A B` and one called `A` followed by one called `B` must not collide.
 * The same reasoning as `panel-key.ts` length-prefixing its parts.
 */
export function byOrdinal<T>(name: (item: T) => string): () => (item: T) => string {
  return () => {
    const seen = new Map<string, number>();
    return (item) => {
      const key = name(item);
      const ordinal = seen.get(key) ?? 0;
      seen.set(key, ordinal + 1);
      return `${key}\0${ordinal}`;
    };
  };
}
