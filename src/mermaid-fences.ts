/** A ```mermaid block inside a Markdown document. */
export interface Fence {
  /** 0-based position among the mermaid fences in the document. */
  index: number;
  /** The diagram source, fence markers stripped. */
  content: string;
  /** Nearest ATX heading above the fence, if any. Labels the picker. */
  heading?: string;
  /** 0-based line of the opening fence. */
  line: number;
}

const FENCE = /^(\s*)(`{3,}|~{3,})\s*(\S*)/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;

/**
 * Every ```mermaid block in a Markdown document, in document order.
 *
 * Pure and structurally simple on purpose — this is the one piece of Markdown understanding the
 * extension has, and every diagram it shows for a .md file comes through here.
 */
export function findMermaidFences(text: string): Fence[] {
  const lines = text.split(/\r?\n/);
  const fences: Fence[] = [];
  let heading: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i]);

    if (!open) {
      const title = HEADING.exec(lines[i]);
      if (title) {
        heading = title[1];
      }
      continue;
    }

    const [, indent, marker, info] = open;
    const body: string[] = [];
    let line = i + 1;

    // A closing fence uses the same character and is at least as long, so a longer fence can
    // contain a shorter one — that's how Markdown shows a ```mermaid block as an example.
    for (; line < lines.length; line++) {
      const close = FENCE.exec(lines[line]);
      if (close && close[2][0] === marker[0] && close[2].length >= marker.length && !close[3]) {
        break;
      }
      body.push(lines[line]);
    }

    if (info.toLowerCase() === 'mermaid') {
      fences.push({
        index: fences.length,
        content: dedent(body, indent.length).join('\n'),
        ...(heading === undefined ? {} : { heading }),
        line: i,
      });
    }

    i = line; // Skip the block; nothing inside it is Markdown.
  }

  return fences;
}

/** Fences indented inside a list item carry that indentation into every content line. */
function dedent(lines: string[], indent: number): string[] {
  if (indent === 0) {
    return lines;
  }
  return lines.map((line) => (line.slice(0, indent).trim() === '' ? line.slice(indent) : line));
}
