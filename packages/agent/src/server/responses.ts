export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export function sse(events: Array<{ event: string; data: unknown }>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const entry of events) {
        controller.enqueue(
          encoder.encode(
            `event: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`,
          ),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    },
  });
}

export function streamSse(
  stream: (
    emit: (event: string, data: unknown) => Promise<void>,
  ) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  let closed = false;
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = async (event: string, data: unknown): Promise<void> => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
          } catch {
            // Bun cancels the stream when a client disconnects. A model or
            // tool callback can race that cancellation; do not turn it into
            // an uncaught process-level failure.
            closed = true;
          }
        };
        try {
          await stream(emit);
        } catch (error) {
          await emit("error", {
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          if (!closed) {
            try {
              controller.close();
            } catch {
              closed = true;
            }
          }
        }
      },
      cancel() {
        closed = true;
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      },
    },
  );
}
