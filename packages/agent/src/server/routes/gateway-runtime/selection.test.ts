import { describe, expect, it } from "bun:test";
import {
  normalizeGatewayReason,
  resolveGatewayPlatformSelection,
} from "./selection";
import {
  getGatewayMessageEditValidationError,
  getGatewayProgressiveValidationError,
  getGatewayReplayValidationError,
} from "./validators";

describe("gateway runtime route helpers", () => {
  it("normalizes platform selection and reason values", () => {
    expect(resolveGatewayPlatformSelection(undefined)).toBe("all");
    expect(resolveGatewayPlatformSelection(" all ")).toBe("all");
    expect(resolveGatewayPlatformSelection("telegram")).toBe("telegram");
    expect(normalizeGatewayReason(undefined)).toBe("api");
    expect(normalizeGatewayReason("  manual  ")).toBe("manual");
  });

  it("validates replay payloads", () => {
    expect(getGatewayReplayValidationError({})).toBe("recordId is required");
    expect(getGatewayReplayValidationError({ recordId: "record-1" })).toBe(
      undefined,
    );
  });

  it("validates message edit payloads", () => {
    expect(getGatewayMessageEditValidationError({ deliveryId: "d-1" })).toBe(
      "deliveryId and text are required.",
    );
    expect(
      getGatewayMessageEditValidationError({
        deliveryId: "d-1",
        text: "hello",
      }),
    ).toBe(undefined);
  });

  it("validates progressive message payloads", () => {
    expect(
      getGatewayProgressiveValidationError({
        platform: "api",
        roomId: "room-1",
        parts: ["one"],
      }),
    ).toBe("platform, roomId, and at least two message parts are required.");
    expect(
      getGatewayProgressiveValidationError({
        platform: "api",
        roomId: "room-1",
        parts: ["one", "two"],
      }),
    ).toBe(undefined);
  });
});
