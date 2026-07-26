export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Drop a pending call. */
  cancel(): void;
  /** Run a pending call now instead of waiting out the delay. */
  flush(): void;
}

/** Calls `fn` once `ms` have passed without another call, with the most recent arguments. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;

  const debounced = (...args: A): void => {
    pending = args;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      const args = pending!;
      pending = undefined;
      fn(...args);
    }, ms);
  };

  debounced.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    pending = undefined;
  };

  debounced.flush = (): void => {
    if (pending === undefined) {
      return;
    }
    const args = pending;
    debounced.cancel();
    fn(...args);
  };

  return debounced;
}
