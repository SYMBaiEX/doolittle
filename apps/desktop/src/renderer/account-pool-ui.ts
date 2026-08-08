import type { AccountWithCredentialFlag } from "@elizaos/ui/api/client-agent";
import type { AccountPoolAccount } from "../shared/contracts";
import { asRecord } from "./value-guards";

const HEALTH_STATES = new Set<AccountWithCredentialFlag["health"]>([
  "ok",
  "rate-limited",
  "needs-reauth",
  "invalid",
  "unknown",
]);

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function toElizaAccount(
  account: AccountPoolAccount,
): AccountWithCredentialFlag {
  const health = HEALTH_STATES.has(
    account.health as AccountWithCredentialFlag["health"],
  )
    ? (account.health as AccountWithCredentialFlag["health"])
    : "unknown";
  const healthDetail = asRecord(account.healthDetail);
  const usage = asRecord(account.usage);
  const sessionPct = optionalNumber(usage.sessionPct);
  const weeklyPct = optionalNumber(usage.weeklyPct);
  const resetsAt = optionalNumber(usage.resetsAt);
  const refreshedAt = optionalNumber(usage.refreshedAt);
  const hasUsage =
    sessionPct !== undefined ||
    weeklyPct !== undefined ||
    resetsAt !== undefined ||
    refreshedAt !== undefined;

  return {
    id: account.accountId,
    providerId: account.providerId,
    label: account.label,
    source: account.source,
    enabled: account.enabled,
    priority: account.priority,
    createdAt: account.createdAt,
    ...(account.lastUsedAt === undefined
      ? {}
      : { lastUsedAt: account.lastUsedAt }),
    health,
    ...(Object.keys(healthDetail).length
      ? {
          healthDetail: {
            ...(optionalNumber(healthDetail.until) === undefined
              ? {}
              : { until: optionalNumber(healthDetail.until) }),
            ...(optionalNumber(healthDetail.lastChecked) === undefined
              ? {}
              : { lastChecked: optionalNumber(healthDetail.lastChecked) }),
            ...(typeof healthDetail.lastError === "string"
              ? { lastError: healthDetail.lastError }
              : {}),
          },
        }
      : {}),
    ...(hasUsage
      ? {
          usage: {
            ...(sessionPct === undefined ? {} : { sessionPct }),
            ...(weeklyPct === undefined ? {} : { weeklyPct }),
            ...(resetsAt === undefined ? {} : { resetsAt }),
            refreshedAt: refreshedAt ?? 0,
          },
        }
      : {}),
    hasCredential: true,
  };
}
