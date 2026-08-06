import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDoolittleCors,
  isSdkTerminalRequestAuthorized,
  sdkTerminalRunTokenError,
} from "./auth";

function nodeRequest(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as IncomingMessage;
}

function nodeResponse(): {
  response: ServerResponse;
  headers: Map<string, string | number | readonly string[]>;
} {
  const headers = new Map<string, string | number | readonly string[]>();
  const response = {
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    hasHeader(name: string) {
      return headers.has(name.toLowerCase());
    },
  } as unknown as ServerResponse;
  return { response, headers };
}

afterEach(() => vi.unstubAllEnvs());

describe("Eliza-native API security adapters", () => {
  it("uses Eliza's CORS policy and extends preflight for product PATCH routes", () => {
    vi.stubEnv("ELIZA_API_BIND", "127.0.0.1");
    const { response, headers } = nodeResponse();

    expect(
      applyDoolittleCors(
        nodeRequest({ origin: "http://localhost:5173" }),
        response,
        "/projects/one",
      ),
    ).toBe(true);
    expect(headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(headers.get("access-control-allow-methods")).toBe(
      "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
  });

  it("rejects origins rejected by Eliza's canonical origin policy", () => {
    vi.stubEnv("ELIZA_API_BIND", "127.0.0.1");
    const { response } = nodeResponse();

    expect(
      applyDoolittleCors(
        nodeRequest({ origin: "https://attacker.example" }),
        response,
        "/health",
      ),
    ).toBe(false);
  });

  it("accepts the dedicated terminal token only on the official route", () => {
    vi.stubEnv("ELIZA_TERMINAL_RUN_TOKEN", "terminal-secret");
    const request = nodeRequest({
      "x-eliza-terminal-token": "terminal-secret",
    });

    expect(isSdkTerminalRequestAuthorized(request, "/api/terminal/run")).toBe(
      true,
    );
    expect(isSdkTerminalRequestAuthorized(request, "/secrets")).toBe(false);
  });

  it("adapts Web Request bodies to Eliza's terminal rejection contract", () => {
    vi.stubEnv("ELIZA_TERMINAL_RUN_TOKEN", "terminal-secret");
    const request = new Request("http://localhost/api/terminal/run");

    expect(
      sdkTerminalRunTokenError(request, {
        terminalToken: "terminal-secret",
      }),
    ).toBeNull();
    expect(sdkTerminalRunTokenError(request)).toEqual({
      status: 401,
      reason:
        "Missing terminal token. Provide X-Eliza-Terminal-Token header or terminalToken in request body.",
    });
  });

  it("inherits Eliza's terminal shutdown when operator API auth is enabled", () => {
    vi.stubEnv("ELIZA_API_TOKEN", "operator-secret");
    vi.stubEnv("ELIZA_TERMINAL_RUN_TOKEN", "");

    expect(
      sdkTerminalRunTokenError(
        new Request("http://localhost/api/terminal/run"),
      ),
    ).toEqual({
      status: 403,
      reason:
        "Terminal run is disabled for token-authenticated API sessions. Set ELIZA_TERMINAL_RUN_TOKEN to enable command execution.",
    });
  });
});
