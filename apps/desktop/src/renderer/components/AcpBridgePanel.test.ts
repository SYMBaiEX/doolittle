import { describe, expect, it } from "vitest";
import { acpBridgeStatusLabel, normalizeAcpTools } from "./AcpBridgePanel";

describe("ACP bridge panel helpers", () => {
  it("keeps only display-safe discovered tool fields", () => {
    expect(
      normalizeAcpTools([
        {
          name: "workspace.read",
          description: "Read a file",
          kind: "read",
          source: "doolittle",
          ignored: "value",
        },
        { description: "missing name" },
      ]),
    ).toEqual([
      {
        name: "workspace.read",
        description: "Read a file",
        kind: "read",
        source: "doolittle",
      },
    ]);
  });

  it("does not imply a configured bridge when status is missing or disabled", () => {
    expect(acpBridgeStatusLabel(undefined)).toBe("Checking");
    expect(
      acpBridgeStatusLabel({ enabled: false, detail: "", timeoutMs: 5000 }),
    ).toBe("Not configured");
    expect(
      acpBridgeStatusLabel({ enabled: true, detail: "", timeoutMs: 5000 }),
    ).toBe("Configured");
  });
});
