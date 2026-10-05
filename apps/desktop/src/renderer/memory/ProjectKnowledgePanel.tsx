import type {
  BotCatalogResponse,
  SharedKnowledgeResponse,
} from "@doolittle/contracts/bots";
import { Button, NativeSelect, StateSurface } from "@doolittle/ui";
import { useEffect, useState } from "react";
import { desktopRequest, errorMessage, useApiResource } from "../lib";

/** Host-owned sharing management, not a view into another bot's private memory. */
export function ProjectKnowledgePanel({ active }: { active: boolean }) {
  const knowledge = useApiResource<SharedKnowledgeResponse>(
    active ? "/bots/knowledge" : null,
    [active],
  );
  const catalog = useApiResource<BotCatalogResponse>(active ? "/bots" : null, [
    active,
  ]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{
    error?: string;
    message?: string;
  }>({});
  useEffect(() => {
    if (!active) return;
    const reload = () => knowledge.reload();
    window.addEventListener("doolittle:knowledge-changed", reload);
    return () =>
      window.removeEventListener("doolittle:knowledge-changed", reload);
  }, [active, knowledge.reload]);
  const change = async (
    id: string,
    action: "grant" | "revoke",
    targetBotId?: string,
  ) => {
    if (busy) return;
    setBusy(id);
    setFeedback({});
    try {
      await desktopRequest(
        `/bots/knowledge/${encodeURIComponent(id)}/${action}`,
        "POST",
        { consent: true, ...(targetBotId ? { targetBotId } : {}) },
      );
      knowledge.reload();
      setFeedback({
        message:
          action === "grant"
            ? "Access granted for future consultations."
            : "Access revoked for future retrieval. Information already delivered cannot be erased.",
      });
    } catch (cause) {
      setFeedback({ error: errorMessage(cause) });
    } finally {
      setBusy("");
    }
  };
  const records = knowledge.data?.knowledge ?? [];
  const bots = catalog.data?.bots ?? [];
  return (
    <section className="grid gap-4" aria-label="Project knowledge">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2>Project knowledge</h2>
          <p className="text-sm text-[var(--muted)]">
            Promote a completed conversation message, then explicitly grant
            access. Private bot history stays private.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!active || Boolean(busy)}
          onClick={() => {
            knowledge.reload();
            catalog.reload();
          }}
        >
          Refresh knowledge
        </Button>
      </header>
      {feedback.error ? (
        <StateSurface kind="error" title="Knowledge change failed">
          {feedback.error}
        </StateSurface>
      ) : null}
      {feedback.message ? (
        <p role="status" className="text-sm">
          {feedback.message}
        </p>
      ) : null}
      {knowledge.error || catalog.error ? (
        <StateSurface kind="error" title="Knowledge is unavailable">
          {knowledge.error || catalog.error}
        </StateSurface>
      ) : null}
      {knowledge.loading && !knowledge.data ? (
        <StateSurface kind="loading" title="Loading project knowledge" />
      ) : null}
      {!knowledge.loading && !knowledge.error && records.length === 0 ? (
        <StateSurface kind="empty" title="Nothing shared yet">
          Use a message's bookmark action in a project conversation. Promotion
          does not automatically share it.
        </StateSurface>
      ) : null}
      <ul className="m-0 list-none p-0 divide-y divide-[var(--line-subtle)]">
        {records.map((record) => {
          const eligible = bots.filter(
            (bot) =>
              !bot.archivedAt &&
              bot.id !== record.source.botId &&
              bot.projectId === record.scope.id,
          );
          const selected = targets[record.id] ?? eligible[0]?.id ?? "";
          const grants =
            knowledge.data?.grants.filter(
              (grant) => grant.knowledgeId === record.id && !grant.revokedAt,
            ) ?? [];
          const sourceName =
            bots.find((bot) => bot.id === record.source.botId)?.name ??
            "Archived bot";
          return (
            <li key={record.id} className="grid gap-3 py-4">
              <div>
                <h3 className="text-base font-medium">{record.title}</h3>
                <p className="text-sm text-[var(--muted)]">
                  From {sourceName} · {record.scope.kind} {record.scope.id} ·{" "}
                  {record.revokedAt ? "Revoked" : "Privately promoted"}
                </p>
              </div>
              {!record.revokedAt ? (
                <>
                  {grants.length ? (
                    <ul className="m-0 list-none p-0 grid gap-1">
                      {grants.map((grant) => (
                        <li
                          key={grant.botId}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="text-sm">
                            Shared with{" "}
                            {bots.find((bot) => bot.id === grant.botId)?.name ??
                              "Archived bot"}
                          </span>
                          <Button
                            variant="ghost"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              void change(record.id, "revoke", grant.botId)
                            }
                          >
                            Revoke access
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[var(--muted)]">
                      No bots have access.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <NativeSelect
                      aria-label={`Share ${record.title} with bot`}
                      value={selected}
                      disabled={!eligible.length || Boolean(busy)}
                      onChange={(event) =>
                        setTargets((current) => ({
                          ...current,
                          [record.id]: event.target.value,
                        }))
                      }
                    >
                      {!eligible.length ? (
                        <option value="">No other bots in this project</option>
                      ) : (
                        eligible.map((bot) => (
                          <option key={bot.id} value={bot.id}>
                            {bot.name}
                          </option>
                        ))
                      )}
                    </NativeSelect>
                    <Button
                      disabled={
                        !selected ||
                        Boolean(busy) ||
                        grants.some((grant) => grant.botId === selected)
                      }
                      onClick={() => void change(record.id, "grant", selected)}
                    >
                      Grant access
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={Boolean(busy)}
                      onClick={() => void change(record.id, "revoke")}
                    >
                      Revoke finding
                    </Button>
                  </div>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
