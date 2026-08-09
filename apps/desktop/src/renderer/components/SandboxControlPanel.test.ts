import { describe, expect, it } from "vitest";
import {
  normalizeLocalSandboxControl,
  normalizeLocalSandboxes,
  normalizeLocalSandboxResult,
} from "./SandboxControlPanel";

describe("local sandbox control helpers", () => {
  it("normalizes an unavailable local service without inventing capabilities", () => {
    expect(
      normalizeLocalSandboxControl({
        available: false,
        activeSandboxId: 42,
        supportsExecution: "yes",
        detail: "Sandbox service is unavailable.",
      }),
    ).toEqual({
      available: false,
      activeSandboxId: "",
      supportsExecution: false,
      detail: "Sandbox service is unavailable.",
    });
  });

  it("keeps only identified local sandboxes and supports an active multi-sandbox list", () => {
    expect(
      normalizeLocalSandboxes([
        { id: "python-1", template: "python", path: "/tmp/python-1" },
        { id: "node-1", template: "node-js", createdAt: "2026-08-09" },
        { template: "python" },
      ]),
    ).toEqual([
      {
        id: "python-1",
        template: "python",
        path: "/tmp/python-1",
        createdAt: "",
      },
      {
        id: "node-1",
        template: "node-js",
        path: "",
        createdAt: "2026-08-09",
      },
    ]);
  });

  it("bounds execution output and keeps stdout, stderr, and errors as text", () => {
    const result = normalizeLocalSandboxResult({
      success: false,
      stdout: "<strong>untrusted output</strong>",
      stderr: "failure details",
      error: { value: "Python exception" },
      language: "python",
      sandboxId: "python-1",
    });

    expect(result).toMatchObject({
      success: false,
      stdout: "<strong>untrusted output</strong>",
      stderr: "failure details",
      error: "Python exception",
      language: "python",
      sandboxId: "python-1",
    });
  });
});
