import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("MCP control density", () => {
  it("keeps discovery and server diagnostics optional while tools stay ready", () => {
    const source = read("./McpControlPanel.tsx");

    expect(source).toContain(
      '<details className="mcp-control-disclosure mcp-control-servers">',
    );
    expect(source).toContain(
      '<details className="mcp-control-disclosure mcp-control-marketplace">',
    );
    expect(source).toContain(
      '<details className="mcp-control-disclosure mcp-control-browser" open>',
    );
  });
});
