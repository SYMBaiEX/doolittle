import { describe, expect, it } from "bun:test";
import { TOOL_CONTROL_PLANE_CATALOG } from "./index";

describe("TOOL_CONTROL_PLANE_CATALOG", () => {
  it("keeps unique ids across status, ownership, automation, and catalog projections", () => {
    const ids = TOOL_CONTROL_PLANE_CATALOG.map((tool) => tool.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("gateway.send");
    expect(ids).toContain("plugins.native");
    expect(ids).toContain("runtime.ownership");
    expect(ids).toContain("automation.trajectory.package");
    expect(ids).toContain("skills.install");
  });

  it("preserves the top-level control plane ordering for status surfaces", () => {
    expect(TOOL_CONTROL_PLANE_CATALOG[0]?.id).toBe("gateway.send");
    expect(TOOL_CONTROL_PLANE_CATALOG[1]?.id).toBe("acp.status");
    expect(
      TOOL_CONTROL_PLANE_CATALOG.findIndex((tool) => tool.id === "mcp.bridge"),
    ).toBeGreaterThan(
      TOOL_CONTROL_PLANE_CATALOG.findIndex(
        (tool) => tool.id === "automation.cron",
      ),
    );
  });
});
