import { diffFlowcharts } from './flowchart-diff';
import { mergeSource, type MergeColours } from './flowchart-merge';
import { parseFlowchart } from './flowchart-parse';
import type { ChangeKind } from './reconcile';
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

/**
 * Two versions of a diagram as one merged diagram, or `null` when they can't be diffed.
 *
 * The one place that knows which readers exist. `main.ts` asks a single question — can these two be
 * merged, and with what key — so the choice of parser is pure and tested rather than sitting in the
 * DOM wiring, and adding a third diagram type later touches this file and not the webview.
 *
 * `null` covers every way an answer is unavailable: a type neither reader understands, a source too
 * broken to parse, and a pair whose *type changed* between the versions. That last one is a
 * deliberate refusal rather than an oversight — a flowchart replaced by a sequence diagram is a
 * rewrite, and merging them would mean reinterpreting one version in the other's terms.
 */
export function mergeDiagrams(
  before: string,
  after: string,
  colours: MergeColours,
): MergedDiagram | null {
  const flowcharts = pair(parseFlowchart(before), parseFlowchart(after));
  if (flowcharts) {
    const diff = diffFlowcharts(flowcharts[0], flowcharts[1]);
    const present = (kind: ChangeKind): boolean =>
      diff.nodes.some((change) => change.kind === kind) ||
      diff.edges.some((change) => change.kind === kind);

    return {
      source: mergeSource(diff, flowcharts[1], colours),
      kinds: HIGHLIGHTED.filter(present),
    };
  }

  const sequences = pair(parseSequence(before), parseSequence(after));
  if (sequences) {
    const diff = diffSequences(sequences[0], sequences[1]);
    const present = (kind: ChangeKind): boolean =>
      diff.participants.some((change) => change.kind === kind) || holds(diff.statements, kind);

    return {
      source: mergeSequenceSource(diff, sequences[1], colours),
      kinds: HIGHLIGHTED.filter(present),
    };
  }

  return null;
}

/** Both versions read by the same reader, or nothing. */
const pair = <T>(before: T | null, after: T | null): [T, T] | null =>
  before && after ? [before, after] : null;

/** Whether a kind occurs anywhere in a statement list, including inside blocks. */
function holds(changes: StatementChange[], kind: ChangeKind): boolean {
  return changes.some(
    (change) =>
      change.kind === kind ||
      (isBlockChange(change) && change.sections.some((s) => holds(s.statements, kind))),
  );
}
