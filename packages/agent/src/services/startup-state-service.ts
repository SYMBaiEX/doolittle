import { EventEmitter } from "node:events";

export type StartupPhaseId =
  | "runtime"
  | "gateway"
  | "cron"
  | "diagnostics"
  | "operator"
  | "ecosystem"
  | "skills";

export type StartupPhaseStatus = "deferred" | "warming" | "ready" | "error";

export interface StartupPhaseSnapshot {
  id: StartupPhaseId;
  status: StartupPhaseStatus;
  detail?: string;
  updatedAt: string;
}

export interface StartupStateSnapshot {
  hotPathReady: boolean;
  deferredReady: boolean;
  phases: Record<StartupPhaseId, StartupPhaseSnapshot>;
  updatedAt: string;
}

const DEFERRED_PHASES: StartupPhaseId[] = [
  "gateway",
  "cron",
  "diagnostics",
  "operator",
  "ecosystem",
  "skills",
];

function nowIso(): string {
  return new Date().toISOString();
}

function buildPhase(id: StartupPhaseId): StartupPhaseSnapshot {
  return {
    id,
    status: id === "runtime" ? "warming" : "deferred",
    updatedAt: nowIso(),
  };
}

export class StartupStateService {
  private readonly events = new EventEmitter();
  private readonly phases: Record<StartupPhaseId, StartupPhaseSnapshot> = {
    runtime: buildPhase("runtime"),
    gateway: buildPhase("gateway"),
    cron: buildPhase("cron"),
    diagnostics: buildPhase("diagnostics"),
    operator: buildPhase("operator"),
    ecosystem: buildPhase("ecosystem"),
    skills: buildPhase("skills"),
  };

  markWarming(id: StartupPhaseId, detail?: string): void {
    this.patch(id, "warming", detail);
  }

  markDeferred(id: StartupPhaseId, detail?: string): void {
    this.patch(id, "deferred", detail);
  }

  markReady(id: StartupPhaseId, detail?: string): void {
    this.patch(id, "ready", detail);
  }

  markError(id: StartupPhaseId, detail?: string): void {
    this.patch(id, "error", detail);
  }

  getSnapshot(): StartupStateSnapshot {
    const phases = Object.fromEntries(
      Object.entries(this.phases).map(([key, value]) => [key, { ...value }]),
    ) as Record<StartupPhaseId, StartupPhaseSnapshot>;
    return {
      hotPathReady: phases.runtime.status === "ready",
      deferredReady: DEFERRED_PHASES.every(
        (id) => phases[id].status === "ready",
      ),
      phases,
      updatedAt: nowIso(),
    };
  }

  onUpdate(listener: (snapshot: StartupStateSnapshot) => void): () => void {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  private patch(
    id: StartupPhaseId,
    status: StartupPhaseStatus,
    detail?: string,
  ): void {
    this.phases[id] = {
      id,
      status,
      detail,
      updatedAt: nowIso(),
    };
    this.events.emit("update", this.getSnapshot());
  }
}
