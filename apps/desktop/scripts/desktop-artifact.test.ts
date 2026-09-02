import { describe, expect, it } from "vitest";
import { assertDesktopArtifactAuditReport } from "./desktop-artifact";

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
