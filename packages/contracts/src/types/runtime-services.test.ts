import { describe, expect, it } from "vitest";
import {
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_GITHUB_PLANNING_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
} from "./runtime-services";

describe("Doolittle runtime service identifiers", () => {
  it("does not claim service identifiers owned by official Eliza plugins", () => {
    expect([
      DOOLITTLE_BROWSER_SERVICE,
      DOOLITTLE_GITHUB_PLANNING_SERVICE,
      DOOLITTLE_MCP_SERVICE,
      DOOLITTLE_SHELL_SERVICE,
    ]).not.toEqual(expect.arrayContaining(["browser", "mcp", "shell"]));
  });

  it("keeps product projections explicitly namespaced", () => {
    expect(DOOLITTLE_BROWSER_SERVICE).toBe("doolittle_browser");
    expect(DOOLITTLE_GITHUB_PLANNING_SERVICE).toBe("doolittle_github_planning");
    expect(DOOLITTLE_MCP_SERVICE).toBe("doolittle_mcp");
    expect(DOOLITTLE_SHELL_SERVICE).toBe("doolittle_shell");
  });
});
