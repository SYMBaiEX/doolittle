import type { RunUpdateEventBus } from "@/services/run-controller/event-bus";
import type { RunUpdateEvent } from "@/services/run-controller/types";
import type { RunControllerDependencies, RunTransition } from "./types";

export function onRunUpdate(
  events: RunUpdateEventBus,
  listener: (event: RunUpdateEvent) => void,
): () => void {
  return events.onUpdate(listener);
}

export function emitRunUpdate(
  { events }: RunControllerDependencies,
  type: RunUpdateEvent["type"],
  run: RunTransition["run"],
): void {
  events.emit(type, run);
}

export function applyRunTransition(
  { events, store }: RunControllerDependencies,
  sessionId: string,
  transitionFactory: (current: RunTransition["run"]) => RunTransition,
): void {
  const current = store.getInternal(sessionId);
  if (!current || current.endedAt) {
    return;
  }
  const transition = transitionFactory(current);
  store.apply(sessionId, transition.run);
  events.emit(transition.type, transition.run);
}
