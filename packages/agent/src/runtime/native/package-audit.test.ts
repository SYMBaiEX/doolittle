import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@/types/runtime";
import { getLatestRuntimeLine, getNativePackageAudit } from "./package-audit";

describe("native package audit", () => {
  it("keeps the runtime line and summary derived from package records", () => {
    const audit = getNativePackageAudit({} as EnvConfig);

    expect(getLatestRuntimeLine()).toMatchObject({
      alpha: "2.0.0-alpha.85",
      latest: "2.0.0-alpha.77",
    });
    expect(audit.packages.length).toBeGreaterThan(20);
    expect(audit.summary.alphaOnly).toBe(
      audit.packages.filter((entry) => entry.compatibility === "alpha-only")
        .length,
    );
    expect(audit.summary.vendored).toBe(
      audit.packages.filter(
        (entry) => entry.compatibility === "vendored-by-design",
      ).length,
    );
    expect(audit.activeCatalog.length).toBeGreaterThan(0);
  });
});
