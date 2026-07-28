import { describe, expect, it } from "vitest";
import type { EnvConfig } from "@/types/runtime";
import { getLatestRuntimeLine, getNativePackageAudit } from "./package-audit";
import { getNativePackageAuditRecords } from "./package-audit/records";

describe("native package audit", () => {
  it("keeps the runtime line and summary derived from package records", () => {
    const audit = getNativePackageAudit({} as EnvConfig);

    expect(getLatestRuntimeLine()).toMatchObject({
      beta: "2.0.3-beta.7",
      latest: "1.7.2",
    });
    expect(audit.packages.length).toBeGreaterThan(20);
    expect(audit.summary.betaOnly).toBe(
      audit.packages.filter((entry) => entry.compatibility === "beta-only")
        .length,
    );
    expect(audit.summary.vendored).toBe(
      audit.packages.filter(
        (entry) => entry.compatibility === "vendored-by-design",
      ).length,
    );
    expect(audit.activeCatalog.length).toBeGreaterThan(0);
  });

  it("returns a defensive copy of the static package records", () => {
    const original = getNativePackageAuditRecords();
    const snapshot = getNativePackageAuditRecords();

    snapshot.pop();

    expect(snapshot).not.toBe(original);
    expect(original.length).toBeGreaterThan(snapshot.length);
    expect(original[0]?.packageName).toBe("elizaos");
    expect(original.at(-1)?.packageName).toBe("@doolittle/plugin-autocoder");
  });
});
