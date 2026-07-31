import mermaid from 'mermaid';
import { isBlankDiagram } from './diagram-source';
import { composeComparison, composeMerged, type ExportSide, type LegendKey } from './export-image';
import { Box, computeFitView, dividerPercent, panBy, View, zoomAt } from './view-math';
import { initialViewMode, isStacked, setMode, syncAvailable, toggleSync, ViewMode } from './view-mode';
import { parseFlowchart } from './flowchart-parse';
import { diffFlowcharts, type ChangeKind } from './flowchart-diff';
import { mergeSource, type MergeColours } from './flowchart-merge';

type Pane = 'left' | 'right';
const PANES: Pane[] = ['left', 'right'];

/**
 * Everything that can be panned and zoomed. The merged diagram is a surface but not a *pane*: it
 * holds neither version, so it takes no part in "fit both to the larger" or in the sync rules.
 */
type Surface = Pane | 'merged';
const SURFACES: Surface[] = ['left', 'right', 'merged'];

interface Side {
  label: string;
  content: string;
}
interface CompareMessage {
  type: 'compare';
  title: string;
  left: Side;
  right: Side;
  /** Opaque here: handed straight to `setState` so a reload can rebuild this comparison. */
  state?: unknown;
}
/** The host answers an export request with the format the save dialog settled on. */
interface ExportAsMessage {
  type: 'exportAs';
  format: 'svg' | 'png';
}
type HostMessage = CompareMessage | ExportAsMessage;

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  /** What VS Code keeps for us across a window reload, and hands to the panel serializer. */
  setState(state: unknown): void;
};
const vscodeApi = acquireVsCodeApi();

/** Fails loudly if the markup in panel-body.ts and this module ever drift apart. */
function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Mermaid Compare: missing element #${id}`);
  }
  return found;
}

const isDark =
  document.body.classList.contains('vscode-dark') ||
  document.body.classList.contains('vscode-high-contrast');

/**
 * The editor's own UI font, **resolved** rather than passed through as `var(--vscode-font-family)`.
 *
 * Mermaid drops whatever this is into the stylesheet it injects, which a CSS variable would satisfy
 * on screen — and then break on export, where the SVG is written to a file with nothing to resolve
 * the variable against and the text falls back to a default serif. Reading the computed value here
 * hands mermaid real font names that survive leaving the webview.
 */
const uiFont = getComputedStyle(document.body).fontFamily;

mermaid.initialize({
  startOnLoad: false,
  theme: isDark ? 'dark' : 'default',
  securityLevel: 'strict',
  // Without this, diagrams render in mermaid's default Trebuchet MS while the panel around them
  // uses the editor's font — two typefaces a few pixels apart.
  ...(uiFont ? { fontFamily: uiFont } : {}),
});

// --- View state: one per surface, kept identical across the two panes while Sync is on ---
const views: Record<Surface, View> = {
  left: { x: 0, y: 0, scale: 1 },
  right: { x: 0, y: 0, scale: 1 },
  merged: { x: 0, y: 0, scale: 1 },
};
/** Measured at scale 1 after each successful render; the input to fit. */
const contentBoxes: Record<Surface, Box | undefined> = {
  left: undefined,
  right: undefined,
  merged: undefined,
};
let viewMode = initialViewMode();
let lastActive: Surface = 'left';

/** `viewMode.synced` is the single source of truth; this reads as the old flag did. */
const isSynced = (): boolean => viewMode.synced;

function applyView(): void {
  for (const surface of SURFACES) {
    const { x, y, scale } = views[surface];
    el(`${surface}-viewport`).style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }
  const percent = (surface: Surface): string => `${Math.round(views[surface].scale * 100)}%`;

  if (showingMerged()) {
    el('zoom-level').textContent = percent('merged');
    return;
  }
  el('zoom-level').textContent = isSynced()
    ? percent('left')
    : `${percent('left')} / ${percent('right')}`;
}

/** Apply `change` to the surface that was interacted with — or to both panes, while synced. */
function updateView(surface: Surface, change: (view: View) => View): void {
  lastActive = surface;
  userAdjusted = true;

  // The merged diagram is on its own: syncing it to the panes would move a view the user can't
  // even see, and be waiting for them when they leave the mode.
  if (surface === 'merged') {
    views.merged = change(views.merged);
  } else if (isSynced()) {
    const next = change(views[surface]);
    views.left = next;
    views.right = { ...next };
  } else {
    views[surface] = change(views[surface]);
  }
  applyView();
}

function paneSize(surface: Surface): Box {
  const canvas = el(`${surface}-viewport`).parentElement!;
  return { width: canvas.clientWidth, height: canvas.clientHeight };
}

/**
 * Frame each diagram in its pane. While synced both panes fit the *larger* of the two diagrams,
 * so a shared scale still means "same size on screen" and the comparison stays honest.
 */
function fitToView(): void {
  // One diagram, one pane, nothing to reconcile.
  if (showingMerged() && contentBoxes.merged) {
    views.merged = computeFitView(contentBoxes.merged, paneSize('merged'));
    applyView();
    return;
  }

  const boxes = PANES.map((pane) => contentBoxes[pane]).filter((box): box is Box => box !== undefined);
  if (boxes.length === 0) {
    return;
  }

  if (isSynced()) {
    const largest: Box = {
      width: Math.max(...boxes.map((b) => b.width)),
      height: Math.max(...boxes.map((b) => b.height)),
    };
    const fit = computeFitView(largest, paneSize('left'));
    views.left = fit;
    views.right = { ...fit };
  } else {
    for (const pane of PANES) {
      const box = contentBoxes[pane];
      if (box) {
        views[pane] = computeFitView(box, paneSize(pane));
      }
    }
  }
  applyView();
}

/** Zoom a surface about its own centre — what the buttons and keyboard use. */
function zoomBy(factor: number): void {
  const surface: Surface = showingMerged() ? 'merged' : isSynced() ? 'left' : lastActive;
  const size = paneSize(surface);
  updateView(surface, (view) => zoomAt(view, factor, { x: size.width / 2, y: size.height / 2 }));
}

// --- Rendering ---

/** Whether each pane currently holds a successful render, so a failed one can be kept. */
const hasGoodRender: Record<Pane, boolean> = { left: false, right: false };

/** Source last handed to each pane. A refresh re-posts both sides; only re-render what moved. */
const rendered: Record<Pane, string | undefined> = { left: undefined, right: undefined };

/** Set once the user pans or zooms; from then on, their framing is never overridden. */
let userAdjusted = false;

function setBadge(side: Pane, message: string | undefined): void {
  const badge = el(`${side}-badge`);
  badge.hidden = message === undefined;
  badge.title = message ?? '';
}

/**
 * Pin the SVG to its viewBox size and report that size.
 *
 * Mermaid emits a responsive SVG (`max-width`, percentage width), so its layout box is whatever
 * the container happens to allow — which is not the diagram's size and is not what `getBBox()`
 * reports either, since that is in user units. Fitting needs the two to agree: after this, a
 * transform of `scale(s)` puts exactly `s * width` pixels on screen.
 */
function measure(svg: SVGSVGElement): Box | undefined {
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    svg.style.width = `${viewBox.width}px`;
    svg.style.height = `${viewBox.height}px`;
    return { width: viewBox.width, height: viewBox.height };
  }

  const rect = svg.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : undefined;
}

async function renderPane(side: Pane, data: Side): Promise<void> {
  el(`${side}-label`).textContent = data.label;

  if (rendered[side] === data.content) {
    return;
  }
  rendered[side] = data.content;

  const viewport = el(`${side}-viewport`);

  // Mermaid treats empty source as a parse error; an absent diagram isn't an error here.
  if (isBlankDiagram(data.content)) {
    viewport.innerHTML = '<div class="empty-diagram">(empty)</div>';
    hasGoodRender[side] = false;
    contentBoxes[side] = undefined;
    setBadge(side, undefined);
    return;
  }

  const id = `mmd-${side}-${Date.now()}`;
  try {
    const { svg } = await mermaid.render(id, data.content);
    viewport.innerHTML = svg;
    const svgEl = viewport.querySelector('svg');
    if (svgEl) {
      svgEl.style.maxWidth = 'none';
      contentBoxes[side] = measure(svgEl);
    }
    hasGoodRender[side] = true;
    setBadge(side, undefined);
  } catch (err) {
    // mermaid.render leaves a temp error element in the DOM on failure
    document.getElementById(id)?.remove();
    const message = err instanceof Error ? err.message : String(err);

    // Mid-edit source is invalid most of the time. Keep the last good diagram on screen and
    // flag the error in the header rather than blanking the pane on every keystroke.
    if (hasGoodRender[side]) {
      setBadge(side, message);
      return;
    }

    viewport.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'render-error';
    pre.textContent = message;
    viewport.appendChild(pre);
    contentBoxes[side] = undefined;
    setBadge(side, undefined);
  }
}

// --- Semantic diff ---

/**
 * `classDef` takes literal colours, not CSS variables, so the theme has to be resolved here. Dark
 * themes get lighter hues: the same green that reads well on white disappears on a dark canvas.
 */
const SEMANTIC_COLOURS: MergeColours = isDark
  ? { added: '#3fb950', removed: '#f85149', changed: '#d29922', text: '#e6edf3' }
  : { added: '#1a7f37', removed: '#cf222e', changed: '#9a6700', text: '#1f2328' };

// The legend reads the same values the diagram is drawn with, rather than keeping its own copy in
// the stylesheet that would quietly drift from them.
for (const [kind, colour] of Object.entries(SEMANTIC_COLOURS)) {
  document.body.style.setProperty(`--semantic-${kind}`, colour);
}

/** True once a merged diagram is actually on screen — false while semantic has fallen back. */
let semanticActive = false;
const showingMerged = (): boolean => viewMode.mode === 'semantic' && semanticActive;

/** The merged source last rendered, so an unrelated refresh doesn't relayout the diagram. */
let mergedRendered: string | undefined;
let hasGoodMerged = false;

/**
 * Which kinds the current diff actually holds, in a fixed order, for the exported image's key.
 * Kept from the diff rather than reparsed at export time — and only the kinds present, since
 * listing one nothing uses would report a change that didn't happen.
 */
const LEGEND_KINDS: { kind: Exclude<ChangeKind, 'unchanged'>; label: string; dashed?: boolean }[] = [
  { kind: 'added', label: 'Added' },
  { kind: 'removed', label: 'Removed', dashed: true },
  { kind: 'changed', label: 'Changed' },
];
let mergedLegend: LegendKey[] = [];

/**
 * Render the two sides as one merged diagram. Returns false when they can't be diffed — a
 * sequence diagram, a class diagram, or a source too broken to parse — which is the caller's cue
 * to fall back to showing both versions.
 *
 * The sources come from `rendered`, which already holds exactly what each pane was last given.
 */
async function renderMerged(): Promise<boolean> {
  const before = parseFlowchart(rendered.left ?? '');
  const after = parseFlowchart(rendered.right ?? '');
  if (!before || !after) {
    return false;
  }

  const diff = diffFlowcharts(before, after);
  mergedLegend = LEGEND_KINDS.filter(
    ({ kind }) =>
      diff.nodes.some((change) => change.kind === kind) ||
      diff.edges.some((change) => change.kind === kind),
  ).map(({ kind, label, dashed }) => ({
    label,
    colour: SEMANTIC_COLOURS[kind],
    ...(dashed ? { dashed } : {}),
  }));

  const source = mergeSource(diff, after, SEMANTIC_COLOURS);
  if (mergedRendered === source && hasGoodMerged) {
    return true;
  }
  mergedRendered = source;

  const viewport = el('merged-viewport');
  const id = `mmd-merged-${Date.now()}`;

  try {
    const { svg } = await mermaid.render(id, source);
    viewport.innerHTML = svg;
    const svgEl = viewport.querySelector('svg');
    if (svgEl) {
      svgEl.style.maxWidth = 'none';
      contentBoxes.merged = measure(svgEl);
    }
    hasGoodMerged = true;
    return true;
  } catch {
    // Generated source that mermaid rejects is a bug here, not a mid-edit state — but it must not
    // take the panel down with it, so it reads as "can't diff this" like any unsupported input.
    document.getElementById(id)?.remove();
    mergedRendered = undefined;
    return hasGoodMerged;
  }
}

window.addEventListener('message', async (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (message.type === 'exportAs') {
    sendExport(message.format);
    return;
  }
  if (message.type !== 'compare') {
    return;
  }
  // Held by VS Code across a window reload and handed back to the panel serializer. Recorded
  // before rendering: a diagram that fails to render is still a comparison worth reopening.
  if (message.state !== undefined) {
    vscodeApi.setState(message.state);
  }

  el('doc-title').textContent = message.title;
  await Promise.all([renderPane('left', message.left), renderPane('right', message.right)]);

  // An edit can turn a diffable pair into an undiffable one and back, so the fallback has to be
  // re-decided on every message, not only when the mode is entered.
  if (viewMode.mode === 'semantic') {
    semanticActive = await renderMerged();
    applyMode();
  }

  // Open framed rather than at a hardcoded corner. Once the user has moved the view themselves,
  // a refresh must never yank it back.
  if (!userAdjusted) {
    fitToView();
  } else {
    applyView();
  }
});

// --- Pan (drag) ---
let dragging: Surface | undefined;
let last = { x: 0, y: 0 };

for (const surface of SURFACES) {
  const canvas = el(`${surface}-viewport`).parentElement!;

  canvas.addEventListener('mousedown', (e) => {
    dragging = surface;
    lastActive = surface;
    last = { x: e.clientX, y: e.clientY };
  });

  // --- Zoom (wheel), anchored at the cursor ---
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const rect = canvas.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      updateView(surface, (view) => zoomAt(view, factor, anchor));
    },
    { passive: false }
  );
}

window.addEventListener('mousemove', (e) => {
  if (!dragging) {
    return;
  }
  const dx = e.clientX - last.x;
  const dy = e.clientY - last.y;
  last = { x: e.clientX, y: e.clientY };
  updateView(dragging, (view) => panBy(view, dx, dy));
});

window.addEventListener('mouseup', () => {
  dragging = undefined;
});

// --- Toolbar ---
el('fit').addEventListener('click', fitToView);
el('zoom-in').addEventListener('click', () => zoomBy(1.2));
el('zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
el('refresh').addEventListener('click', () => vscodeApi.postMessage({ type: 'refresh' }));

/**
 * Push `viewMode` into the DOM: the layout classes, the toggle states, and the shared view that
 * being synced implies. The pane last interacted with wins when the views converge — anything
 * else would move a framing the user just set.
 */
function applyMode(): void {
  const { mode } = viewMode;

  // Semantic that couldn't be applied lays out as side by side: the user still gets to see the two
  // versions, with the notice saying why the diff isn't there. Everything below keys off the
  // *layout*, not off the mode the picker is showing.
  const layout: ViewMode = mode === 'semantic' && !semanticActive ? 'sideBySide' : mode;

  for (const id of ['panes', 'pane-headers']) {
    const classes = el(id).classList;
    classes.toggle('stacked', isStacked(layout));
    for (const candidate of MODES) {
      classes.toggle(candidate, candidate === layout);
    }
  }

  (el('mode') as HTMLSelectElement).value = mode;
  el('opacity-control').hidden = mode !== 'overlay';
  el('blink-controls').hidden = mode !== 'blink';
  el('semantic-legend').hidden = layout !== 'semantic';
  el('sync').setAttribute('aria-pressed', String(isSynced()));
  (el('sync') as HTMLButtonElement).disabled = !syncAvailable(viewMode);

  const notice = el('semantic-notice');
  notice.hidden = mode !== 'semantic' || semanticActive;
  if (!notice.hidden) {
    notice.textContent =
      'Semantic diff reads flowcharts only — showing both versions side by side instead.';
  }

  if (isSynced() && lastActive !== 'merged') {
    views.left = { ...views[lastActive] };
    views.right = { ...views[lastActive] };
  }
  applyView();
}

/** Every mode doubles as its layout class, so a new one needs no extra wiring here. */
const MODES: ViewMode[] = ['sideBySide', 'overlay', 'swipe', 'blink', 'semantic'];

const switchTo = async (mode: ViewMode): Promise<void> => {
  // Someone who asked their OS for less motion gets a still frame and an explicit Resume, rather
  // than an animation that starts on its own. Seeded here rather than forced by a CSS media
  // query, which would also override that Resume and leave the button dead.
  if (mode === 'blink') {
    setBlinkPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Built before the mode is applied, because whether it renders at all decides the layout.
  semanticActive = mode === 'semantic' ? await renderMerged() : false;

  viewMode = setMode(viewMode, mode);
  applyMode();

  // Stacking two diagrams that were framed apart leaves them at unrelated scales; re-fit unless
  // the user's own framing is what they want to keep.
  if (!userAdjusted) {
    fitToView();
  }
};

el('sync').addEventListener('click', () => {
  viewMode = toggleSync(viewMode);
  applyMode();
});

el('mode').addEventListener('change', (event) => {
  void switchTo((event.target as HTMLSelectElement).value as ViewMode);
});

el('opacity').addEventListener('input', (event) => {
  const percent = Number((event.target as HTMLInputElement).value);
  el('panes').style.setProperty('--overlay-opacity', String(percent / 100));
});

// --- Export ---

/** PNG is rasterised at 2x so it stays legible where a browser scales it down. */
const PNG_SCALE = 2;

/**
 * A theme colour, falling back to one that matches the theme's *polarity* rather than to a fixed
 * light default. Getting this wrong is not cosmetic: a dark render on a white background is light
 * text on white — the very thing painting a background is meant to prevent — and that is exactly
 * what an undefined variable produced the first time this was rendered.
 */
const cssVar = (name: string, dark: string, light: string): string =>
  getComputedStyle(document.body).getPropertyValue(name).trim() || (isDark ? dark : light);

/**
 * One surface as the composer wants it: its markup and the size that markup is drawn at.
 *
 * The label is passed in rather than read from the DOM, because the merged surface has no header
 * of its own — in semantic mode the two pane labels are hidden, and the image is titled with both.
 */
function exportSide(surface: Surface, label: string): ExportSide {
  const svg = el(`${surface}-viewport`).querySelector('svg');
  const box = contentBoxes[surface];

  return {
    label,
    svg: svg && box ? new XMLSerializer().serializeToString(svg) : undefined,
    width: box?.width ?? 0,
    height: box?.height ?? 0,
  };
}

const paneLabel = (pane: Pane): string => el(`${pane}-label`).textContent ?? pane;

// Baked in, not left transparent: a dark-theme render is light text, which disappears the moment
// a viewer composites it onto white.
const exportBackground = () => cssVar('--vscode-editor-background', '#1e1e1e', '#ffffff');
const exportForeground = () => cssVar('--vscode-foreground', '#cccccc', '#333333');

const comparisonImage = () =>
  composeComparison({
    left: exportSide('left', paneLabel('left')),
    right: exportSide('right', paneLabel('right')),
    background: exportBackground(),
    foreground: exportForeground(),
  });

/** The merged diff, titled with both sides so the image still says what it compares. */
const mergedImage = () =>
  composeMerged({
    diagram: exportSide('merged', `${paneLabel('left')} → ${paneLabel('right')}`),
    legend: mergedLegend,
    background: exportBackground(),
    foreground: exportForeground(),
  });

/**
 * Rasterise the composed SVG. Chromium draws `<foreignObject>` — which mermaid's flowchart labels
 * use — and the markup carries its own styles, so the canvas stays untainted and `toDataURL`
 * works. Both were verified against a real render before this was built on.
 */
function rasterise(svg: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * PNG_SCALE));
      canvas.height = Math.max(1, Math.round(height * PNG_SCALE));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('no 2d context'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('the composed SVG could not be rendered'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function sendExport(format: 'svg' | 'png'): Promise<void> {
  // Export what the mode means, not what the screen shows: overlay, swipe and blink are ways of
  // looking at two diagrams, so they still write the comparison. A merged diff *is* a comparison,
  // and a semantic fallback is showing two panes, so it writes two.
  const image = showingMerged() ? mergedImage() : comparisonImage();

  if (format === 'svg') {
    vscodeApi.postMessage({ type: 'exportData', format, data: image.markup });
    return;
  }

  try {
    const dataUrl = await rasterise(image.markup, image.width, image.height);
    vscodeApi.postMessage({ type: 'exportData', format, data: dataUrl.split(',')[1] });
  } catch (err) {
    vscodeApi.postMessage({
      type: 'exportFailed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

el('export').addEventListener('click', () => vscodeApi.postMessage({ type: 'export' }));

// --- Blink ---

/** One source of truth for the paused state: the class both animations honour. */
function setBlinkPaused(paused: boolean): void {
  for (const id of ['panes', 'pane-headers']) {
    el(id).classList.toggle('paused', paused);
  }
  const button = el('blink-pause');
  button.setAttribute('aria-pressed', String(paused));
  button.textContent = paused ? 'Resume' : 'Pause';
}

el('blink-speed').addEventListener('change', (event) => {
  el('panes').style.setProperty('--blink-duration', (event.target as HTMLSelectElement).value);
  el('pane-headers').style.setProperty('--blink-duration', (event.target as HTMLSelectElement).value);
});

el('blink-pause').addEventListener('click', () => {
  setBlinkPaused(el('blink-pause').getAttribute('aria-pressed') !== 'true');
});

// --- Swipe divider ---

/** Position of the divider, in percent of the pane width. Drives both the clip and the handle. */
function setDivider(percent: number): void {
  el('panes').style.setProperty('--swipe-position', `${percent}%`);
  el('swipe-handle').setAttribute('aria-valuenow', String(Math.round(percent)));
}

{
  const handle = el('swipe-handle');

  handle.addEventListener('pointerdown', (event) => {
    // Without this the drag also reaches the canvas underneath and pans the diagram.
    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) {
      return;
    }
    setDivider(dividerPercent(event.clientX, el('panes').getBoundingClientRect()));
  });

  handle.addEventListener('pointerup', (event) => handle.releasePointerCapture(event.pointerId));

  // A divider only draggable by mouse would be the one control a keyboard can't reach.
  handle.addEventListener('keydown', (event) => {
    const current = Number(handle.getAttribute('aria-valuenow') ?? 50);
    const step = event.shiftKey ? 10 : 2;
    const moved: Record<string, number> = {
      ArrowLeft: current - step,
      ArrowRight: current + step,
      Home: 0,
      End: 100,
    };

    const next = moved[event.key];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    setDivider(Math.min(100, Math.max(0, next)));
  });
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) {
    return;
  }
  if (e.key === '+' || e.key === '=') {
    zoomBy(1.2);
  } else if (e.key === '-') {
    zoomBy(1 / 1.2);
  } else if (e.key === '0') {
    fitToView();
  } else {
    return;
  }
  e.preventDefault();
});

// Re-frame on resize only while the user hasn't taken control of the view yet.
window.addEventListener('resize', () => {
  if (!userAdjusted) {
    fitToView();
  }
});

vscodeApi.postMessage({ type: 'ready' });
