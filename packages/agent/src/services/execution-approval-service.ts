import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ApprovalService, type IAgentRuntime, type UUID } from "@elizaos/core";
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
  nativeBacked?: boolean;
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
  private nativeApprovals?: ApprovalService;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "execution-approvals.json");
    if (!existsSync(this.filePath)) {
      this.write({ approvals: [] });
    }
  }

  bindRuntime(runtime: IAgentRuntime): void {
    this.nativeApprovals =
      runtime.getService<ApprovalService>(ApprovalService.serviceType) ??
      undefined;
  }

  hasNativeBridge(): boolean {
    return Boolean(this.nativeApprovals);
  }

  async request(input: {
    platform: PlatformName;
    userId: string;
    roomId: string;
    sessionKey?: string;
    runtimeRoomId?: string;
    runtimeEntityId?: string;
    command: string;
    reason: string;
    ttlMinutes?: number;
  }): Promise<ExecutionApprovalRecord> {
    const ttlMinutes = input.ttlMinutes ?? 15;
    const store = this.read();
    let nativeTaskId: string | undefined;
    if (this.nativeApprovals && input.runtimeRoomId) {
      nativeTaskId = await this.requestNativeApproval({
        roomId: input.runtimeRoomId,
        entityId: input.runtimeEntityId,
        platform: input.platform,
        userId: input.userId,
        roomIdLabel: input.roomId,
        sessionKey: input.sessionKey,
        command: input.command,
        reason: input.reason,
        ttlMinutes,
      });
    }
    const record: ExecutionApprovalRecord = {
      id: nativeTaskId ?? randomUUID(),
      platform: input.platform,
      userId: input.userId,
      roomId: input.roomId,
      sessionKey: input.sessionKey,
      command: input.command,
      reason: input.reason,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
      nativeBacked: Boolean(nativeTaskId),
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

  async approve(
    id: string,
    options?: { useImmediately?: boolean },
  ): Promise<ExecutionApprovalRecord> {
    const pending = this.assertPending(id);
    if (pending.nativeBacked && this.nativeApprovals) {
      await this.nativeApprovals.handleSelection(id as UUID, "approve");
    }
    return this.updateRecord(id, (record) => {
      const timestamp = nowIso();
      record.approvedAt ??= timestamp;
      record.status = options?.useImmediately ? "used" : "approved";
      if (options?.useImmediately) {
        record.usedAt = timestamp;
      }
    });
  }

  async deny(id: string): Promise<ExecutionApprovalRecord> {
    const pending = this.assertPending(id);
    if (pending.nativeBacked && this.nativeApprovals) {
      await this.nativeApprovals.handleSelection(id as UUID, "deny");
    }
    return this.updateRecord(id, (record) => {
      record.deniedAt ??= nowIso();
      record.status = "denied";
    });
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

  private assertPending(id: string): ExecutionApprovalRecord {
    const record = this.get(id);
    if (!record) {
      throw new Error(`Approval not found: ${id}`);
    }
    if (record.status !== "pending") {
      throw new Error(`Approval ${id} is ${record.status}.`);
    }
    return record;
  }

  private updateRecord(
    id: string,
    update: (record: ExecutionApprovalRecord) => void,
  ): ExecutionApprovalRecord {
    const store = this.read();
    this.expirePending(store);
    const record = store.approvals.find((entry) => entry.id === id);
    if (!record) {
      throw new Error(`Approval not found: ${id}`);
    }
    update(record);
    this.pruneStore(store);
    this.write(store);
    return { ...record };
  }

  private async requestNativeApproval(input: {
    roomId: string;
    entityId?: string;
    platform: PlatformName;
    userId: string;
    roomIdLabel: string;
    sessionKey?: string;
    command: string;
    reason: string;
    ttlMinutes: number;
  }): Promise<string | undefined> {
    if (!this.nativeApprovals) {
      return undefined;
    }
    let taskId = "";
    taskId = await this.nativeApprovals.requestApprovalAsync({
      name: "eliza-agent-remote-exec",
      description: `${input.reason}\n\nCommand: ${input.command}`,
      roomId: input.roomId as UUID,
      entityId: input.entityId as UUID | undefined,
      options: [
        {
          name: "approve",
          description: "Approve this remote shell command.",
        },
        {
          name: "deny",
          description: "Deny this remote shell command.",
          isCancel: true,
          isDefault: true,
        },
      ],
      timeoutMs: input.ttlMinutes * 60_000,
      timeoutDefault: "deny",
      metadata: {
        type: "eliza-agent-remote-exec",
        platform: input.platform,
        userId: input.userId,
        roomId: input.roomIdLabel,
        sessionKey: input.sessionKey,
        command: input.command,
        reason: input.reason,
      },
      onSelect: async (option) => {
        if (!taskId) {
          return;
        }
        if (option === "approve") {
          this.safeMutate(taskId, (record) => {
            record.approvedAt ??= nowIso();
            if (record.status === "pending") {
              record.status = "approved";
            }
          });
          return;
        }
        this.safeMutate(taskId, (record) => {
          record.deniedAt ??= nowIso();
          record.status = "denied";
        });
      },
      onTimeout: async () => {
        if (!taskId) {
          return;
        }
        this.safeMutate(taskId, (record) => {
          record.status = "expired";
        });
      },
    });
    return taskId || undefined;
  }

  private safeMutate(
    id: string,
    update: (record: ExecutionApprovalRecord) => void,
  ): void {
    try {
      this.updateRecord(id, update);
    } catch {
      // Ignore late async writes if the mirror record has already been pruned.
    }
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
