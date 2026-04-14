import {
  type GatewayInboxReplayResult,
  replayGatewayInboxRecord,
} from "@/gateway/receive/replay";
import type { PlatformName } from "@/types/gateway";
import type { GatewayTransportDetail } from "../../state/state-snapshot";
import type { GatewayInboxRecord } from "../history-view";
import type { GatewayRunnerReadModelDeps } from "./types";

interface ReplayGatewayInboxRecordByIdOptions {
  recordId: string;
  inboxLog: readonly GatewayInboxRecord[];
  receive: GatewayRunnerReadModelDeps["receive"];
  transport: (platform: PlatformName) => Promise<GatewayTransportDetail>;
}

export async function replayGatewayInboxRecordById(
  options: ReplayGatewayInboxRecordByIdOptions,
): Promise<GatewayInboxReplayResult> {
  const record = options.inboxLog.find(
    (entry) => entry.recordId === options.recordId,
  );
  if (!record) {
    throw new Error(`Inbox record ${options.recordId} was not found.`);
  }

  return replayGatewayInboxRecord({
    record,
    receive: options.receive,
    transport: options.transport,
  });
}
