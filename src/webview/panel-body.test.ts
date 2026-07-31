import { describe, it, expect, beforeEach } from 'vitest';
import { PANEL_BODY_HTML } from './panel-body';

/**
 * The real panel and the Playwright harness both render this markup, and `main.ts` reaches into
 * it by id. A typo'd id would otherwise only surface as a null dereference at runtime.
 */
const REQUIRED_IDS = [
  'doc-title',
  'fit',
  'zoom-out',
  'zoom-level',
  'zoom-in',
  'sync',
  'refresh',
  'overlay',
  'opacity',
  'opacity-control',
  'pane-headers',
  'left-label',
  'right-label',
  'left-badge',
  'right-badge',
  'left-viewport',
  'right-viewport',
];

beforeEach(() => {
  document.body.innerHTML = PANEL_BODY_HTML;
});

describe('PANEL_BODY_HTML', () => {
  it.each(REQUIRED_IDS)('contains #%s', (id) => {
    expect(document.getElementById(id)).not.toBeNull();
  });

  it('has one canvas and one viewport per pane', () => {
    expect(document.querySelectorAll('.pane')).toHaveLength(2);
    expect(document.querySelectorAll('.canvas')).toHaveLength(2);
    expect(document.querySelectorAll('.viewport')).toHaveLength(2);
  });

  it('starts with both error badges hidden', () => {
    for (const side of ['left', 'right']) {
      expect(document.getElementById(`${side}-badge`)!.hasAttribute('hidden')).toBe(true);
    }
  });

  it('starts with sync switched on', () => {
    expect(document.getElementById('sync')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('starts side by side, with the opacity slider out of the way', () => {
    expect(document.getElementById('overlay')!.getAttribute('aria-pressed')).toBe('false');
    expect(document.getElementById('opacity-control')!.hasAttribute('hidden')).toBe(true);
  });

  it('keeps both pane labels in one header row, so overlay has somewhere to put them', () => {
    const headers = document.querySelectorAll('#pane-headers header');

    expect(headers).toHaveLength(2);
    expect(document.querySelector('.pane header')).toBeNull();
  });

  it('carries no script tag — the panel supplies one with a CSP nonce', () => {
    expect(PANEL_BODY_HTML).not.toMatch(/<script/i);
  });
});
