/**
 * Loads the webview outside VS Code so it can be driven by a real browser.
 *
 * The webview is plain browser code — the only thing tying it to the host is `acquireVsCodeApi`
 * and the markup it expects to find. Stub the first, inject the second from the same constant
 * the real panel uses, and the module runs unmodified. Dev builds only; never packaged.
 */
import { PANEL_BODY_HTML } from '../../webview/panel-body';

interface HarnessWindow extends Window {
  acquireVsCodeApi(): { postMessage(message: unknown): void };
  /** Everything the webview has posted back to the "host", in order. */
  __posted: unknown[];
  /** Post a compare message, exactly as the panel would. */
  __compare(payload: { title: string; left: Side; right: Side }): void;
}

interface Side {
  label: string;
  content: string;
}

const harnessWindow = window as unknown as HarnessWindow;

harnessWindow.__posted = [];
harnessWindow.acquireVsCodeApi = () => ({
  postMessage: (message: unknown) => {
    harnessWindow.__posted.push(message);
  },
});

document.body.innerHTML = PANEL_BODY_HTML;

const SAMPLE = `flowchart TD
  A[Checkout] --> B[Install deps]
  B --> C[Typecheck]
  C --> D[Test]
  D --> E[Build]
  E --> F[Package]`;

const SAMPLE_CHANGED = `flowchart TD
  A[Checkout] --> B[Install deps]
  B --> C[Typecheck]
  C --> D[Test]
  D --> E[Build]
  E --> G[Sign]
  G --> F[Package]`;

// Dynamic so the markup above is in place before the webview module's top-level lookups run.
void import('../../webview/main').then(() => {
  harnessWindow.__compare = (payload) => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'compare', ...payload } }));
  };

  // Load something by default so the page is also useful opened by hand.
  harnessWindow.__compare({
    title: 'pipeline.mmd',
    left: { label: 'HEAD', content: SAMPLE },
    right: { label: 'Working Tree', content: SAMPLE_CHANGED },
  });
});
