import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshOAuthCredentials } from "./oauth-refresh";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("refreshOAuthCredentials", () => {
  it("bounds a stalled OAuth refresh and returns unavailable", async () => {
    globalThis.fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );

    await expect(
      refreshOAuthCredentials({
        tokenUrl: "https://auth.example/token",
        clientId: "client",
        refreshToken: "refresh",
        timeoutMs: 5,
      }),
    ).resolves.toBeUndefined();
  });

  it("surfaces bounded network failures for strict callers", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network unavailable");
    });

    await expect(
      refreshOAuthCredentials({
        tokenUrl: "https://auth.example/token",
        clientId: "client",
        refreshToken: "refresh",
        throwOnFailure: true,
      }),
    ).rejects.toThrow("OAuth refresh request failed: network unavailable");
  });
});
