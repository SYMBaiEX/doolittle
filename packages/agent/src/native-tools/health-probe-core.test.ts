import { createServer, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import {
  createHealthProbeRequest,
  createHealthProbeResult,
  DEFAULT_DOOLITTLE_API_URL,
  normalizeHealthBody,
  resolveDoolittleApiUrl,
} from "./health-probe-core";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a loopback TCP listener.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

describe("Doolittle native health probe", () => {
  it("targets the canonical health route with bounded configuration", () => {
    expect(resolveDoolittleApiUrl(undefined, undefined)).toBe(
      `${DEFAULT_DOOLITTLE_API_URL}/health`,
    );
    expect(resolveDoolittleApiUrl(undefined, "4312")).toBe(
      "http://127.0.0.1:4312/health",
    );
    expect(
      resolveDoolittleApiUrl("https://agent.example.test/base", undefined),
    ).toBe("https://agent.example.test/health");
  });

  it("rejects executable and credential-bearing URLs", () => {
    expect(() =>
      resolveDoolittleApiUrl("file:///tmp/state", undefined),
    ).toThrow("must use http or https");
    expect(() =>
      resolveDoolittleApiUrl("https://operator:secret@example.test", undefined),
    ).toThrow("must not contain credentials");
  });

  it("sends trimmed credentials only to the default configured local origin", () => {
    expect(
      createHealthProbeRequest(
        "http://127.0.0.1:3000/health",
        " token ",
        undefined,
        undefined,
      ),
    ).toEqual({
      headers: { authorization: "Bearer token" },
      redirect: "error",
    });
    expect(
      createHealthProbeRequest(
        "http://127.0.0.1:4312/health",
        "token",
        "4312",
        undefined,
      ).headers,
    ).toEqual({ authorization: "Bearer token" });
  });

  it.each([
    "https://attacker.example/health",
    "http://127.0.0.1:4312/health",
    "http://localhost:3000/health",
    "http://[::1]:3000/health",
    "https://127.0.0.1:3000/health",
  ])("never inherits the default token trust for %s", (endpoint) => {
    expect(
      createHealthProbeRequest(endpoint, "token", undefined, undefined),
    ).toEqual({ headers: {}, redirect: "error" });
  });

  it("preserves unauthenticated remote probes and explicit HTTPS auth opt-in", () => {
    expect(
      createHealthProbeRequest(
        "https://agent.example:8443/health",
        undefined,
        undefined,
        undefined,
      ),
    ).toEqual({ headers: {}, redirect: "error" });
    expect(
      createHealthProbeRequest(
        "https://agent.example:8443/health",
        "token",
        undefined,
        "https://agent.example:8443",
      ).headers,
    ).toEqual({ authorization: "Bearer token" });
    expect(
      createHealthProbeRequest(
        "https://agent.example:8444/health",
        "token",
        undefined,
        "https://agent.example:8443",
      ).headers,
    ).toEqual({});
  });

  it("allows explicit numeric IPv6 loopback auth without trusting aliases", () => {
    expect(
      createHealthProbeRequest(
        "http://[::1]:4312/health",
        "token",
        undefined,
        "http://[::1]:4312",
      ).headers,
    ).toEqual({ authorization: "Bearer token" });
  });

  it("rejects invalid explicit trust configuration even without a token", () => {
    expect(() =>
      createHealthProbeRequest(
        "http://agent.example/health",
        undefined,
        undefined,
        "http://agent.example",
      ),
    ).toThrow("requires an HTTPS origin");
  });

  it.each([
    "http://agent.example",
    "http://localhost:4312",
    "file:///tmp/state",
    "https://operator:secret@agent.example",
    "https://@agent.example",
    "https://agent.example/base",
    "https://agent.example?query=1",
    "https://agent.example#fragment",
    "not a URL",
  ])("fails closed for invalid or insecure auth origin %s", (origin) => {
    expect(() =>
      createHealthProbeRequest(
        "https://agent.example/health",
        "token",
        undefined,
        origin,
      ),
    ).toThrow();
  });

  it("authenticates the trusted server but never follows its cross-origin redirect", async () => {
    let redirectedRequests = 0;
    let receivedAuthorization: string | undefined;
    const target = createServer((_request, response) => {
      redirectedRequests += 1;
      response.end("must not be reached");
    });
    const targetOrigin = await listen(target);
    const trusted = createServer((request, response) => {
      receivedAuthorization = request.headers.authorization;
      response.writeHead(302, { location: `${targetOrigin}/health` }).end();
    });
    try {
      const trustedOrigin = await listen(trusted);
      const endpoint = `${trustedOrigin}/health`;
      await expect(
        fetch(endpoint, {
          ...createHealthProbeRequest(
            endpoint,
            "token",
            undefined,
            trustedOrigin,
          ),
          signal: AbortSignal.timeout(2_000),
        }),
      ).rejects.toThrow();
      expect(receivedAuthorization).toBe("Bearer token");
      expect(redirectedRequests).toBe(0);
    } finally {
      await Promise.all([close(trusted), close(target)]);
    }
  });

  it("normalizes and bounds response text without interpreting runtime data", () => {
    expect(normalizeHealthBody('  {"status":"ok"}  ')).toBe('{"status":"ok"}');
    expect(normalizeHealthBody("   ")).toBe("");
    expect(normalizeHealthBody("x".repeat(3_000))).toBe("x".repeat(2_000));
  });

  it("derives success only from a successful HTTP status", () => {
    expect(
      createHealthProbeResult(
        "http://127.0.0.1:3000/health",
        200,
        '{"ready":true}',
      ),
    ).toEqual({
      ok: true,
      status: 200,
      endpoint: "http://127.0.0.1:3000/health",
      body: '{"ready":true}',
    });
    expect(
      createHealthProbeResult("http://127.0.0.1:3000/health", 503, "starting")
        .ok,
    ).toBe(false);
  });
});
