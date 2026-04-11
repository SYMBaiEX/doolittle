import type {
  GatewayMessageLike,
  GatewayTraceLike,
} from "../../../types/trajectory";
import type { SessionService } from "../../session/service";

export type TrajectoryBundleMode = "dataset" | "research" | "evaluation" | "rl";

export interface TrajectoryBundleStorageHost {
  baseDir: string;
  sessions: Pick<SessionService, "recent">;
  slug(value: string): string;
}

export interface TrajectoryBundleWriteOptions {
  label: string;
  purpose: string;
  mode: TrajectoryBundleMode;
  limit: number;
  sessionId?: string | null;
  role?: "user" | "assistant" | "system" | null;
  tags?: string[];
  notes?: string;
}

export interface TrajectoryBundleWriteResult {
  dataPath: string;
  manifestPath: string;
  summaryPath: string;
  messageCount: number;
  sessionCount: number;
}

export interface TrajectoryGatewayIngestInput {
  label?: string;
  purpose?: string;
  tags?: string[];
  notes?: string;
  traces: GatewayTraceLike[];
  inbox: GatewayMessageLike[];
  outbox: GatewayMessageLike[];
}

export interface TrajectoryBatchManifestInput {
  label?: string;
  purpose?: string;
  prompts: string[];
  rubric?: string[];
  tags?: string[];
  taskIds?: string[];
  group?: string;
}
