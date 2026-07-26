/**
 * True when there is nothing to render. Mermaid treats empty source as a parse error, so
 * callers check this first and show a placeholder instead.
 */
export function isBlankDiagram(content: string): boolean {
  return content.trim().length === 0;
}
