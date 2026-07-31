import mermaid from 'mermaid';
import { isBlankDiagram } from './diagram-source';
import { composeComparison, type ExportSide } from './export-image';
import { Box, computeFitView, dividerPercent, panBy, View, zoomAt } from './view-math';
import { initialViewMode, isStacked, setMode, syncAvailable, toggleSync, ViewMode } from './view-mode';

type Pane = 'left' | 'right';
const PANES: Pane[] = ['left', 'right'];

interface Side {
  label: string;
  content: string;
}
interface CompareMessage {
  type: 'compare';
  title: string;
  left: Side;
  right: Side;
}
/** The host answers an export request with the format the save dialog settled on. */
interface ExportAsMessage {
  type: 'exportAs';
  format: 'svg' | 'png';
}
type HostMessage = CompareMessage | ExportAsMessage;

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
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

// --- View state: one per pane, kept identical while Sync is on ---
const views: Record<Pane, View> = {
  left: { x: 0, y: 0, scale: 1 },
  right: { x: 0, y: 0, scale: 1 },
};
/** Measured at scale 1 after each successful render; the input to fit. */
const contentBoxes: Record<Pane, Box | undefined> = { left: undefined, right: undefined };
let viewMode = initialViewMode();
let lastActive: Pane = 'left';

/** `viewMode.synced` is the single source of truth; this reads as the old flag did. */
const isSynced = (): boolean => viewMode.synced;

function applyView(): void {
  for (const pane of PANES) {
    const { x, y, scale } = views[pane];
    el(`${pane}-viewport`).style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }
  const percent = (pane: Pane): string => `${Math.round(views[pane].scale * 100)}%`;
  el('zoom-level').textContent = isSynced()
    ? percent('left')
    : `${percent('left')} / ${percent('right')}`;
}

/** Apply `change` to the pane that was interacted with — or to both, while synced. */
function updateView(pane: Pane, change: (view: View) => View): void {
  lastActive = pane;
  userAdjusted = true;
  if (isSynced()) {
    const next = change(views[pane]);
    views.left = next;
    views.right = { ...next };
  } else {
    views[pane] = change(views[pane]);
  }
  applyView();
}

function paneSize(pane: Pane): Box {
  const canvas = el(`${pane}-viewport`).parentElement!;
  return { width: canvas.clientWidth, height: canvas.clientHeight };
}

/**
 * Frame each diagram in its pane. While synced both panes fit the *larger* of the two diagrams,
 * so a shared scale still means "same size on screen" and the comparison stays honest.
 */
function fitToView(): void {
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

/** Zoom a pane about its own centre — what the buttons and keyboard use. */
function zoomBy(factor: number): void {
  const pane = isSynced() ? 'left' : lastActive;
  const size = paneSize(pane);
  updateView(pane, (view) => zoomAt(view, factor, { x: size.width / 2, y: size.height / 2 }));
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

window.addEventListener('message', async (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (message.type === 'exportAs') {
    sendExport(message.format);
    return;
  }
  if (message.type !== 'compare') {
    return;
  }
  el('doc-title').textContent = message.title;
  await Promise.all([renderPane('left', message.left), renderPane('right', message.right)]);

  // Open framed rather than at a hardcoded corner. Once the user has moved the view themselves,
  // a refresh must never yank it back.
  if (!userAdjusted) {
    fitToView();
  } else {
    applyView();
  }
});

// --- Pan (drag) ---
let dragging: Pane | undefined;
let last = { x: 0, y: 0 };

for (const pane of PANES) {
  const canvas = el(`${pane}-viewport`).parentElement!;

  canvas.addEventListener('mousedown', (e) => {
    dragging = pane;
    lastActive = pane;
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
      updateView(pane, (view) => zoomAt(view, factor, anchor));
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

  for (const id of ['panes', 'pane-headers']) {
    const classes = el(id).classList;
    classes.toggle('stacked', isStacked(mode));
    for (const candidate of MODES) {
      classes.toggle(candidate, candidate === mode);
    }
  }

  (el('mode') as HTMLSelectElement).value = mode;
  el('opacity-control').hidden = mode !== 'overlay';
  el('blink-controls').hidden = mode !== 'blink';
  el('sync').setAttribute('aria-pressed', String(isSynced()));
  (el('sync') as HTMLButtonElement).disabled = !syncAvailable(viewMode);

  if (isSynced()) {
    views.left = { ...views[lastActive] };
    views.right = { ...views[lastActive] };
  }
  applyView();
}

/** Every mode doubles as its layout class, so a new one needs no extra wiring here. */
const MODES: ViewMode[] = ['sideBySide', 'overlay', 'swipe', 'blink'];

const switchTo = (mode: ViewMode): void => {
  // Someone who asked their OS for less motion gets a still frame and an explicit Resume, rather
  // than an animation that starts on its own. Seeded here rather than forced by a CSS media
  // query, which would also override that Resume and leave the button dead.
  if (mode === 'blink') {
    setBlinkPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

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
  switchTo((event.target as HTMLSelectElement).value as ViewMode);
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

/** One side as the composer wants it: its markup and the size that markup is drawn at. */
function exportSide(pane: Pane): ExportSide {
  const svg = el(`${pane}-viewport`).querySelector('svg');
  const box = contentBoxes[pane];

  return {
    label: el(`${pane}-label`).textContent ?? pane,
    svg: svg && box ? new XMLSerializer().serializeToString(svg) : undefined,
    width: box?.width ?? 0,
    height: box?.height ?? 0,
  };
}

const comparisonImage = () =>
  composeComparison({
    left: exportSide('left'),
    right: exportSide('right'),
    // Baked in, not left transparent: a dark-theme render is light text, which disappears the
    // moment a viewer composites it onto white.
    background: cssVar('--vscode-editor-background', '#1e1e1e', '#ffffff'),
    foreground: cssVar('--vscode-foreground', '#cccccc', '#333333'),
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
  const image = comparisonImage();

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
