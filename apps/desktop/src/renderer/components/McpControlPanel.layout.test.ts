import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("MCP control density", () => {
  it("keeps deep registries optional and uses the shared compact summary", () => {
    const source = read("./McpControlPanel.tsx");

    expect(source).toContain(
      '<details className="mcp-control-disclosure mcp-control-servers">',
    );
    expect(source).toContain(
      '<details className="mcp-control-disclosure mcp-control-marketplace">',
    );
    expect(source).toContain(
      '<details className="mcp-control-disclosure mcp-control-browser">',
    );
    expect(source).toContain("<CompactStatStrip");
    expect(source).not.toContain('className="mcp-control-summary"');
    expect(source).not.toContain('className="mcp-control-probe"');
  });
});
