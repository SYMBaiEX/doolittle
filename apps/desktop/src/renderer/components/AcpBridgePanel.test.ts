import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AcpBridgePanel,
  acpBridgeStatusLabel,
  acpBridgeSummary,
  normalizeAcpTools,
} from "./AcpBridgePanel";

describe("ACP bridge panel helpers", () => {
  it("uses solid bridge surfaces and density-aware SDK controls", () => {
    const markup = renderToStaticMarkup(
      createElement(AcpBridgePanel, { active: true }),
    );
    expect(markup).not.toContain("gradient(");
    expect(markup).not.toContain("text-[10px]");
    expect(markup).not.toContain("text-[11px]");
    expect(markup).toContain("!h-[var(--control-height)]");
    expect(markup).toContain("max-[760px]:!min-h-11");
    expect(markup).toContain('id="acp-bridge-heading"');
  });
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

  it("keeps an honest summary available when static reads fail", () => {
    expect(acpBridgeSummary(undefined, undefined, true)).toEqual({
      command: "Unavailable",
      detail: "Bridge status could not be read.",
      toolCount: 0,
      sessionCount: 0,
      lastProbe: "Not yet",
      lastError: "No bridge error recorded.",
    });
  });
});
