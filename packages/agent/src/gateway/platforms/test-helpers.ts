import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeliveryService } from "@/services/delivery-service";

type FetchHandler = (
  url: string,
  init?: RequestInit,
) => Promise<Response> | Response;

export function createDeliveryRoot(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), `doolittle-${prefix}-adapter-`));
  return {
    root,
    delivery: new DeliveryService(join(root, "delivery")),
    cleanup: () => rmSync(root, { force: true, recursive: true }),
  };
}

export function installFetchMock(handler: FetchHandler): () => void {
  const originalFetch = globalThis.fetch;
  const mockFetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" || input instanceof URL
          ? input.toString()
          : input.url;
      return handler(url, init);
    },
    {
      preconnect: async () => {},
    },
  ) as typeof fetch;

  globalThis.fetch = mockFetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}
