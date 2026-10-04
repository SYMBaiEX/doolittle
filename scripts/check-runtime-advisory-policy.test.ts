import { describe, expect, it } from "vitest";
import {
  assertRuntimeAdvisoryPolicyCoverage,
  REVIEWED_RUNTIME_HIGH_ADVISORIES,
} from "./check-runtime-advisory-policy";

describe("runtime advisory policy coverage", () => {
  it.each([
    ["GHSA-58MR-GQGX-XQ4G", "=3.1.6"],
    ["GHSA-7Q85-XJ36-VMFC", "<0.6.1"],
    ["GHSA-8238-W5PM-2374", "<=0.6.0"],
    ["GHSA-J5F4-CC29-5X44", "<=0.6.0"],
    ["GHSA-QW65-CVWX-89V3", ">=3.0.0 <3.1.7"],
    ["GHSA-RCW4-F5RP-G42V", "<=0.6.0"],
    ["GHSA-RFGV-XXQX-MFG5", ">=8.0.0 <8.10.2"],
    ["GHSA-RGJ7-G3M4-5G8C", "<0.35.4"],
    ["GHSA-VFJ7-8CJW-P6XM", "<=3.0.3"],
    ["GHSA-VP8M-P9JH-Q5PM", ">=8.10.0 <8.10.2"],
    ["GHSA-W293-VG96-WGC3", ">=8.0.0 <8.10.2"],
    ["GHSA-X8MW-P69M-V3MX", ">=1.0.0 <3.2.1"],
  ])(
    "keeps the reviewed %s range exact and rejects later expansion",
    (id, range) => {
      expect(REVIEWED_RUNTIME_HIGH_ADVISORIES.get(id)).toBe(range);
      const advisory = {
        severity: "high",
        url: `https://github.com/advisories/${id}`,
      };
      expect(() =>
        assertRuntimeAdvisoryPolicyCoverage({
          advisories: {
            reviewed: { ...advisory, vulnerable_versions: range },
          },
        }),
      ).not.toThrow();
      expect(() =>
        assertRuntimeAdvisoryPolicyCoverage({
          advisories: {
            changed: {
              ...advisory,
              vulnerable_versions: `${range} || >=99.0.0`,
            },
          },
        }),
      ).toThrow("changed range");
    },
  );

  it("accepts reviewed production high advisories", () => {
    expect(() =>
      assertRuntimeAdvisoryPolicyCoverage({
        advisories: {
          known: {
            severity: "high",
            url: "https://github.com/advisories/GHSA-vxpw-j846-p89q",
            vulnerable_versions: "<6.27.0",
          },
          tomlRecursion: {
            severity: "high",
            url: "https://github.com/advisories/GHSA-82x6-q7mm-w9cf",
            vulnerable_versions: "<4.2.0",
          },
          tomlPrototypePollution: {
            severity: "high",
            url: "https://github.com/advisories/GHSA-v5mp-jgw5-2x6j",
            vulnerable_versions: "<4.1.2",
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
