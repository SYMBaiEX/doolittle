import { describe, expect, it } from "vitest";
import { findDoolittleWorkspaceVersionMismatch } from "./workspace-version-policy";

describe("Doolittle workspace version policy", () => {
  it("accepts Doolittle workspaces aligned with the root release", () => {
    expect(
      findDoolittleWorkspaceVersionMismatch(
        { name: "@doolittle/contracts", version: "2.0.3-beta.7" },
        "2.0.3-beta.7",
      ),
    ).toBeUndefined();
  });

  it("reports missing or stale Doolittle workspace versions", () => {
    expect(
      findDoolittleWorkspaceVersionMismatch(
        { name: "@doolittle/contracts", version: "2.0.3-beta.6" },
        "2.0.3-beta.7",
      ),
    ).toEqual({
      name: "@doolittle/contracts",
      actual: "2.0.3-beta.6",
      expected: "2.0.3-beta.7",
    });
    expect(
      findDoolittleWorkspaceVersionMismatch(
        { name: "@doolittle/contracts" },
        "2.0.3-beta.7",
      )?.actual,
    ).toBe("unknown");
  });

  it("leaves external and declared Eliza compatibility packages alone", () => {
    expect(
      findDoolittleWorkspaceVersionMismatch(
        { name: "@elizaos/registry", version: "2.0.3-beta.7" },
        "2.0.3-beta.7",
      ),
    ).toBeUndefined();
  });
});
