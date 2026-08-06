import {
  checkPairingAllowed,
  type PairingService as ElizaPairingService,
  getPairingService,
  type IAgentRuntime,
  type PairingRequest,
} from "@elizaos/core";
import type { PairingRequestRecord, PlatformName } from "@/types";
import { migrateLegacyPairingStore } from "./gateway-pairing-migration";

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

  private requireRuntime(): IAgentRuntime {
    if (!this.runtime) {
      throw new Error("Eliza pairing runtime is not bound.");
    }
    return this.runtime;
  }

  private async service(): Promise<ElizaPairingService> {
    const runtime = this.requireRuntime();
    const service = await getPairingService(runtime);
    if (!service) {
      throw new Error("Eliza PairingService is not available.");
    }
    this.migration ??= migrateLegacyPairingStore(
      this.legacyStoreFile,
      runtime,
      service,
    );
    await this.migration;
    return service;
  }
}
