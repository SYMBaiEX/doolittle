import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  checkPairingAllowed,
  type PairingAllowlistEntry as ElizaPairingAllowlistEntry,
  PairingService as ElizaPairingService,
  type IAgentRuntime,
  type PairingRequest,
  stringToUuid,
} from "@elizaos/core";
import type {
  PairingAllowlistEntry,
  PairingRequestRecord,
  PlatformName,
} from "@/types";

function isoDate(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function projectPendingRequest(request: PairingRequest): PairingRequestRecord {
  return {
    id: request.id,
    platform: request.channel as PlatformName,
    userId: request.senderId,
    code: request.code,
    createdAt: isoDate(request.createdAt),
    status: "pending",
  };
}

function projectAllowlistEntry(
  entry: ElizaPairingAllowlistEntry,
): PairingAllowlistEntry {
  return {
    platform: entry.channel as PlatformName,
    userId: entry.senderId,
    approvedAt: isoDate(entry.createdAt),
  };
}

/**
 * Product-facing projection over Eliza's canonical PairingService.
 *
 * Eliza owns pairing request and allowlist persistence. This adapter only maps
 * those records into Doolittle's gateway/API contracts and provides the
 * product-specific deny operation by deleting a pending SDK request.
 */
export class GatewayPairingProjection {
  private runtime?: IAgentRuntime;
  private migration?: Promise<void>;

  constructor(
    private readonly platforms: readonly PlatformName[],
    private readonly legacyStoreFile?: string,
  ) {}

  bindRuntime(runtime: IAgentRuntime): void {
    this.runtime = runtime;
  }

  async listPending(platform?: PlatformName): Promise<PairingRequestRecord[]> {
    const service = await this.service();
    const platforms = platform ? [platform] : this.platforms;
    const requests = await Promise.all(
      platforms.map((entry) => service.listPendingRequests(entry)),
    );
    return requests.flat().map(projectPendingRequest);
  }

  async listAllowlist(
    platform?: PlatformName,
  ): Promise<PairingAllowlistEntry[]> {
    const service = await this.service();
    const platforms = platform ? [platform] : this.platforms;
    const entries = await Promise.all(
      platforms.map((entry) => service.getAllowlist(entry)),
    );
    return entries.flat().map(projectAllowlistEntry);
  }

  async checkOrRequest(
    platform: PlatformName,
    userId: string,
    metadata?: Record<string, string>,
  ): Promise<{ allowed: boolean; pairingCode?: string }> {
    const runtime = this.requireRuntime();
    await this.service();
    const result = await checkPairingAllowed(runtime, {
      channel: platform,
      senderId: userId,
      metadata,
    });
    return {
      allowed: result.allowed,
      pairingCode: result.pairingCode,
    };
  }

  async approve(
    platform: PlatformName,
    code: string,
  ): Promise<PairingRequestRecord> {
    const result = await (await this.service()).approveCode({
      channel: platform,
      code,
    });
    if (!result) {
      throw new Error(
        `No pending pairing request found for ${platform} code ${code}.`,
      );
    }
    return {
      ...projectPendingRequest(result.request),
      status: "approved",
      approvedAt: isoDate(result.allowlistEntry.createdAt),
    };
  }

  async deny(
    platform: PlatformName,
    code: string,
  ): Promise<PairingRequestRecord> {
    const runtime = this.requireRuntime();
    const request = (
      await (await this.service()).listPendingRequests(platform)
    ).find((entry) => entry.code.toUpperCase() === code.trim().toUpperCase());
    if (!request) {
      throw new Error(
        `No pending pairing request found for ${platform} code ${code}.`,
      );
    }
    await runtime.deletePairingRequest(request.id);
    return {
      ...projectPendingRequest(request),
      status: "denied",
      deniedAt: new Date().toISOString(),
    };
  }

  async revoke(platform: PlatformName, userId: string): Promise<void> {
    await (await this.service()).removeFromAllowlist(platform, userId);
  }

  async clearPending(): Promise<void> {
    const runtime = this.requireRuntime();
    const requests = await this.listPending();
    await Promise.all(
      requests.map((request) => runtime.deletePairingRequest(request.id)),
    );
  }

  private requireRuntime(): IAgentRuntime {
    if (!this.runtime) {
      throw new Error("Eliza pairing runtime is not bound.");
    }
    return this.runtime;
  }

  private async service(): Promise<ElizaPairingService> {
    const runtime = this.requireRuntime();
    await runtime.getServiceLoadPromise(ElizaPairingService.serviceType);
    const service = runtime.getService<ElizaPairingService>(
      ElizaPairingService.serviceType,
    );
    if (!service) {
      throw new Error("Eliza PairingService is not available.");
    }
    this.migration ??= this.migrateLegacyStore(runtime, service);
    await this.migration;
    return service;
  }

  private async migrateLegacyStore(
    runtime: IAgentRuntime,
    service: ElizaPairingService,
  ): Promise<void> {
    const filePath = this.legacyStoreFile;
    if (!filePath || !existsSync(filePath)) {
      return;
    }
    const markerPath = `${filePath}.eliza-migrated`;
    if (existsSync(markerPath)) {
      return;
    }

    const legacy = JSON.parse(readFileSync(filePath, "utf8")) as {
      requests?: PairingRequestRecord[];
      allowlist?: PairingAllowlistEntry[];
    };
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

    writeFileSync(
      markerPath,
      JSON.stringify(
        {
          migratedAt: new Date().toISOString(),
          owner: "Eliza PairingService",
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}
