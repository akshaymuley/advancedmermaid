/**
 * The panel's DOM, shared by the real webview (`comparePanel.getHtml` wraps it in a CSP shell)
 * and the Playwright harness. Keeping one copy is the point: the harness only proves something
 * about the extension if it renders the extension's actual markup.
 *
 * No `<script>` here — the panel injects one with a nonce, and the harness loads its own bundle.
 */
export const PANEL_BODY_HTML = `<div id="toolbar">
  <span id="doc-title"></span>
  <div id="view-controls">
    <button id="fit" title="Fit both diagrams to their panes (0)">Fit</button>
    <button id="zoom-out" title="Zoom out (-)">&minus;</button>
    <span id="zoom-level">100%</span>
    <button id="zoom-in" title="Zoom in (+)">+</button>
    <button id="sync" aria-pressed="true" title="Pan and zoom both panes together">Sync</button>
    <button id="refresh" title="Re-read both sides, including the git ref">Refresh</button>
  </div>
</div>
<div id="panes">
  <section class="pane" data-side="left">
    <header><span id="left-label"></span><span class="badge" id="left-badge" hidden>!</span></header>
    <div class="canvas"><div class="viewport" id="left-viewport"></div></div>
  </section>
  <section class="pane" data-side="right">
    <header><span id="right-label"></span><span class="badge" id="right-badge" hidden>!</span></header>
    <div class="canvas"><div class="viewport" id="right-viewport"></div></div>
  </section>
</div>`;
