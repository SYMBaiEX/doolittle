import type { DirectLocalIntentExecution } from "../local-intent-fallback";
import {
  looksLikeDeferredActionPromise,
  looksLikeIncompleteLocalReview,
  looksLikeNativeExecutionFailure,
} from "./patterns";

export function shouldPreferDirectLocalExecution(
  intent: DirectLocalIntentExecution | undefined,
): boolean {
  return Boolean(intent?.isHighConfidence);
}

export function isHighConfidenceDirectLocalIntent(
  intent: DirectLocalIntentExecution | undefined,
): boolean {
  return shouldPreferDirectLocalExecution(intent);
}

export function requiresModelSynthesisForLocalIntent(
  intent: DirectLocalIntentExecution | undefined,
): boolean {
  return intent?.kind === "synthesis";
}

export function shouldUseDirectLocalFallback(input: {
  message: string;
  response: string;
  observedActionCount: number;
  runFailureMessage?: string;
  isHighConfidenceIntent?: boolean;
  requiresModelSynthesis?: boolean;
}): boolean {
  const stalledAfterMinimalWork =
    Boolean(input.isHighConfidenceIntent) && input.observedActionCount <= 1;
  if (!input.runFailureMessage && input.requiresModelSynthesis) {
    return false;
  }
  return (
    (input.observedActionCount === 0 || stalledAfterMinimalWork) &&
    (Boolean(input.runFailureMessage) ||
      !input.response.trim() ||
      looksLikeDeferredActionPromise(input.response) ||
      looksLikeNativeExecutionFailure(input.response) ||
      Boolean(
        input.isHighConfidenceIntent &&
          looksLikeIncompleteLocalReview(input.response),
      ) ||
      Boolean(input.isHighConfidenceIntent && !input.response.trim()))
  );
}
