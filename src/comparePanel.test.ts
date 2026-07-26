import { describe, it, expect } from 'vitest';
import { getNonce } from './comparePanel';

describe('getNonce', () => {
  it('returns a 32-character string', () => {
    expect(getNonce()).toHaveLength(32);
  });

  it('uses only characters that are safe inside a CSP nonce attribute', () => {
    for (let i = 0; i < 50; i++) {
      expect(getNonce()).toMatch(/^[A-Za-z0-9]{32}$/);
    }
  });

  it('produces a different value on each call', () => {
    const nonces = new Set(Array.from({ length: 100 }, () => getNonce()));
    expect(nonces.size).toBe(100);
  });
});
