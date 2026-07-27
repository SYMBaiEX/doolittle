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
import "./acp-bridge-panel.css";

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
    <section aria-labelledby="acp-bridge-heading" className="acp-bridge-panel">
      <header className="acp-bridge-header">
        <div>
          <span className="eyebrow">Experimental</span>
          <h2 id="acp-bridge-heading">ACP bridge</h2>
          <p>
            A configured-command bridge for local discovery and diagnostics. It
            is not a verified Agent Client Protocol editor integration.
          </p>
        </div>
        <div className="acp-bridge-actions">
          <Badge tone={configured ? "good" : "warn"}>
            {acpBridgeStatusLabel(bridge)}
          </Badge>
          <button className="secondary-button" onClick={refresh} type="button">
            Refresh
          </button>
        </div>
      </header>

      {loading ? <LoadingBlock label="Checking ACP bridge…" /> : null}
      {staticError ? (
        <Notice tone="bad">
          Could not read the local ACP bridge: {staticError}
        </Notice>
      ) : null}
      {!loading && !staticError ? (
        <>
          <div className="acp-bridge-summary">
            <div>
              <span>Command</span>
              <strong>
                {configured ? "Configured locally" : "Not configured"}
              </strong>
              <small>{bridge?.detail || "No bridge status returned."}</small>
            </div>
            <div>
              <span>Registered tools</span>
              <strong>{bridge?.toolCount ?? 0}</strong>
              <small>
                {sessionSummary?.totalSessions ?? 0} local sessions observed
              </small>
            </div>
            <div>
              <span>Last probe</span>
              <strong>{displayTimestamp(bridge?.lastProbeAt)}</strong>
              <small>{bridge?.lastError || "No bridge error recorded."}</small>
            </div>
          </div>

          {!configured ? (
            <Notice tone="warn">
              Set <code>ACP_SERVER_COMMAND</code> and restart the local runtime
              before probing. This screen does not install, publish, import, or
              invoke an ACP command.
            </Notice>
          ) : (
            <div className="acp-bridge-probe-row">
              <div>
                <strong>Connection probe</strong>
                <span>
                  Runs the configured command with a safe <code>--help</code>{" "}
                  probe.
                </span>
              </div>
              <button
                className="secondary-button"
                disabled={probing}
                onClick={() => void probe()}
                type="button"
              >
                {probing ? "Probing…" : "Probe bridge"}
              </button>
            </div>
          )}
          {probeNotice ? (
            <Notice
              tone={probeNotice.startsWith("Probe passed") ? "good" : "bad"}
            >
              {probeNotice}
            </Notice>
          ) : null}

          <div className="acp-bridge-lower-grid">
            <article className="acp-bridge-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Observed locally</span>
                  <h3>Recent sessions</h3>
                </div>
                <Badge tone="neutral">
                  {sessionSummary?.titledSessions ?? 0} titled
                </Badge>
              </div>
              {sessionSummary?.recentTitles?.length ? (
                <ul className="acp-bridge-session-list">
                  {[...new Set(sessionSummary.recentTitles)].map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ul>
              ) : (
                <p className="acp-bridge-muted">
                  No titled local sessions are available yet.
                </p>
              )}
            </article>

            <article className="acp-bridge-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Bridge metadata</span>
                  <h3>Editor-facing record</h3>
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
              <p className="acp-bridge-muted">
                {editor.data?.editor?.registryPath
                  ? "A local registry path is available to the configured command."
                  : "No local editor-facing record is available yet."}
              </p>
              <code className="acp-bridge-path">
                {editor.data?.editor?.registryPath || "Not available"}
              </code>
            </article>
          </div>

          <article className="acp-bridge-card acp-bridge-tools">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Read-only discovery</span>
                <h3>Search bridge tools</h3>
              </div>
              {toolQuery ? (
                <Badge tone="neutral">{searchedTools.length} matches</Badge>
              ) : null}
            </div>
            <form className="acp-bridge-search" onSubmit={search}>
              <input
                aria-label="Search ACP bridge tools"
                maxLength={256}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Search by tool name, description, kind, or source"
                value={draftQuery}
              />
              <button className="secondary-button" type="submit">
                Search
              </button>
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
              <EmptyBlock title="No bridge tools match">
                Try a broader local tool search.
              </EmptyBlock>
            ) : null}
            {searchedTools.length ? (
              <div className="acp-bridge-tool-list">
                {searchedTools.map((tool) => (
                  <article key={`${tool.source}:${tool.name}`}>
                    <div>
                      <code>{tool.name}</code>
                      <span>{tool.description}</span>
                    </div>
                    <small>
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
