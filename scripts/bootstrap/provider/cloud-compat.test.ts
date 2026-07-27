import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { checkCloudAvailability, normalizeCloudSiteUrl } from "./cloud-compat";

function asFetchMock(
  fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return fn as unknown as typeof fetch;
}

describe("cloud bootstrap compatibility helpers", () => {
  const originalCloudBaseUrl = process.env.ELIZAOS_CLOUD_BASE_URL;

  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
    delete process.env.ELIZAOS_CLOUD_BASE_URL;
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
    if (originalCloudBaseUrl === undefined) {
      delete process.env.ELIZAOS_CLOUD_BASE_URL;
    } else {
      process.env.ELIZAOS_CLOUD_BASE_URL = originalCloudBaseUrl;
    }
  });

  it("normalizes legacy cloud URLs to the canonical site base", () => {
    expect(normalizeCloudSiteUrl("http://www.elizacloud.ai/api/v1/")).toBe(
      "https://elizacloud.ai",
    );
    expect(
      normalizeCloudSiteUrl("https://api.elizacloud.ai/custom/api/v1"),
    ).toBe("https://elizacloud.ai");
  });

  it("preserves loopback origins while trimming API path suffixes", () => {
    expect(normalizeCloudSiteUrl("http://127.0.0.1:4000/api/v1")).toBe(
      "http://127.0.0.1:4000",
    );
    expect(normalizeCloudSiteUrl("http://localhost:3000/custom/api/v1/")).toBe(
      "http://localhost:3000/custom",
    );
  });

  it("probes the normalized compat availability endpoint and returns null when available", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          "https://elizacloud.ai/api/compat/availability",
        );
        expect(init?.method).toBe("GET");
        expect(init?.redirect).toBe("manual");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return new Response(JSON.stringify({ available: true }), {
          status: 200,
        });
      },
    );
    globalThis.fetch = asFetchMock(fetchMock);

    const result = await checkCloudAvailability("https://www.elizacloud.ai/");

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    globalThis.fetch = originalFetch;
  });

  it("returns the reported reason when the compat endpoint reports unavailable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = asFetchMock(
      mock(async () => {
        return new Response(
          JSON.stringify({
            available: false,
            reason: "Cloud service temporarily unavailable",
          }),
          { status: 200 },
        );
      }),
    );

    const result = await checkCloudAvailability("https://elizacloud.ai");

    expect(result).toBe("Cloud service temporarily unavailable");
    globalThis.fetch = originalFetch;
  });

  it("returns the HTTP status when the compat endpoint is auth-gated", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = asFetchMock(
      mock(async () => new Response("forbidden", { status: 403 })),
    );

    const result = await checkCloudAvailability("https://elizacloud.ai");

    expect(result).toBe("HTTP 403");
    globalThis.fetch = originalFetch;
  });
});
