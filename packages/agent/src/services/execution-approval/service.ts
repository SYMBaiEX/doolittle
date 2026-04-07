import type { ApprovalService, IAgentRuntime } from "@elizaos/core";
import {
  bindNativeApprovals,
  forwardNativeApprovalSelection,
  requestNativeExecutionApproval,
} from "./native-bridge";
import { ExecutionApprovalStore } from "./store";
import type {
  ExecutionApprovalMatchInput,
  ExecutionApprovalRecord,
  ExecutionApprovalStoreData,
} from "./types";
import {
  createPendingApprovalRecord,
  expirePendingApprovals,
  markApprovalApproved,
  markApprovalDenied,
  markApprovalExpired,
  markApprovalUsed,
  matchesApprovalRequest,
  pruneApprovalStore,
} from "./updates";

export type { ExecutionApprovalRecord } from "./types";

export class ExecutionApprovalService {
  private readonly store: ExecutionApprovalStore;
  private nativeApprovals?: ApprovalService;

  constructor(baseDir: string) {
    this.store = new ExecutionApprovalStore(baseDir);
  }

  bindRuntime(runtime: IAgentRuntime): void {
    this.nativeApprovals = bindNativeApprovals(runtime);
  }

  hasNativeBridge(): boolean {
    return Boolean(this.nativeApprovals);
  }

  async request(input: {
    platform: ExecutionApprovalMatchInput["platform"];
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
    const store = this.store.read();
    let nativeTaskId: string | undefined;

    if (this.nativeApprovals && input.runtimeRoomId) {
      nativeTaskId = await requestNativeExecutionApproval({
        approvals: this.nativeApprovals,
        roomId: input.runtimeRoomId,
        entityId: input.runtimeEntityId,
        platform: input.platform,
        userId: input.userId,
        roomIdLabel: input.roomId,
        sessionKey: input.sessionKey,
        command: input.command,
        reason: input.reason,
        ttlMinutes,
        onApprove: () => {
          if (!nativeTaskId) {
            return;
          }
          this.safeMutate(nativeTaskId, (record) => {
            markApprovalApproved(record);
          });
        },
        onDeny: () => {
          if (!nativeTaskId) {
            return;
          }
          this.safeMutate(nativeTaskId, (record) => {
            markApprovalDenied(record);
          });
        },
        onTimeout: () => {
          if (!nativeTaskId) {
            return;
          }
          this.safeMutate(nativeTaskId, (record) => {
            markApprovalExpired(record);
          });
        },
      });
    }

    const record = createPendingApprovalRecord({
      platform: input.platform,
      userId: input.userId,
      roomId: input.roomId,
      sessionKey: input.sessionKey,
      command: input.command,
      reason: input.reason,
      ttlMinutes,
      nativeTaskId,
    });

    store.approvals.push(record);
    pruneApprovalStore(store);
    this.store.write(store);
    return record;
  }

  list(status?: ExecutionApprovalRecord["status"]): ExecutionApprovalRecord[] {
    const store = this.readActiveStore();
    return store.approvals
      .filter((record) => (status ? record.status === status : true))
      .slice()
      .reverse();
  }

  get(id: string): ExecutionApprovalRecord | undefined {
    const store = this.readActiveStore();
    return store.approvals.find((record) => record.id === id);
  }

  latestPendingForSession(
    sessionKey: string,
  ): ExecutionApprovalRecord | undefined {
    const store = this.readActiveStore();
    return store.approvals
      .slice()
      .reverse()
      .find(
        (record) =>
          record.sessionKey === sessionKey && record.status === "pending",
      );
  }

  findPending(
    input: ExecutionApprovalMatchInput,
  ): ExecutionApprovalRecord | undefined {
    const store = this.readActiveStore();
    return store.approvals
      .slice()
      .reverse()
      .find(
        (record) =>
          record.status === "pending" && matchesApprovalRequest(record, input),
      );
  }

  async approve(
    id: string,
    options?: { useImmediately?: boolean },
  ): Promise<ExecutionApprovalRecord> {
    const pending = this.assertPending(id);
    if (pending.nativeBacked) {
      await forwardNativeApprovalSelection(this.nativeApprovals, id, "approve");
    }
    return this.updateRecord(id, (record) => {
      markApprovalApproved(record, options);
    });
  }

  async deny(id: string): Promise<ExecutionApprovalRecord> {
    const pending = this.assertPending(id);
    if (pending.nativeBacked) {
      await forwardNativeApprovalSelection(this.nativeApprovals, id, "deny");
    }
    return this.updateRecord(id, (record) => {
      markApprovalDenied(record);
    });
  }

  useApproved(
    input: ExecutionApprovalMatchInput,
  ): ExecutionApprovalRecord | undefined {
    const store = this.readActiveStore();
    const record = store.approvals.find(
      (entry) =>
        entry.status === "approved" && matchesApprovalRequest(entry, input),
    );
    if (!record) {
      return undefined;
    }
    markApprovalUsed(record);
    this.store.write(store);
    return record;
  }

  private readActiveStore(): ExecutionApprovalStoreData {
    const store = this.store.read();
    if (expirePendingApprovals(store)) {
      pruneApprovalStore(store);
      this.store.write(store);
    }
    return store;
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
    const store = this.store.read();
    if (expirePendingApprovals(store)) {
      pruneApprovalStore(store);
    }
    const record = store.approvals.find((entry) => entry.id === id);
    if (!record) {
      throw new Error(`Approval not found: ${id}`);
    }
    update(record);
    pruneApprovalStore(store);
    this.store.write(store);
    return { ...record };
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
}
