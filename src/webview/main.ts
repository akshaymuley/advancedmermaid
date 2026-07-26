import mermaid from 'mermaid';
import { isBlankDiagram } from './diagram-source';

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

const isDark =
  document.body.classList.contains('vscode-dark') ||
  document.body.classList.contains('vscode-high-contrast');

mermaid.initialize({
  startOnLoad: false,
  theme: isDark ? 'dark' : 'default',
  securityLevel: 'strict',
});

// --- Shared pan/zoom state (both panes stay in sync) ---
const view = { x: 40, y: 40, scale: 1 };

function applyView(): void {
  document.querySelectorAll<HTMLElement>('.viewport').forEach((el) => {
    el.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  });
}

/** Whether each pane currently holds a successful render, so a failed one can be kept. */
const hasGoodRender = { left: false, right: false };

/** Source last handed to each pane. A refresh re-posts both sides; only re-render what moved. */
const rendered: Record<'left' | 'right', string | undefined> = {
  left: undefined,
  right: undefined,
};

function setBadge(side: 'left' | 'right', message: string | undefined): void {
  const badge = document.getElementById(`${side}-badge`)!;
  badge.hidden = message === undefined;
  badge.title = message ?? '';
}

async function renderPane(side: 'left' | 'right', data: Side): Promise<void> {
  const label = document.getElementById(`${side}-label`)!;
  label.textContent = data.label;

  if (rendered[side] === data.content) {
    return;
  }
  rendered[side] = data.content;

  const viewport = document.getElementById(`${side}-viewport`)!;

  // Mermaid treats empty source as a parse error; an absent diagram isn't an error here.
  if (isBlankDiagram(data.content)) {
    viewport.innerHTML = '<div class="empty-diagram">(empty)</div>';
    hasGoodRender[side] = false;
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
    setBadge(side, undefined);
  }
}

window.addEventListener('message', async (event: MessageEvent<CompareMessage>) => {
  const message = event.data;
  if (message.type === 'compare') {
    document.getElementById('doc-title')!.textContent = message.title;
    await Promise.all([renderPane('left', message.left), renderPane('right', message.right)]);
    applyView();
  }
});

// --- Pan (drag) ---
let dragging = false;
let last = { x: 0, y: 0 };

document.querySelectorAll<HTMLElement>('.canvas').forEach((canvas) => {
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
  });

  // --- Zoom (wheel), anchored at the cursor ---
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      view.x = cx - (cx - view.x) * factor;
      view.y = cy - (cy - view.y) * factor;
      view.scale *= factor;
      applyView();
    },
    { passive: false }
  );
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) {
    return;
  }
  view.x += e.clientX - last.x;
  view.y += e.clientY - last.y;
  last = { x: e.clientX, y: e.clientY };
  applyView();
});

window.addEventListener('mouseup', () => {
  dragging = false;
});

document.getElementById('refresh')!.addEventListener('click', () => {
  vscodeApi.postMessage({ type: 'refresh' });
});

document.getElementById('reset')!.addEventListener('click', () => {
  view.x = 40;
  view.y = 40;
  view.scale = 1;
  applyView();
});

vscodeApi.postMessage({ type: 'ready' });
