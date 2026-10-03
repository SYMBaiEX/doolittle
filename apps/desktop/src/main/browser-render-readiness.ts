import type { BrowserWindow } from "electron";

const unavailable = () => new Error("Native first frame is unavailable.");
const MAX_IMAGE_DIMENSION = 16_384;

/** Navigation chronology + nonempty metadata, never target-frame content proof. */
export function installRenderReadiness(options: {
  window: BrowserWindow;
  acceptsCommit(url: string): boolean;
  invalidated(): void;
}) {
  const window = options.window;
  const contents = window.webContents;
  let epoch = 0;
  let committed = false;
  let ready = false;
  let stopped = false;
  const waiters = new Set<{
    resolve(epoch: number): void;
    reject(): void;
  }>();
  const listeners: Array<{
    emitter: NodeJS.EventEmitter;
    event: string;
    listener: (...args: unknown[]) => void;
  }> = [];
  const rejectWaiters = () => {
    for (const waiter of [...waiters]) waiter.reject();
  };
  const invalidate = () => {
    epoch++;
    committed = false;
    ready = false;
    rejectWaiters();
    try {
      options.invalidated();
    } catch {
      /* Cancellation remains fail closed. */
    }
  };
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    committed = false;
    ready = false;
    rejectWaiters();
    for (const { emitter, event, listener } of listeners) {
      try {
        emitter.removeListener(event, listener);
      } catch {
        /* Never mask the owned failure. */
      }
    }
    listeners.length = 0;
    try {
      options.invalidated();
    } catch {
      /* Cancellation remains fail closed. */
    }
  };
  const alive = () => {
    try {
      return !window.isDestroyed() && !contents.isDestroyed();
    } catch {
      return false;
    }
  };
  const add = (
    emitter: NodeJS.EventEmitter,
    event: string,
    listener: (...args: unknown[]) => void,
  ) => {
    listeners.push({ emitter, event, listener });
    emitter.on(event, listener);
  };
  const commit = (url: unknown) => {
    if (committed || ready) invalidate();
    committed = false;
    ready = false;
    if (typeof url === "string") {
      try {
        committed = options.acceptsCommit(url) === true;
      } catch {
        /* Fail closed. */
      }
    }
  };
  try {
    add(contents, "did-start-navigation", (details) => {
      if ((details as { isMainFrame?: unknown })?.isMainFrame === true)
        invalidate();
    });
    add(contents, "did-navigate", (_event, url) => commit(url));
    add(contents, "did-navigate-in-page", (_event, url, isMainFrame) => {
      if (isMainFrame !== true) return;
      invalidate();
      commit(url);
    });
    add(contents, "paint", (_event, _dirtyRect, image) => {
      if (stopped || !committed || !alive()) return;
      try {
        const native = image as Pick<
          Electron.NativeImage,
          "isEmpty" | "getSize"
        >;
        if (native.isEmpty()) return;
        const { width, height } = native.getSize();
        if (
          ![width, height].every(
            (value) =>
              Number.isInteger(value) &&
              value > 0 &&
              value <= MAX_IMAGE_DIMENSION,
          )
        )
          return;
        ready = true;
        for (const waiter of [...waiters]) waiter.resolve(epoch);
      } catch {
        /* No readiness from invalid native metadata, and no raw error. */
      }
    });
    add(window, "closed", dispose);
    add(contents, "destroyed", dispose);
    add(contents, "render-process-gone", dispose);
  } catch {
    dispose();
    throw unavailable();
  }
  return {
    dispose,
    assertAlive() {
      if (stopped || !alive()) throw unavailable();
    },
    assertCurrent(value: number) {
      if (stopped || !committed || !ready || value !== epoch || !alive())
        throw unavailable();
    },
    wait(signal: AbortSignal): Promise<number> {
      if (signal.aborted || stopped || !alive())
        return Promise.reject(unavailable());
      if (committed && ready) return Promise.resolve(epoch);
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          waiters.delete(waiter);
          signal.removeEventListener("abort", abort);
        };
        const waiter = {
          resolve(value: number) {
            cleanup();
            resolve(value);
          },
          reject() {
            cleanup();
            reject(unavailable());
          },
        };
        const abort = () => waiter.reject();
        waiters.add(waiter);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    },
  };
}

/** Abort the owned operation; an unfinished native promise never starts a next step. */
export function renderCaptureStep<T>(
  signal: AbortSignal,
  action: () => Promise<T>,
): Promise<T> {
  if (signal.aborted) return Promise.reject(unavailable());
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(unavailable());
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      void action().then(
        (value) => {
          cleanup();
          if (signal.aborted) reject(unavailable());
          else resolve(value);
        },
        (error: unknown) => {
          cleanup();
          reject(error);
        },
      );
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
