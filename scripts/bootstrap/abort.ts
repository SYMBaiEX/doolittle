export class BootstrapAbortError extends Error {
  constructor(message = "Bootstrap cancelled by user.") {
    super(message);
    this.name = "BootstrapAbortError";
  }
}

export interface BootstrapAbortHandle {
  abort: (reason?: string) => void;
  race: <T>(operation: Promise<T>) => Promise<T>;
  throwIfAborted: () => void;
}

export function createBootstrapAbortHandle(): BootstrapAbortHandle {
  const controller = new AbortController();
  let abortedError: BootstrapAbortError | null = null;

  const abort = (reason = "Bootstrap cancelled by user."): void => {
    if (!abortedError) {
      abortedError = new BootstrapAbortError(reason);
      controller.abort(abortedError);
    }
  };

  const throwIfAborted = (): void => {
    if (abortedError) {
      throw abortedError;
    }
  };

  const race = <T>(operation: Promise<T>): Promise<T> => {
    if (abortedError) {
      return Promise.reject(abortedError);
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (!abortedError || settled) {
          return;
        }
        settled = true;
        controller.signal.removeEventListener("abort", onAbort);
        reject(abortedError);
      };
      controller.signal.addEventListener("abort", onAbort, { once: true });

      void operation.then(
        (value) => {
          if (settled) {
            return;
          }
          settled = true;
          controller.signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error) => {
          if (settled) {
            return;
          }
          settled = true;
          controller.signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  };

  return {
    abort,
    race,
    throwIfAborted,
  };
}

export function isBootstrapAbortError(
  error: unknown,
): error is BootstrapAbortError {
  return error instanceof BootstrapAbortError;
}
