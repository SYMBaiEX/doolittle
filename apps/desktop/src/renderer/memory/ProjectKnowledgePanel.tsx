import type {
  BotCatalogResponse,
  BotTeamCatalogResponse,
  SharedKnowledgeResponse,
} from "@doolittle/contracts/bots";
import {
  Button,
  ContextActionMenu,
  NativeSelect,
  StateSurface,
} from "@doolittle/ui";
import { useEffect, useState } from "react";
import { copyContextText } from "../context-menu-clipboard";
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
  const teams = useApiResource<BotTeamCatalogResponse>(
    active ? "/bots/teams" : null,
    [active],
  );
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{
    error?: string;
    message?: string;
  }>({});
  useEffect(() => {
    if (!active) return;
    const reload = () => {
      knowledge.reload();
      teams.reload();
      catalog.reload();
    };
    window.addEventListener("doolittle:knowledge-changed", reload);
    return () =>
      window.removeEventListener("doolittle:knowledge-changed", reload);
  }, [active, knowledge.reload, teams.reload, catalog.reload]);
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
    <section className="grid gap-4" aria-label="Shared knowledge">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2>Shared knowledge</h2>
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
            teams.reload();
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
      {teams.error ? (
        <StateSurface kind="error" title="Teams are unavailable">
          {teams.error} Team grants are disabled until membership can be
          verified.
        </StateSurface>
      ) : null}
      {knowledge.loading && !knowledge.data ? (
        <StateSurface kind="loading" title="Loading shared knowledge" />
      ) : null}
      {!knowledge.loading && !knowledge.error && records.length === 0 ? (
        <StateSurface kind="empty" title="Nothing shared yet">
          Use a completed message's bookmark action to choose its project or
          team. Promotion does not automatically share it.
        </StateSurface>
      ) : null}
      <ul className="m-0 list-none p-0 divide-y divide-[var(--line-subtle)]">
        {records.map((record) => {
          const team = teams.data?.teams.find(
            (candidate) =>
              candidate.id === record.scope.id && !candidate.archivedAt,
          );
          const sourceBot = bots.find((bot) => bot.id === record.source.botId);
          const sourceEligible =
            sourceBot &&
            !sourceBot.archivedAt &&
            (record.scope.kind === "team"
              ? team?.memberBotIds.includes(sourceBot.id)
              : sourceBot.projectId === record.scope.id);
          const eligible = bots.filter(
            (bot) =>
              sourceEligible &&
              !bot.archivedAt &&
              bot.id !== record.source.botId &&
              (record.scope.kind === "team"
                ? team?.memberBotIds.includes(bot.id)
                : bot.projectId === record.scope.id),
          );
          const selected = eligible.some((bot) => bot.id === targets[record.id])
            ? targets[record.id]
            : (eligible[0]?.id ?? "");
          const grants =
            knowledge.data?.grants.filter(
              (grant) => grant.knowledgeId === record.id && !grant.revokedAt,
            ) ?? [];
          const sourceName =
            bots.find((bot) => bot.id === record.source.botId)?.name ??
            "Archived bot";
          const grantDisabled =
            !active ||
            !selected ||
            Boolean(busy) ||
            Boolean(record.integrity) ||
            Boolean(knowledge.error) ||
            Boolean(catalog.error) ||
            (record.scope.kind === "team" && Boolean(teams.error)) ||
            grants.some((grant) => grant.botId === selected);
          const contextScope = JSON.stringify([
            record.id,
            record.revokedAt,
            record.integrity?.status,
            selected,
            eligible.map((bot) => bot.id),
            grants.map((grant) => [grant.botId, grant.grantedAt]),
            teams.data?.revision,
          ]);
          return (
            <li key={record.id} className="grid gap-3 py-4">
              <ContextActionMenu
                label={`Shared finding: ${record.title}`}
                scopeKey={contextScope}
                items={[
                  ...(!record.revokedAt
                    ? [
                        {
                          id: "grant-access",
                          label: `Grant access to ${bots.find((bot) => bot.id === selected)?.name ?? "selected bot"}…`,
                          disabled: grantDisabled,
                          onSelect: () => {
                            void change(record.id, "grant", selected);
                          },
                        },
                        {
                          id: "revoke-finding",
                          label: "Revoke finding…",
                          destructive: true,
                          disabled: !active || Boolean(busy),
                          onSelect: () => {
                            void change(record.id, "revoke");
                          },
                        },
                      ]
                    : []),
                  {
                    id: "copy-title",
                    label: "Copy finding title",
                    separatorBefore: !record.revokedAt,
                    onSelect: () => {
                      void copyContextText(record.title);
                    },
                  },
                ]}
              >
                <div>
                  <h3 className="text-base font-medium">{record.title}</h3>
                  <p className="text-sm text-[var(--muted)]">
                    From {sourceName} · {record.scope.kind}{" "}
                    {record.scope.kind === "team"
                      ? (team?.name ?? "Archived or unavailable team")
                      : record.scope.id}{" "}
                    · {record.revokedAt ? "Revoked" : "Privately promoted"}
                  </p>
                </div>
                {record.integrity ? (
                  <StateSurface
                    kind="error"
                    title="Re-promote the exact source"
                  >
                    {record.integrity.message} Existing access cannot disclose
                    this ambiguous finding.
                  </StateSurface>
                ) : null}
                {!record.revokedAt ? (
                  <>
                    {grants.length ? (
                      <ul className="m-0 list-none p-0 grid gap-1">
                        {grants.map((grant) => (
                          <li
                            key={grant.botId}
                            className="flex flex-wrap items-center justify-between gap-2"
                          >
                            <ContextActionMenu
                              label={`Knowledge access: ${bots.find((bot) => bot.id === grant.botId)?.name ?? "archived bot"}`}
                              scopeKey={`${contextScope}:${grant.botId}`}
                              items={[
                                {
                                  id: "revoke-access",
                                  label: "Revoke this bot’s access…",
                                  destructive: true,
                                  disabled: !active || Boolean(busy),
                                  onSelect: () => {
                                    void change(
                                      record.id,
                                      "revoke",
                                      grant.botId,
                                    );
                                  },
                                },
                              ]}
                            >
                              <span className="text-sm">
                                Shared with{" "}
                                {bots.find((bot) => bot.id === grant.botId)
                                  ?.name ?? "Archived bot"}
                                {!eligible.some((bot) => bot.id === grant.botId)
                                  ? " · Membership inactive"
                                  : ""}
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
                            </ContextActionMenu>
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
                        disabled={
                          !eligible.length ||
                          Boolean(busy) ||
                          Boolean(record.integrity)
                        }
                        onChange={(event) =>
                          setTargets((current) => ({
                            ...current,
                            [record.id]: event.target.value,
                          }))
                        }
                      >
                        {!eligible.length ? (
                          <option value="">
                            No eligible bots in this {record.scope.kind}
                          </option>
                        ) : (
                          eligible.map((bot) => (
                            <option key={bot.id} value={bot.id}>
                              {bot.name}
                            </option>
                          ))
                        )}
                      </NativeSelect>
                      <Button
                        disabled={grantDisabled}
                        onClick={() =>
                          void change(record.id, "grant", selected)
                        }
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
              </ContextActionMenu>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
