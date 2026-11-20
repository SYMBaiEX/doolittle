import { describe, expect, it } from "vitest";
import { gatewayReplayFeedback } from "../../apps/desktop/src/renderer/GatewayPage";

describe("gateway replay feedback", () => {
  it("reports a failed replay returned in a successful HTTP response", () => {
    expect(
      gatewayReplayFeedback({
        result: {
          ok: false,
          response: "The response was generated.",
          deliveryFailure: "Delivery adapter is unavailable.",
        },
      }),
    ).toEqual({
      message:
        "Replay could not be completed: Delivery adapter is unavailable.",
      tone: "bad",
    });
  });

  it("requires a confirmed replay outcome", () => {
    expect(gatewayReplayFeedback({ result: { ok: true } }).tone).toBe("good");
    expect(gatewayReplayFeedback({}).tone).toBe("bad");
  });
});
