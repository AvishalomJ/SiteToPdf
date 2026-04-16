/**
 * Browser pool — manages Playwright browser instances for concurrent jobs.
 * Queues requests when capacity is reached.
 */

const MAX_CONCURRENT =
  parseInt(process.env.MAX_CONCURRENT_BROWSERS ?? '2', 10) || 2;
const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per job

let activeCount = 0;
const waitQueue: Array<{
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}> = [];

/**
 * Acquire a slot in the browser pool.
 * Resolves immediately if capacity is available, otherwise queues.
 * Rejects after JOB_TIMEOUT_MS.
 */
export function acquire(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waitQueue.findIndex((w) => w.resolve === resolve);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(new Error('Browser pool timeout — too many concurrent jobs'));
    }, JOB_TIMEOUT_MS);

    waitQueue.push({ resolve, reject, timer });
  });
}

/** Release a slot back to the pool, unblocking the next queued request. */
export function release(): void {
  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!;
    clearTimeout(next.timer);
    next.resolve();
  } else {
    activeCount = Math.max(0, activeCount - 1);
  }
}

/** Drain the pool — reject all queued requests and reset. */
export function shutdown(): void {
  for (const entry of waitQueue) {
    clearTimeout(entry.timer);
    entry.reject(new Error('Browser pool shutting down'));
  }
  waitQueue.length = 0;
  activeCount = 0;
}
