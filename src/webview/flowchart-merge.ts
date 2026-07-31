import { SHAPES, type Flowchart, type Subgraph } from './flowchart-parse';
import type { ChangeKind, EdgeChange, FlowchartDiff, NodeChange } from './flowchart-diff';

/** Literal colours, since mermaid's `classDef` takes no CSS variables. Chosen per theme. */
export interface MergeColours {
  added: string;
  removed: string;
  changed: string;
  /** Label colour, so a tinted box stays legible in either theme. */
  text: string;
}

/**
 * The kinds worth styling. `unchanged` is deliberately absent, and typed out of the list rather
 * than merely left off it, so `MergeColours` can't grow a colour that nothing may use.
 */
const HIGHLIGHTED: Exclude<ChangeKind, 'unchanged'>[] = ['added', 'removed', 'changed'];

/**
 * One mermaid source showing both versions at once, with the changes marked.
 *
 * Regenerating source rather than post-processing mermaid's SVG is why the parser keeps shapes and
 * connectors verbatim: everything here is written back out the way it was written in, and mermaid
 * does the layout. Reaching into its rendered output would mean depending on internals this
 * project has already been bitten by twice.
 *
 * Takes the newer chart alongside the diff because a diff is about change and this also needs
 * structure — the header and the subgraph nesting, neither of which is a difference.
 *
 * Unchanged nodes and edges get no class at all, so they render in the theme's ordinary style.
 * Styling everything would make the changes exactly as loud as the parts that stayed put, which is
 * the problem this mode exists to solve.
 */
export function mergeSource(diff: FlowchartDiff, after: Flowchart, colours: MergeColours): string {
  const lines: string[] = [
    after.direction ? `${after.keyword} ${after.direction}` : after.keyword,
  ];

  const changes = new Map(diff.nodes.map((change) => [change.node.id, change]));
  const emitted = new Set<string>();
  const children = new Map<string | undefined, Subgraph[]>();
  for (const block of after.subgraphs) {
    children.set(block.parent, [...(children.get(block.parent) ?? []), block]);
  }

  const emitBlock = (block: Subgraph, indent: string): void => {
    lines.push(`${indent}subgraph ${block.id}${block.title ? ` ["${escape(block.title)}"]` : ''}`);

    for (const id of block.members) {
      const change = changes.get(id);
      if (change && !emitted.has(id)) {
        emitted.add(id);
        lines.push(`${indent}  ${nodeStatement(change)}`);
      }
    }
    for (const child of children.get(block.id) ?? []) {
      emitBlock(child, `${indent}  `);
    }

    lines.push(`${indent}end`);
  };

  for (const block of children.get(undefined) ?? []) {
    emitBlock(block, '  ');
  }

  // Whatever the blocks didn't claim, in the diff's order. A removed node lands here even if it
  // used to live inside a block: that block may not exist in the newer version at all, and
  // inventing one back would be a bigger lie than moving the node out of it.
  for (const change of diff.nodes) {
    if (!emitted.has(change.node.id)) {
      emitted.add(change.node.id);
      lines.push(`  ${nodeStatement(change)}`);
    }
  }

  for (const change of diff.edges) {
    lines.push(`  ${edgeStatement(change)}`);
  }

  return [...lines, ...styling(diff, colours)].join('\n');
}

/** `A["Text"]`, or a bare `A` where the source never gave one a label. */
function nodeStatement(change: NodeChange): string {
  const { id, shape } = change.node;
  const label = labelFor(change);

  if (label === undefined) {
    return id;
  }

  const [open, close] = SHAPES.find(([o, c]) => o + c === shape) ?? ['[', ']'];
  return `${id}${open}"${escape(label)}"${close}`;
}

/**
 * A reworded node says what it used to say. The colour reports *that* something changed; only the
 * old text reports *what*, and a merged diagram nobody can read the change out of is just a third
 * diagram. Plain text rather than a `<br/>` second line: `securityLevel` is `strict`.
 */
function labelFor(change: NodeChange): string | undefined {
  const { label } = change.node;
  const was = change.before?.label;

  if (change.kind !== 'changed' || was === undefined || was === label) {
    return label;
  }
  return label === undefined ? `(was: ${was})` : `${label} (was: ${was})`;
}

function edgeStatement({ edge }: EdgeChange): string {
  const label = edge.label === undefined ? '' : `|"${escape(edge.label)}"|`;
  return `${edge.from} ${edge.connector}${label} ${edge.to}`;
}

/** The `classDef`/`class`/`linkStyle` block, emitted only for the kinds actually present. */
function styling(diff: FlowchartDiff, colours: MergeColours): string[] {
  const lines: string[] = [];

  for (const kind of HIGHLIGHTED) {
    const ids = diff.nodes.filter((c) => c.kind === kind).map((c) => c.node.id);
    const edges = diff.edges
      .map((change, index) => ({ change, index }))
      .filter(({ change }) => change.kind === kind);

    if (ids.length === 0 && edges.length === 0) {
      continue;
    }

    const colour = colours[kind];
    // A removal is dashed as well as coloured, so the one kind that says "this is gone" doesn't
    // depend on telling green from red.
    const dashed = kind === 'removed' ? ',stroke-dasharray: 5 5' : '';

    lines.push(`  classDef ${kind} stroke:${colour},stroke-width:3px,color:${colours.text}${dashed}`);
    if (ids.length > 0) {
      lines.push(`  class ${ids.join(',')} ${kind}`);
    }
    for (const { index } of edges) {
      lines.push(`  linkStyle ${index} stroke:${colour},stroke-width:3px${dashed}`);
    }
  }

  return lines;
}

/** Mermaid has no backslash escape inside a label; `#quot;` is its own entity form. */
const escape = (text: string): string => text.replace(/"/g, '#quot;');
