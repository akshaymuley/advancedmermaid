import { describe, it, expect } from 'vitest';
import { fromPanelState, toPanelState, type PanelState } from './panel-state';
import type { SideTargets } from './side-source';

const targets = (over: Partial<SideTargets> = {}): SideTargets => ({
  left: {
    uri: { toString: () => 'file:///repo/diagram.mmd', fsPath: '/repo/diagram.mmd' },
    kind: 'mermaid',
    source: { kind: 'ref', ref: 'HEAD' },
  },
  right: {
    uri: { toString: () => 'file:///repo/diagram.mmd', fsPath: '/repo/diagram.mmd' },
    kind: 'mermaid',
    source: { kind: 'workingTree' },
  },
  ...over,
});

const saved = (over: Partial<PanelState> = {}): PanelState => ({
  ...toPanelState(targets()),
  ...over,
});

describe('toPanelState', () => {
  it('records what each pane was showing, as plain JSON', () => {
    expect(toPanelState(targets())).toEqual({
      version: 1,
      left: {
        uri: 'file:///repo/diagram.mmd',
        kind: 'mermaid',
        source: { kind: 'ref', ref: 'HEAD' },
      },
      right: {
        uri: 'file:///repo/diagram.mmd',
        kind: 'mermaid',
        source: { kind: 'workingTree' },
      },
    });
  });

  it('survives a trip through JSON, which is the only way it is ever stored', () => {
    const state = toPanelState(targets());

    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('keeps which diagram a Markdown pane was showing', () => {
    const state = toPanelState(
      targets({
        left: {
          uri: { toString: () => 'file:///repo/notes.md', fsPath: '/repo/notes.md' },
          kind: 'markdown',
          fence: 2,
          source: { kind: 'workingTree' },
        },
      }),
    );

    expect(state.left.fence).toBe(2);
  });

  // `fence: undefined` and a missing `fence` mean the same thing here — the whole file is the
  // diagram — but only one of them survives JSON.stringify, so they must not be told apart.
  it('leaves the fence out entirely when the whole file is the diagram', () => {
    expect('fence' in toPanelState(targets()).left).toBe(false);
  });
});

describe('fromPanelState', () => {
  it('accepts state it wrote itself', () => {
    const state = toPanelState(targets());

    expect(fromPanelState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  // Everything below is the same question: this is the one input that arrives from disk, possibly
  // written by a build that no longer exists. Refusing it means opening no panel, which is
  // recoverable; half-trusting it means failing later somewhere that says nothing about why.
  it('refuses state that is not there at all', () => {
    expect(fromPanelState(undefined)).toBeUndefined();
    expect(fromPanelState(null)).toBeUndefined();
  });

  it('refuses state that is not an object', () => {
    expect(fromPanelState('restore me')).toBeUndefined();
    expect(fromPanelState(42)).toBeUndefined();
    expect(fromPanelState([])).toBeUndefined();
  });

  it('refuses a version it does not know, rather than guessing at the shape', () => {
    expect(fromPanelState(saved({ version: 2 as unknown as 1 }))).toBeUndefined();
    expect(fromPanelState({ ...saved(), version: undefined })).toBeUndefined();
  });

  it('refuses state missing a side, since a comparison needs both', () => {
    const { left } = saved();

    expect(fromPanelState({ version: 1, left })).toBeUndefined();
    expect(fromPanelState({ version: 1, right: left })).toBeUndefined();
  });

  it('refuses a side whose file is not a string', () => {
    const state = saved();

    expect(fromPanelState({ ...state, left: { ...state.left, uri: 7 } })).toBeUndefined();
    expect(fromPanelState({ ...state, left: { ...state.left, uri: '' } })).toBeUndefined();
  });

  it('refuses a file kind it cannot render', () => {
    const state = saved();

    expect(fromPanelState({ ...state, left: { ...state.left, kind: 'pdf' } })).toBeUndefined();
  });

  it('refuses a source it does not recognise, including a ref with no ref', () => {
    const state = saved();

    expect(
      fromPanelState({ ...state, left: { ...state.left, source: { kind: 'ref' } } }),
    ).toBeUndefined();
    expect(
      fromPanelState({ ...state, left: { ...state.left, source: { kind: 'stash' } } }),
    ).toBeUndefined();
    expect(fromPanelState({ ...state, left: { ...state.left, source: null } })).toBeUndefined();
  });

  it('refuses a fence that is not a whole diagram index', () => {
    const state = saved();

    for (const fence of ['2', -1, 1.5]) {
      expect(fromPanelState({ ...state, left: { ...state.left, fence } })).toBeUndefined();
    }
  });

  it('accepts a fence index, which is how a Markdown comparison comes back', () => {
    const state = saved();
    const restored = fromPanelState({ ...state, left: { ...state.left, kind: 'markdown', fence: 0 } });

    expect(restored?.left.fence).toBe(0);
  });

  it('keeps nothing the caller did not save, so stale extras cannot leak through', () => {
    const state = saved();
    const restored = fromPanelState({
      ...state,
      colour: 'red',
      left: { ...state.left, colour: 'blue' },
    });

    expect(restored).toEqual(state);
  });
});
