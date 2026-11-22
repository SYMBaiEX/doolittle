import type {
  BotCatalogResponse,
  BotTeamCatalogResponse,
  SharedKnowledgeResponse,
} from "@doolittle/contracts/bots";
import { ContextActionMenu, NativeSelect, StateSurface } from "@doolittle/ui";
import { Bookmark, RotateCw, ShieldMinus, ShieldPlus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
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
    if (!active || busy) return;
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
  const teamsById = new Map(
    (teams.data?.teams ?? []).map((team) => [team.id, team]),
  );
  const botsById = new Map(bots.map((bot) => [bot.id, bot]));
  const hasBotInventory = catalog.hasData && !catalog.error;
  const hasTeamInventory = teams.hasData && !teams.error;
  const botLabel = (id: string) => {
    const bot = botsById.get(id);
    if (bot) return bot.archivedAt ? `${bot.name} (archived)` : bot.name;
    return catalog.loading ? "Loading bot…" : "Unavailable bot";
  };
  return (
    <WorkbenchSection
      description="Save a completed message as a finding, then grant access to the bots that need it."
      headingLevel={3}
      icon={Bookmark}
      title="Shared knowledge"
      actions={
        <WorkbenchAction
          disabled={!active || Boolean(busy)}
          icon={RotateCw}
          onClick={() => {
            knowledge.reload();
            catalog.reload();
            teams.reload();
          }}
        >
          Refresh knowledge
        </WorkbenchAction>
      }
    >
      <div className="grid gap-3">
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
        {knowledge.error ? (
          <StateSurface kind="error" title="Knowledge is unavailable">
            {knowledge.error}
          </StateSurface>
        ) : null}
        {catalog.error ? (
          <StateSurface kind="error" title="Bot inventory is unavailable">
            {catalog.error} Refresh knowledge to verify bot access before
            granting it.
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
        {active && (catalog.loading || teams.loading) ? (
          <p className="text-sm text-[var(--muted)]" role="status">
            Checking{" "}
            {catalog.loading && teams.loading
              ? "bot and team"
              : catalog.loading
                ? "bot"
                : "team"}{" "}
            membership…
          </p>
        ) : null}
        {!active ? (
          <WorkbenchEmpty icon={Bookmark} title="Shared knowledge is offline">
            The runtime must be ready to load findings and sharing permissions.
          </WorkbenchEmpty>
        ) : null}
        {knowledge.hasData && !knowledge.error && records.length === 0 ? (
          <WorkbenchEmpty icon={Bookmark} title="Nothing shared yet">
            Use a completed message's bookmark action to choose its project or
            team. Promotion does not automatically share it.
          </WorkbenchEmpty>
        ) : null}
        <ul className="m-0 grid list-none gap-3 p-0">
          {records.map((record) => {
            const team = teamsById.get(record.scope.id);
            const sourceBot = botsById.get(record.source.botId);
            const teamLabel = team
              ? team.archivedAt
                ? `${team.name} (archived)`
                : team.name
              : teams.loading
                ? "Loading team…"
                : "Unavailable team";
            const membershipKnown =
              hasBotInventory &&
              (record.scope.kind !== "team" || hasTeamInventory);
            const sourceEligible =
              membershipKnown &&
              sourceBot &&
              !sourceBot.archivedAt &&
              (record.scope.kind === "team"
                ? team &&
                  !team.archivedAt &&
                  team.memberBotIds.includes(sourceBot.id)
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
            const selected = eligible.some(
              (bot) => bot.id === targets[record.id],
            )
              ? targets[record.id]
              : (eligible[0]?.id ?? "");
            const grants =
              knowledge.data?.grants.filter(
                (grant) => grant.knowledgeId === record.id && !grant.revokedAt,
              ) ?? [];
            const sourceName = botLabel(record.source.botId);
            const grantDisabled =
              !active ||
              !selected ||
              Boolean(busy) ||
              Boolean(record.integrity) ||
              Boolean(knowledge.error) ||
              !membershipKnown ||
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
              <li
                key={record.id}
                className="grid gap-3 rounded-[var(--radius-md)] bg-[var(--surface-soft)] px-3 py-3"
              >
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
                    <h4 className="text-base font-medium [overflow-wrap:anywhere]">
                      {record.title}
                    </h4>
                    <p className="text-sm text-[var(--muted)]">
                      From {sourceName} · {record.scope.kind}{" "}
                      {record.scope.kind === "team"
                        ? teamLabel
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
                                label={`Knowledge access: ${botLabel(grant.botId)}`}
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
                                  Shared with {botLabel(grant.botId)}
                                  {membershipKnown &&
                                  !eligible.some(
                                    (bot) => bot.id === grant.botId,
                                  )
                                    ? " · Membership inactive"
                                    : ""}
                                </span>
                                <WorkbenchAction
                                  emphasis="quiet"
                                  icon={ShieldMinus}
                                  disabled={Boolean(busy)}
                                  onClick={() =>
                                    void change(
                                      record.id,
                                      "revoke",
                                      grant.botId,
                                    )
                                  }
                                >
                                  Revoke access
                                </WorkbenchAction>
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
                              {membershipKnown
                                ? `No eligible bots in this ${record.scope.kind}`
                                : "Membership needs verification"}
                            </option>
                          ) : (
                            eligible.map((bot) => (
                              <option key={bot.id} value={bot.id}>
                                {bot.name}
                              </option>
                            ))
                          )}
                        </NativeSelect>
                        <WorkbenchAction
                          disabled={grantDisabled}
                          emphasis="primary"
                          icon={ShieldPlus}
                          onClick={() =>
                            void change(record.id, "grant", selected)
                          }
                        >
                          Grant access
                        </WorkbenchAction>
                        <WorkbenchAction
                          emphasis="quiet"
                          icon={ShieldMinus}
                          disabled={Boolean(busy)}
                          onClick={() => void change(record.id, "revoke")}
                        >
                          Revoke finding
                        </WorkbenchAction>
                      </div>
                    </>
                  ) : null}
                </ContextActionMenu>
              </li>
            );
          })}
        </ul>
      </div>
    </WorkbenchSection>
  );
}
