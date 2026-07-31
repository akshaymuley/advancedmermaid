import { describe, it, expect } from 'vitest';
import { initialViewMode, setMode, syncAvailable, toggleSync, type ViewModeState } from './view-mode';

const state = (over: Partial<ViewModeState> = {}): ViewModeState => ({
  ...initialViewMode(),
  ...over,
});

describe('view mode', () => {
  it('starts side by side, synced', () => {
    expect(initialViewMode()).toEqual({ mode: 'sideBySide', synced: true, remembered: true });
  });

  it('forces sync on when overlay is entered', () => {
    // Two stacked layers with independent views would be two diagrams sliding over each other,
    // which is not a comparison of anything.
    const next = setMode(state({ synced: false, remembered: false }), 'overlay');

    expect(next.mode).toBe('overlay');
    expect(next.synced).toBe(true);
  });

  it('restores the sync setting the user had before overlay', () => {
    const unsynced = state({ synced: false, remembered: false });

    expect(setMode(setMode(unsynced, 'overlay'), 'sideBySide')).toEqual(unsynced);
  });

  it('leaves sync on afterwards when it was on to begin with', () => {
    const synced = state({ synced: true, remembered: true });

    expect(setMode(setMode(synced, 'overlay'), 'sideBySide')).toEqual(synced);
  });

  it('does not let re-entering overlay overwrite what it has to restore', () => {
    // The forced `synced: true` must not be mistaken for the user's own setting. Without this,
    // a second click on an already-pressed Overlay button loses their unsynced view for good.
    const unsynced = state({ synced: false, remembered: false });
    const twice = setMode(setMode(unsynced, 'overlay'), 'overlay');

    expect(setMode(twice, 'sideBySide').synced).toBe(false);
  });

  it('ignores a sync toggle while overlaid', () => {
    const overlaid = setMode(state(), 'overlay');

    expect(toggleSync(overlaid)).toEqual(overlaid);
  });

  it('toggles sync side by side, and remembers the new setting', () => {
    const off = toggleSync(state());

    expect(off).toEqual({ mode: 'sideBySide', synced: false, remembered: false });
    expect(toggleSync(off)).toEqual({ mode: 'sideBySide', synced: true, remembered: true });
  });

  it('carries a fresh sync setting through a later overlay round trip', () => {
    const off = toggleSync(state());
    const roundTrip = setMode(setMode(off, 'overlay'), 'sideBySide');

    expect(roundTrip.synced).toBe(false);
  });

  it('says whether the sync control is usable, since overlay pins it', () => {
    expect(syncAvailable(state())).toBe(true);
    expect(syncAvailable(setMode(state(), 'overlay'))).toBe(false);
  });

  it('leaves the state alone when the mode it is already in is set again', () => {
    const sideBySide = state();
    expect(setMode(sideBySide, 'sideBySide')).toEqual(sideBySide);
  });
});
