import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startVisiblePolling } from './visiblePolling';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('never overlaps slow requests and cancels future work on disposal', async () => {
  let finish!: () => void;
  const task = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  const stop = startVisiblePolling(task, 100);
  await vi.advanceTimersByTimeAsync(1000);
  expect(task).toHaveBeenCalledTimes(1);
  stop();
  finish();
  await vi.advanceTimersByTimeAsync(1000);
  expect(task).toHaveBeenCalledTimes(1);
});

it('stops hidden polling and refreshes immediately on becoming visible', async () => {
  const task = vi.fn();
  const stop = startVisiblePolling(task, 100);
  await vi.advanceTimersByTimeAsync(100);
  expect(task).toHaveBeenCalledTimes(2);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(task).toHaveBeenCalledTimes(2);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(100);
  expect(task).toHaveBeenCalledTimes(4);
  stop();
});

it('waits for visibility when mounted hidden and retries failures', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  const task = vi.fn().mockRejectedValue(new Error('offline'));
  const stop = startVisiblePolling(task, 100);
  await vi.advanceTimersByTimeAsync(1000);
  expect(task).not.toHaveBeenCalled();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(100);
  expect(task).toHaveBeenCalledTimes(2);
  stop();
});
