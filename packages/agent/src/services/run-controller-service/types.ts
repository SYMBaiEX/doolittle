import type { RunUpdateEventBus } from "@/services/run-controller/event-bus";
import type { RunControllerStore } from "@/services/run-controller/store";
import type {
  RunSnapshot,
  RunStatus,
  RunUpdateType,
} from "@/services/run-controller/types";

export interface RunControllerDependencies {
  events: RunUpdateEventBus;
  store: RunControllerStore;
}

export interface RunTransition {
  run: RunSnapshot;
  type: RunUpdateType;
}

export type FinishRunStatus = Extract<RunStatus, "complete" | "error">;
