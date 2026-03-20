import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  PairingAllowlistEntry,
  PairingRequestRecord,
  PlatformName,
} from "@/types";

interface PairingStore {
  requests: PairingRequestRecord[];
  allowlist: PairingAllowlistEntry[];
}

function randomCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export class PairingService {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "pairing.json");
    if (!existsSync(this.filePath)) {
      this.write({ requests: [], allowlist: [] });
    }
  }

  listPending(platform?: PlatformName): PairingRequestRecord[] {
    return this.read().requests.filter(
      (request) => request.status === "pending" && (!platform || request.platform === platform),
    );
  }

  listAllowlist(platform?: PlatformName): PairingAllowlistEntry[] {
    return this.read().allowlist.filter((entry) => !platform || entry.platform === platform);
  }

  isAllowed(platform: PlatformName, userId: string): boolean {
    return this.read().allowlist.some(
      (entry) => entry.platform === platform && entry.userId === userId,
    );
  }

  create(platform: PlatformName, userId: string): PairingRequestRecord {
    const store = this.read();
    const existing = store.requests.find(
      (request) =>
        request.platform === platform &&
        request.userId === userId &&
        request.status === "pending",
    );
    if (existing) {
      return existing;
    }

    const record: PairingRequestRecord = {
      id: randomUUID(),
      platform,
      userId,
      code: randomCode(),
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    store.requests.push(record);
    this.write(store);
    return record;
  }

  approve(platform: PlatformName, code: string): PairingRequestRecord {
    const store = this.read();
    const record = store.requests.find(
      (request) =>
        request.platform === platform &&
        request.code === code &&
        request.status === "pending",
    );
    if (!record) {
      throw new Error(`No pending pairing request found for ${platform} code ${code}.`);
    }

    record.status = "approved";
    record.approvedAt = new Date().toISOString();

    if (
      !store.allowlist.some(
        (entry) => entry.platform === record.platform && entry.userId === record.userId,
      )
    ) {
      store.allowlist.push({
        platform: record.platform,
        userId: record.userId,
        approvedAt: record.approvedAt,
      });
    }
    this.write(store);
    return record;
  }

  deny(platform: PlatformName, code: string): PairingRequestRecord {
    const store = this.read();
    const record = store.requests.find(
      (request) =>
        request.platform === platform &&
        request.code === code &&
        request.status === "pending",
    );
    if (!record) {
      throw new Error(`No pending pairing request found for ${platform} code ${code}.`);
    }

    record.status = "denied";
    record.deniedAt = new Date().toISOString();
    this.write(store);
    return record;
  }

  revoke(platform: PlatformName, userId: string): void {
    const store = this.read();
    store.allowlist = store.allowlist.filter(
      (entry) => !(entry.platform === platform && entry.userId === userId),
    );
    this.write(store);
  }

  clearPending(): void {
    const store = this.read();
    store.requests = store.requests.filter((request) => request.status !== "pending");
    this.write(store);
  }

  private read(): PairingStore {
    const raw = readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as PairingStore;
  }

  private write(store: PairingStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }
}
