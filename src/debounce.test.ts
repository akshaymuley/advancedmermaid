import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('does not call through immediately', () => {
    const spy = vi.fn();
    debounce(spy, 300)();
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls through once the quiet period elapses', () => {
    const spy = vi.fn();
    debounce(spy, 300)();
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('collapses a burst into a single call', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 300);
    for (let i = 0; i < 10; i++) {
      debounced();
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('passes the arguments from the most recent call', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 300);
    debounced('first');
    debounced('second');
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledWith('second');
  });

  it('cancel() prevents a pending call', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 300);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('can be reused after a cancel', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 300);
    debounced();
    debounced.cancel();
    debounced();
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('flush() runs a pending call immediately', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 300);
    debounced('now');
    debounced.flush();
    expect(spy).toHaveBeenCalledWith('now');
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('flush() is a no-op when nothing is pending', () => {
    const spy = vi.fn();
    debounce(spy, 300).flush();
    expect(spy).not.toHaveBeenCalled();
  });
});
