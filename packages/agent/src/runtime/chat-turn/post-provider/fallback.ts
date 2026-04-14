import type {
  PostProviderApprovalResult,
  PostProviderTurnInput,
} from "./types";

const DIRECT_LOCAL_FALLBACK_NOTICE =
  "Native planning stalled on this local task, so I switched to the direct workspace executor.";

export interface PostProviderFallbackState {
  kind: "continue";
  observedActionCount: number;
  response: string;
  runFailureMessage?: string;
  usedFallback: boolean;
}

function shouldLoadDirectLocalIntentFallback(input: {
  localInteractive: boolean;
  observedActionCount: number;
  runFailureMessage?: string;
}): boolean {
  return (
    input.localInteractive &&
    (input.observedActionCount === 0 || Boolean(input.runFailureMessage))
  );
}

export async function resolvePostProviderFallback(
  input: Pick<
    PostProviderTurnInput,
    | "context"
    | "effectiveInput"
    | "turn"
    | "options"
    | "loadDirectLocalIntent"
    | "approveDirectLocalIntent"
  > & {
    response: string;
    runFailureMessage?: string;
  },
): Promise<PostProviderApprovalResult | PostProviderFallbackState> {
  let response = input.response;
  let runFailureMessage = input.runFailureMessage;
  let usedFallback = false;

  const observedActionCount =
    input.context.services.runController.getActive(input.turn.sessionId)
      ?.observedActionCount ?? 0;

  const fallbackModule = shouldLoadDirectLocalIntentFallback({
    localInteractive: input.turn.localInteractive,
    observedActionCount,
    runFailureMessage,
  })
    ? await input.loadDirectLocalIntent()
    : null;
  const directLocalIntent = fallbackModule?.directLocalIntent;

  if (
    directLocalIntent &&
    fallbackModule.shouldUseDirectLocalFallback({
      message: input.effectiveInput.message,
      response,
      observedActionCount,
      runFailureMessage,
      isHighConfidenceIntent: fallbackModule.isHighConfidenceDirectLocalIntent(
        directLocalIntent as never,
      ),
      requiresModelSynthesis:
        fallbackModule.requiresModelSynthesisForLocalIntent(
          directLocalIntent as never,
        ),
    })
  ) {
    try {
      const approvalResponse = await input.approveDirectLocalIntent(
        directLocalIntent as { label?: string },
        runFailureMessage || response.trim()
          ? DIRECT_LOCAL_FALLBACK_NOTICE
          : undefined,
      );
      if (approvalResponse) {
        return {
          kind: "approval",
          response: approvalResponse,
        };
      }

      response = await fallbackModule.executeDirectLocalIntent(
        directLocalIntent as never,
        input.turn.sessionId,
        input.context,
        input.options,
      );
      runFailureMessage = undefined;
      usedFallback = true;
    } catch (fallbackError) {
      if (!runFailureMessage) {
        input.context.services.runController.finishTurn(
          input.turn.sessionId,
          "error",
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError),
        );
        throw fallbackError;
      }
    }
  }

  return {
    kind: "continue",
    observedActionCount,
    response,
    runFailureMessage,
    usedFallback,
  };
}
