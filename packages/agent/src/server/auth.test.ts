import { describe, expect, it } from "vitest";
import {
  isApiRequestAuthorized,
  isLoopbackHost,
  isSdkTerminalRequestAuthorized,
  sdkTerminalRunTokenError,
} from "./auth";

function request(authorization?: string): Request {
  return new Request("http://x/secrets", {
    headers: authorization ? { authorization } : {},
  });
}

describe("isLoopbackHost", () => {
  it("recognizes loopback hosts", () => {
    for (const h of ["127.0.0.1", "localhost", "::1", "127.5.5.5"]) {
      expect(isLoopbackHost(h)).toBe(true);
    }
  });
  it("rejects all-interfaces and LAN hosts", () => {
    for (const h of ["0.0.0.0", "192.168.1.10", "10.0.0.5", "example.com"]) {
      expect(isLoopbackHost(h)).toBe(false);
    }
  });
});

describe("isApiRequestAuthorized", () => {
  it("allows any request on a loopback bind (OS-restricted to local)", () => {
    expect(isApiRequestAuthorized({ host: "127.0.0.1" }, request())).toBe(true);
    expect(isApiRequestAuthorized({ host: "localhost" }, request())).toBe(true);
  });

  it("denies all requests on a non-loopback bind with no token (fail-safe)", () => {
    expect(isApiRequestAuthorized({ host: "0.0.0.0" }, request())).toBe(false);
    expect(
      isApiRequestAuthorized({ host: "0.0.0.0" }, request("Bearer anything")),
    ).toBe(false);
  });

  it("requires a matching bearer token on a non-loopback bind", () => {
    const config = { host: "0.0.0.0", apiToken: "s3cret" };
    expect(isApiRequestAuthorized(config, request("Bearer s3cret"))).toBe(true);
    expect(isApiRequestAuthorized(config, request("Bearer wrong"))).toBe(false);
    expect(isApiRequestAuthorized(config, request())).toBe(false);
    expect(isApiRequestAuthorized(config, request("s3cret"))).toBe(false);
  });
});

describe("SDK terminal authorization", () => {
  it("accepts the dedicated token only on the official terminal route", () => {
    const terminalRequest = new Request("http://x/api/terminal/run", {
      headers: { "x-eliza-terminal-token": "terminal-secret" },
    });
    const unrelatedRequest = new Request("http://x/secrets", {
      headers: { "x-eliza-terminal-token": "terminal-secret" },
    });

    expect(
      isSdkTerminalRequestAuthorized(terminalRequest, "terminal-secret"),
    ).toBe(true);
    expect(
      isSdkTerminalRequestAuthorized(unrelatedRequest, "terminal-secret"),
    ).toBe(false);
    expect(
      isSdkTerminalRequestAuthorized(terminalRequest, "wrong-secret"),
    ).toBe(false);
  });

  it("supports the SDK body token and returns stable rejection reasons", () => {
    const terminalRequest = new Request("http://x/api/terminal/run");

    expect(
      sdkTerminalRunTokenError(
        terminalRequest,
        { terminalToken: "terminal-secret" },
        "terminal-secret",
      ),
    ).toBeNull();
    expect(
      sdkTerminalRunTokenError(terminalRequest, {}, "terminal-secret"),
    ).toEqual({
      status: 401,
      reason:
        "Missing terminal token. Provide X-Eliza-Terminal-Token header or terminalToken in request body.",
    });
    expect(
      sdkTerminalRunTokenError(
        terminalRequest,
        { terminalToken: "wrong" },
        "terminal-secret",
      ),
    ).toEqual({ status: 401, reason: "Invalid terminal token." });
  });
});
