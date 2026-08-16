export function throwIfMediaAborted(
  signal: AbortSignal | undefined,
  message = "Media operation was cancelled.",
): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;

  const error = new Error(message);
  error.name = "AbortError";
  throw error;
}

export function isMediaAbort(
  error: unknown,
  signal: AbortSignal | undefined,
): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function raceMediaAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return operation;
  throwIfMediaAborted(signal);

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      try {
        throwIfMediaAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
