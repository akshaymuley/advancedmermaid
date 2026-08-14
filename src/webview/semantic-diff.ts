import { diffClassDiagrams } from './class-diff';
import { mergeClassSource } from './class-merge';
import { parseClassDiagram } from './class-parse';
import { diffFlowcharts } from './flowchart-diff';
import { mergeSource, type MergeColours } from './flowchart-merge';
import { parseFlowchart } from './flowchart-parse';
import type { ChangeKind, Side } from './reconcile';
import { diffSequences, isBlockChange, type StatementChange } from './sequence-diff';
import { mergeSequenceSource } from './sequence-merge';
import { parseSequence } from './sequence-parse';

/** The kinds worth a legend entry, in the order the legend lists them. */
const HIGHLIGHTED: Exclude<ChangeKind, 'unchanged'>[] = ['added', 'removed', 'changed'];

export interface MergedDiagram {
  /** Mermaid source for one diagram showing both versions, changes marked. */
  source: string;
  /**
   * Which kinds this diff actually holds, in a fixed order. Only the kinds present: listing one
   * nothing uses would report a change that didn't happen, on screen and in the exported key.
   */
  kinds: Exclude<ChangeKind, 'unchanged'>[];
}

export interface AnnotatedPair {
  /** Mermaid source for the older version alone, its removals and rewordings marked. */
  left: string;
  /** The same for the newer version, its additions and rewordings marked. */
  right: string;
  kinds: Exclude<ChangeKind, 'unchanged'>[];
}

/**
 * One comparison, before anything has been written out.
 *
 * `write` is deferred rather than eager because the two callers want different things from the
 * same diff — one merged diagram, or one source per side — and rendering all three every time
 * would emit two diagrams nobody asked for.
 */
interface Comparison {
  kinds: Exclude<ChangeKind, 'unchanged'>[];
  /** One version alone, or the merged diagram when `side` is absent. */
  write(side?: Side): string;
  /**
   * Whether both sources survive the round trip through the parser with nothing dropped.
   *
   * False when either version carried something the reader recognises but does not model —
   * `classDef`, `style`, `click` — since the emitters never write those back out.
   */
  lossless: boolean;
}

/**
 * Two versions of a diagram as one merged diagram, or `null` when they can't be diffed.
 *
 * See `compare` below for the dispatch this and `annotateDiagrams` share.
 */
export function mergeDiagrams(
  before: string,
  after: string,
  colours: MergeColours,
): MergedDiagram | null {
  const comparison = compare(before, after, colours);

  return comparison && { source: comparison.write(), kinds: comparison.kinds };
}

/**
 * The same two versions as two separately-marked diagrams — one per Side by side pane — or `null`
 * when they can't be diffed or can't be redrawn faithfully.
 *
 * The extra refusal over `mergeDiagrams` is `lossless`, and it is what makes this safe to leave on
 * by default. Regenerating a diagram whose author styled it would quietly repaint their work in
 * the diff's colours. Semantic mode may do that, having been asked for explicitly; a mode nobody
 * opted into may not, so a styled pair falls back to the plain render it has always had.
 */
export function annotateDiagrams(
  before: string,
  after: string,
  colours: MergeColours,
): AnnotatedPair | null {
  const comparison = compare(before, after, colours);
  if (!comparison || !comparison.lossless) {
    return null;
  }

  return {
    left: comparison.write('before'),
    right: comparison.write('after'),
    kinds: comparison.kinds,
  };
}

/**
 * The one place that knows which readers exist. Both modes ask a single question — can these two be
 * compared, and with what key — so the choice of parser is pure and tested rather than sitting in
 * the DOM wiring, and adding a third diagram type later touches this file and not the webview.
 *
 * `null` covers every way an answer is unavailable: a type neither reader understands, a source too
 * broken to parse, and a pair whose *type changed* between the versions. That last one is a
 * deliberate refusal rather than an oversight — a flowchart replaced by a sequence diagram is a
 * rewrite, and merging them would mean reinterpreting one version in the other's terms.
 */
function compare(before: string, after: string, colours: MergeColours): Comparison | null {
  const flowcharts = pair(parseFlowchart(before), parseFlowchart(after));
  if (flowcharts) {
    const [older, newer] = flowcharts;
    const diff = diffFlowcharts(older, newer);
    const present = (kind: ChangeKind): boolean =>
      diff.nodes.some((change) => change.kind === kind) ||
      diff.edges.some((change) => change.kind === kind);

    return {
      kinds: HIGHLIGHTED.filter(present),
      write: (side) => mergeSource(diff, side === 'before' ? older : newer, colours, side),
      lossless: intact(older.unsupported, newer.unsupported),
    };
  }

  const classDiagrams = pair(parseClassDiagram(before), parseClassDiagram(after));
  if (classDiagrams) {
    const [older, newer] = classDiagrams;
    const diff = diffClassDiagrams(older, newer);
    const present = (kind: ChangeKind): boolean =>
      diff.classes.some((change) => change.kind === kind) ||
      diff.classes.some((change) => change.members.some((member) => member.kind === kind)) ||
      diff.relationships.some((change) => change.kind === kind) ||
      diff.notes.some((change) => change.kind === kind);

    return {
      kinds: HIGHLIGHTED.filter(present),
      write: (side) => mergeClassSource(diff, side === 'before' ? older : newer, colours, side),
      lossless: intact(older.unsupported, newer.unsupported),
    };
  }

  const sequences = pair(parseSequence(before), parseSequence(after));
  if (sequences) {
    const [older, newer] = sequences;
    const diff = diffSequences(older, newer);
    const present = (kind: ChangeKind): boolean =>
      diff.participants.some((change) => change.kind === kind) || holds(diff.statements, kind);

    return {
      kinds: HIGHLIGHTED.filter(present),
      write: (side) => mergeSequenceSource(diff, side === 'before' ? older : newer, colours, side),
      // A sequence diagram has no styling grammar to lose, and the reader keeps everything else it
      // doesn't model as verbatim text — so this round trip drops nothing.
      lossless: true,
    };
  }

  return null;
}

/** Both versions read by the same reader, or nothing. */
const pair = <T>(before: T | null, after: T | null): [T, T] | null =>
  before && after ? [before, after] : null;

/** Nothing was set aside on either side, so re-emitting writes back everything that came in. */
const intact = (before: string[], after: string[]): boolean =>
  before.length === 0 && after.length === 0;

/** Whether a kind occurs anywhere in a statement list, including inside blocks. */
function holds(changes: StatementChange[], kind: ChangeKind): boolean {
  return changes.some(
    (change) =>
      change.kind === kind ||
      (isBlockChange(change) && change.sections.some((s) => holds(s.statements, kind))),
  );
}
