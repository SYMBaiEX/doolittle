import type { HttpMethod } from "../../shared/contracts";
import { asString } from "../value-guards";

/**
 * Build the narrowest durable exact rule implied by an approval record.
 * Session IDs and run IDs are intentionally omitted: they are one-turn
 * execution identities, while rules are meant to survive later runs.
 */
export function exactApprovalRuleInputFromApproval(
  approval: Record<string, unknown>,
): Record<string, unknown> | null {
  const command = asString(approval.command).trim();
  const platform = asString(approval.platform).trim();
  const userId = asString(approval.userId).trim();
  const roomId = asString(approval.roomId).trim();
  if (!command || !platform || !userId || !roomId) return null;
  const input: Record<string, unknown> = {
    patternType: "exact",
    pattern: command,
    platform,
    userId,
    roomId,
    enabled: true,
  };
  const sessionKey = asString(approval.sessionKey).trim();
  const botId = asString(approval.botId).trim();
  if (sessionKey) input.sessionKey = sessionKey;
  if (botId) input.botId = botId;
  return input;
}

export type ApprovalRuleRequest = (
  path: string,
  method: HttpMethod,
  body?: unknown,
) => Promise<unknown>;

export type AlwaysAllowApprovalResult =
  | { status: "approved" }
  | { status: "rule-unconfirmed"; error: unknown }
  | { status: "approval-unconfirmed"; error: unknown };

/**
 * Always-allow is deliberately fail-closed: the current approval is approved
 * only after the persistent rule write succeeds. When a write fails after a
 * network round trip, the result is reported as unconfirmed rather than
 * pretending the local side knows the server's final state.
 */
export async function approveWithPersistentApprovalRule({
  approvalId,
  request,
  ruleInput,
}: {
  approvalId: string;
  request: ApprovalRuleRequest;
  ruleInput: Record<string, unknown>;
}): Promise<AlwaysAllowApprovalResult> {
  try {
    await request("/execution/approval-rules", "POST", ruleInput);
  } catch (error) {
    return { status: "rule-unconfirmed", error };
  }
  try {
    await request(
      `/execution/approvals/${encodeURIComponent(approvalId)}/approve`,
      "POST",
      {},
    );
  } catch (error) {
    return { status: "approval-unconfirmed", error };
  }
  return { status: "approved" };
}
