import type { ApprovalService, IAgentRuntime } from "@elizaos/core";
import { bindNativeApprovals } from "../native-bridge";
import { ExecutionApprovalStore } from "../store";
import type {
  CreateExecutionApprovalRuleInput,
  ExecutionApprovalMatchInput,
  ExecutionApprovalRecord,
  ExecutionApprovalRule,
  UpdateExecutionApprovalRuleInput,
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
import {
  createExecutionApprovalRule,
  deleteExecutionApprovalRule,
  findMatchingExecutionApprovalRule,
  getExecutionApprovalRule,
  listExecutionApprovalRules,
  updateExecutionApprovalRule,
} from "./rules";

export type {
  CreateExecutionApprovalRuleInput,
  ExecutionApprovalRecord,
  ExecutionApprovalRule,
  UpdateExecutionApprovalRuleInput,
} from "../types";

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
    botId?: string;
    sessionId?: string;
    runId?: string;
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

  listRules(): ExecutionApprovalRule[] {
    return listExecutionApprovalRules(this.store);
  }

  getRule(id: string): ExecutionApprovalRule | undefined {
    return getExecutionApprovalRule(this.store, id);
  }

  createRule(input: CreateExecutionApprovalRuleInput): ExecutionApprovalRule {
    return createExecutionApprovalRule(this.store, input);
  }

  updateRule(
    id: string,
    patch: UpdateExecutionApprovalRuleInput,
  ): ExecutionApprovalRule | undefined {
    return updateExecutionApprovalRule(this.store, id, patch);
  }

  deleteRule(id: string): boolean {
    return deleteExecutionApprovalRule(this.store, id);
  }

  findMatchingRule(
    input: ExecutionApprovalMatchInput,
  ): ExecutionApprovalRule | undefined {
    return findMatchingExecutionApprovalRule(this.store, input);
  }
}
