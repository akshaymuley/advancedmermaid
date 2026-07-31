/**
 * The panel's DOM, shared by the real webview (`comparePanel.getHtml` wraps it in a CSP shell)
 * and the Playwright harness. Keeping one copy is the point: the harness only proves something
 * about the extension if it renders the extension's actual markup.
 *
 * The two pane labels live in one `#pane-headers` row rather than inside their panes. Side by
 * side that reads identically — two half-width cells above two half-width canvases — but the
 * stacked modes put the canvases on top of each other, where two stacked headers would be
 * unreadable.
 *
 * `#swipe-handle` is always present and shown by CSS only in swipe mode, rather than toggled with
 * the `hidden` attribute: an author `display` rule beats the UA stylesheet's `[hidden]`, which is
 * a trap this file has already sprung once.
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
    <select id="mode" aria-label="Comparison mode" title="How the two diagrams are shown">
      <option value="sideBySide">Side by side</option>
      <option value="overlay">Overlay</option>
      <option value="swipe">Swipe</option>
      <option value="blink">Blink</option>
    </select>
    <label id="opacity-control" hidden>
      <span class="visually-hidden">Opacity of the upper diagram</span>
      <input id="opacity" type="range" min="0" max="100" value="50"
             title="Opacity of the upper diagram">
    </label>
    <span id="blink-controls" hidden>
      <select id="blink-speed" aria-label="Blink speed" title="How fast the two diagrams alternate">
        <option value="3s">Slow</option>
        <option value="1.6s" selected>Medium</option>
        <option value="0.8s">Fast</option>
      </select>
      <button id="blink-pause" aria-pressed="false" title="Pause the alternation">Pause</button>
    </span>
    <button id="sync" aria-pressed="true" title="Pan and zoom both panes together">Sync</button>
    <button id="refresh" title="Re-read both sides, including the git ref">Refresh</button>
  </div>
</div>
<div id="pane-headers">
  <header data-side="left"><span id="left-label"></span><span class="badge" id="left-badge" hidden>!</span></header>
  <header data-side="right"><span id="right-label"></span><span class="badge" id="right-badge" hidden>!</span></header>
</div>
<div id="panes">
  <section class="pane" data-side="left">
    <div class="canvas"><div class="viewport" id="left-viewport"></div></div>
  </section>
  <section class="pane" data-side="right">
    <div class="canvas"><div class="viewport" id="right-viewport"></div></div>
  </section>
  <div id="swipe-handle" role="separator" tabindex="0" aria-orientation="vertical"
       aria-label="Swipe divider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div>
</div>`;
