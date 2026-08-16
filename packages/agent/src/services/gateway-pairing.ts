import {
  checkPairingAllowed,
  type PairingService as ElizaPairingService,
  getPairingService,
  type IAgentRuntime,
  type PairingAllowlistEntry,
  type PairingRequest,
} from "@elizaos/core";
import type {
  PairingApprovedRecord,
  PairingRequestRecord,
  PlatformName,
} from "@/types";
import { migrateLegacyPairingStore } from "./gateway-pairing-migration";
import {
  createAccountIdentity,
  normalizeAccountId,
} from "./gateway-session-service/routes";

const ELIZA_PAIRING_PAGE_LIMIT = 100;

interface ElizaPairingPage<T> {
  items: T[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

interface PaginatedElizaPairingService {
  listPendingRequestsPage?: (
    channel: string,
    options?: { limit?: number; offset?: number },
  ) => Promise<ElizaPairingPage<PairingRequest>>;
  getAllowlistPage?: (
    channel: string,
    options?: { limit?: number; offset?: number },
  ) => Promise<ElizaPairingPage<PairingAllowlistEntry>>;
}

type EffectivePairingService = ElizaPairingService &
  PaginatedElizaPairingService;

async function readPairingPageItems<T>(
  readPage: (options: {
    limit: number;
    offset: number;
  }) => Promise<ElizaPairingPage<T>>,
  limit: number,
): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  while (items.length < limit) {
    const page = await readPage({
      limit: Math.min(ELIZA_PAIRING_PAGE_LIMIT, limit - items.length),
      offset,
    });
    items.push(...page.items);
    if (!page.hasMore || page.nextOffset === null) break;
    if (page.nextOffset <= offset) {
      throw new Error("Eliza PairingService returned a non-advancing page.");
    }
    offset = page.nextOffset;
  }
  return items.slice(0, limit);
}

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

function projectApprovedSender(entry: {
  id: string;
  channel: string;
  senderId: string;
  createdAt: Date | string;
}): PairingApprovedRecord {
  return {
    id: entry.id,
    platform: entry.channel as PlatformName,
    userId: entry.senderId,
    approvedAt: isoDate(entry.createdAt),
    status: "approved",
  };
}

const LEGACY_ACCOUNT_SCOPED_PAIRING_PLATFORMS = new Set<PlatformName>([
  // Telegram was the only account-scoped pairing identity released before the
  // connector-wide isolation change. Preserve its single-account allowlists.
  "telegram",
]);

function pairingSenderId(
  platform: PlatformName,
  userId: string,
  metadata?: Record<string, string>,
): string {
  const accountIdentity = createAccountIdentity(metadata?.accountId);
  if (!accountIdentity) return userId;

  // Account identities are percent-encoded or hashed before being embedded.
  // `userId` is terminal, so delimiter-bearing IDs cannot make the account
  // boundary ambiguous.
  return `doolittle-pairing:v1:${platform}:account=${accountIdentity}:user=${userId}`;
}

function legacyTelegramAccountPairingSenderId(
  platform: PlatformName,
  userId: string,
  metadata?: Record<string, string>,
): string | undefined {
  if (platform !== "telegram") return undefined;

  const accountId = normalizeAccountId(metadata?.accountId);
  return accountId ? `telegram-account:${accountId}:${userId}` : undefined;
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

  async listPending(
    platform?: PlatformName,
    limit = 200,
  ): Promise<PairingRequestRecord[]> {
    const service = await this.service();
    const platforms = platform ? [platform] : this.platforms;
    const requests = await Promise.all(
      platforms.map((entry) => this.pendingForPlatform(service, entry, limit)),
    );
    return requests
      .flat()
      .map(projectPendingRequest)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async listApproved(
    platform?: PlatformName,
    limit = 200,
  ): Promise<PairingApprovedRecord[]> {
    const service = await this.service();
    const platforms = platform ? [platform] : this.platforms;
    const entries = await Promise.all(
      platforms.map((entry) => this.approvedForPlatform(service, entry, limit)),
    );
    return entries
      .flat()
      .map(projectApprovedSender)
      .sort((left, right) => right.approvedAt.localeCompare(left.approvedAt))
      .slice(0, limit);
  }

  async checkOrRequest(
    platform: PlatformName,
    userId: string,
    metadata?: Record<string, string>,
  ): Promise<{ allowed: boolean; pairingCode?: string }> {
    const runtime = this.requireRuntime();
    const service = await this.service();
    const senderId = pairingSenderId(platform, userId, metadata);
    // Telegram's pre-upgrade, single-account allowlist intentionally remains
    // compatible. New account-scoped approvals never use this fallback, so an
    // approval for one account cannot authorize another.
    if (
      senderId !== userId &&
      LEGACY_ACCOUNT_SCOPED_PAIRING_PLATFORMS.has(platform)
    ) {
      const legacyAllowlist = await service.getAllowlist(platform);
      const legacyAccountSenderId = legacyTelegramAccountPairingSenderId(
        platform,
        userId,
        metadata,
      );
      if (
        legacyAllowlist.some(
          (entry) =>
            entry.senderId === userId ||
            entry.senderId === legacyAccountSenderId,
        )
      ) {
        return { allowed: true };
      }
    }
    const result = await checkPairingAllowed(runtime, {
      channel: platform,
      senderId,
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

  async revoke(
    platform: PlatformName,
    userId: string,
  ): Promise<PairingApprovedRecord> {
    const service = await this.service();
    const approved = await service.getAllowlist(platform);
    const entry = approved.find((candidate) => candidate.senderId === userId);
    if (!entry || !(await service.removeFromAllowlist(platform, userId))) {
      throw new Error(
        `No approved pairing sender found for ${platform} user ${userId}.`,
      );
    }
    return projectApprovedSender(entry);
  }

  private requireRuntime(): IAgentRuntime {
    if (!this.runtime) {
      throw new Error("Eliza pairing runtime is not bound.");
    }
    return this.runtime;
  }

  private async pendingForPlatform(
    service: EffectivePairingService,
    platform: PlatformName,
    limit: number,
  ): Promise<PairingRequest[]> {
    if (!service.listPendingRequestsPage) {
      return service.listPendingRequests(platform);
    }
    return readPairingPageItems(
      (options) =>
        service.listPendingRequestsPage?.(platform, options) ??
        Promise.reject(
          new Error("Eliza pairing pagination became unavailable."),
        ),
      limit,
    );
  }

  private async approvedForPlatform(
    service: EffectivePairingService,
    platform: PlatformName,
    limit: number,
  ): Promise<PairingAllowlistEntry[]> {
    if (!service.getAllowlistPage) {
      return service.getAllowlist(platform);
    }
    return readPairingPageItems(
      (options) =>
        service.getAllowlistPage?.(platform, options) ??
        Promise.reject(
          new Error("Eliza pairing pagination became unavailable."),
        ),
      limit,
    );
  }

  private async service(): Promise<EffectivePairingService> {
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
    return service as EffectivePairingService;
  }
}
