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
  });

  return { runtime, requests, allowlist };
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

  it("fails closed before the official runtime is bound", async () => {
    const projection = new GatewayPairingProjection(["telegram"]);
    await expect(projection.listPending()).rejects.toThrow(
      "Eliza pairing runtime is not bound.",
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
