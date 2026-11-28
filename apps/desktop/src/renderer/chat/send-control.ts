export interface ComposerSendControl {
  queueControl: "hidden" | "enabled" | "disabled";
  behaviorText: string;
  hiddenHint: string;
}

/**
 * Describes the only dispatch behavior the chat runtime honestly supports.
 * A live turn can be cancelled or finished before the next message; it cannot
 * be steered or injected mid-turn from the composer.
 */
export function composerSendControl({
  active,
  cancelling,
  canQueue,
  hasContent,
}: {
  active: boolean;
  cancelling: boolean;
  canQueue: boolean;
  hasContent: boolean;
}): ComposerSendControl {
  if (!active) {
    return {
      queueControl: "hidden",
      behaviorText: "",
      hiddenHint: "Enter to send.",
    };
  }
  if (cancelling) {
    return {
      queueControl: "hidden",
      behaviorText: hasContent
        ? "Stopping the current response; queueing is paused."
        : "",
      hiddenHint: "Stopping response.",
    };
  }
  if (canQueue) {
    return {
      queueControl: "enabled",
      behaviorText: "Enter queues behind the current response.",
      hiddenHint: "Enter to queue. Escape to stop.",
    };
  }
  return {
    queueControl: hasContent ? "disabled" : "hidden",
    behaviorText: hasContent ? "Queueing is unavailable for this draft." : "",
    hiddenHint: hasContent
      ? "Queueing is unavailable for this draft. Escape to stop."
      : "Escape to stop.",
  };
}
