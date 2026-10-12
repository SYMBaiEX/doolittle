import { isApiError } from "@elizaos/ui/api/client-types";

/** Only host-confirmed cancellation can silence startup failure feedback. */
export function shouldReportBotActivationFailure(error: unknown): boolean {
  return !(isApiError(error) && error.code === "bot_activation_cancelled");
}
