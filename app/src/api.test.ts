import { afterEach, expect, it, vi } from 'vitest';
import { connectStepStream } from './api';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('keeps one reconnect timer after repeated errors and disposes it', async () => {
  vi.useFakeTimers();
  const sources: { url: string; onerror?: () => void; onmessage?: (event: { data: string }) => void; close: ReturnType<typeof vi.fn> }[] = [];
  class Source {
    close = vi.fn();
    constructor(public url: string) { sources.push(this); }
  }
  vi.stubGlobal('EventSource', Source);
  const onStep = vi.fn();
  const stop = connectStepStream(onStep, 'session/one');
  expect(sources[0].url).toContain('?sessionId=session%2Fone');
  sources[0].onmessage!({ data: '{"kind":"text","text":"hi"}' });
  expect(onStep).toHaveBeenCalledTimes(1);
  sources[0].onerror!();
  sources[0].onerror!();
  await vi.advanceTimersByTimeAsync(1500);
  expect(sources).toHaveLength(2);
  sources[1].onerror!();
  stop();
  await vi.advanceTimersByTimeAsync(20000);
  expect(sources).toHaveLength(2);
});

it('does not reconnect a quiet stream solely because the document was hidden', async () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  const created = vi.fn();
  class Source { close = vi.fn(); constructor() { created(); } }
  vi.stubGlobal('EventSource', Source);
  const stop = connectStepStream(vi.fn());
  await vi.advanceTimersByTimeAsync(20000);
  expect(created).toHaveBeenCalledTimes(1);
  stop();
});
