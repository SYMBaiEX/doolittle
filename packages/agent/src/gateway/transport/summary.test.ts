import { describe, expect, it } from "bun:test";
import { summarizeTransportInventory } from "./summary";

describe("summarizeTransportInventory", () => {
  const inventory = [
    {
      platform: "telegram",
      source: "official",
      configEnabled: true,
      gatewayEnabled: true,
      operational: true,
      reason: "ready",
      detail: "telegram ready",
    },
    {
      platform: "discord",
      source: "vendored",
      configEnabled: false,
      gatewayEnabled: false,
      operational: false,
      reason: "missing",
      detail: "discord missing",
    },
    {
      platform: "sms",
      source: "custom",
      configEnabled: false,
      gatewayEnabled: true,
      operational: false,
      reason: "custom",
      detail: "sms custom",
    },
    {
      platform: "api",
      source: "product",
      configEnabled: true,
      gatewayEnabled: true,
      operational: true,
      reason: "native",
      detail: "api native",
    },
  ] as const;

  it("renders diagnostics output", () => {
    const summary = summarizeTransportInventory(
      inventory as unknown as Parameters<typeof summarizeTransportInventory>[0],
      "diagnostics",
    );

    expect(summary).toContain("operational=2/4 configured=2 gatewayEnabled=3");
    expect(summary).toContain("official=1 vendored=1 custom=1 product=1");
    expect(summary).toContain("telegram:source=official");
  });

  it("renders cli output", () => {
    const summary = summarizeTransportInventory(
      inventory as unknown as Parameters<typeof summarizeTransportInventory>[0],
      "cli",
    );

    expect(summary).toContain("Inventory totals:");
    expect(summary).toContain("Sources:");
    expect(summary).toContain("- discord vendored");
  });

  it("renders chat output by default", () => {
    const summary = summarizeTransportInventory(
      inventory as unknown as Parameters<typeof summarizeTransportInventory>[0],
    );

    expect(summary).toContain("inventory totals:");
    expect(summary).toContain("sources:");
  });
});
