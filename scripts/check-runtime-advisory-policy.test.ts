import { describe, expect, it } from "vitest";
import { assertRuntimeAdvisoryPolicyCoverage } from "./check-runtime-advisory-policy";

describe("runtime advisory policy coverage", () => {
  it("accepts reviewed production high advisories", () => {
    expect(() =>
      assertRuntimeAdvisoryPolicyCoverage({
        advisories: {
          known: {
            severity: "high",
            url: "https://github.com/advisories/GHSA-vxpw-j846-p89q",
            vulnerable_versions: "<6.27.0",
          },
          low: {
            severity: "low",
            url: "https://github.com/advisories/GHSA-not-reviewed-low",
          },
        },
      }),
    ).not.toThrow();
  });

  it("fails when a new high advisory has not been reviewed", () => {
    expect(() =>
      assertRuntimeAdvisoryPolicyCoverage({
        advisories: {
          new: {
            severity: "high",
            url: "https://github.com/advisories/GHSA-new1-high-new2",
          },
        },
      }),
    ).toThrow("GHSA-NEW1-HIGH-NEW2");
  });

  it("fails closed when a high advisory has no canonical GHSA URL", () => {
    expect(() =>
      assertRuntimeAdvisoryPolicyCoverage({
        advisories: { malformed: { severity: "high" } },
      }),
    ).toThrow("MISSING-GHSA-URL");
  });

  it("fails closed when a reviewed advisory expands its vulnerable range", () => {
    expect(() =>
      assertRuntimeAdvisoryPolicyCoverage({
        advisories: {
          changed: {
            severity: "high",
            url: "https://github.com/advisories/GHSA-vxpw-j846-p89q",
            vulnerable_versions: "<6.30.0",
          },
        },
      }),
    ).toThrow("changed range");
  });
});
