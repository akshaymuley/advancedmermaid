/** `RefType` from the built-in git extension's API, inlined so this stays free of `vscode`. */
export const RefType = { Head: 0, RemoteHead: 1, Tag: 2 } as const;

export type RefKind = 'branch' | 'tag' | 'remote';

export interface RefChoice {
  name: string;
  kind: RefKind;
}

/** A ref as the git extension reports it. `name` is absent for a detached HEAD. */
export interface RawRef {
  name?: string;
  type: number;
}

const KINDS: Readonly<Record<number, RefKind>> = {
  [RefType.Head]: 'branch',
  [RefType.Tag]: 'tag',
  [RefType.RemoteHead]: 'remote',
};

/** Local branches are what people pick most often, then tags; remotes are the long tail. */
const GROUPS: readonly RefKind[] = ['branch', 'tag', 'remote'];

/**
 * The repository's refs as pickable choices, grouped by kind and de-duplicated.
 *
 * Identity is name *and* kind: git happily allows a branch and a tag called `release`, and they
 * point at different commits, so collapsing them would silently hide one.
 */
export function orderRefs(refs: readonly RawRef[]): RefChoice[] {
  const seen = new Set<string>();
  const choices: RefChoice[] = [];

  for (const ref of refs) {
    const kind = KINDS[ref.type];
    if (!kind || !ref.name || seen.has(`${kind}:${ref.name}`)) {
      continue;
    }
    seen.add(`${kind}:${ref.name}`);
    choices.push({ name: ref.name, kind });
  }

  return GROUPS.flatMap((group) => choices.filter((choice) => choice.kind === group));
}
