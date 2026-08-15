import { describe, expect, it } from "vitest";
import { findDoolittleWorkspaceVersionMismatch } from "./workspace-version-policy";

describe("Doolittle workspace version policy", () => {
  it("accepts Doolittle workspaces aligned with the root release", () => {
    expect(
      findDoolittleWorkspaceVersionMismatch(
        { name: "@doolittle/contracts", version: "0.1.0" },
        "0.1.0",
      ),
    ).toBeUndefined();
  });

  it("reports missing or stale Doolittle workspace versions", () => {
    expect(
      findDoolittleWorkspaceVersionMismatch(
        { name: "@doolittle/contracts", version: "0.0.9" },
        "0.1.0",
      ),
    ).toEqual({
      name: "@doolittle/contracts",
      actual: "0.0.9",
      expected: "0.1.0",
    });
    expect(
      findDoolittleWorkspaceVersionMismatch(
        { name: "@doolittle/contracts" },
        "0.1.0",
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
