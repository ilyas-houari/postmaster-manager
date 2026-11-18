export type AnalysisProgress = {
  completed: number;
  total: number;
  successful: number;
  failed: number;
};

export type AnalysisResult<T> = {
  item: string;
  data?: T;
  error?: string;
};

export function createAnalysisRunner<T>(
  items: string[],
  process: (item: string, signal: AbortSignal) => Promise<T>,
  onResult: (result: AnalysisResult<T>) => void,
  onProgress: (progress: AnalysisProgress) => void,
  concurrency = 3
) {
  const controller = new AbortController();
  let index = 0;
  let completed = 0;
  let successful = 0;
  let failed = 0;
  let paused = false;
  let cancelled = false;

  const resumeWaiters: Array<() => void> = [];

  function notify() {
    onProgress({
      completed,
      total: items.length,
      successful,
      failed,
    });
  }

  async function waitIfPaused() {
    while (paused && !cancelled) {
      await new Promise<void>(resolve => {
        resumeWaiters.push(resolve);
      });
    }
  }

  function releaseWaiters() {
    for (const resolve of resumeWaiters.splice(0)) {
      resolve();
    }
  }

  async function worker() {
    while (!cancelled) {
      await waitIfPaused();
      if (cancelled) return;

      const current = index++;
      if (current >= items.length) return;

      const item = items[current];

      try {
        const data = await process(item, controller.signal);

        if (!cancelled) {
          successful++;
          onResult({ item, data });
        }
      } catch (error) {
        if (!cancelled) {
          failed++;
          onResult({
            item,
            error: error instanceof Error
              ? error.message
              : "Request failed",
          });
        }
      }

      if (!cancelled) {
        completed++;
        notify();
      }
    }
  }

  return {
    start: async () => {
      notify();
      await Promise.all(
        Array.from(
          { length: Math.min(Math.max(1, Math.floor(concurrency)), items.length) },
          () => worker()
        )
      );
    },

    pause: () => {
      paused = true;
    },

    resume: () => {
      paused = false;
      releaseWaiters();
    },

    cancel: () => {
      cancelled = true;
      controller.abort();
      releaseWaiters();
    },
  };
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  const signal = options.signal;

  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("Cancelled", "AbortError");
    }

    try {
      const response = await fetch(url, options);

      if (
        ![429, 503].includes(response.status) ||
        attempt >= retries
      ) {
        return response;
      }
    } catch (error) {
      if (signal?.aborted || attempt >= retries) throw error;
    }

    const delay = Math.min(1000 * 2 ** attempt, 8000);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, delay);

      function onAbort() {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(new DOMException("Cancelled", "AbortError"));
      }

      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
