const responsePostCommit = new WeakMap<Response, () => void>();

/** Registers work that may start only after Node finished writing the response. */
export function onResponseCommitted(
  response: Response,
  callback: () => void,
): Response {
  responsePostCommit.set(response, callback);
  return response;
}

export function runResponsePostCommit(response: Response): void {
  const callback = responsePostCommit.get(response);
  responsePostCommit.delete(response);
  callback?.();
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function streamSse(
  stream: (
    emit: (event: string, data: unknown) => Promise<void>,
  ) => Promise<void>,
  options?: {
    signal?: AbortSignal;
    /** Abort server-side work when the client abandons the stream. */
    onCancel?: () => void;
  },
): Response {
  const encoder = new TextEncoder();
  let closed = false;
  let writable: Promise<void> | undefined;
  let resume: (() => void) | undefined;
  let removeAbortListener: (() => void) | undefined;

  function wake(): void {
    const resolve = resume;
    writable = undefined;
    resume = undefined;
    resolve?.();
  }

  function close(cancelled: boolean): boolean {
    if (closed) return false;
    closed = true;
    removeAbortListener?.();
    wake();
    if (cancelled) options?.onCancel?.();
    return true;
  }

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const signal = options?.signal;
        const abort = () => {
          if (close(true)) controller.close();
        };
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        removeAbortListener = () => signal?.removeEventListener("abort", abort);
        const emit = async (event: string, data: unknown): Promise<void> => {
          while (!closed && (controller.desiredSize ?? 0) <= 0) {
            writable ??= new Promise<void>((resolve) => {
              resume = resolve;
            });
            await writable;
          }
          if (closed) return;
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        };
        // Do not return the producer promise from start. The consumer must
        // be able to trigger pull while the producer waits for capacity.
        void (async () => {
          try {
            await stream(emit);
          } catch {
            await emit("error", { message: "Stream failed." });
          } finally {
            if (close(false)) controller.close();
          }
        })();
      },
      pull: wake,
      cancel() {
        close(true);
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    },
  );
}
