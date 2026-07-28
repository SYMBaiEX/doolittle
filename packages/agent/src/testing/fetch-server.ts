import { createServer } from "node:http";

export interface FetchTestServer {
  port: number;
  url: URL;
  stop(force?: boolean): void;
}

export async function serveFetchTest(
  handler: (request: Request) => Response | Promise<Response>,
): Promise<FetchTestServer> {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const method = incoming.method ?? "GET";
      const request = new Request(
        new URL(incoming.url ?? "/", `http://${incoming.headers.host}`),
        {
          method,
          headers: incoming.headers as HeadersInit,
          body:
            method === "GET" || method === "HEAD"
              ? undefined
              : Buffer.concat(chunks),
        },
      );
      const response = await handler(request);
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) => {
        outgoing.setHeader(name, value);
      });
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      outgoing.statusCode = 500;
      outgoing.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Test server did not bind to a TCP port.");
  }
  const url = new URL(`http://127.0.0.1:${address.port}`);
  return {
    port: address.port,
    url,
    stop() {
      server.closeAllConnections();
      server.close();
    },
  };
}
