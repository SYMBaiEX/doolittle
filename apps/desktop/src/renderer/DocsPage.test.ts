import { describe, expect, it } from "vitest";
import { normalizeDoctorChecks, prioritizeDoctorChecks } from "./DocsPage";

describe("DocsPage diagnostics projection", () => {
  it("uses the native DiagnosticCheck summary and stable id", () => {
    expect(
      normalizeDoctorChecks({
        checks: [
          {
            id: "runtime",
            status: "pass",
            summary: "Runtime is available",
            detail: "The local service responded.",
          },
        ],
      }),
    ).toEqual([
      {
        id: "runtime",
        status: "pass",
        label: "Runtime is available",
        detail: "The local service responded.",
      },
    ]);
  });

  it("keeps failures visible before collapsing passing checks", () => {
    const checks = normalizeDoctorChecks({
      checks: [
        { id: "pass-1", status: "pass", summary: "A", detail: "ok" },
        { id: "pass-2", status: "pass", summary: "B", detail: "ok" },
        { id: "warn", status: "warn", summary: "Needs work", detail: "fix" },
      ],
    });

    expect(prioritizeDoctorChecks(checks, 2)).toEqual({
      visible: [checks[2], checks[0]],
      remaining: [checks[1]],
    });
  });
});
