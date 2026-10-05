import type { BotSummary } from "@doolittle/contracts/bots";
import { desktopRequest } from "../lib";

export async function loadOwnedRunInventory(
  botIds: readonly string[],
): Promise<{
  runs: unknown[];
  updates: Record<string, unknown>;
  warnings: string[];
}> {
  const owners = botIds.length ? [...new Set(botIds)] : [undefined];
  const results = await Promise.allSettled(
    owners.map(async (botId) => {
      const batch = await desktopRequest<{ runs?: unknown; updates?: unknown }>(
        "/chat/runs?limit=50&include_updates=true",
        "GET",
        undefined,
        undefined,
        undefined,
        botId,
      );
      if (!Array.isArray(batch.runs))
        throw new Error("Run inventory is unavailable.");
      const runs = batch.runs.map((value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error("Invalid run receipt.");
        const run = value as Record<string, unknown>;
        if (botId && run.botId !== botId)
          throw new Error("Run ownership does not match its worker.");
        return { ...run, ...(botId ? { botId } : {}) } as Record<
          string,
          unknown
        >;
      });
      return {
        runs,
        updates:
          batch.updates &&
          typeof batch.updates === "object" &&
          !Array.isArray(batch.updates)
            ? (batch.updates as Record<string, unknown>)
            : {},
      };
    }),
  );
  const warnings: string[] = [];
  const batches = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [result.value];
    warnings.push(
      `Run history for ${owners[index] ?? "Doolittle"} is unavailable.`,
    );
    return [];
  });
  if (!batches.length) throw new Error("Run inventory is unavailable.");
  const ids = new Set<string>();
  for (const batch of batches)
    for (const run of batch.runs) {
      if (typeof run.runId !== "string" || ids.has(run.runId))
        throw new Error("Conflicting durable run identity.");
      ids.add(run.runId);
    }
  const runs: Record<string, unknown>[] = [];
  for (const run of batches.flatMap((batch) => batch.runs)) {
    if (run.source === "desktop-consultation") {
      try {
        const ledger = await desktopRequest<{ consultations?: unknown[] }>(
          `/bots/consultations?targetRunId=${encodeURIComponent(String(run.runId))}`,
          "GET",
        );
        const matched = ledger.consultations?.some((value) => {
          if (!value || typeof value !== "object") return false;
          const entry = value as {
            target?: { botId?: string; sessionId?: string; runId?: string };
          };
          return (
            entry.target?.botId === run.botId &&
            entry.target?.sessionId === run.sessionId &&
            entry.target?.runId === run.runId
          );
        });
        if (!matched) throw new Error("Unverified consultation.");
      } catch {
        warnings.push(
          "A specialist run could not be verified against its consultation ledger.",
        );
        continue;
      }
    }
    runs.push(run);
  }
  return {
    runs,
    warnings,
    updates: Object.assign(
      {},
      ...batches.map((batch) => batch.updates),
    ) as Record<string, unknown>,
  };
}

export function liveBotIds(bots: readonly BotSummary[] | undefined): string[] {
  return (
    bots
      ?.filter((bot) => ["ready", "busy", "waiting"].includes(bot.state))
      .map((bot) => bot.id)
      .sort() ?? []
  );
}
