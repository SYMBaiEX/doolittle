import { ApiError } from "@elizaos/ui/api/client-types";
import { describe, expect, it } from "vitest";
import { shouldReportBotActivationFailure } from "./bot-activation-feedback";

describe("bot activation failure feedback", () => {
  it("does not toast an explicitly cancelled SDK request", () => {
    expect(
      shouldReportBotActivationFailure(
        new ApiError({
          kind: "http",
          path: "/bots/bot/activate",
          status: 409,
          code: "bot_activation_cancelled",
          message: "Bot startup was cancelled.",
        }),
      ),
    ).toBe(false);
  });

  it.each(["http", "network", "timeout", "parse"] as const)(
    "reports a genuine %s failure even if the bot could remain stopped",
    (kind) => {
      expect(
        shouldReportBotActivationFailure(
          new ApiError({
            kind,
            path: "/bots/bot/activate",
            code: "bot_activation_failed",
            message: "fixture-only-private-detail",
          }),
        ),
      ).toBe(true);
    },
  );

  it("does not infer cancellation from raw message text or an untyped code", () => {
    expect(shouldReportBotActivationFailure(new Error("cancelled"))).toBe(true);
    expect(
      shouldReportBotActivationFailure({ code: "bot_activation_cancelled" }),
    ).toBe(true);
  });
});
