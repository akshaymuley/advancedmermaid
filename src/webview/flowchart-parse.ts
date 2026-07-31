/** A node in a flowchart. */
export interface FlowNode {
  /** The identifier as written. This is the diff's identity for a node. */
  id: string;
  /** Display text, if the node ever declared any. Absent means mermaid shows the id. */
  label?: string;
  /** The bracket pair as written — `[]`, `()`, `{}`, `([])` — kept verbatim so it can be re-emitted. */
  shape?: string;
}

/** A connection between two nodes. */
export interface FlowEdge {
  from: string;
  to: string;
  /** The connector exactly as written: `-->`, `-.->`, `==>`, `---`. */
  connector: string;
  /** The text on the edge, from either `|label|` or `-- label -->`. */
  label?: string;
}

/** A `subgraph … end` block. */
export interface Subgraph {
  /** The identifier, which is the title too when the block declares no separate one. */
  id: string;
  /** The bracketed title, when the block gives one. */
  title?: string;
  /** Node ids declared directly inside, in source order. */
  members: string[];
  /** The enclosing subgraph's id, for a nested block. */
  parent?: string;
}

export interface Flowchart {
  /** `flowchart` or `graph`, as written. */
  keyword: string;
  /** `TD`, `LR`, … as written; absent when the header omitted one. */
  direction?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  subgraphs: Subgraph[];
  /**
   * Lines kept but not modelled — `classDef`, `style`, `click`, `linkStyle`.
   *
   * Collected rather than rejected: a diagram with styling in it is still perfectly diffable, and
   * refusing to parse one would make the feature useless on real diagrams.
   */
  unsupported: string[];
}

const HEADER = /^(flowchart|graph)(?:\s+(\S+))?\s*$/;
const COMMENT = /^\s*%%/;

/**
 * A connector carrying its label between the two halves — `A -- yes --> B`.
 *
 * The leading `[^->]` is the whole reason this is safe to scan lazily. Without it the pattern also
 * matches straight across `A --> B --> C`, taking `> B` for a label and the two arrows for one
 * edge. Only the solid and thick forms are read this way; a dotted edge's label is written
 * `-.->|text|`, which the pipe form below already covers.
 */
const INLINE_LABEL = /^(?:--\s*([^->][^]*?)\s*(--+[>ox]?)|==\s*([^=>][^]*?)\s*(==+[>ox]?))/;

/** Every connector shape, kept verbatim: its length and arrowhead are both meaningful. */
const CONNECTOR = /^[<ox]?(?:-\.+-|-{2,}|={2,})[>ox]?/;

/** `-->|yes|` — the label form that works on every connector, dotted ones included. */
const PIPE_LABEL = /^\s*\|([^|]*)\|/;

/**
 * Bracket pairs, longest opener first so `([` is never read as `(` with a stray `[`.
 * The pair itself is the shape: storing it verbatim means re-emitting cannot pick the wrong one.
 */
const SHAPES: readonly [string, string][] = [
  ['([', '])'],
  ['[[', ']]'],
  ['[(', ')]'],
  ['((', '))'],
  ['{{', '}}'],
  ['[/', '/]'],
  ['[\\', '\\]'],
  ['[/', '\\]'],
  ['[\\', '/]'],
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
  ['>', ']'],
];

const SUBGRAPH = /^subgraph\s+(.+)$/;
const SUBGRAPH_END = /^end$/;

/** Lines that are real flowchart syntax but describe no node or edge. */
const UNMODELLED = /^(?:classDef|class|style|linkStyle|click|direction)\b/;

interface Link {
  connector: string;
  label?: string;
}

/**
 * A flowchart's nodes and edges, or `null` if the source isn't a flowchart at all.
 *
 * Hand-written on purpose. Mermaid 11 exposes no graph: `mermaid.parse()` hands back only
 * `{ diagramType, config }`, and `Diagram.fromText` ships as types over bundled chunks with no
 * export path. Parsing here keeps the one piece of diagram understanding the extension has in its
 * best-tested tier — pure, no DOM, no mermaid — the same trade `mermaid-fences.ts` makes.
 *
 * `null` rather than a throw or a partial graph: "this isn't a flowchart" is a routine answer for
 * a tool that will be pointed at sequence and class diagrams, and the caller's response is to show
 * the two versions side by side instead.
 */
export function parseFlowchart(text: string): Flowchart | null {
  const lines = text.split(/\r?\n/);
  let start = 0;

  while (start < lines.length && (lines[start].trim() === '' || COMMENT.test(lines[start]))) {
    start++;
  }

  const header = start < lines.length ? HEADER.exec(lines[start].trim()) : null;
  if (!header) {
    return null;
  }

  const [, keyword, direction] = header;

  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const subgraphs: Subgraph[] = [];
  const unsupported: string[] = [];
  const open: Subgraph[] = [];

  /** One statement — a chain of nodes, a block boundary, or a line we keep but don't model. */
  function readStatement(raw: string): void {
    const statement = raw.trim();

    if (statement === '') {
      return;
    }

    if (UNMODELLED.test(statement)) {
      unsupported.push(statement);
      return;
    }

    const block = SUBGRAPH.exec(statement);
    if (block) {
      const subgraph = openSubgraph(block[1], open[open.length - 1]);
      subgraphs.push(subgraph);
      open.push(subgraph);
      return;
    }

    if (SUBGRAPH_END.test(statement)) {
      open.pop();
      return;
    }

    const { parts, links } = splitStatement(raw);
    const groups = parts.map((part) =>
      splitTopLevel(part, '&').map((spec) => declare(nodes, spec, open[open.length - 1])),
    );

    // A statement is a chain: every group links to the one after it, and an `&` on either side
    // means every node in one group links to every node in the other.
    links.forEach((link, i) => {
      for (const from of groups[i]) {
        for (const to of groups[i + 1] ?? []) {
          edges.push({
            from,
            to,
            connector: link.connector,
            ...(link.label === undefined ? {} : { label: link.label }),
          });
        }
      }
    });
  }

  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || COMMENT.test(line)) {
      continue;
    }

    // A line can hold several statements in the older `graph TD; A-->B; C-->D` style.
    for (const raw of splitTopLevel(line, ';')) {
      readStatement(raw);
    }
  }

  return {
    keyword,
    ...(direction === undefined ? {} : { direction }),
    nodes: [...nodes.values()],
    edges,
    subgraphs,
    unsupported,
  };
}

/** `subgraph ci [Continuous integration]`, or just `subgraph Build` where the name is the title. */
function openSubgraph(declaration: string, parent: Subgraph | undefined): Subgraph {
  const titled = /^(\S+)\s*\[(.*)\]$/.exec(declaration.trim());
  const [id, title] = titled ? [titled[1], unquote(titled[2])] : [declaration.trim(), undefined];

  return {
    id,
    ...(title === undefined ? {} : { title }),
    members: [],
    ...(parent === undefined ? {} : { parent: parent.id }),
  };
}

/**
 * Split one line into the node groups it names and the connectors between them.
 *
 * Character by character rather than by regex over the whole line, because a label is allowed to
 * contain anything — `A["a --> b"]` is one node, not two joined by an arrow — so a connector only
 * counts outside brackets and outside quotes.
 */
function splitStatement(line: string): { parts: string[]; links: Link[] } {
  const parts: string[] = [];
  const links: Link[] = [];
  let buffer = '';
  let depth = 0;
  let quoted = false;

  for (let i = 0; i < line.length; ) {
    const ch = line[i];

    if (quoted) {
      quoted = ch !== '"';
      buffer += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      quoted = true;
      buffer += ch;
      i++;
      continue;
    }

    if (depth === 0) {
      const link = matchLink(line.slice(i));
      if (link) {
        parts.push(buffer);
        buffer = '';
        links.push(link.link);
        i += link.length;
        continue;
      }
    }

    if (ch === '[' || ch === '(' || ch === '{') {
      depth++;
    } else if (ch === ']' || ch === ')' || ch === '}') {
      depth--;
    }

    buffer += ch;
    i++;
  }

  parts.push(buffer);
  return { parts, links };
}

/** The connector at the head of `rest`, with whichever label form it carries, if any. */
function matchLink(rest: string): { link: Link; length: number } | null {
  const inline = INLINE_LABEL.exec(rest);
  if (inline) {
    const label = inline[1] ?? inline[3];
    const connector = inline[2] ?? inline[4];
    return { link: { connector, label }, length: inline[0].length };
  }

  const plain = CONNECTOR.exec(rest);
  if (!plain) {
    return null;
  }

  const pipe = PIPE_LABEL.exec(rest.slice(plain[0].length));
  return pipe
    ? { link: { connector: plain[0], label: pipe[1].trim() }, length: plain[0].length + pipe[0].length }
    : { link: { connector: plain[0] }, length: plain[0].length };
}

/**
 * Split on a separator that only separates outside brackets and quotes.
 *
 * Two things need this: `&`, where `A & B` is two nodes sharing one connector, and `;`, which ends
 * a statement in the older `graph TD; A-->B;` style. A label is allowed to contain either
 * character, so neither can be split on blindly.
 */
function splitTopLevel(part: string, separator: string): string[] {
  const specs: string[] = [];
  let buffer = '';
  let depth = 0;
  let quoted = false;

  for (const ch of part) {
    if (quoted) {
      quoted = ch !== '"';
      buffer += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === '[' || ch === '(' || ch === '{') {
      depth++;
    } else if (ch === ']' || ch === ')' || ch === '}') {
      depth--;
    } else if (ch === separator && depth === 0) {
      specs.push(buffer);
      buffer = '';
      continue;
    }
    buffer += ch;
  }

  specs.push(buffer);
  return specs.filter((spec) => spec.trim() !== '');
}

/**
 * Record the node a spec names and return its id.
 *
 * A later mention fills in what an earlier one left blank, because wiring the graph up first and
 * labelling the nodes underneath is ordinary style — the mention that introduces an id is often
 * not the one that gives it a label.
 */
function declare(
  nodes: Map<string, FlowNode>,
  spec: string,
  enclosing: Subgraph | undefined,
): string {
  const { id, label, shape } = parseNode(spec.trim());
  const existing = nodes.get(id);

  // Mentioning a node inside a block is what puts it in that block — only the innermost one, so a
  // nested block's nodes don't also count as the outer block's.
  if (enclosing && !enclosing.members.includes(id)) {
    enclosing.members.push(id);
  }

  if (!existing) {
    nodes.set(id, {
      id,
      ...(label === undefined ? {} : { label }),
      ...(shape === undefined ? {} : { shape }),
    });
    return id;
  }

  if (label !== undefined) {
    existing.label = label;
  }
  if (shape !== undefined) {
    existing.shape = shape;
  }
  return id;
}

function parseNode(spec: string): { id: string; label?: string; shape?: string } {
  const boundary = spec.search(/[[({>]/);
  if (boundary === -1) {
    return { id: spec };
  }

  const id = spec.slice(0, boundary).trim();
  const rest = spec.slice(boundary).trim();

  for (const [open, close] of SHAPES) {
    if (rest.startsWith(open) && rest.endsWith(close) && rest.length >= open.length + close.length) {
      return {
        id,
        label: unquote(rest.slice(open.length, rest.length - close.length)),
        shape: open + close,
      };
    }
  }

  // Something bracketed we don't model — mermaid 11's `A@{ shape: … }`, say. The id is still
  // usable, and losing the shape is better than losing the node.
  return { id };
}

/** A quoted label exists so its text can contain anything; the quotes aren't part of it. */
const unquote = (label: string): string =>
  label.length >= 2 && label.startsWith('"') && label.endsWith('"') ? label.slice(1, -1) : label;
