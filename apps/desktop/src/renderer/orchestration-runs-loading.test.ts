import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./OrchestrationPage.tsx", import.meta.url),
  "utf8",
);

describe("orchestration runs loading boundary", () => {
  it("keeps the runs panel out of the eager page import graph", () => {
    expect(source).toContain("const OrchestrationRunsPanel = lazy(() =>");
    expect(source).toContain(
      'import("./orchestration/OrchestrationRunsPanel")',
    );
    expect(source).not.toContain("import { OrchestrationRunsPanel } from");
  });

  it("provides an accessible loading state only for the runs tab", () => {
    expect(source).toContain('activeTab === "runs"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('role="status"');
    expect(source).toContain("Loading workflow tools…");
  });
});
