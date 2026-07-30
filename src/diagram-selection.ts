import { findMermaidFences } from './mermaid-fences';
import type { SourceKind } from './mermaid-file';

export interface DiagramSelection {
  /** The diagram source to render. Empty when the requested fence isn't there. */
  content: string;
  /** True when a Markdown file has no fence at the requested position. */
  missing: boolean;
}

/**
 * The diagram a side of the comparison should show.
 *
 * The one place that knows a `.mmd` file *is* a diagram while a `.md` file merely contains some.
 * Both sides go through here, so the working tree and the ref are always read the same way.
 */
export function selectDiagram(text: string, kind: SourceKind, fence = 0): DiagramSelection {
  if (kind === 'mermaid') {
    return { content: text, missing: false };
  }

  const found = findMermaidFences(text)[fence];
  return found ? { content: found.content, missing: false } : { content: '', missing: true };
}
