import type { ApprovalService, IAgentRuntime } from "@elizaos/core";
import { bindNativeApprovals } from "../native-bridge";
import { ExecutionApprovalStore } from "../store";
import type {
  ExecutionApprovalMatchInput,
  ExecutionApprovalRecord,
} from "../types";
import {
  findPendingExecutionApproval,
  getExecutionApproval,
  latestPendingExecutionApprovalForSession,
  listExecutionApprovals,
  useApprovedExecutionApproval,
} from "./reporting";
import { requestExecutionApproval } from "./requests";
import { approveExecutionApproval, denyExecutionApproval } from "./resolution";

export type { ExecutionApprovalRecord } from "../types";

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
    return requestExecutionApproval({
      store: this.store,
      nativeApprovals: this.nativeApprovals,
      input,
    });
  }

  list(status?: ExecutionApprovalRecord["status"]): ExecutionApprovalRecord[] {
    return listExecutionApprovals(this.store, status);
  }

  get(id: string): ExecutionApprovalRecord | undefined {
    return getExecutionApproval(this.store, id);
  }

  latestPendingForSession(
    sessionKey: string,
  ): ExecutionApprovalRecord | undefined {
    return latestPendingExecutionApprovalForSession(this.store, sessionKey);
  }

  findPending(
    input: ExecutionApprovalMatchInput,
  ): ExecutionApprovalRecord | undefined {
    return findPendingExecutionApproval(this.store, input);
  }

  async approve(
    id: string,
    options?: { useImmediately?: boolean },
  ): Promise<ExecutionApprovalRecord> {
    return approveExecutionApproval({
      store: this.store,
      nativeApprovals: this.nativeApprovals,
      id,
      options,
    });
  }

  async deny(id: string): Promise<ExecutionApprovalRecord> {
    return denyExecutionApproval({
      store: this.store,
      nativeApprovals: this.nativeApprovals,
      id,
    });
  }

  useApproved(
    input: ExecutionApprovalMatchInput,
  ): ExecutionApprovalRecord | undefined {
    return useApprovedExecutionApproval(this.store, input);
  }
}
