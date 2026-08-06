import { existsSync, readFileSync } from "node:fs";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import {
  type IAgentRuntime,
  type PairingService,
  stringToUuid,
} from "@elizaos/core";
import type { PairingAllowlistEntry, PairingRequestRecord } from "@/types";

interface LegacyPairingStore {
  requests?: PairingRequestRecord[];
  allowlist?: PairingAllowlistEntry[];
}

/**
 * One-time compatibility boundary for the retired Doolittle JSON owner.
 * The source file remains untouched for recovery; the marker makes imports
 * idempotent after Eliza persistence accepts the records.
 */
export async function migrateLegacyPairingStore(
  filePath: string | undefined,
  runtime: IAgentRuntime,
  service: PairingService,
): Promise<void> {
  if (!filePath || !existsSync(filePath)) {
    return;
  }
  const markerPath = `${filePath}.eliza-migrated`;
  if (existsSync(markerPath)) {
    return;
  }

  const legacy = JSON.parse(
    readFileSync(filePath, "utf8"),
  ) as LegacyPairingStore;
  for (const entry of legacy.allowlist ?? []) {
    await service.addToAllowlist(entry.platform, entry.userId, {
      migratedFrom: "doolittle-json",
      approvedAt: entry.approvedAt,
    });
  }

  for (const entry of legacy.requests ?? []) {
    if (entry.status !== "pending") {
      continue;
    }
    const pending = await service.listPendingRequests(entry.platform);
    if (pending.some((request) => request.senderId === entry.userId)) {
      continue;
    }
    if (
      pending.some(
        (request) => request.code.toUpperCase() === entry.code.toUpperCase(),
      )
    ) {
      await service.upsertRequest({
        channel: entry.platform,
        senderId: entry.userId,
        metadata: { migratedFrom: "doolittle-json" },
      });
      continue;
    }
    const createdAt = new Date(entry.createdAt);
    await runtime.createPairingRequest({
      id: stringToUuid(
        `pairing-${entry.platform}-${entry.userId}-${entry.createdAt}`,
      ),
      channel: entry.platform,
      senderId: entry.userId,
      code: entry.code,
      createdAt,
      lastSeenAt: createdAt,
      metadata: { migratedFrom: "doolittle-json" },
      agentId: runtime.agentId,
    });
  }

  writeJsonAtomicSync(markerPath, {
    migratedAt: new Date().toISOString(),
    owner: "Eliza PairingService",
  });
}
