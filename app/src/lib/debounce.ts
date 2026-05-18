/**
 * Trailing-edge debounce. Returns a wrapped function that delays
 * invocation until `ms` milliseconds have passed since the most recent
 * call; bursts collapse into one trailing call with the last arguments.
 *
 * `cancel()` drops any pending invocation. Always call it from the
 * cleanup of a React effect that owns the debounced function — without
 * it, an unmount during the debounce window leaves a stale call to
 * fire after the component is gone.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
): { (...args: Args): void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}
