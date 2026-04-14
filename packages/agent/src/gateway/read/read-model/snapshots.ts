import type { PlatformHealth } from "../../platforms/base";
import type {
  GatewayHistorySnapshot,
  GatewayStateSnapshot,
} from "../../state/state-snapshot";
import type { GatewayHistoryFilter } from "../history-view";
import type { GatewayRunnerReadModelDeps } from "./types";

type GatewaySnapshotState = GatewayRunnerReadModelDeps["snapshotState"];

export async function readGatewayHealth(
  snapshotState: GatewaySnapshotState,
): Promise<PlatformHealth[]> {
  const snapshot = await snapshotState("health", 20);
  return snapshot.readiness;
}

export function readGatewayHistory(
  snapshotState: GatewaySnapshotState,
  limit = 20,
  filters?: GatewayHistoryFilter,
): Promise<GatewayHistorySnapshot> {
  return snapshotState("history", limit, filters);
}

export async function readGatewayState(
  snapshotState: GatewaySnapshotState,
  limit = 20,
  filters?: GatewayHistoryFilter,
): Promise<GatewayStateSnapshot> {
  return (await readGatewayHistory(snapshotState, limit, filters)).state;
}
