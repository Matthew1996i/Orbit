// Poll only while visible, with at most one request in flight per subscriber.
export const startVisiblePolling = (task: () => void | Promise<unknown>, interval: number): (() => void) => {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (stopped || running || document.hidden) return;
    running = true;
    try { await task(); } catch { /* The next poll retries transient failures. */ }
    finally {
      running = false;
      if (!stopped && !document.hidden) timer = setTimeout(run, interval);
    }
  };
  const onVisibility = () => {
    clearTimeout(timer);
    if (!document.hidden) void run();
  };
  document.addEventListener('visibilitychange', onVisibility);
  void run();
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
};
