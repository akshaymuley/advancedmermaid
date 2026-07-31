import type { SourceKind } from './mermaid-file';
import type { SideSource, SideTargets } from './side-source';

/** One pane, reduced to what a reload has to remember. */
export interface SideState {
  uri: string;
  kind: SourceKind;
  /** Which ```mermaid fence, for Markdown. Absent means the whole file is the diagram. */
  fence?: number;
  source: SideSource;
}

/**
 * What a comparison panel was showing, as plain JSON.
 *
 * `version` is here to be checked, not decorated with: state comes back from disk possibly written
 * by a build that no longer exists, and knowing the shape is one this code understands should be a
 * cheap explicit test rather than an inference from which fields happen to be present.
 */
export interface PanelState {
  version: 1;
  left: SideState;
  right: SideState;
}

const VERSION = 1;

const KINDS: SourceKind[] = ['mermaid', 'markdown'];

/** What to hand VS Code so a reload can rebuild this comparison. */
export function toPanelState({ left, right }: SideTargets): PanelState {
  return { version: VERSION, left: sideState(left), right: sideState(right) };
}

function sideState(side: SideTargets['left']): SideState {
  return {
    uri: side.uri.toString(),
    kind: side.kind,
    // Spread rather than `fence: side.fence`: an explicit `undefined` and an absent key mean the
    // same thing here, but only one of them survives JSON.stringify, and the two must not come
    // back as different states.
    ...(side.fence === undefined ? {} : { fence: side.fence }),
    source: side.source,
  };
}

/**
 * State from a previous window, validated.
 *
 * Takes `unknown` on purpose. This is the only input the extension has that it did not receive
 * from VS Code or read from a file it just opened — it comes back from disk, possibly written by a
 * build that has since changed shape. `undefined` means "restore nothing", which costs the user a
 * closed tab; trusting a half-familiar object costs them a failure somewhere that says nothing
 * about where it came from.
 */
export function fromPanelState(state: unknown): PanelState | undefined {
  if (!isRecord(state) || state.version !== VERSION) {
    return undefined;
  }

  const left = sideFrom(state.left);
  const right = sideFrom(state.right);

  return left && right ? { version: VERSION, left, right } : undefined;
}

function sideFrom(side: unknown): SideState | undefined {
  if (!isRecord(side)) {
    return undefined;
  }

  const { uri, kind, fence, source } = side;

  if (typeof uri !== 'string' || uri === '') {
    return undefined;
  }
  if (typeof kind !== 'string' || !KINDS.includes(kind as SourceKind)) {
    return undefined;
  }
  if (fence !== undefined && !(typeof fence === 'number' && Number.isInteger(fence) && fence >= 0)) {
    return undefined;
  }

  const validated = sourceFrom(source);
  if (!validated) {
    return undefined;
  }

  // Rebuilt field by field rather than spread, so anything an older build wrote alongside these is
  // dropped instead of riding along into a target.
  return {
    uri,
    kind: kind as SourceKind,
    ...(fence === undefined ? {} : { fence }),
    source: validated,
  };
}

function sourceFrom(source: unknown): SideSource | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  if (source.kind === 'workingTree') {
    return { kind: 'workingTree' };
  }
  if (source.kind === 'ref' && typeof source.ref === 'string' && source.ref !== '') {
    return { kind: 'ref', ref: source.ref };
  }
  return undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
