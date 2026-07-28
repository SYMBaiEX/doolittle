import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  DesktopLifecycleState,
  DesktopUpdateState,
  PluginsResponse,
  RuntimeStatus,
} from "../shared/contracts";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  titleCase,
  type UnknownRecord,
  useApiResource,
} from "./lib";

export { AutomationsPage } from "./AutomationsPage";

interface CronResponse {
  jobs?: unknown[];
  runs?: unknown[];
}

interface SecretsResponse {
  keys?: unknown[];
}

interface SecretValueResponse {
  key?: string;
  value?: string | null;
}

export function LegacyAutomationsPage({ active }: { active: boolean }) {
  const jobs = useApiResource<CronResponse>(active ? "/cron/jobs" : null, [
    active,
  ]);
  const runs = useApiResource<CronResponse>(active ? "/cron/runs" : null, [
    active,
  ]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 9 * * 1-5");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const entries = asArray(jobs.data?.jobs).map(asRecord);
  const runEntries = asArray(runs.data?.runs).map(asRecord);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!schedule.trim() || !prompt.trim()) return;
    setBusy("create");
    setFeedback("");
    try {
      await desktopRequest("/cron/jobs", "POST", {
        name: name.trim() || `Automation ${entries.length + 1}`,
        schedule: schedule.trim(),
        prompt: prompt.trim(),
        delivery: "local",
      });
      setName("");
      setPrompt("");
      setShowCreate(false);
      setFeedback("Automation created.");
      jobs.reload();
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const act = async (
    id: string,
    action: "pause" | "resume" | "run" | "delete",
  ) => {
    setBusy(`${id}:${action}`);
    setFeedback("");
    try {
      await desktopRequest(
        `/cron/jobs/${encodeURIComponent(id)}${action === "delete" ? "" : `/${action}`}`,
        action === "delete" ? "DELETE" : "POST",
      );
      setFeedback(
        action === "delete"
          ? "Automation deleted."
          : `Automation ${action === "run" ? "queued" : `${action}d`}.`,
      );
      jobs.reload();
      runs.reload();
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operations"
        title="Automations"
        description="Schedule recurring agent work, run it on demand, and inspect recent execution receipts."
        actions={
          <button
            className="primary-button"
            onClick={() => setShowCreate((value) => !value)}
            type="button"
          >
            {showCreate ? "Close" : "New automation"}
          </button>
        }
      />
      {showCreate ? (
        <form className="content-card automation-form" onSubmit={create}>
          <div className="card-heading">
            <div>
              <span className="eyebrow">New scheduled job</span>
              <h2>Describe what should happen</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Weekday brief"
              />
            </label>
            <label>
              <span>Cron schedule</span>
              <input
                required
                value={schedule}
                onChange={(event) => setSchedule(event.target.value)}
                placeholder="0 9 * * 1-5"
              />
              <small>Minute hour day-of-month month day-of-week</small>
            </label>
            <label className="field-span">
              <span>Prompt</span>
              <textarea
                required
                rows={4}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Review active work and prepare a concise morning brief."
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="primary-button"
              disabled={busy === "create"}
              type="submit"
            >
              {busy === "create" ? "Creating…" : "Create automation"}
            </button>
          </div>
        </form>
      ) : null}
      {feedback ? <Notice>{feedback}</Notice> : null}
      <div className="two-column-grid operations-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Schedule</span>
              <h2>Jobs</h2>
            </div>
            <Badge>{entries.length}</Badge>
          </div>
          {jobs.loading ? (
            <LoadingBlock label="Loading automations…" />
          ) : jobs.error ? (
            <ErrorBlock error={jobs.error} retry={jobs.reload} />
          ) : entries.length ? (
            <div className="stack-list">
              {entries.map((entry, index) => {
                const id = asString(entry.id, String(index));
                const status = asString(entry.status, "active");
                return (
                  <article className="automation-row" key={id}>
                    <div className="automation-title">
                      <div>
                        <strong>
                          {asString(entry.name, `Automation ${index + 1}`)}
                        </strong>
                        <code>{asString(entry.schedule, "No schedule")}</code>
                      </div>
                      <Badge tone={status === "paused" ? "warn" : "good"}>
                        {titleCase(status)}
                      </Badge>
                    </div>
                    <p>{asString(entry.prompt, "No prompt")}</p>
                    <small>
                      Next:{" "}
                      {displayTimestamp(asString(entry.nextRunAt) || undefined)}
                    </small>
                    <div className="button-row">
                      <button
                        className="secondary-button"
                        disabled={Boolean(busy)}
                        onClick={() => void act(id, "run")}
                        type="button"
                      >
                        Run now
                      </button>
                      <button
                        className="secondary-button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void act(id, status === "paused" ? "resume" : "pause")
                        }
                        type="button"
                      >
                        {status === "paused" ? "Resume" : "Pause"}
                      </button>
                      <button
                        className="danger-button"
                        disabled={Boolean(busy)}
                        onClick={() => void act(id, "delete")}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyBlock title="No automations yet">
              Create a scheduled job to let Doolittle work on a recurring
              cadence.
            </EmptyBlock>
          )}
        </section>
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Receipts</span>
              <h2>Recent runs</h2>
            </div>
            <button className="text-button" onClick={runs.reload} type="button">
              Refresh
            </button>
          </div>
          {runs.loading ? (
            <LoadingBlock />
          ) : runs.error ? (
            <ErrorBlock error={runs.error} retry={runs.reload} />
          ) : runEntries.length ? (
            <div className="timeline">
              {runEntries.map((entry, index) => {
                const status = asString(entry.status, "completed");
                return (
                  <div
                    className="timeline-item"
                    key={asString(entry.id, String(index))}
                  >
                    <i className={status} />
                    <div>
                      <strong>
                        {asString(
                          entry.jobName,
                          asString(entry.name, "Automation run"),
                        )}
                      </strong>
                      <p>
                        {asString(
                          entry.summary,
                          asString(entry.detail, titleCase(status)),
                        )}
                      </p>
                      <small>
                        {displayTimestamp(
                          asString(
                            entry.completedAt,
                            asString(entry.startedAt),
                          ) || undefined,
                        )}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyBlock title="No run receipts">
              Completed automation runs will be recorded here.
            </EmptyBlock>
          )}
        </section>
      </div>
    </div>
  );
}

interface LogsResponse {
  logs?: unknown[];
}

interface DeliveriesResponse {
  deliveries?: unknown[];
}

interface TerminalHistoryResponse {
  commands?: unknown[];
}

export function LogsPage({ active }: { active: boolean }) {
  const [level, setLevel] = useState("all");
  const [query, setQuery] = useState("");
  const params = new URLSearchParams({ limit: "500" });
  if (level !== "all") params.set("level", level);
  if (query.trim()) params.set("query", query.trim());
  const resource = useApiResource<LogsResponse>(
    active ? `/logs?${params.toString()}` : null,
    [active, level],
  );
  const deliveries = useApiResource<DeliveriesResponse>(
    active ? "/deliveries" : null,
    [active],
  );
  const terminalHistory = useApiResource<TerminalHistoryResponse>(
    active ? "/terminal/history" : null,
    [active],
  );
  const entries = asArray(resource.data?.logs).map(asRecord);
  const deliveryEntries = asArray(deliveries.data?.deliveries).map(asRecord);
  const commandEntries = asArray(terminalHistory.data?.commands).map(asRecord);

  return (
    <div className="page page-logs">
      <PageHeader
        eyebrow="Operations"
        title="Logs"
        description="Inspect the redacted structured event stream emitted by the private local runtime."
        actions={
          <button
            className="secondary-button"
            onClick={() => {
              resource.reload();
              deliveries.reload();
              terminalHistory.reload();
            }}
            type="button"
          >
            Refresh
          </button>
        }
      />
      <div className="metric-grid compact">
        <MetricCard label="Log records" value={entries.length} />
        <MetricCard label="Deliveries" value={deliveryEntries.length} />
        <MetricCard label="Terminal commands" value={commandEntries.length} />
        <MetricCard label="Filter" value={level === "all" ? "All" : level} />
      </div>
      <div className="filter-bar">
        <form
          className="search-field grow"
          onSubmit={(event) => {
            event.preventDefault();
            resource.reload();
          }}
        >
          <input
            aria-label="Search runtime logs"
            placeholder="Search messages, scopes, and details"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        <select
          aria-label="Log level"
          value={level}
          onChange={(event) => setLevel(event.target.value)}
        >
          <option value="all">All levels</option>
          <option value="trace">Trace</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warnings</option>
          <option value="error">Errors</option>
          <option value="fatal">Fatal</option>
        </select>
      </div>
      {resource.loading ? (
        <LoadingBlock label="Reading event log…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : entries.length ? (
        <section className="log-console" aria-label="Runtime logs">
          {entries.map((entry) => {
            const logLevel = asString(entry.level, "info");
            return (
              <article
                className="log-row"
                key={`${asString(entry.at)}:${asString(entry.scope)}:${asString(
                  entry.message,
                )}`}
              >
                <time>{displayTimestamp(asString(entry.at) || undefined)}</time>
                <Badge
                  tone={
                    logLevel === "error" || logLevel === "fatal"
                      ? "bad"
                      : logLevel === "warn"
                        ? "warn"
                        : "neutral"
                  }
                >
                  {logLevel}
                </Badge>
                <code>{asString(entry.scope, "runtime")}</code>
                <div>
                  <strong>{asString(entry.message, "Event")}</strong>
                  {entry.detail ? <p>{asString(entry.detail)}</p> : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyBlock title="No matching log events">
          The current filters did not match any recent records.
        </EmptyBlock>
      )}
      <div className="two-column-grid" style={{ marginTop: "16px" }}>
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Delivery state</span>
              <h2>Recent deliveries</h2>
            </div>
            <button
              className="text-button"
              onClick={deliveries.reload}
              type="button"
            >
              Refresh
            </button>
          </div>
          {deliveries.loading ? (
            <LoadingBlock />
          ) : deliveries.error ? (
            <ErrorBlock error={deliveries.error} retry={deliveries.reload} />
          ) : deliveryEntries.length ? (
            <div className="stack-list">
              {deliveryEntries.slice(0, 12).map((entry, index) => (
                <div
                  className="status-row"
                  key={`${asString(entry.id, "delivery")}:${String(index)}`}
                >
                  <div>
                    <strong>
                      {asString(
                        entry.platform,
                        asString(entry.channel, "Delivery"),
                      )}
                    </strong>
                    <small>
                      {asString(
                        entry.preview,
                        asString(
                          entry.detail,
                          asString(entry.message, "No preview"),
                        ),
                      )}
                    </small>
                  </div>
                  <Badge>
                    {asString(entry.status, asString(entry.state, "recorded"))}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock title="No deliveries recorded">
              Delivery traces will appear here once gateway or home outputs run.
            </EmptyBlock>
          )}
        </section>
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Command trail</span>
              <h2>Terminal history</h2>
            </div>
            <button
              className="text-button"
              onClick={terminalHistory.reload}
              type="button"
            >
              Refresh
            </button>
          </div>
          {terminalHistory.loading ? (
            <LoadingBlock />
          ) : terminalHistory.error ? (
            <ErrorBlock
              error={terminalHistory.error}
              retry={terminalHistory.reload}
            />
          ) : commandEntries.length ? (
            <div className="stack-list">
              {commandEntries.slice(0, 12).map((entry, index) => (
                <div
                  className="status-row"
                  key={`${asString(entry.command, "command")}:${String(index)}`}
                >
                  <div>
                    <strong>
                      {asString(entry.command, "Unknown command")}
                    </strong>
                    <small>
                      {[
                        asString(entry.backend),
                        asString(entry.cwd),
                        asString(entry.status),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No command metadata"}
                    </small>
                  </div>
                  <Badge tone={entry.ok === false ? "bad" : "neutral"}>
                    {entry.ok === false
                      ? "Failed"
                      : entry.ok === true
                        ? "OK"
                        : asString(entry.exitCode, "Recorded")}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock title="No recent commands">
              Local terminal execution history has not been recorded yet.
            </EmptyBlock>
          )}
        </section>
      </div>
    </div>
  );
}

interface SettingsResponse {
  settings?: UnknownRecord;
}

interface ThemeResponse {
  active?: string;
  profile?: UnknownRecord;
  themes?: unknown[];
}

interface GatewayHealthResponse {
  summary?: UnknownRecord;
  transportControl?: UnknownRecord;
  sessions?: unknown[];
  deliveries?: unknown[];
  traces?: unknown[];
}

interface GatewayRuntimeResponse {
  summary?: UnknownRecord;
  runtime?: UnknownRecord;
  transportControl?: UnknownRecord;
  transportInventory?: unknown[];
  messagingPlugins?: unknown[];
}

interface FlatSetting {
  path: string;
  value: unknown;
  category: string;
}

function flattenSettings(
  value: unknown,
  prefix = "",
  output: FlatSetting[] = [],
): FlatSetting[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    output.push({
      path: prefix,
      value,
      category: prefix.split(".")[0] || "general",
    });
    return output;
  }
  for (const [key, child] of Object.entries(value as UnknownRecord)) {
    flattenSettings(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function formatJson(value: unknown, maxCharacters = 30_000): string {
  let formatted: string;
  try {
    formatted = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    formatted = String(value);
  }
  return formatted.length <= maxCharacters
    ? formatted
    : `${formatted.slice(0, maxCharacters)}\n… (${formatted.length - maxCharacters} more characters)`;
}

const selectOptions: Record<string, string[]> = {
  "model.provider": [
    "ollama",
    "elizacloud",
    "codex",
    "claude-code",
    "devin",
    "openai",
    "anthropic",
  ],
  "execution.backend": [
    "local",
    "docker",
    "ssh",
    "singularity",
    "daytona",
    "modal",
  ],
  "execution.remoteSyncMode": ["mirror", "upload", "none"],
  "execution.remoteArtifactPolicy": ["metadata-only", "download", "ignore"],
  "agent.runDepth": ["minimal", "standard", "deep"],
  "agent.toolProgressMode": ["off", "new", "all"],
};

function SettingControl({
  field,
  saved,
}: {
  field: FlatSetting;
  saved: () => void;
}) {
  const initial = Array.isArray(field.value)
    ? field.value.join("\n")
    : typeof field.value === "boolean"
      ? field.value
      : String(field.value ?? "");
  const [value, setValue] = useState<string | boolean>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = selectOptions[field.path];

  const persist = async () => {
    setBusy(true);
    setError("");
    let next: unknown = value;
    if (Array.isArray(field.value)) {
      next = String(value)
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (typeof field.value === "number") {
      next = Number(value);
    }
    try {
      await desktopRequest("/settings", "POST", {
        path: field.path,
        value: next,
      });
      saved();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setting-row">
      <div className="setting-copy">
        <strong>{titleCase(field.path.split(".").at(-1) ?? field.path)}</strong>
        <code>{field.path}</code>
      </div>
      <div className="setting-control">
        {typeof field.value === "boolean" ? (
          <label className="switch">
            <input
              checked={Boolean(value)}
              type="checkbox"
              onChange={(event) => setValue(event.target.checked)}
            />
            <i />
            <span>{value ? "On" : "Off"}</span>
          </label>
        ) : Array.isArray(field.value) ? (
          <textarea
            rows={Math.min(4, Math.max(2, field.value.length))}
            value={String(value)}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : options ? (
          <select
            value={String(value)}
            onChange={(event) => setValue(event.target.value)}
          >
            {!options.includes(String(value)) ? (
              <option value={String(value)}>{String(value)}</option>
            ) : null}
            {options.map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={typeof field.value === "number" ? "number" : "text"}
            value={String(value)}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void persist()}
          type="button"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error ? <small className="field-error">{error}</small> : null}
    </div>
  );
}

export function SettingsPage({ active }: { active: boolean }) {
  const settings = useApiResource<SettingsResponse>(
    active ? "/settings" : null,
    [active],
  );
  const themes = useApiResource<ThemeResponse>(active ? "/theme" : null, [
    active,
  ]);
  const execution = useApiResource<Record<string, unknown>>(
    active ? "/execution/status" : null,
    [active],
  );
  const [category, setCategory] = useState("model");
  const [query, setQuery] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [lifecycle, setLifecycle] = useState<DesktopLifecycleState | null>(
    null,
  );
  const [update, setUpdate] = useState<DesktopUpdateState | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    void window.doolittle
      .getLifecycleState()
      .then((state) => mounted && setLifecycle(state));
    void window.doolittle
      .getUpdateState()
      .then((state) => mounted && setUpdate(state));
    return window.doolittle.onUpdateState((state) => {
      if (mounted) setUpdate(state);
    });
  }, [active]);
  const fields = useMemo(
    () => flattenSettings(settings.data?.settings ?? {}),
    [settings.data],
  );
  const categories = [...new Set(fields.map((field) => field.category))];
  const visibleFields = fields.filter((field) => {
    const normalized = query.trim().toLowerCase();
    return (
      (category === "all" || field.category === category) &&
      (!normalized || field.path.toLowerCase().includes(normalized))
    );
  });

  const changeTheme = async (theme: string) => {
    try {
      await desktopRequest("/theme", "POST", { theme });
      setSavedMessage("Theme saved.");
      themes.reload();
      settings.reload();
    } catch (error) {
      setSavedMessage(errorMessage(error));
    }
  };

  return (
    <div className="page page-settings">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Every persisted non-secret runtime setting, grouped by subsystem and saved directly to Doolittle’s local settings service."
        actions={
          <button
            className="secondary-button"
            onClick={settings.reload}
            type="button"
          >
            Reload
          </button>
        }
      />
      {savedMessage ? <Notice>{savedMessage}</Notice> : null}
      {settings.loading ? (
        <LoadingBlock label="Loading runtime configuration…" />
      ) : settings.error ? (
        <ErrorBlock error={settings.error} retry={settings.reload} />
      ) : (
        <div className="settings-layout">
          <aside className="settings-nav">
            <button
              className={category === "all" ? "selected" : ""}
              onClick={() => setCategory("all")}
              type="button"
            >
              <span>All settings</span>
              <small>{fields.length}</small>
            </button>
            {categories.map((value) => (
              <button
                className={category === value ? "selected" : ""}
                key={value}
                onClick={() => setCategory(value)}
                type="button"
              >
                <span>{titleCase(value)}</span>
                <small>
                  {fields.filter((field) => field.category === value).length}
                </small>
              </button>
            ))}
            <div className="settings-nav-note">
              <strong>Secrets stay protected</strong>
              <p>
                API keys and OAuth tokens are never returned to the renderer.
              </p>
            </div>
          </aside>
          <section className="settings-content">
            <div className="filter-bar">
              <label className="search-field grow">
                <span className="sr-only">Search settings</span>
                <input
                  placeholder="Search settings"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            {category === "ui" || category === "all" ? (
              <section className="settings-group">
                <div className="settings-group-heading">
                  <div>
                    <span className="eyebrow">Appearance</span>
                    <h2>Runtime theme</h2>
                  </div>
                  <Badge>
                    {titleCase(asString(themes.data?.active, "orange"))}
                  </Badge>
                </div>
                <div className="theme-grid">
                  {asArray(themes.data?.themes).map((value, index) => {
                    const entry = asRecord(value);
                    const name = asString(entry.name, String(index));
                    return (
                      <button
                        className={
                          themes.data?.active === name ? "selected" : ""
                        }
                        key={name}
                        onClick={() => void changeTheme(name)}
                        type="button"
                      >
                        <i
                          style={{
                            background: asString(entry.primary, "#ff6a00"),
                          }}
                        />
                        <span>{asString(entry.label, titleCase(name))}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {category === "ui" || category === "all" ? (
              <section className="settings-group">
                <div className="settings-group-heading">
                  <div>
                    <span className="eyebrow">Desktop</span>
                    <h2>Background & updates</h2>
                  </div>
                </div>
                <div className="settings-rows">
                  <div className="setting-row">
                    <div className="setting-copy">
                      <strong>Keep running in the background</strong>
                      <small>
                        When enabled, closing the window hides Doolittle so
                        active local work can continue. Quit always stops it.
                      </small>
                    </div>
                    <div className="setting-control">
                      <label className="switch">
                        <input
                          checked={lifecycle?.keepRunningInBackground ?? false}
                          disabled={!lifecycle}
                          type="checkbox"
                          onChange={(event) =>
                            void window.doolittle
                              .setKeepRunningInBackground(event.target.checked)
                              .then(setLifecycle)
                              .catch((error) =>
                                setSavedMessage(errorMessage(error)),
                              )
                          }
                        />
                        <i />
                        <span>
                          {lifecycle?.keepRunningInBackground ? "On" : "Off"}
                        </span>
                      </label>
                    </div>
                  </div>
                  <div className="setting-row">
                    <div className="setting-copy">
                      <strong>Application updates</strong>
                      <small>
                        {update?.message ?? "Loading update status…"}
                      </small>
                      {update?.progress !== undefined ? (
                        <small>{update.progress}% downloaded</small>
                      ) : null}
                    </div>
                    <div className="setting-control">
                      <div className="button-row">
                        <button
                          className="secondary-button"
                          disabled={
                            updateBusy ||
                            update?.phase === "unavailable" ||
                            update?.phase === "checking" ||
                            update?.phase === "downloading"
                          }
                          onClick={() => {
                            setUpdateBusy(true);
                            void window.doolittle
                              .checkForUpdates()
                              .then(setUpdate)
                              .catch((error) =>
                                setUpdate({
                                  phase: "error",
                                  message: errorMessage(error),
                                }),
                              )
                              .finally(() => setUpdateBusy(false));
                          }}
                          type="button"
                        >
                          Check for updates
                        </button>
                        {update?.phase === "available" ? (
                          <button
                            className="secondary-button"
                            disabled={updateBusy}
                            onClick={() => {
                              setUpdateBusy(true);
                              void window.doolittle
                                .downloadUpdate()
                                .then(setUpdate)
                                .catch((error) =>
                                  setUpdate({
                                    phase: "error",
                                    message: errorMessage(error),
                                  }),
                                )
                                .finally(() => setUpdateBusy(false));
                            }}
                            type="button"
                          >
                            Download
                          </button>
                        ) : null}
                        {update?.phase === "downloaded" ? (
                          <button
                            className="primary-button"
                            onClick={() =>
                              void window.doolittle
                                .installUpdate()
                                .catch((error) =>
                                  setSavedMessage(errorMessage(error)),
                                )
                            }
                            type="button"
                          >
                            Install and restart
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
            <section className="settings-group">
              <div className="settings-group-heading">
                <div>
                  <span className="eyebrow">{category}</span>
                  <h2>
                    {category === "all"
                      ? "Complete configuration"
                      : `${titleCase(category)} settings`}
                  </h2>
                </div>
                <Badge>{visibleFields.length} fields</Badge>
              </div>
              <div className="settings-rows">
                {visibleFields.length ? (
                  visibleFields.map((field) => (
                    <SettingControl
                      field={field}
                      key={`${field.path}:${JSON.stringify(field.value)}`}
                      saved={() => {
                        setSavedMessage(`${field.path} saved.`);
                        settings.reload();
                        if (field.category === "execution") execution.reload();
                      }}
                    />
                  ))
                ) : (
                  <EmptyBlock
                    title={query ? "No settings match" : "No settings loaded"}
                    actions={
                      <button
                        className="secondary-button"
                        onClick={settings.reload}
                        type="button"
                      >
                        Reload settings
                      </button>
                    }
                  >
                    {query
                      ? "Clear the search or choose another category."
                      : "Restart the local runtime if configuration has not loaded, then try again."}
                  </EmptyBlock>
                )}
              </div>
            </section>
            {category === "execution" || category === "all" ? (
              <section className="settings-group">
                <div className="settings-group-heading">
                  <div>
                    <span className="eyebrow">Readiness</span>
                    <h2>Execution backends</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={execution.reload}
                    type="button"
                  >
                    Recheck
                  </button>
                </div>
                {execution.loading ? (
                  <LoadingBlock />
                ) : execution.error ? (
                  <ErrorBlock
                    error={execution.error}
                    retry={execution.reload}
                  />
                ) : (
                  <div className="stack-list">
                    {asArray(execution.data?.backends).map((value, index) => {
                      const backend = asRecord(value);
                      return (
                        <div
                          className="status-row"
                          key={asString(backend.backend, String(index))}
                        >
                          <div>
                            <strong>
                              {titleCase(asString(backend.backend, "Backend"))}
                            </strong>
                            <small>
                              {asString(backend.detail, "No health detail")}
                            </small>
                          </div>
                          <Badge tone={backend.ready ? "good" : "warn"}>
                            {backend.ready ? "Ready" : "Unavailable"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

export function KeysPage({ active }: { active: boolean }) {
  const secrets = useApiResource<SecretsResponse>(active ? "/secrets" : null, [
    active,
  ]);
  const [selectedKey, setSelectedKey] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [revealedValue, setRevealedValue] = useState("");
  const [valueVisible, setValueVisible] = useState(false);
  const [busy, setBusy] = useState<"load" | "save" | "">("");
  const [feedback, setFeedback] = useState("");
  const clearSensitiveValue = useCallback(() => {
    setDraftValue("");
    setRevealedValue("");
    setValueVisible(false);
  }, []);

  const keys = useMemo(
    () =>
      asArray(secrets.data?.keys)
        .map((value) => asString(value))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [secrets.data],
  );

  useEffect(() => {
    if (!selectedKey && keys[0]) {
      setSelectedKey(keys[0]);
      setDraftKey(keys[0]);
    }
  }, [keys, selectedKey]);

  useEffect(() => {
    if (!revealedValue) return;
    const timeout = window.setTimeout(clearSensitiveValue, 60_000);
    const clearWhenHidden = () => {
      if (document.visibilityState === "hidden") clearSensitiveValue();
    };
    document.addEventListener("visibilitychange", clearWhenHidden);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", clearWhenHidden);
    };
  }, [clearSensitiveValue, revealedValue]);

  const loadValue = async (key = draftKey.trim()) => {
    if (!key) return;
    setBusy("load");
    setFeedback("");
    try {
      const response = await desktopRequest<SecretValueResponse>(
        "/secrets/get",
        "POST",
        { key },
      );
      setSelectedKey(key);
      setDraftKey(key);
      setRevealedValue(asString(response.value));
      setDraftValue(asString(response.value));
      setValueVisible(true);
      setFeedback(`Loaded ${key}.`);
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const saveValue = async (event: FormEvent) => {
    event.preventDefault();
    const key = draftKey.trim();
    if (!key) return;
    setBusy("save");
    setFeedback("");
    try {
      await desktopRequest("/secrets/set", "POST", {
        key,
        value: draftValue,
      });
      setSelectedKey(key);
      clearSensitiveValue();
      setFeedback(`Stored ${key}.`);
      secrets.reload();
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="page page-keys">
      <PageHeader
        eyebrow="Credentials"
        title="Keys"
        description="Inspect which local secrets exist, reveal a value on demand, and update provider credentials from the desktop shell."
        actions={
          <button
            className="secondary-button"
            onClick={secrets.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      {feedback ? (
        <Notice tone={feedback.startsWith("Stored") ? "good" : "neutral"}>
          {feedback}
        </Notice>
      ) : null}
      <div className="split-workspace">
        <section className="list-panel">
          <div className="detail-toolbar">
            <div>
              <span className="eyebrow">Known keys</span>
              <h2>Secret inventory</h2>
            </div>
            <Badge>{keys.length}</Badge>
          </div>
          {secrets.loading ? (
            <LoadingBlock label="Loading secret names…" />
          ) : secrets.error ? (
            <ErrorBlock error={secrets.error} retry={secrets.reload} />
          ) : (
            <div className="list-scroll">
              {keys.map((key) => (
                <button
                  className={`row-card ${selectedKey === key ? "selected" : ""}`}
                  key={key}
                  onClick={() => {
                    setSelectedKey(key);
                    setDraftKey(key);
                    setDraftValue("");
                    setRevealedValue("");
                    setValueVisible(false);
                    setFeedback("");
                  }}
                  type="button"
                >
                  <span className="row-card-main">
                    <strong>{key}</strong>
                    <small>Stored locally</small>
                  </span>
                </button>
              ))}
              {!keys.length ? (
                <EmptyBlock title="No stored keys">
                  Add your first provider or tool credential from the form.
                </EmptyBlock>
              ) : null}
            </div>
          )}
        </section>
        <section className="detail-panel">
          <div className="detail-toolbar">
            <div>
              <span className="eyebrow">Local secret store</span>
              <h2>{draftKey || "Add or update a key"}</h2>
            </div>
            {selectedKey ? <Badge>{selectedKey}</Badge> : null}
          </div>
          <form className="content-card form-card" onSubmit={saveValue}>
            <div className="field-grid">
              <label className="field-span">
                <span>Key name</span>
                <input
                  placeholder="OPENAI_API_KEY"
                  value={draftKey}
                  onChange={(event) => setDraftKey(event.target.value)}
                />
              </label>
              <label className="field-span">
                <span>Value</span>
                <input
                  autoComplete="off"
                  placeholder="Paste the local secret value"
                  type={valueVisible ? "text" : "password"}
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="secondary-button"
                disabled={busy === "load" || !draftKey.trim()}
                onClick={() => void loadValue()}
                type="button"
              >
                {busy === "load" ? "Loading…" : "Reveal stored value"}
              </button>
              <button
                className="primary-button"
                disabled={busy === "save" || !draftKey.trim()}
                type="submit"
              >
                {busy === "save" ? "Saving…" : "Save key"}
              </button>
              {draftValue ? (
                <button
                  className="text-button"
                  onClick={() => setValueVisible((current) => !current)}
                  type="button"
                >
                  {valueVisible ? "Hide value" : "Show value"}
                </button>
              ) : null}
            </div>
          </form>
          <div className="metric-grid compact" style={{ marginTop: "14px" }}>
            <MetricCard label="Known keys" value={keys.length} />
            <MetricCard
              label="Selected key"
              value={draftKey || "None"}
              detail="Names are listed without values."
            />
            <MetricCard
              label="Renderer access"
              value={revealedValue ? "Explicit" : "Protected"}
              detail="Values are returned only on demand."
            />
            <MetricCard label="Storage" value="Local only" />
          </div>
          {revealedValue ? (
            <Notice tone="warn">
              The selected value is loaded into the protected editor above.
              <button
                className="text-button"
                onClick={clearSensitiveValue}
                type="button"
              >
                Clear from renderer
              </button>
            </Notice>
          ) : (
            <Notice tone="warn">
              Revealing a key copies its current value into the desktop
              renderer. Only do that when you need to inspect or replace it.
            </Notice>
          )}
        </section>
      </div>
    </div>
  );
}

interface DoctorResponse {
  checks?: unknown[];
}

export function DocsPage({ active }: { active: boolean }) {
  const doctor = useApiResource<DoctorResponse>(active ? "/doctor" : null, [
    active,
  ]);
  const setup = useApiResource<Record<string, unknown>>(
    active ? "/setup/summary" : null,
    [active],
  );
  const checks = asArray(doctor.data?.checks).map(asRecord);
  const passing = checks.filter((check) =>
    ["pass", "ready", "ok"].includes(asString(check.status).toLowerCase()),
  ).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Help"
        title="About Doolittle"
        description="A private desktop workspace for the Doolittle ElizaOS agent runtime."
      />
      <div className="about-hero">
        <div className="about-mark" aria-hidden="true">
          D
        </div>
        <div>
          <span className="eyebrow">Doolittle Desktop</span>
          <h2>Local agent. Native workspace.</h2>
          <p>
            The Electron shell communicates with a private loopback runtime.
            Conversations, settings, automations, logs, and profiles remain in
            the application data directory on this computer.
          </p>
        </div>
      </div>
      <div className="metric-grid compact">
        <MetricCard label="Health checks" value={checks.length} />
        <MetricCard label="Passing" value={passing} />
        <MetricCard label="Runtime transport" value="Loopback" />
        <MetricCard label="Desktop bridge" value="Sandboxed" />
      </div>
      <div className="two-column-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Runtime doctor</span>
              <h2>System checks</h2>
            </div>
            <button
              className="text-button"
              onClick={doctor.reload}
              type="button"
            >
              Run again
            </button>
          </div>
          {doctor.loading ? (
            <LoadingBlock />
          ) : doctor.error ? (
            <ErrorBlock error={doctor.error} retry={doctor.reload} />
          ) : (
            <div className="stack-list">
              {checks.map((check) => {
                const status = asString(check.status, "unknown");
                return (
                  <div
                    className="status-row"
                    key={`${asString(
                      check.name,
                      asString(check.label, "Unnamed check"),
                    )}:${asString(
                      check.detail,
                      asString(check.message),
                    )}:${JSON.stringify(check)}`}
                  >
                    <div>
                      <strong>
                        {asString(
                          check.name,
                          asString(check.label, "Unnamed check"),
                        )}
                      </strong>
                      <small>
                        {asString(
                          check.detail,
                          asString(check.message, "No details"),
                        )}
                      </small>
                    </div>
                    <Badge
                      tone={
                        ["pass", "ready", "ok"].includes(status.toLowerCase())
                          ? "good"
                          : status === "warn"
                            ? "warn"
                            : "bad"
                      }
                    >
                      {titleCase(status)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Quick reference</span>
              <h2>Run Doolittle</h2>
            </div>
          </div>
          <div className="command-list">
            <div>
              <code>./scripts/install.sh</code>
              <span>Install or update the local command.</span>
            </div>
            <div>
              <code>doolittle desktop</code>
              <span>Open this desktop application.</span>
            </div>
            <div>
              <code>doolittle doctor</code>
              <span>Check runtime and provider readiness.</span>
            </div>
            <div>
              <code>doolittle</code>
              <span>Open the terminal interface.</span>
            </div>
          </div>
          {setup.error ? (
            <Notice tone="warn">{setup.error}</Notice>
          ) : setup.data ? (
            <Notice tone="good">
              The local operator setup summary is available and the runtime
              answered successfully.
            </Notice>
          ) : null}
        </section>
      </div>
      <section className="content-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Architecture</span>
            <h2>Desktop security boundary</h2>
          </div>
        </div>
        <div className="architecture-flow">
          <div>
            <strong>React renderer</strong>
            <span>Sandboxed UI</span>
          </div>
          <i>→</i>
          <div>
            <strong>Typed preload</strong>
            <span>Exact endpoint allowlist</span>
          </div>
          <i>→</i>
          <div>
            <strong>Electron main</strong>
            <span>Private IPC</span>
          </div>
          <i>→</i>
          <div>
            <strong>Doolittle runtime</strong>
            <span>127.0.0.1 ephemeral port</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export function RuntimePage({ active }: { active: boolean }) {
  const runtime = useApiResource<RuntimeStatus>(
    active ? "/runtime/status" : null,
    [active],
  );
  const plugins = useApiResource<PluginsResponse>(
    active ? "/runtime/plugins" : null,
    [active],
  );
  const ecosystem = useApiResource<UnknownRecord>(
    active ? "/runtime/ecosystem" : null,
    [active],
  );
  const insights = useApiResource<UnknownRecord>(active ? "/insights" : null, [
    active,
  ]);
  const gatewayHealth = useApiResource<GatewayHealthResponse>(
    active ? "/gateway/health" : null,
    [active],
  );
  const gatewayRuntime = useApiResource<GatewayRuntimeResponse>(
    active ? "/gateway/runtime" : null,
    [active],
  );

  const catalog = asArray(plugins.data?.catalog).map(asRecord);
  const ecosystemPayload = asRecord(ecosystem.data);
  const insightPayload = asRecord(insights.data);
  const ownershipPayload = asRecord(insightPayload.ownership);
  const gatewayHealthSummary = asRecord(gatewayHealth.data?.summary);
  const gatewayRuntimeSummary = asRecord(gatewayRuntime.data?.summary);
  const gatewayTransportControl = asRecord(
    gatewayHealth.data?.transportControl,
  );
  const gatewayRuntimeControl = asRecord(gatewayRuntime.data?.transportControl);
  const gatewaySessions = asArray(gatewayHealth.data?.sessions);
  const gatewayDeliveries = asArray(gatewayHealth.data?.deliveries);
  const gatewayTraces = asArray(gatewayHealth.data?.traces);
  const gatewayInventory = asArray(gatewayRuntime.data?.transportInventory);
  const gatewayPlugins = asArray(gatewayRuntime.data?.messagingPlugins);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Runtime"
        title="Runtime"
        description="Inspect assembled runtime details, plugin inventory, ecosystem state, and operator insights."
        actions={
          <button
            className="text-button"
            onClick={() => {
              runtime.reload();
              plugins.reload();
              ecosystem.reload();
              insights.reload();
              gatewayHealth.reload();
              gatewayRuntime.reload();
            }}
            type="button"
          >
            Refresh
          </button>
        }
      />
      {runtime.loading ? (
        <LoadingBlock />
      ) : runtime.error ? (
        <ErrorBlock error={runtime.error} retry={runtime.reload} />
      ) : (
        <>
          <div className="metric-grid compact">
            <MetricCard
              label="Provider"
              value={asString(runtime.data?.provider, "Not set")}
            />
            <MetricCard
              label="Model"
              value={asString(runtime.data?.model, "Unknown")}
            />
            <MetricCard label="Plugins" value={catalog.length} />
            <MetricCard
              label="Ownership signals"
              value={Object.keys(ownershipPayload).length}
              detail={
                runtime.data?.fallback?.offlineBootstrapMode
                  ? "offline bootstrap enabled"
                  : "offline bootstrap disabled"
              }
            />
          </div>
          <div className="two-column-grid">
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Binding</span>
                  <h2>Active provider model</h2>
                </div>
                <Badge>{asString(runtime.data?.provider, "Not set")}</Badge>
              </div>
              <div className="status-row">
                <div>
                  <strong>
                    {asString(runtime.data?.model, "Unknown model")}
                  </strong>
                  <small>
                    {runtime.data?.fallback?.offlineBootstrapMode
                      ? "Offline bootstrap: enabled"
                      : "Offline bootstrap: disabled"}
                  </small>
                </div>
                <Badge tone="good">Running</Badge>
              </div>
              <pre className="json-preview">
                {formatJson(runtime.data?.startup)}
              </pre>
            </section>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Plugins</span>
                  <h2>Catalog summary</h2>
                </div>
                <Badge>{catalog.length}</Badge>
              </div>
              {plugins.loading ? (
                <LoadingBlock />
              ) : plugins.error ? (
                <ErrorBlock error={plugins.error} retry={plugins.reload} />
              ) : catalog.length ? (
                <div className="stack-list">
                  {catalog.slice(0, 20).map((entry, index) => (
                    <article className="status-row" key={String(index)}>
                      <div>
                        <strong>
                          {asString(entry.name, asString(entry.id, "Plugin"))}
                        </strong>
                        <small>{asString(entry.id, "No id")}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyBlock title="No plugin entries">
                  Runtime is available but has no catalog payload.
                </EmptyBlock>
              )}
            </section>
          </div>
          <div className="two-column-grid" style={{ marginTop: "16px" }}>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Gateway</span>
                  <h2>Transport health</h2>
                </div>
                <Badge>
                  {asNumber(gatewayTransportControl.ready, 0)}/
                  {asNumber(gatewayTransportControl.configured, 0)} ready
                </Badge>
              </div>
              {gatewayHealth.loading ? (
                <LoadingBlock />
              ) : gatewayHealth.error ? (
                <ErrorBlock
                  error={gatewayHealth.error}
                  retry={gatewayHealth.reload}
                />
              ) : (
                <>
                  <div className="card-grid">
                    <MetricCard
                      label="Sessions"
                      value={gatewaySessions.length}
                    />
                    <MetricCard
                      label="Deliveries"
                      value={gatewayDeliveries.length}
                    />
                    <MetricCard label="Traces" value={gatewayTraces.length} />
                    <MetricCard
                      label="Live services"
                      value={asNumber(gatewayTransportControl.liveServices, 0)}
                    />
                  </div>
                  <div className="stack-list">
                    <div className="status-row">
                      <div>
                        <strong>
                          {asString(
                            gatewayHealthSummary.headline,
                            "Gateway health unavailable",
                          )}
                        </strong>
                        <small>
                          {asString(
                            gatewayHealthSummary.detail,
                            "No gateway health detail was returned.",
                          )}
                        </small>
                      </div>
                    </div>
                  </div>
                  <pre className="json-preview">
                    {formatJson(gatewayHealth.data)}
                  </pre>
                </>
              )}
            </section>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Gateway</span>
                  <h2>Runtime attachment</h2>
                </div>
                <Badge>{gatewayInventory.length} transports</Badge>
              </div>
              {gatewayRuntime.loading ? (
                <LoadingBlock />
              ) : gatewayRuntime.error ? (
                <ErrorBlock
                  error={gatewayRuntime.error}
                  retry={gatewayRuntime.reload}
                />
              ) : (
                <>
                  <div className="card-grid">
                    <MetricCard
                      label="Configured"
                      value={asNumber(gatewayRuntimeControl.configured, 0)}
                    />
                    <MetricCard
                      label="Live services"
                      value={asNumber(gatewayRuntimeControl.liveServices, 0)}
                    />
                    <MetricCard
                      label="Messaging plugins"
                      value={gatewayPlugins.length}
                    />
                    <MetricCard
                      label="Inventory"
                      value={gatewayInventory.length}
                    />
                  </div>
                  <div className="stack-list">
                    <div className="status-row">
                      <div>
                        <strong>
                          {asString(
                            gatewayRuntimeSummary.headline,
                            "Gateway runtime unavailable",
                          )}
                        </strong>
                        <small>
                          {asString(
                            gatewayRuntimeSummary.detail,
                            "No runtime gateway detail was returned.",
                          )}
                        </small>
                      </div>
                    </div>
                  </div>
                  <pre className="json-preview">
                    {formatJson(gatewayRuntime.data)}
                  </pre>
                </>
              )}
            </section>
          </div>
          <div className="two-column-grid" style={{ marginTop: "16px" }}>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Ecosystem</span>
                  <h2>Runtime ecosystem snapshot</h2>
                </div>
                <Badge>{Object.keys(ecosystemPayload).length}</Badge>
              </div>
              {ecosystem.loading ? (
                <LoadingBlock />
              ) : ecosystem.error ? (
                <ErrorBlock error={ecosystem.error} retry={ecosystem.reload} />
              ) : (
                <>
                  <div className="stack-list">
                    {Object.entries(ecosystemPayload)
                      .slice(0, 8)
                      .map(([key, value]) => (
                        <div className="status-row" key={key}>
                          <div>
                            <strong>{titleCase(key)}</strong>
                            <small>
                              {Array.isArray(value)
                                ? `${value.length} entries`
                                : typeof value === "object" && value
                                  ? `${Object.keys(asRecord(value)).length} fields`
                                  : String(value)}
                            </small>
                          </div>
                        </div>
                      ))}
                  </div>
                  <pre className="json-preview">
                    {formatJson(ecosystem.data)}
                  </pre>
                </>
              )}
            </section>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Operator</span>
                  <h2>Insight snapshot</h2>
                </div>
                <Badge>{Object.keys(insightPayload).length}</Badge>
              </div>
              {insights.loading ? (
                <LoadingBlock />
              ) : insights.error ? (
                <ErrorBlock error={insights.error} retry={insights.reload} />
              ) : (
                <>
                  <div className="stack-list">
                    {Object.entries(ownershipPayload)
                      .slice(0, 8)
                      .map(([key, value]) => (
                        <div className="status-row" key={key}>
                          <div>
                            <strong>{titleCase(key)}</strong>
                            <small>
                              {typeof value === "object" && value
                                ? `${Object.keys(asRecord(value)).length} fields`
                                : String(value)}
                            </small>
                          </div>
                        </div>
                      ))}
                  </div>
                  <pre className="json-preview">
                    {formatJson(insights.data)}
                  </pre>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export function CompatibilityPage({ active }: { active: boolean }) {
  const compatibility = useApiResource<UnknownRecord>(
    active ? "/runtime/compatibility" : null,
    [active],
  );
  const checks = asArray(asRecord(compatibility.data).checks).map(asRecord);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Runtime"
        title="Compatibility"
        description="Review compatibility diagnostics for provider and runtime readiness."
        actions={
          <button
            className="text-button"
            onClick={compatibility.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      {!active ? (
        <EmptyBlock title="Compatibility checks are offline">
          Restart the local runtime to inspect provider and runtime readiness.
        </EmptyBlock>
      ) : compatibility.loading ? (
        <LoadingBlock />
      ) : compatibility.error ? (
        <ErrorBlock error={compatibility.error} retry={compatibility.reload} />
      ) : checks.length ? (
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Checks</span>
              <h2>Runtime compatibility</h2>
            </div>
            <Badge>{checks.length}</Badge>
          </div>
          <div className="stack-list">
            {checks.map((check, index) => {
              const status = asString(check.status, "unknown");
              return (
                <div className="status-row" key={String(index)}>
                  <div>
                    <strong>{asString(check.name, "Check")}</strong>
                    <small>
                      {asString(
                        check.message,
                        asString(check.detail, "No details"),
                      )}
                    </small>
                  </div>
                  <Badge
                    tone={
                      ["pass", "ready", "ok"].includes(status.toLowerCase())
                        ? "good"
                        : status.toLowerCase() === "warn"
                          ? "warn"
                          : "bad"
                    }
                  >
                    {titleCase(status)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <EmptyBlock
          title="No compatibility checks found"
          actions={
            <button
              className="secondary-button"
              onClick={compatibility.reload}
              type="button"
            >
              Run checks again
            </button>
          }
        >
          The runtime did not return a checks payload.
        </EmptyBlock>
      )}
      {compatibility.data ? (
        <section className="content-card" style={{ marginTop: "16px" }}>
          <div className="card-heading">
            <div>
              <span className="eyebrow">Raw payload</span>
              <h2>Compatibility response</h2>
            </div>
          </div>
          <pre className="json-preview">{formatJson(compatibility.data)}</pre>
        </section>
      ) : null}
    </div>
  );
}

export function RegistryPage({ active }: { active: boolean }) {
  const [query, setQuery] = useState("");
  const [refreshRequested, setRefreshRequested] = useState(false);
  const params = useMemo(() => {
    const next = new URLSearchParams();
    const normalized = query.trim();
    if (normalized) {
      next.set("query", normalized);
    }
    if (refreshRequested) {
      next.set("refresh", "true");
    }
    return next.toString();
  }, [query, refreshRequested]);
  const path = params ? `/runtime/registry?${params}` : "/runtime/registry";
  const registry = useApiResource<UnknownRecord>(active ? path : null, [
    active,
    params,
  ]);
  const entries = asArray(asRecord(registry.data).registries).map(asRecord);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Runtime"
        title="Plugin registry"
        description="Search or refresh the runtime registry and review matching entries."
        actions={
          <button
            className="text-button"
            onClick={registry.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      {active ? (
        <div className="filter-bar">
          <label className="search-field grow">
            <span className="sr-only">Search the plugin registry</span>
            <input
              placeholder="Search by plugin name"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            onClick={() => setRefreshRequested((current) => !current)}
            type="button"
          >
            {refreshRequested ? "Hard refresh" : "Cached lookup"}
          </button>
        </div>
      ) : null}
      {!active ? (
        <EmptyBlock title="Plugin registry is offline">
          Restart the local runtime to search installed and available plugins.
        </EmptyBlock>
      ) : registry.loading ? (
        <LoadingBlock />
      ) : registry.error ? (
        <ErrorBlock error={registry.error} retry={registry.reload} />
      ) : entries.length ? (
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Registry</span>
              <h2>Entries</h2>
            </div>
            <Badge>{entries.length}</Badge>
          </div>
          <div className="stack-list">
            {entries.map((entry, index) => (
              <div className="status-row" key={String(index)}>
                <div>
                  <strong>
                    {asString(entry.name, asString(entry.id, "Entry"))}
                  </strong>
                  <small>
                    {asString(
                      entry.version,
                      asString(entry.source, "No version"),
                    )}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <EmptyBlock
          title="No registry entries"
          actions={
            <button
              className="secondary-button"
              onClick={registry.reload}
              type="button"
            >
              Search again
            </button>
          }
        >
          No registry rows returned for this query.
        </EmptyBlock>
      )}
      {registry.data ? (
        <section className="content-card" style={{ marginTop: "16px" }}>
          <div className="card-heading">
            <div>
              <span className="eyebrow">Raw payload</span>
              <h2>Registry response</h2>
            </div>
          </div>
          <pre className="json-preview">{formatJson(registry.data)}</pre>
        </section>
      ) : null}
    </div>
  );
}

export function SetupPage({ active }: { active: boolean }) {
  const checklist = useApiResource<UnknownRecord>(
    active ? "/setup/checklist" : null,
    [active],
  );
  const summary = useApiResource<UnknownRecord>(
    active ? "/setup/summary" : null,
    [active],
  );
  const checklistItems = asArray(asRecord(checklist.data).checklist).map(
    asRecord,
  );
  const summaryPayload = asRecord(summary.data);
  const summaryEntries = Object.entries(asRecord(summaryPayload.summary));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operator"
        title="Setup"
        description="Track local setup health and onboarding checklist status."
      />
      {!active ? (
        <EmptyBlock title="Setup checks are offline">
          Restart the local runtime to inspect onboarding and readiness.
        </EmptyBlock>
      ) : (
        <>
          <div className="two-column-grid">
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Checklist</span>
                  <h2>Readiness items</h2>
                </div>
                <button
                  className="text-button"
                  onClick={checklist.reload}
                  type="button"
                >
                  Refresh
                </button>
              </div>
              {checklist.loading ? (
                <LoadingBlock />
              ) : checklist.error ? (
                <ErrorBlock error={checklist.error} retry={checklist.reload} />
              ) : checklistItems.length ? (
                <div className="stack-list">
                  {checklistItems.map((entry, index) => {
                    const status = asString(entry.status, "pending");
                    const done = status.toLowerCase() === "done";
                    return (
                      <div className="status-row" key={String(index)}>
                        <div>
                          <strong>
                            {asString(
                              entry.label,
                              asString(entry.name, "Item"),
                            )}
                          </strong>
                          <small>
                            {asString(entry.description, "No details")}
                          </small>
                        </div>
                        <Badge tone={done ? "good" : "warn"}>
                          {done ? "Done" : "Pending"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyBlock title="No checklist items">
                  No setup checklist items were returned.
                </EmptyBlock>
              )}
            </section>
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Summary</span>
                  <h2>Setup snapshot</h2>
                </div>
                <button
                  className="text-button"
                  onClick={summary.reload}
                  type="button"
                >
                  Refresh
                </button>
              </div>
              {summary.loading ? (
                <LoadingBlock />
              ) : summary.error ? (
                <ErrorBlock error={summary.error} retry={summary.reload} />
              ) : summaryEntries.length ? (
                <div className="stack-list">
                  {summaryEntries.map(([key, value]) => (
                    <div className="status-row" key={key}>
                      <div>
                        <strong>{titleCase(key)}</strong>
                        <small>{String(value)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBlock title="No summary payload">
                  No setup summary is available.
                </EmptyBlock>
              )}
            </section>
          </div>
          {summary.data ? (
            <section className="content-card" style={{ marginTop: "16px" }}>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Raw payload</span>
                  <h2>Setup response</h2>
                </div>
              </div>
              <pre className="json-preview">{formatJson(summary.data)}</pre>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
