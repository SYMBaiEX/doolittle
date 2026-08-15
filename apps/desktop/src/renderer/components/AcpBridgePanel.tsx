import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { type FormEvent, useState } from "react";
import type {
  AcpBridgeSessionSummary,
  AcpBridgeStatus,
  AcpBridgeTool,
} from "../../shared/contracts";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  useApiResource,
} from "../lib";

const PANEL_CLASS =
  "grid gap-3.5 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_42%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent-soft)_48%,var(--surface-raised)),var(--surface-raised)_58%)] p-[18px]";
const HEADER_CLASS =
  "flex items-start justify-between gap-4 max-[760px]:flex-col";
const HEADING_CLASS = "mt-1 text-xl font-bold";
const DESCRIPTION_CLASS =
  "mt-[7px] max-w-2xl text-[13px] leading-[1.55] text-[var(--text-soft)]";
const ACTIONS_CLASS = "flex items-center gap-2";
const SUMMARY_CLASS = "grid grid-cols-3 gap-2.5 max-[760px]:grid-cols-1";
const CARD_CLASS =
  "min-w-0 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-raised)_88%,transparent)] p-[13px]";
const SUMMARY_CARD_CLASS = `${CARD_CLASS} flex flex-col gap-[5px]`;
const SUMMARY_LABEL_CLASS =
  "font-[var(--font-mono)] text-[10px] uppercase tracking-[0.05em] text-[var(--muted)]";
const MUTED_CLASS = "m-0 text-[11px] leading-[1.45] text-[var(--text-soft)]";
const PROBE_CLASS =
  "flex items-center justify-between gap-4 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-raised)_90%,transparent)] px-[13px] py-3 max-[760px]:flex-col max-[760px]:items-start";
const CARD_HEADING_CLASS = "mb-2.5 flex items-start justify-between gap-3";
const EYEBROW_CLASS =
  "font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]";

interface AcpStatusResponse {
  acp?: AcpBridgeStatus;
}

interface AcpEditorResponse {
  editor?: { commandConfigured?: boolean; registryPath?: string };
}

interface AcpSessionsResponse {
  sessions?: AcpBridgeSessionSummary;
}

interface AcpToolsResponse {
  tools?: AcpBridgeTool[];
}

export function normalizeAcpTools(value: unknown): AcpBridgeTool[] {
  return asArray(value)
    .map((entry): AcpBridgeTool | null => {
      const record = asRecord(entry);
      const name = asString(record.name).trim();
      if (!name) return null;
      return {
        name,
        description: asString(record.description, "No description provided."),
        kind: asString(record.kind, "other"),
        source: asString(record.source, "doolittle"),
      };
    })
    .filter((tool): tool is AcpBridgeTool => tool !== null);
}

export function acpBridgeStatusLabel(
  status: AcpBridgeStatus | undefined,
): string {
  if (!status) return "Checking";
  return status.enabled ? "Configured" : "Not configured";
}

export function acpBridgeSummary(
  bridge: AcpBridgeStatus | undefined,
  sessions: AcpBridgeSessionSummary | undefined,
  unavailable = false,
) {
  return {
    command: unavailable
      ? "Unavailable"
      : bridge?.enabled
        ? "Configured locally"
        : "Not configured",
    detail:
      bridge?.detail ||
      (unavailable
        ? "Bridge status could not be read."
        : "No bridge status returned."),
    toolCount: bridge?.toolCount ?? 0,
    sessionCount: sessions?.totalSessions ?? 0,
    lastProbe: displayTimestamp(bridge?.lastProbeAt),
    lastError: bridge?.lastError || "No bridge error recorded.",
  };
}

export function AcpBridgePanel({ active }: { active: boolean }) {
  const status = useApiResource<AcpStatusResponse>(
    active ? "/acp/status" : null,
    [active],
  );
  const editor = useApiResource<AcpEditorResponse>(
    active ? "/acp/editor" : null,
    [active],
  );
  const sessions = useApiResource<AcpSessionsResponse>(
    active ? "/acp/sessions?limit=5" : null,
    [active],
  );
  const [draftQuery, setDraftQuery] = useState("");
  const [toolQuery, setToolQuery] = useState("");
  const tools = useApiResource<AcpToolsResponse>(
    active && toolQuery
      ? `/acp/tools?query=${encodeURIComponent(toolQuery)}`
      : null,
    [active, toolQuery],
  );
  const [probing, setProbing] = useState(false);
  const [probeNotice, setProbeNotice] = useState("");

  const bridge = status.data?.acp;
  const sessionSummary = sessions.data?.sessions;
  const searchedTools = normalizeAcpTools(tools.data?.tools);
  const configured = bridge?.enabled === true;
  const loading = status.loading || editor.loading || sessions.loading;
  const staticError = status.error || editor.error || sessions.error;
  const summary = acpBridgeSummary(
    bridge,
    sessionSummary,
    Boolean(staticError),
  );

  const refresh = () => {
    status.reload();
    editor.reload();
    sessions.reload();
    tools.reload();
  };

  const search = (event: FormEvent) => {
    event.preventDefault();
    setToolQuery(draftQuery.trim().slice(0, 256));
  };

  const probe = async () => {
    if (!configured || probing) return;
    setProbing(true);
    setProbeNotice("");
    try {
      const result = await desktopRequest<{
        probe?: { ok?: boolean; detail?: string };
      }>("/acp/probe", "POST");
      const detail = asString(
        result.probe?.detail,
        "The bridge did not return a probe detail.",
      );
      setProbeNotice(
        result.probe?.ok
          ? `Probe passed: ${detail}`
          : `Probe failed: ${detail}`,
      );
      status.reload();
    } catch (cause) {
      setProbeNotice(`Probe failed: ${errorMessage(cause)}`);
    } finally {
      setProbing(false);
    }
  };

  return (
    <section aria-labelledby="acp-bridge-heading" className={PANEL_CLASS}>
      <header className={HEADER_CLASS}>
        <div>
          <span className={EYEBROW_CLASS}>Experimental</span>
          <h2 className={HEADING_CLASS} id="acp-bridge-heading">
            ACP bridge
          </h2>
          <p className={DESCRIPTION_CLASS}>
            A configured-command bridge for local discovery and diagnostics. It
            is not a verified Agent Client Protocol editor integration.
          </p>
        </div>
        <div className={ACTIONS_CLASS}>
          <Badge tone={staticError ? "bad" : configured ? "good" : "warn"}>
            {staticError ? "Unavailable" : acpBridgeStatusLabel(bridge)}
          </Badge>
          <Button onClick={refresh} size="sm" type="button" variant="outline">
            Refresh
          </Button>
        </div>
      </header>

      {loading ? <LoadingBlock label="Checking ACP bridge…" /> : null}
      {staticError ? (
        <Notice tone="bad">
          Could not read the local ACP bridge: {staticError}
        </Notice>
      ) : null}
      {!loading ? (
        <div className={`acp-bridge-summary ${SUMMARY_CLASS}`}>
          <div className={SUMMARY_CARD_CLASS}>
            <span className={SUMMARY_LABEL_CLASS}>Command</span>
            <strong className="text-[15px]">{summary.command}</strong>
            <small className={MUTED_CLASS}>{summary.detail}</small>
          </div>
          <div className={SUMMARY_CARD_CLASS}>
            <span className={SUMMARY_LABEL_CLASS}>Registered tools</span>
            <strong className="text-[15px]">{summary.toolCount}</strong>
            <small className={MUTED_CLASS}>
              {summary.sessionCount} local sessions observed
            </small>
          </div>
          <div className={SUMMARY_CARD_CLASS}>
            <span className={SUMMARY_LABEL_CLASS}>Last probe</span>
            <strong className="text-[15px]">{summary.lastProbe}</strong>
            <small className={MUTED_CLASS}>{summary.lastError}</small>
          </div>
        </div>
      ) : null}
      {!loading && !staticError ? (
        <>
          {!configured ? (
            <Notice tone="warn">
              Set <code>ACP_SERVER_COMMAND</code> and restart the local runtime
              before probing. This screen does not install, publish, import, or
              invoke an ACP command.
            </Notice>
          ) : (
            <div className={PROBE_CLASS}>
              <div className="flex flex-col gap-1">
                <strong>Connection probe</strong>
                <span className="text-xs text-[var(--text-soft)]">
                  Runs the configured command with a safe <code>--help</code>{" "}
                  probe.
                </span>
              </div>
              <Button
                disabled={probing}
                onClick={() => void probe()}
                size="sm"
                type="button"
                variant="outline"
              >
                {probing ? "Probing…" : "Probe bridge"}
              </Button>
            </div>
          )}
          {probeNotice ? (
            <Notice
              tone={probeNotice.startsWith("Probe passed") ? "good" : "bad"}
            >
              {probeNotice}
            </Notice>
          ) : null}

          <div className="grid grid-cols-2 gap-2.5 max-[760px]:grid-cols-1">
            <article className={CARD_CLASS}>
              <div className={CARD_HEADING_CLASS}>
                <div>
                  <span className={EYEBROW_CLASS}>Observed locally</span>
                  <h3 className="mt-[3px] text-[15px] font-bold">
                    Recent sessions
                  </h3>
                </div>
                <Badge tone="neutral">
                  {sessionSummary?.titledSessions ?? 0} titled
                </Badge>
              </div>
              {sessionSummary?.recentTitles?.length ? (
                <ul className="m-0 grid gap-1.5 pl-[18px] text-xs text-[var(--text-soft)]">
                  {[...new Set(sessionSummary.recentTitles)].map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ul>
              ) : (
                <p className={MUTED_CLASS}>
                  No titled local sessions are available yet.
                </p>
              )}
            </article>

            <article className={CARD_CLASS}>
              <div className={CARD_HEADING_CLASS}>
                <div>
                  <span className={EYEBROW_CLASS}>Bridge metadata</span>
                  <h3 className="mt-[3px] text-[15px] font-bold">
                    Editor-facing record
                  </h3>
                </div>
                <Badge
                  tone={
                    editor.data?.editor?.commandConfigured ? "good" : "warn"
                  }
                >
                  {editor.data?.editor?.commandConfigured
                    ? "Command set"
                    : "Command missing"}
                </Badge>
              </div>
              <p className={MUTED_CLASS}>
                {editor.data?.editor?.registryPath
                  ? "A local registry path is available to the configured command."
                  : "No local editor-facing record is available yet."}
              </p>
              <code className="mt-2.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[var(--muted)]">
                {editor.data?.editor?.registryPath || "Not available"}
              </code>
            </article>
          </div>

          <article className={`${CARD_CLASS} grid gap-2.5`}>
            <div className={CARD_HEADING_CLASS}>
              <div>
                <span className={EYEBROW_CLASS}>Read-only discovery</span>
                <h3 className="mt-[3px] text-[15px] font-bold">
                  Search bridge tools
                </h3>
              </div>
              {toolQuery ? (
                <Badge tone="neutral">{searchedTools.length} matches</Badge>
              ) : null}
            </div>
            <form className="flex gap-2" onSubmit={search}>
              <Input
                aria-label="Search ACP bridge tools"
                className="min-w-0 flex-1"
                maxLength={256}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Search by tool name, description, kind, or source"
                value={draftQuery}
              />
              <Button size="sm" type="submit" variant="outline">
                Search
              </Button>
            </form>
            {tools.loading ? (
              <LoadingBlock label="Searching bridge tools…" />
            ) : null}
            {tools.error ? (
              <Notice tone="bad">
                Could not search bridge tools: {tools.error}
              </Notice>
            ) : null}
            {!tools.loading &&
            !tools.error &&
            toolQuery &&
            !searchedTools.length ? (
              <EmptyBlock density="compact" title="No bridge tools match">
                Try a broader local tool search.
              </EmptyBlock>
            ) : null}
            {searchedTools.length ? (
              <div className="acp-bridge-tool-list grid gap-[7px]">
                {searchedTools.map((tool) => (
                  <article
                    className="flex items-start justify-between gap-3 border-t border-[var(--border)] py-[9px]"
                    key={`${tool.source}:${tool.name}`}
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <code className="text-[11px] text-[var(--accent)]">
                        {tool.name}
                      </code>
                      <span className="text-xs leading-[1.4] text-[var(--text-soft)]">
                        {tool.description}
                      </span>
                    </div>
                    <small className="shrink-0 text-[10px] text-[var(--muted)]">
                      {tool.kind} · {tool.source}
                    </small>
                  </article>
                ))}
              </div>
            ) : null}
          </article>
        </>
      ) : null}
    </section>
  );
}
