import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compatibilityCatalogEntries } from "./CompatibilityPage";

describe("compatibilityCatalogEntries", () => {
  it("normalizes readiness checks into the shared compact catalog model", () => {
    expect(
      compatibilityCatalogEntries({
        checks: [
          { id: "native", name: "Native runtime", status: "ready" },
          {
            name: "Provider auth",
            status: "warn",
            detail: "Sign in before using this provider.",
          },
          { name: "Sandbox", status: "failed", message: "Engine offline." },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        id: "native",
        status: "Ready",
        tone: "good",
      }),
      expect.objectContaining({
        description: "Sign in before using this provider.",
        status: "Warn",
        tone: "warn",
      }),
      expect.objectContaining({
        description: "Engine offline.",
        status: "Failed",
        tone: "bad",
      }),
    ]);
  });

  it("returns a stable fallback row for malformed checks", () => {
    expect(compatibilityCatalogEntries({ checks: [null] })).toEqual([
      expect.objectContaining({
        id: "check-0",
        title: "Check",
        description: "No details",
        status: "Unknown",
      }),
    ]);
  });

  it("keeps the no-checks state compact beside the raw report", () => {
    const source = readFileSync(
      new URL("./CompatibilityPage.tsx", import.meta.url),
      "utf8",
    );
    const styles = readFileSync(
      new URL("./diagnostics-pages.css", import.meta.url),
      "utf8",
    );

    expect(source).toContain("<CompatibilityEmptyState");
    expect(source).toContain('className="page compatibility-page"');
    expect(styles).toMatch(
      /\.compatibility-empty\s*\{[^}]*min-height:\s*52px;[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto;/su,
    );
  });
});
