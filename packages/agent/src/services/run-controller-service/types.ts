import type { RunUpdateEventBus } from "../run-controller/event-bus";
import type { RunControllerStore } from "../run-controller/store";
import type {
  RunSnapshot,
  RunStatus,
  RunUpdateType,
} from "../run-controller/types";

export interface RunControllerDependencies {
  events: RunUpdateEventBus;
  store: RunControllerStore;
}

export interface RunTransition {
  run: RunSnapshot;
  type: RunUpdateType;
}

export type FinishRunStatus = Extract<
  RunStatus,
  "complete" | "cancelled" | "error"
>;
