import { describe, expect, it } from "vitest";
import {
  applyRequestCors,
  getRequestOriginPolicy,
  publishElizaApiPort,
} from "./server";

describe("publishElizaApiPort", () => {
  it("publishes the actual bound port for official in-process Eliza actions", () => {
    const env: NodeJS.ProcessEnv = { ELIZA_PORT: "2138" };

    publishElizaApiPort(48_123, env);

    expect(env.ELIZA_PORT).toBe("48123");
  });
});

describe("API browser origin policy", () => {
  function request(url: string, origin?: string): Request {
    return new Request(url, { headers: origin ? { origin } : {} });
  }

  it("keeps terminal requests without an Origin header allowed", () => {
    expect(
      getRequestOriginPolicy(request("http://127.0.0.1:3131/health")),
    ).toEqual({ allowed: true });
  });

  it("allows same-origin and loopback-to-loopback browser requests", () => {
    expect(
      getRequestOriginPolicy(
        request("http://192.168.1.10:3131/health", "http://192.168.1.10:3131"),
      ),
    ).toEqual({ allowed: true, origin: "http://192.168.1.10:3131" });
    expect(
      getRequestOriginPolicy(
        request("http://127.0.0.1:3131/health", "http://localhost:5173"),
      ),
    ).toEqual({ allowed: true, origin: "http://localhost:5173" });
  });

  it("rejects hostile, null, malformed, and non-loopback cross-origin requests", () => {
    for (const origin of [
      "https://attacker.example",
      "null",
      "not a URL",
      "http://localhost:5173/path",
    ]) {
      expect(
        getRequestOriginPolicy(request("http://127.0.0.1:3131/health", origin)),
      ).toEqual({ allowed: false });
    }
    expect(
      getRequestOriginPolicy(
        request("http://192.168.1.10:3131/health", "http://localhost:5173"),
      ),
    ).toEqual({ allowed: false });
  });

  it("adds exact CORS headers only for an allowed browser origin", () => {
    const browserResponse = applyRequestCors(
      new Response("ok"),
      "http://localhost:5173",
    );
    expect(browserResponse.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(browserResponse.headers.get("access-control-allow-origin")).not.toBe(
      "*",
    );
    expect(browserResponse.headers.get("access-control-allow-methods")).toBe(
      "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    expect(browserResponse.headers.get("access-control-allow-headers")).toBe(
      "Authorization, Content-Type, X-Eliza-Terminal-Token",
    );
    expect(browserResponse.headers.get("vary")).toBe("Origin");

    const terminalResponse = applyRequestCors(new Response("ok"));
    expect(
      terminalResponse.headers.get("access-control-allow-origin"),
    ).toBeNull();
  });
});
