/**
 * Which layout the two renders are in, and how that interacts with the sync toggle. Pure — no
 * DOM — so the one piece of real logic here is testable, the same extraction `view-math.ts`
 * makes for the pan/zoom arithmetic.
 */
export type ViewMode = 'sideBySide' | 'overlay';

export interface ViewModeState {
  mode: ViewMode;
  /** Whether both panes share one view. Forced on while overlaid. */
  synced: boolean;
  /**
   * The sync setting to hand back when overlay is left.
   *
   * Overlay pins `synced` to true, so `synced` alone can no longer answer "what did the user
   * choose?" — this does. Without it, overlaying once would silently keep the panes locked
   * together forever after.
   */
  remembered: boolean;
}

export const initialViewMode = (): ViewModeState => ({
  mode: 'sideBySide',
  synced: true,
  remembered: true,
});

/**
 * Switch layout.
 *
 * Setting the mode already in effect is a no-op, deliberately: entering overlay twice must not
 * capture the *forced* `synced: true` as though the user had asked for it, which would lose their
 * unsynced framing on the way back out.
 */
export function setMode(state: ViewModeState, mode: ViewMode): ViewModeState {
  if (mode === state.mode) {
    return state;
  }

  // Stacked layers with independent views would slide over each other, which compares nothing.
  return mode === 'overlay'
    ? { mode, synced: true, remembered: state.synced }
    : { mode, synced: state.remembered, remembered: state.remembered };
}

/** Ignored while overlaid, where sync isn't the user's to choose. */
export function toggleSync(state: ViewModeState): ViewModeState {
  if (!syncAvailable(state)) {
    return state;
  }

  const synced = !state.synced;
  return { ...state, synced, remembered: synced };
}

/** Whether the Sync control should respond at all — false while overlay pins it on. */
export const syncAvailable = (state: ViewModeState): boolean => state.mode === 'sideBySide';
