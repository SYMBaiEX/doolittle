export interface ComposerSendControl {
  queueControl: "hidden" | "enabled" | "disabled";
  dispatchLabel: "Queue" | "Steer" | "Steer or queue";
  behaviorText: string;
  hiddenHint: string;
}

/**
 * Describes the dispatch behavior the chat runtime honestly supports.
 * Steerability is known only by offering the message to the active run, so the
 * composer never promises steering before the backend accepts it.
 */
export function composerSendControl({
  active,
  cancelling,
  canQueue,
  hasContent,
  steerOffer = false,
  steerPending = false,
}: {
  active: boolean;
  cancelling: boolean;
  canQueue: boolean;
  hasContent: boolean;
  steerOffer?: boolean;
  steerPending?: boolean;
}): ComposerSendControl {
  if (!active) {
    return {
      queueControl: "hidden",
      dispatchLabel: "Queue",
      behaviorText: "",
      hiddenHint: "Enter to send.",
    };
  }
  if (cancelling) {
    return {
      queueControl: "hidden",
      dispatchLabel: steerOffer ? "Steer or queue" : "Queue",
      behaviorText: hasContent
        ? "Stopping the current response; queueing is paused."
        : "",
      hiddenHint: "Stopping response.",
    };
  }
  if (steerPending) {
    return {
      queueControl: "disabled",
      dispatchLabel: "Steer or queue",
      behaviorText: "Offering the message to the active run…",
      hiddenHint: "Offering the message to the active run. Escape to stop.",
    };
  }
  if (canQueue || steerOffer) {
    const dispatchLabel = steerOffer
      ? canQueue
        ? "Steer or queue"
        : "Steer"
      : "Queue";
    return {
      queueControl: "enabled",
      dispatchLabel,
      behaviorText: steerOffer
        ? canQueue
          ? "Enter offers to steer this run. If steering is unavailable, the message queues."
          : "Enter offers to steer this run. If steering is unavailable, the draft stays here."
        : "Enter queues behind the current response.",
      hiddenHint: steerOffer
        ? "Enter to offer steering. Escape to stop."
        : "Enter to queue. Escape to stop.",
    };
  }
  return {
    queueControl: hasContent ? "disabled" : "hidden",
    dispatchLabel: "Queue",
    behaviorText: hasContent ? "Queueing is unavailable for this draft." : "",
    hiddenHint: hasContent
      ? "Queueing is unavailable for this draft. Escape to stop."
      : "Escape to stop.",
  };
}
