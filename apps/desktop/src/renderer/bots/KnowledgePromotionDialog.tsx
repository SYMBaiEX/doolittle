import type { BotTeamCatalogResponse } from "@doolittle/contracts/bots";
import { Button, DialogFrame, NativeSelect, StateSurface } from "@doolittle/ui";
import { useId, useRef, useState } from "react";
import type { DisplayMessage } from "../chat/models";
import { useModalFocusBoundary } from "../components/useModalFocusBoundary";
import { errorMessage, useApiResource } from "../lib";
import { promoteKnowledgeMessage } from "./project-knowledge";

/** Captured at the message action, never retargeted by later session selection. */
export interface KnowledgePromotionSource {
  botId: string;
  sessionId: string;
  projectId?: string;
  message: DisplayMessage;
  returnFocusTarget: HTMLElement | null;
}

export function KnowledgePromotionDialog({
  source,
  onClose,
  onSaved,
}: {
  source: KnowledgePromotionSource;
  onClose: () => void;
  onSaved: (sessionId: string) => void;
}) {
  const teams = useApiResource<BotTeamCatalogResponse>("/bots/teams", []);
  const available =
    teams.data?.teams.filter(
      (team) => !team.archivedAt && team.memberBotIds.includes(source.botId),
    ) ?? [];
  const [selection, setSelection] = useState(
    source.projectId ? `project:${source.projectId}` : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const scopeId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useModalFocusBoundary({
    active: true,
    isolateBackground: true,
    isolationBoundaryRef: backdropRef,
    initialFocusSelector: "select",
    restoreFocus: true,
    restoreFocusTarget: source.returnFocusTarget,
    onClose: () => {
      if (!busy) onClose();
    },
  });
  const validSelection =
    (selection === `project:${source.projectId}` &&
      Boolean(source.projectId)) ||
    available.some((team) => selection === `team:${team.id}`);
  const submit = async () => {
    if (busy || !validSelection) return;
    setBusy(true);
    setError("");
    try {
      const separator = selection.indexOf(":");
      await promoteKnowledgeMessage({
        sourceBotId: source.botId,
        sessionId: source.sessionId,
        message: source.message,
        scope: {
          kind: selection.slice(0, separator) === "team" ? "team" : "project",
          id: selection.slice(separator + 1),
        },
      });
      onSaved(source.sessionId);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogFrame
      title="Promote this finding"
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
        Save exactly this completed message with its provenance. Promotion stays
        private until you grant access in Shared knowledge.
      </p>
      <label className="grid gap-2 text-sm" htmlFor={scopeId}>
        Project or team
        <NativeSelect
          id={scopeId}
          value={selection}
          onChange={(event) => setSelection(event.target.value)}
          disabled={busy}
        >
          <option value="">Choose a scope</option>
          {source.projectId ? (
            <option value={`project:${source.projectId}`}>
              This conversation’s project
            </option>
          ) : null}
          {available.map((team) => (
            <option key={team.id} value={`team:${team.id}`}>
              Team · {team.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      {teams.loading && !teams.data ? (
        <StateSurface kind="loading" title="Loading your teams" />
      ) : null}
      {teams.error ? (
        <StateSurface kind="error" title="Teams are unavailable">
          {teams.error}
        </StateSurface>
      ) : null}
      {!teams.loading &&
      !teams.error &&
      !source.projectId &&
      !available.length ? (
        <StateSurface kind="empty" title="Choose a sharing scope first">
          Add this bot to a team in Team &amp; work → Agents, or start a project
          conversation. No private history has been shared.
        </StateSurface>
      ) : null}
      {selection.startsWith("team:") ? (
        <p className="m-0 text-sm text-[var(--muted)]">
          Team grants may share this selected finding across projects. Both bots
          must remain current team members.
        </p>
      ) : null}
      {error ? (
        <StateSurface kind="error" title="Finding was not promoted">
          {error}
        </StateSurface>
      ) : null}
      <Button disabled={busy || !validSelection} onClick={() => void submit()}>
        {busy ? "Saving…" : "Save finding"}
      </Button>
    </DialogFrame>
  );
}
