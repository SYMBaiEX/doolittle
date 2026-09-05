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

  it("keeps review loading behind its own lazy boundary", () => {
    expect(source).toContain("const ReviewPage = lazy(() =>");
    expect(source).toContain('import("./ReviewPage")');
    expect(source).toContain('activeTab === "review"');
    expect(source).toContain("Loading review tools…");
  });

  it("loads operations pages only when their Work tabs are selected", () => {
    expect(source).toContain("const AutomationsPage = lazy(() =>");
    expect(source).toContain('import("./AutomationsPage")');
    expect(source).toContain('activeTab === "automations"');
    expect(source).toContain("<AutomationsPage active={active} embedded />");
    expect(source).toContain("const GatewayPage = lazy(() =>");
    expect(source).toContain('import("./GatewayPage")');
    expect(source).toContain('activeTab === "inbox"');
    expect(source).toContain("<GatewayPage active={active} embedded />");
  });
});
