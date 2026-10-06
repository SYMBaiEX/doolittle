import type {
  BotCatalogResponse,
  BotSummary,
  BotTeam,
  BotTeamCatalogResponse,
} from "@doolittle/contracts/bots";
import {
  Button,
  ContextActionMenu,
  DialogFrame,
  Input,
  StateSurface,
} from "@doolittle/ui";
import { useId, useRef, useState } from "react";
import { useModalFocusBoundary } from "../components/useModalFocusBoundary";
import { copyContextText } from "../context-menu-clipboard";
import { desktopRequest, errorMessage, useApiResource } from "../lib";

function TeamEditor({
  team,
  bots,
  revision,
  returnFocusTarget,
  onClose,
  onSaved,
}: {
  team?: BotTeam;
  bots: readonly BotSummary[];
  revision: number;
  returnFocusTarget: HTMLElement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const activeBots = bots.filter((bot) => !bot.archivedAt);
  const [name, setName] = useState(team?.name ?? "");
  const [members, setMembers] = useState(
    () =>
      new Set(
        team?.memberBotIds.filter((id) =>
          activeBots.some((bot) => bot.id === id),
        ) ?? [],
      ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const nameId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useModalFocusBoundary({
    active: true,
    isolateBackground: true,
    isolationBoundaryRef: backdropRef,
    initialFocusSelector: "input",
    restoreFocus: true,
    restoreFocusTarget: returnFocusTarget,
    onClose: () => {
      if (!busy) onClose();
    },
  });
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await desktopRequest(
        team ? `/bots/teams/${encodeURIComponent(team.id)}` : "/bots/teams",
        team ? "PATCH" : "POST",
        {
          name: name.trim(),
          memberBotIds: [...members],
          expectedRevision: revision,
          consent: true,
        },
      );
      onSaved();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogFrame
      title={team ? `Edit ${team.name}` : "Create a team"}
      titleId={titleId}
      backdropRef={backdropRef}
      ref={dialogRef}
      actions={
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Close
        </Button>
      }
    >
      <p className="m-0 text-sm text-[var(--muted)]">
        Choose members explicitly. Team membership does not share private
        histories or automatically grant access to findings.
      </p>
      <label className="grid gap-2 text-sm" htmlFor={nameId}>
        Team name
        <Input
          id={nameId}
          value={name}
          maxLength={100}
          required
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <fieldset className="m-0 grid gap-1 border-0 p-0">
        <legend className="mb-2 text-sm font-medium">Members</legend>
        {activeBots.map((bot) => (
          <label
            key={bot.id}
            className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
          >
            <input
              type="checkbox"
              disabled={busy}
              checked={members.has(bot.id)}
              onChange={(event) =>
                setMembers((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(bot.id);
                  else next.delete(bot.id);
                  return next;
                })
              }
            />
            {bot.name}
          </label>
        ))}
      </fieldset>
      {team?.memberBotIds.some(
        (id) => !activeBots.some((bot) => bot.id === id),
      ) ? (
        <p className="m-0 text-sm text-[var(--muted)]">
          Archived or unavailable bots are excluded from the saved membership.
          The native confirmation shows the exact change.
        </p>
      ) : null}
      <p className="m-0 text-sm text-[var(--muted)]">
        Separately approved team findings can cross project boundaries. Changes
        apply to future retrieval; information already delivered cannot be
        erased.
      </p>
      {error ? (
        <StateSurface kind="error" title="Team was not saved">
          {error} Close and refresh if another window changed membership.
        </StateSurface>
      ) : null}
      <Button disabled={busy || !name.trim()} onClick={() => void save()}>
        {busy ? "Saving…" : "Save team"}
      </Button>
    </DialogFrame>
  );
}

export function TeamManagementPanel({ active }: { active: boolean }) {
  const teams = useApiResource<BotTeamCatalogResponse>(
    active ? "/bots/teams" : null,
    [active],
  );
  const catalog = useApiResource<BotCatalogResponse>(active ? "/bots" : null, [
    active,
  ]);
  const [editor, setEditor] = useState<{
    team?: BotTeam;
    revision: number;
    returnFocusTarget: HTMLElement | null;
  }>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const editRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const editTeam = (team: BotTeam) =>
    setEditor({
      team,
      revision: teams.data?.revision ?? 0,
      returnFocusTarget: editRefs.current[team.id] ?? null,
    });
  const refresh = () => {
    teams.reload();
    catalog.reload();
    window.dispatchEvent(new Event("doolittle:knowledge-changed"));
  };
  const archive = async (team: BotTeam) => {
    if (!teams.data || busy) return;
    const revision = teams.data.revision;
    setBusy(team.id);
    setError("");
    setNotice("");
    try {
      await desktopRequest(
        `/bots/teams/${encodeURIComponent(team.id)}/archive`,
        "POST",
        { expectedRevision: revision, consent: true },
      );
      refresh();
      setNotice(
        "Team archived. Private histories and promoted findings were retained; future team retrieval is blocked.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  };
  const bots = catalog.data?.bots ?? [];
  return (
    <section className="grid gap-4" aria-label="Persistent bot teams">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-medium">Bot teams</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Explicit membership for sharing selected findings. Persistent bots
            remain independent.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={!active || Boolean(busy)}
            onClick={refresh}
          >
            Refresh teams
          </Button>
          <Button
            disabled={!active || !teams.data || !catalog.data || Boolean(busy)}
            onClick={() =>
              setEditor({
                revision: teams.data?.revision ?? 0,
                returnFocusTarget: document.activeElement as HTMLElement | null,
              })
            }
          >
            Create team
          </Button>
        </div>
      </header>
      {teams.error || catalog.error ? (
        <StateSurface kind="error" title="Teams are unavailable">
          {teams.error || catalog.error}
        </StateSurface>
      ) : null}
      {teams.loading && !teams.data ? (
        <StateSurface kind="loading" title="Loading teams" />
      ) : null}
      {error ? (
        <StateSurface kind="error" title="Team change failed">
          {error}
        </StateSurface>
      ) : null}
      {notice ? (
        <p role="status" className="m-0 text-sm">
          {notice}
        </p>
      ) : null}
      {!teams.loading && !teams.error && teams.data?.teams.length === 0 ? (
        <StateSurface kind="empty" title="No teams yet">
          Create a team and choose its members. Project membership is not team
          membership.
        </StateSurface>
      ) : null}
      <ul className="m-0 grid list-none divide-y divide-[var(--line-subtle)] p-0">
        {teams.data?.teams.map((team) => (
          <li
            key={team.id}
            className="flex flex-wrap items-center justify-between gap-3 py-4"
          >
            <ContextActionMenu
              label={`Team: ${team.name}`}
              scopeKey={JSON.stringify([
                team.id,
                teams.data?.revision,
                team.archivedAt,
                team.memberBotIds,
              ])}
              items={[
                {
                  id: "edit-members",
                  label: "Edit team and members…",
                  disabled:
                    !active ||
                    Boolean(team.archivedAt) ||
                    Boolean(busy) ||
                    !catalog.data,
                  onSelect: () => editTeam(team),
                },
                {
                  id: "archive-team",
                  label: "Archive team…",
                  destructive: true,
                  disabled:
                    !active || Boolean(team.archivedAt) || Boolean(busy),
                  onSelect: () => {
                    void archive(team);
                  },
                },
                {
                  id: "copy-name",
                  label: "Copy team name",
                  separatorBefore: true,
                  onSelect: () => {
                    void copyContextText(team.name);
                  },
                },
              ]}
            >
              <div className="min-w-0">
                <h3 className="m-0 text-base font-medium">
                  {team.name}
                  {team.archivedAt ? " · Archived" : ""}
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {team.memberBotIds
                    .map(
                      (id) =>
                        bots.find((bot) => bot.id === id)?.name ??
                        "Unavailable bot",
                    )
                    .join(", ") || "No members"}
                </p>
              </div>
              {!team.archivedAt ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={Boolean(busy) || !catalog.data}
                    onClick={() => editTeam(team)}
                    ref={(node) => {
                      editRefs.current[team.id] = node;
                    }}
                  >
                    Edit members
                    <span className="sr-only"> for {team.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={Boolean(busy)}
                    onClick={() => void archive(team)}
                  >
                    Archive team<span className="sr-only"> {team.name}</span>
                  </Button>
                </div>
              ) : null}
            </ContextActionMenu>
          </li>
        ))}
      </ul>
      {editor ? (
        <TeamEditor
          {...editor}
          bots={bots}
          onClose={() => setEditor(undefined)}
          onSaved={refresh}
        />
      ) : null}
    </section>
  );
}
