/**
 * Which layout the two renders are in, and how that interacts with the sync toggle. Pure — no
 * DOM — so the one piece of real logic here is testable, the same extraction `view-math.ts`
 * makes for the pan/zoom arithmetic.
 */
export type ViewMode = 'sideBySide' | 'overlay' | 'swipe' | 'blink' | 'semantic';

/**
 * Whether the mode puts both renders in the same space, one on top of the other.
 *
 * A positive list, not "anything but side by side". Semantic is the mode that forced the
 * distinction: it shows a single merged diagram, so it shares one view like the stacked modes but
 * lays out like neither them nor side by side.
 */
export const isStacked = (mode: ViewMode): boolean =>
  mode === 'overlay' || mode === 'swipe' || mode === 'blink';

/**
 * Whether the mode leaves the user only one view to pan and zoom — true for the stacked modes and
 * for semantic alike. This, not `isStacked`, is what the sync rules below turn on.
 */
export const sharesOneView = (mode: ViewMode): boolean => mode !== 'sideBySide';

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
 * `remembered` is captured only when leaving a mode that didn't already share one view, which is
 * the whole subtlety: moving between two such modes — overlay to swipe, or overlay to semantic —
 * would otherwise record the **forced** `synced: true` as though the user had asked for it, and
 * their unsynced framing would be gone for good. Guarding on "same mode" alone doesn't catch that,
 * since the mode did change; nor does guarding on `isStacked`, since semantic isn't stacked.
 */
export function setMode(state: ViewModeState, mode: ViewMode): ViewModeState {
  if (mode === state.mode) {
    return state;
  }

  const remembered = sharesOneView(state.mode) ? state.remembered : state.synced;

  // One view between them: stacked layers framed apart would slide over each other, and a merged
  // diagram has only itself to frame.
  return sharesOneView(mode)
    ? { mode, synced: true, remembered }
    : { mode, synced: remembered, remembered };
}

/** Ignored wherever the two panes share one view, where sync isn't the user's to choose. */
export function toggleSync(state: ViewModeState): ViewModeState {
  if (!syncAvailable(state)) {
    return state;
  }

  const synced = !state.synced;
  return { ...state, synced, remembered: synced };
}

/** Whether the Sync control should respond at all — false wherever the mode pins it on. */
export const syncAvailable = (state: ViewModeState): boolean => !sharesOneView(state.mode);
