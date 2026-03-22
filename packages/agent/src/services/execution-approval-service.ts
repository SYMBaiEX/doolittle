import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlatformName } from "@/types";

export interface ExecutionApprovalRecord {
  id: string;
  platform: PlatformName;
  userId: string;
  roomId: string;
  sessionKey?: string;
  command: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  approvedAt?: string;
  deniedAt?: string;
  usedAt?: string;
  status: "pending" | "approved" | "denied" | "used" | "expired";
}

interface ExecutionApprovalStore {
  approvals: ExecutionApprovalRecord[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function isExpired(record: ExecutionApprovalRecord): boolean {
  return new Date(record.expiresAt).getTime() <= Date.now();
}

export class ExecutionApprovalService {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "execution-approvals.json");
    if (!existsSync(this.filePath)) {
      this.write({ approvals: [] });
    }
  }

  request(input: {
    platform: PlatformName;
    userId: string;
    roomId: string;
    sessionKey?: string;
    command: string;
    reason: string;
    ttlMinutes?: number;
  }): ExecutionApprovalRecord {
    const store = this.read();
    const record: ExecutionApprovalRecord = {
      id: randomUUID(),
      platform: input.platform,
      userId: input.userId,
      roomId: input.roomId,
      sessionKey: input.sessionKey,
      command: input.command,
      reason: input.reason,
      createdAt: nowIso(),
      expiresAt: new Date(
        Date.now() + (input.ttlMinutes ?? 15) * 60_000,
      ).toISOString(),
      status: "pending",
    };
    store.approvals.push(record);
    this.pruneStore(store);
    this.write(store);
    return record;
  }

  list(status?: ExecutionApprovalRecord["status"]): ExecutionApprovalRecord[] {
    const store = this.read();
    this.expirePending(store);
    return store.approvals
      .filter((record) => (status ? record.status === status : true))
      .slice()
      .reverse();
  }

  get(id: string): ExecutionApprovalRecord | undefined {
    const store = this.read();
    this.expirePending(store);
    return store.approvals.find((record) => record.id === id);
  }

  latestPendingForSession(
    sessionKey: string,
  ): ExecutionApprovalRecord | undefined {
    const store = this.read();
    this.expirePending(store);
    return store.approvals
      .slice()
      .reverse()
      .find(
        (record) =>
          record.sessionKey === sessionKey && record.status === "pending",
      );
  }

  findPending(input: {
    platform: PlatformName;
    userId: string;
    roomId: string;
    sessionKey?: string;
    command: string;
  }): ExecutionApprovalRecord | undefined {
    const store = this.read();
    this.expirePending(store);
    return store.approvals
      .slice()
      .reverse()
      .find(
        (record) =>
          record.status === "pending" &&
          record.platform === input.platform &&
          record.userId === input.userId &&
          record.roomId === input.roomId &&
          record.sessionKey === input.sessionKey &&
          record.command.trim() === input.command.trim(),
      );
  }

  approve(
    id: string,
    options?: { useImmediately?: boolean },
  ): ExecutionApprovalRecord {
    const store = this.read();
    this.expirePending(store);
    const record = store.approvals.find((entry) => entry.id === id);
    if (!record) {
      throw new Error(`Approval not found: ${id}`);
    }
    if (record.status !== "pending") {
      throw new Error(`Approval ${id} is ${record.status}.`);
    }
    record.approvedAt = nowIso();
    record.status = options?.useImmediately ? "used" : "approved";
    if (options?.useImmediately) {
      record.usedAt = record.approvedAt;
    }
    this.write(store);
    return record;
  }

  deny(id: string): ExecutionApprovalRecord {
    const store = this.read();
    this.expirePending(store);
    const record = store.approvals.find((entry) => entry.id === id);
    if (!record) {
      throw new Error(`Approval not found: ${id}`);
    }
    if (record.status !== "pending") {
      throw new Error(`Approval ${id} is ${record.status}.`);
    }
    record.deniedAt = nowIso();
    record.status = "denied";
    this.write(store);
    return record;
  }

  useApproved(input: {
    platform: PlatformName;
    userId: string;
    roomId: string;
    sessionKey?: string;
    command: string;
  }): ExecutionApprovalRecord | undefined {
    const store = this.read();
    this.expirePending(store);
    const record = store.approvals.find(
      (entry) =>
        entry.status === "approved" &&
        entry.platform === input.platform &&
        entry.userId === input.userId &&
        entry.roomId === input.roomId &&
        entry.sessionKey === input.sessionKey &&
        entry.command.trim() === input.command.trim(),
    );
    if (!record) {
      return undefined;
    }
    record.status = "used";
    record.usedAt = nowIso();
    this.write(store);
    return record;
  }

  private read(): ExecutionApprovalStore {
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as ExecutionApprovalStore;
    return {
      approvals: parsed.approvals ?? [],
    };
  }

  private write(store: ExecutionApprovalStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }

  private expirePending(store: ExecutionApprovalStore): void {
    let changed = false;
    for (const record of store.approvals) {
      if (record.status === "pending" && isExpired(record)) {
        record.status = "expired";
        changed = true;
      }
    }
    if (changed) {
      this.pruneStore(store);
      this.write(store);
    }
  }

  private pruneStore(store: ExecutionApprovalStore): void {
    if (store.approvals.length > 200) {
      store.approvals = store.approvals.slice(-200);
    }
  }
}
