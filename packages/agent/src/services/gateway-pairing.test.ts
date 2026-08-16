import {
  type IAgentRuntime,
  type PairingAllowlistEntry,
  type PairingRequest,
  PairingService,
  type UUID,
} from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { GatewayPairingProjection } from "./gateway-pairing";

function createPairingRuntime() {
  const requests: PairingRequest[] = [];
  const allowlist: PairingAllowlistEntry[] = [];
  let pairingService: PairingService;

  const runtime = {
    agentId: "00000000-0000-0000-0000-000000000001" as UUID,
    logger: {
      info() {},
      warn() {},
    },
    getService(name: string) {
      return name === PairingService.serviceType ? pairingService : null;
    },
    async getServiceLoadPromise() {},
    async getPairingRequests(
      filters: Array<{ channel?: string; agentId?: UUID }>,
    ) {
      return filters.map((filter) => ({
        requests: requests.filter(
          (request) =>
            (!filter.channel || request.channel === filter.channel) &&
            (!filter.agentId || request.agentId === filter.agentId),
        ),
      }));
    },
    async createPairingRequest(request: PairingRequest) {
      requests.push(request);
      return request.id;
    },
    async updatePairingRequest(request: PairingRequest) {
      const index = requests.findIndex((entry) => entry.id === request.id);
      if (index >= 0) {
        requests[index] = request;
      }
    },
    async deletePairingRequest(id: UUID) {
      const index = requests.findIndex((entry) => entry.id === id);
      if (index < 0) {
        return false;
      }
      requests.splice(index, 1);
      return true;
    },
    async getPairingAllowlists(
      filters: Array<{ channel?: string; agentId?: UUID }>,
    ) {
      return filters.map((filter) => ({
        entries: allowlist.filter(
          (entry) =>
            (!filter.channel || entry.channel === filter.channel) &&
            (!filter.agentId || entry.agentId === filter.agentId),
        ),
      }));
    },
    async createPairingAllowlistEntry(entry: PairingAllowlistEntry) {
      allowlist.push(entry);
      return entry.id;
    },
    async deletePairingAllowlistEntry(id: UUID) {
      const index = allowlist.findIndex((entry) => entry.id === id);
      if (index < 0) {
        return false;
      }
      allowlist.splice(index, 1);
      return true;
    },
  } as unknown as IAgentRuntime;

  pairingService = new PairingService(runtime, {
    requestTtlMs: 60_000,
    maxPendingRequests: 10,
  });

  return { runtime, requests, allowlist, pairingService };
}

describe("GatewayPairingProjection", () => {
  it("projects the official Eliza pairing lifecycle into gateway contracts", async () => {
    const { runtime, requests, allowlist } = createPairingRuntime();
    const projection = new GatewayPairingProjection(["telegram", "discord"]);
    projection.bindRuntime(runtime);

    const first = await projection.checkOrRequest("telegram", "alice", {
      username: "alice",
    });
    expect(first).toMatchObject({ allowed: false });
    expect(first.pairingCode).toHaveLength(8);
    expect(requests).toHaveLength(1);

    const repeated = await projection.checkOrRequest("telegram", "alice");
    expect(repeated.pairingCode).toBe(first.pairingCode);
    expect(requests).toHaveLength(1);
    expect(await projection.listPending()).toMatchObject([
      {
        platform: "telegram",
        userId: "alice",
        status: "pending",
      },
    ]);

    const approved = await projection.approve(
      "telegram",
      first.pairingCode ?? "",
    );
    expect(approved.status).toBe("approved");
    expect(requests).toHaveLength(0);
    expect(allowlist).toHaveLength(1);
    expect(await projection.checkOrRequest("telegram", "alice")).toEqual({
      allowed: true,
      pairingCode: undefined,
    });
  });

  it("denies and clears requests in Eliza persistence without a second store", async () => {
    const { runtime, requests } = createPairingRuntime();
    const projection = new GatewayPairingProjection(["telegram", "discord"]);
    projection.bindRuntime(runtime);

    const telegram = await projection.checkOrRequest("telegram", "alice");
    await projection.checkOrRequest("discord", "bob");
    expect(requests).toHaveLength(2);

    const denied = await projection.deny(
      "telegram",
      telegram.pairingCode ?? "",
    );
    expect(denied).toMatchObject({
      platform: "telegram",
      userId: "alice",
      status: "denied",
    });
    expect(requests).toHaveLength(1);

    const discord = await projection.listPending("discord");
    await projection.deny("discord", discord[0]?.code ?? "");
    expect(requests).toHaveLength(0);
  });

  it("scopes all account-bearing connector requests by account and user", async () => {
    const { runtime, requests } = createPairingRuntime();
    const projection = new GatewayPairingProjection(["telegram", "slack"]);
    projection.bindRuntime(runtime);

    await projection.checkOrRequest("telegram", "alice", { accountId: "work" });
    await projection.checkOrRequest("telegram", "alice", {
      accountId: "personal",
    });
    expect(requests.map((request) => request.senderId).sort()).toEqual([
      "doolittle-pairing:v1:telegram:account=personal:user=alice",
      "doolittle-pairing:v1:telegram:account=work:user=alice",
    ]);

    // The unscoped pre-account Telegram allowlist intentionally continues to
    // authorize this user across the connector's accounts.
    const legacy = await projection.checkOrRequest("telegram", "bob");
    await projection.approve("telegram", legacy.pairingCode ?? "");
    await expect(
      projection.checkOrRequest("telegram", "bob", { accountId: "work" }),
    ).resolves.toEqual({ allowed: true });

    const slackA = await projection.checkOrRequest("slack", "U123", {
      accountId: "workspace-a",
    });
    const slackB = await projection.checkOrRequest("slack", "U123", {
      accountId: "workspace-b",
    });
    expect(slackA.pairingCode).not.toBe(slackB.pairingCode);
    await projection.approve("slack", slackA.pairingCode ?? "");
    await expect(
      projection.checkOrRequest("slack", "U123", { accountId: "workspace-a" }),
    ).resolves.toEqual({ allowed: true, pairingCode: undefined });
    await expect(
      projection.checkOrRequest("slack", "U123", { accountId: "workspace-b" }),
    ).resolves.toMatchObject({
      allowed: false,
      pairingCode: slackB.pairingCode,
    });
    await expect(projection.listApproved("slack")).resolves.toMatchObject([
      {
        platform: "slack",
        userId: "doolittle-pairing:v1:slack:account=workspace-a:user=U123",
        status: "approved",
      },
    ]);
  });

  it("honors legacy Telegram account approvals only for their normalized account and user", async () => {
    const { runtime, requests, allowlist, pairingService } =
      createPairingRuntime();
    const projection = new GatewayPairingProjection(["telegram"]);
    projection.bindRuntime(runtime);

    const legacySenderId = "telegram-account:work:alice";
    await pairingService.addToAllowlist("telegram", legacySenderId);

    await expect(
      projection.checkOrRequest("telegram", "alice", { accountId: " work " }),
    ).resolves.toEqual({ allowed: true });
    await expect(
      projection.checkOrRequest("telegram", "alice", {
        accountId: "personal",
      }),
    ).resolves.toMatchObject({ allowed: false });
    expect(requests).toMatchObject([
      {
        senderId: "doolittle-pairing:v1:telegram:account=personal:user=alice",
      },
    ]);

    await expect(projection.listApproved("telegram")).resolves.toMatchObject([
      {
        platform: "telegram",
        userId: legacySenderId,
        status: "approved",
      },
    ]);
    await expect(
      projection.revoke("telegram", legacySenderId),
    ).resolves.toMatchObject({ userId: legacySenderId, status: "approved" });
    expect(allowlist).toHaveLength(0);
  });

  it("bounds delimiter-bearing and malformed account IDs without pairing collisions", async () => {
    const { runtime, requests } = createPairingRuntime();
    const projection = new GatewayPairingProjection(["slack"]);
    projection.bindRuntime(runtime);

    await projection.checkOrRequest("slack", "U123", {
      accountId: `workspace:${"a".repeat(240)}`,
    });
    await projection.checkOrRequest("slack", "U123", {
      accountId: `workspace:${"b".repeat(240)}`,
    });
    await projection.checkOrRequest("slack", "U123", { accountId: "\ud800" });
    await projection.checkOrRequest("slack", "U123", { accountId: "\udc00" });

    const senderIds = requests.map((request) => request.senderId);
    expect(senderIds[0]).not.toBe(senderIds[1]);
    expect(senderIds[2]).not.toBe(senderIds[3]);
    expect(new Set(senderIds).size).toBe(4);
    expect(senderIds.every((senderId) => senderId.length < 180)).toBe(true);
    expect(senderIds[0]).toContain("account=$sha256-");
    expect(senderIds[2]).toContain("account=$sha256-utf16le-");
  });

  it("lists and revokes only the official Eliza allowlist", async () => {
    const { runtime, allowlist } = createPairingRuntime();
    const projection = new GatewayPairingProjection(["telegram", "discord"]);
    projection.bindRuntime(runtime);

    const request = await projection.checkOrRequest("telegram", "alice");
    await projection.approve("telegram", request.pairingCode ?? "");

    await expect(projection.listApproved()).resolves.toMatchObject([
      { platform: "telegram", userId: "alice", status: "approved" },
    ]);
    await expect(projection.revoke("telegram", "alice")).resolves.toMatchObject(
      {
        platform: "telegram",
        userId: "alice",
        status: "approved",
      },
    );
    expect(allowlist).toHaveLength(0);
    await expect(projection.revoke("telegram", "alice")).rejects.toThrow(
      "No approved pairing sender found",
    );
  });

  it("keeps account scope visible and revocable in pairing management", async () => {
    const { runtime, allowlist } = createPairingRuntime();
    const projection = new GatewayPairingProjection(["slack"]);
    projection.bindRuntime(runtime);

    const request = await projection.checkOrRequest("slack", "U123", {
      accountId: "workspace-a",
    });
    await projection.approve("slack", request.pairingCode ?? "");
    const [approved] = await projection.listApproved("slack");
    expect(approved?.userId).toBe(
      "doolittle-pairing:v1:slack:account=workspace-a:user=U123",
    );
    await expect(
      projection.revoke("slack", approved?.userId ?? ""),
    ).resolves.toMatchObject({ userId: approved?.userId, status: "approved" });
    expect(allowlist).toHaveLength(0);
  });

  it("uses the official bounded paging APIs when the installed Eliza release exposes them", async () => {
    const { runtime, requests, allowlist, pairingService } =
      createPairingRuntime();
    const projection = new GatewayPairingProjection(["telegram"]);
    projection.bindRuntime(runtime);

    const approvalRequest = await projection.checkOrRequest(
      "telegram",
      "approved-0",
    );
    await projection.approve("telegram", approvalRequest.pairingCode ?? "");
    const firstApproved = allowlist[0];
    if (!firstApproved) throw new Error("Expected an approved pairing sender.");
    for (let index = 1; index < 125; index += 1) {
      allowlist.push({
        ...firstApproved,
        id: `00000000-0000-0000-0001-${String(index).padStart(12, "0")}` as UUID,
        senderId: `approved-${index}`,
        createdAt: new Date(Date.now() + index),
      });
    }
    await projection.checkOrRequest("telegram", "pending-0");
    const firstPending = requests[0];
    if (!firstPending) throw new Error("Expected a pending pairing request.");
    for (let index = 1; index < 125; index += 1) {
      requests.push({
        ...firstPending,
        id: `00000000-0000-0000-0002-${String(index).padStart(12, "0")}` as UUID,
        senderId: `pending-${index}`,
        createdAt: new Date(Date.now() + index),
      });
    }

    const pendingCalls: Array<{ limit: number; offset: number }> = [];
    const approvedCalls: Array<{ limit: number; offset: number }> = [];
    const service = pairingService as PairingService & {
      listPendingRequestsPage: (
        channel: string,
        options: { limit: number; offset: number },
      ) => Promise<{
        items: PairingRequest[];
        limit: number;
        offset: number;
        hasMore: boolean;
        nextOffset: number | null;
      }>;
      getAllowlistPage: (
        channel: string,
        options: { limit: number; offset: number },
      ) => Promise<{
        items: PairingAllowlistEntry[];
        limit: number;
        offset: number;
        hasMore: boolean;
        nextOffset: number | null;
      }>;
    };
    service.listPendingRequestsPage = async (_channel, options) => {
      pendingCalls.push(options);
      const items = [...requests]
        .reverse()
        .slice(options.offset, options.offset + options.limit);
      const nextOffset = options.offset + items.length;
      return {
        items,
        ...options,
        hasMore: nextOffset < requests.length,
        nextOffset: nextOffset < requests.length ? nextOffset : null,
      };
    };
    service.getAllowlistPage = async (_channel, options) => {
      approvedCalls.push(options);
      const items = [...allowlist]
        .reverse()
        .slice(options.offset, options.offset + options.limit);
      const nextOffset = options.offset + items.length;
      return {
        items,
        ...options,
        hasMore: nextOffset < allowlist.length,
        nextOffset: nextOffset < allowlist.length ? nextOffset : null,
      };
    };
    service.listPendingRequests = async () => {
      throw new Error("legacy pending array API should not be called");
    };
    service.getAllowlist = async () => {
      throw new Error("legacy allowlist array API should not be called");
    };

    await expect(projection.listPending("telegram", 121)).resolves.toHaveLength(
      121,
    );
    await expect(
      projection.listApproved("telegram", 121),
    ).resolves.toHaveLength(121);
    expect(pendingCalls).toEqual([
      { limit: 100, offset: 0 },
      { limit: 21, offset: 100 },
    ]);
    expect(approvedCalls).toEqual([
      { limit: 100, offset: 0 },
      { limit: 21, offset: 100 },
    ]);
  });

  it("fails closed before the official runtime is bound", async () => {
    const projection = new GatewayPairingProjection(["telegram"]);
    await expect(projection.listPending()).rejects.toThrow(
      "Eliza pairing runtime is not bound.",
    );
  });

  it("preserves the unavailable-service error when the official resolver returns null", async () => {
    const projection = new GatewayPairingProjection(["telegram"]);
    projection.bindRuntime({
      async getServiceLoadPromise() {},
      getService() {
        return null;
      },
    } as unknown as IAgentRuntime);

    await expect(projection.listPending()).rejects.toThrow(
      "Eliza PairingService is not available.",
    );
  });

  it("imports the legacy JSON store once while preserving its source data", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-pairing-migration-"));
    const legacyFile = join(root, "pairing.json");
    const createdAt = new Date().toISOString();
    writeFileSync(
      legacyFile,
      JSON.stringify({
        requests: [
          {
            id: "legacy-request",
            platform: "telegram",
            userId: "pending-user",
            code: "ABCDEFGH",
            createdAt,
            status: "pending",
          },
        ],
        allowlist: [
          {
            platform: "discord",
            userId: "approved-user",
            approvedAt: createdAt,
          },
        ],
      }),
      "utf8",
    );

    const { runtime, requests, allowlist } = createPairingRuntime();
    const projection = new GatewayPairingProjection(
      ["telegram", "discord"],
      legacyFile,
    );
    projection.bindRuntime(runtime);

    await projection.listPending();
    expect(requests).toMatchObject([
      {
        channel: "telegram",
        senderId: "pending-user",
        code: "ABCDEFGH",
      },
    ]);
    expect(allowlist).toMatchObject([
      { channel: "discord", senderId: "approved-user" },
    ]);
    expect(existsSync(legacyFile)).toBe(true);
    expect(
      JSON.parse(readFileSync(`${legacyFile}.eliza-migrated`, "utf8")),
    ).toMatchObject({ owner: "Eliza PairingService" });

    await projection.listPending();
    expect(requests).toHaveLength(1);
    expect(allowlist).toHaveLength(1);
  });
});

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
