import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./ToolsPage.tsx", import.meta.url),
  "utf8",
);

describe("ToolsPage MCP loading boundary", () => {
  it("keeps MCP code out of the initial Tools route until opened", () => {
    expect(source).not.toContain(
      'import { McpControlPanel } from "./components/McpControlPanel"',
    );
    expect(source).toContain('import("./components/McpControlPanel")');
    expect(source).toContain("const LazyMcpControlPanel = lazy(async () =>");
    expect(source).toContain(
      "<Suspense fallback={<McpControlPanelFallback />}",
    );
    expect(source).toMatch(
      /integrationsOpen \? \([\s\S]*<LazyMcpControlPanel active=\{active\} \/>/u,
    );
  });
});
