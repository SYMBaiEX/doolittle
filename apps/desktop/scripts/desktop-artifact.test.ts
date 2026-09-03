import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

import {
  assertDesktopArtifactAuditReport,
  DESKTOP_AUDIT_MAX_ATTEMPTS,
  DESKTOP_AUDIT_TIMEOUT_MS,
  runDesktopAudit,
} from "./desktop-artifact";

const shipped = [
  { name: "runtime-package", version: "1.2.3" },
  { name: "shared-name", version: "2.0.0" },
];

describe("desktop artifact advisory boundary", () => {
  it("rejects high findings for the exact shipped version", () => {
    expect(() =>
      assertDesktopArtifactAuditReport(
        {
          advisories: {
            one: {
              severity: "high",
              module_name: "runtime-package",
              findings: [{ version: "1.2.3" }],
            },
          },
        },
        shipped,
      ),
    ).toThrow("runtime-package");
  });

  it("ignores build-only packages and non-shipped versions", () => {
    expect(() =>
      assertDesktopArtifactAuditReport(
        {
          advisories: {
            build: {
              severity: "critical",
              module_name: "build-only-package",
              findings: [{ version: "9.0.0" }],
            },
            otherVersion: {
              severity: "high",
              module_name: "shared-name",
              findings: [{ version: "1.0.0" }],
            },
          },
        },
        shipped,
      ),
    ).not.toThrow();
  });

  it("fails closed on an unsupported or incomplete affected schema", () => {
    expect(() => assertDesktopArtifactAuditReport({}, shipped)).toThrow(
      "unsupported schema",
    );
    expect(() =>
      assertDesktopArtifactAuditReport(
        {
          advisories: {
            one: { severity: "high", module_name: "runtime-package" },
          },
        },
        shipped,
      ),
    ).toThrow("schema is invalid");
  });
});

describe("desktop artifact audit execution", () => {
  const mockedSpawnSync = vi.mocked(spawnSync);

  afterEach(() => {
    mockedSpawnSync.mockReset();
  });

  it("retries a bounded audit once and requires its complete JSON result", () => {
    mockedSpawnSync
      .mockReturnValueOnce({
        stdout: "",
        stderr: "registry connection stayed open",
        status: null,
        signal: "SIGKILL",
        error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
      } as unknown as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        stdout: JSON.stringify({ vulnerabilities: {} }),
        stderr: "",
        status: 0,
        signal: null,
      } as unknown as ReturnType<typeof spawnSync>);

    expect(runDesktopAudit("/repo")).toEqual({ vulnerabilities: {} });
    expect(mockedSpawnSync).toHaveBeenCalledTimes(2);
    expect(mockedSpawnSync).toHaveBeenLastCalledWith(
      "nub",
      ["audit", "--audit-level", "high", "--json"],
      expect.objectContaining({
        cwd: "/repo",
        timeout: DESKTOP_AUDIT_TIMEOUT_MS,
        killSignal: "SIGKILL",
      }),
    );
  });

  it("accepts a complete report even when Nub fails to close its registry socket", () => {
    mockedSpawnSync.mockReturnValue({
      stdout: JSON.stringify({ vulnerabilities: {} }),
      stderr: "registry connection stayed open",
      status: null,
      signal: "SIGKILL",
      error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
    } as unknown as ReturnType<typeof spawnSync>);

    expect(runDesktopAudit("/repo")).toEqual({ vulnerabilities: {} });
    expect(mockedSpawnSync).toHaveBeenCalledTimes(1);
  });

  it("fails closed after the bounded audit attempts are exhausted", () => {
    mockedSpawnSync.mockReturnValue({
      stdout: "",
      stderr: "registry connection stayed open",
      status: null,
      signal: "SIGKILL",
      error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
    } as unknown as ReturnType<typeof spawnSync>);

    expect(() => runDesktopAudit("/repo")).toThrow(
      `timed out after ${DESKTOP_AUDIT_TIMEOUT_MS}ms across ${DESKTOP_AUDIT_MAX_ATTEMPTS} attempts`,
    );
    expect(mockedSpawnSync).toHaveBeenCalledTimes(DESKTOP_AUDIT_MAX_ATTEMPTS);
  });
});
