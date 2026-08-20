import { describe, expect, it } from "vitest";
import {
  createHealthProbeResult,
  DEFAULT_DOOLITTLE_API_URL,
  normalizeHealthBody,
  resolveDoolittleApiUrl,
} from "./health-probe-core";

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
