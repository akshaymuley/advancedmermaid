import mermaid from 'mermaid';
import { isBlankDiagram } from './diagram-source';
import { Box, computeFitView, panBy, View, zoomAt } from './view-math';

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

mermaid.initialize({
  startOnLoad: false,
  theme: isDark ? 'dark' : 'default',
  securityLevel: 'strict',
});

// --- View state: one per pane, kept identical while Sync is on ---
const views: Record<Pane, View> = {
  left: { x: 0, y: 0, scale: 1 },
  right: { x: 0, y: 0, scale: 1 },
};
/** Measured at scale 1 after each successful render; the input to fit. */
const contentBoxes: Record<Pane, Box | undefined> = { left: undefined, right: undefined };
let synced = true;
let lastActive: Pane = 'left';

function applyView(): void {
  for (const pane of PANES) {
    const { x, y, scale } = views[pane];
    el(`${pane}-viewport`).style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }
  const percent = (pane: Pane): string => `${Math.round(views[pane].scale * 100)}%`;
  el('zoom-level').textContent = synced
    ? percent('left')
    : `${percent('left')} / ${percent('right')}`;
}

/** Apply `change` to the pane that was interacted with — or to both, while synced. */
function updateView(pane: Pane, change: (view: View) => View): void {
  lastActive = pane;
  userAdjusted = true;
  if (synced) {
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

  if (synced) {
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
  const pane = synced ? 'left' : lastActive;
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

window.addEventListener('message', async (event: MessageEvent<CompareMessage>) => {
  const message = event.data;
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

el('sync').addEventListener('click', () => {
  synced = !synced;
  el('sync').setAttribute('aria-pressed', String(synced));
  if (synced) {
    // The pane you were last working in wins; anything else would move a view you just set.
    views.left = { ...views[lastActive] };
    views.right = { ...views[lastActive] };
  }
  applyView();
});

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
