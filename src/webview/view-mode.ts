/**
 * Which layout the two renders are in, and how that interacts with the sync toggle. Pure — no
 * DOM — so the one piece of real logic here is testable, the same extraction `view-math.ts`
 * makes for the pan/zoom arithmetic.
 */
export type ViewMode = 'sideBySide' | 'overlay' | 'swipe';

/** Whether the mode puts both renders in the same space, one on top of the other. */
export const isStacked = (mode: ViewMode): boolean => mode !== 'sideBySide';

export interface ViewModeState {
  mode: ViewMode;
  /** Whether both panes share one view. Forced on while stacked. */
  synced: boolean;
  /**
   * The sync setting to hand back when the panes separate again.
   *
   * Stacked modes pin `synced` to true, so `synced` alone can no longer answer "what did the user
   * choose?" — this does. Without it, stacking once would silently keep the panes locked together
   * forever after.
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
 * `remembered` is captured only when leaving a mode that *wasn't* stacked, which is the whole
 * subtlety: moving between two stacked modes — overlay to swipe — would otherwise record the
 * **forced** `synced: true` as though the user had asked for it, and their unsynced framing would
 * be gone for good. Guarding on "same mode" alone doesn't catch that, since the mode did change.
 */
export function setMode(state: ViewModeState, mode: ViewMode): ViewModeState {
  if (mode === state.mode) {
    return state;
  }

  const remembered = isStacked(state.mode) ? state.remembered : state.synced;

  // Stacked layers with independent views would slide over each other, which compares nothing.
  return isStacked(mode)
    ? { mode, synced: true, remembered }
    : { mode, synced: remembered, remembered };
}

/** Ignored while stacked, where sync isn't the user's to choose. */
export function toggleSync(state: ViewModeState): ViewModeState {
  if (!syncAvailable(state)) {
    return state;
  }

  const synced = !state.synced;
  return { ...state, synced, remembered: synced };
}

/** Whether the Sync control should respond at all — false while a stacked mode pins it on. */
export const syncAvailable = (state: ViewModeState): boolean => !isStacked(state.mode);
