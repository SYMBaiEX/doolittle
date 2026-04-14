import { describe, expect, it } from "bun:test";
import { describeTransportSummary } from "./transports";
import type { TransportInventory } from "./types";

describe("describeTransportSummary", () => {
  it("prefers native inventory detail when a transport is present", () => {
    const inventory: TransportInventory = [
      {
        platform: "discord",
        source: "official",
        configEnabled: true,
        gatewayEnabled: true,
        operational: true,
        reason: "live",
        detail: "Discord transport is live.",
      },
    ];

    expect(
      describeTransportSummary(
        "discord",
        "Discord",
        inventory,
        false,
        "fallback",
      ),
    ).toEqual({
      id: "discord",
      ready: true,
      detail:
        "Discord: source=official cfg=on gateway=on operational=yes reason=live",
    });
  });

  it("falls back to configured detail when inventory is absent", () => {
    expect(
      describeTransportSummary(
        "telegram",
        "Telegram",
        undefined,
        true,
        "Gateway config is enabled.",
      ),
    ).toEqual({
      id: "telegram",
      ready: true,
      detail: "Gateway config is enabled.",
    });
  });

  it("uses a default unavailable message when no data is present", () => {
    expect(describeTransportSummary("sms", "SMS")).toEqual({
      id: "sms",
      ready: false,
      detail: "SMS transport is not available.",
    });
  });
});
