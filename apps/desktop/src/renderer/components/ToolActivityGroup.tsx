import { ContextActionMenu } from "@doolittle/ui";
import { Button } from "@elizaos/ui/button";
import {
  Check,
  ChevronRight,
  Clock3,
  Copy,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { copyContextText } from "../context-menu-clipboard";
import {
  formatToolPayload,
  type ToolActivity,
  type ToolActivityStatus,
  webSearchResults,
} from "./message-output";
import { type ToolDetails, toolActivityDetails } from "./tool-activity-details";
import { UiIcon } from "./UiIcon";
import "../chat/chat-activity.css";

const MAX_DISPLAY_CHARACTERS = 40_000;

const statusLabels: Record<ToolActivityStatus, string> = {
  completed: "Completed",
  error: "Failed",
  running: "Running",
  pending: "Pending",
};

const statusIcons = {
  completed: Check,
  error: TriangleAlert,
  running: LoaderCircle,
  pending: Clock3,
};

export function ToolPayload({
  label,
  text,
  copyLabel,
  kind,
}: {
  label: string;
  text: string;
  copyLabel: string;
  kind?: "command" | "stderr" | "diff";
}) {
  const clipped = text.length > MAX_DISPLAY_CHARACTERS;
  const preview = clipped ? text.slice(0, MAX_DISPLAY_CHARACTERS) : text;
  const diffLines = kind === "diff" ? preview.split("\n") : undefined;
  return (
    <section className="chat-activity-payload" data-kind={kind}>
      <div className="chat-activity-payload-heading">
        <span className="chat-activity-payload-label">{label}</span>
        {clipped ? <small>Preview · 40,000 characters</small> : null}
        <Button
          className="chat-activity-copy"
          onClick={() => void copyContextText(text)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <UiIcon icon={Copy} size="xs" />
          {copyLabel}
        </Button>
      </div>
      <section
        aria-label={label}
        className="chat-activity-console"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Output can exceed both axes and must be keyboard-scrollable.
        tabIndex={0}
      >
        <pre>
          <code>
            {diffLines && diffLines.length <= 1_200
              ? diffLines.map((line, index, lines) => (
                  <span
                    data-diff-line={
                      /^(?:\+\+\+|---|diff |index |@@)/u.test(line)
                        ? "header"
                        : line.startsWith("+")
                          ? "added"
                          : line.startsWith("-")
                            ? "removed"
                            : undefined
                    }
                    // biome-ignore lint/suspicious/noArrayIndexKey: These are positional lines in a read-only payload.
                    key={index}
                  >
                    {line}
                    {index < lines.length - 1 ? "\n" : ""}
                  </span>
                ))
              : preview}
          </code>
        </pre>
      </section>
    </section>
  );
}

function WebSearchSources({ activity }: { activity: ToolActivity }) {
  const results = webSearchResults(activity.output);
  if (!results.length) return null;
  return (
    <section aria-label="Sources" className="chat-activity-sources">
      <div className="chat-activity-source-heading">Sources</div>
      <ol>
        {results.slice(0, 10).map((result) => (
          <li key={result.url}>
            <a href={result.url} rel="noreferrer" target="_blank">
              {result.title}
              <small>{new URL(result.url).hostname}</small>
            </a>
            {result.excerpt ? <p>{result.excerpt.slice(0, 360)}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ToolActivityDetail({
  activity,
  details,
}: {
  activity: ToolActivity;
  details: ToolDetails;
}) {
  const { command, stdout, stderr, diff, truncated, timedOut } = details;
  const input = formatToolPayload(activity.input);
  const output = formatToolPayload(activity.output);
  const hasStreams = stdout !== undefined || stderr !== undefined;
  const hasStructuredOutput = hasStreams || diff !== undefined;
  const error = activity.error || (timedOut ? "Command timed out." : "");
  return (
    <>
      {error ? (
        <p className="chat-activity-warning" data-tone="bad">
          <UiIcon icon={TriangleAlert} size="sm" />
          <span>{error}</span>
        </p>
      ) : null}
      {command ? (
        <ToolPayload
          copyLabel="Copy command"
          kind="command"
          label="Command"
          text={command}
        />
      ) : null}
      {stdout ? (
        <ToolPayload
          copyLabel="Copy output"
          label="Standard output"
          text={stdout}
        />
      ) : null}
      {stderr ? (
        <ToolPayload
          copyLabel={stdout ? "Copy error output" : "Copy output"}
          kind="stderr"
          label="Standard error"
          text={stderr}
        />
      ) : null}
      {hasStreams && !stdout && !stderr ? (
        <p className="chat-activity-note">No command output.</p>
      ) : null}
      {truncated ? (
        <p className="chat-activity-note">The runtime truncated this output.</p>
      ) : null}
      {diff ? (
        <ToolPayload
          copyLabel="Copy diff"
          kind="diff"
          label="Diff"
          text={diff}
        />
      ) : null}
      <WebSearchSources activity={activity} />
      {output && hasStructuredOutput ? (
        <details className="chat-activity-more">
          <summary>Full result</summary>
          <ToolPayload copyLabel="Copy result" label="Result" text={output} />
        </details>
      ) : output ? (
        <ToolPayload copyLabel="Copy output" label="Output" text={output} />
      ) : null}
      {input && input !== command ? (
        <details className="chat-activity-more">
          <summary>Input</summary>
          <ToolPayload copyLabel="Copy input" label="Input" text={input} />
        </details>
      ) : null}
      {!error && !command && !output && !input ? (
        <p className="chat-activity-note">No details recorded.</p>
      ) : null}
    </>
  );
}

export function ToolActivityGroup({
  pending,
  tools,
}: {
  pending: boolean;
  tools: readonly ToolActivity[];
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const entries = useMemo(
    () =>
      tools.map((activity) => ({
        activity,
        details: toolActivityDetails(activity),
      })),
    [tools],
  );
  const failed = entries.filter(
    ({ details }) => details.status === "error",
  ).length;
  const active = entries.some(
    ({ details }) =>
      details.status === "running" || details.status === "pending",
  );
  const status = failed ? "error" : active || pending ? "running" : "completed";
  const stateLabel = failed ? `${failed} failed` : statusLabels[status];
  const last = entries.at(-1)?.details;

  if (!last) return null;
  return (
    <div
      className="chat-activity"
      data-tool-group="true"
      data-tool-status={status}
    >
      <button
        aria-controls={`${id}-activity`}
        aria-describedby={`${id}-state`}
        aria-expanded={expanded}
        aria-label="Tool activity"
        className="chat-activity-trigger"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span
          aria-hidden="true"
          className="chat-activity-mark"
          data-status={status}
        >
          <UiIcon icon={statusIcons[status]} size="xs" />
        </span>
        <span className="chat-activity-title">
          <strong>Tool activity</strong>
          <small>{pending ? last.label : stateLabel}</small>
        </span>
        <span className="sr-only" id={`${id}-state`}>
          {pending ? `${stateLabel}. ${last.label}` : stateLabel}
        </span>
        <UiIcon
          className="chat-activity-chevron"
          icon={ChevronRight}
          size="xs"
        />
      </button>
      <div
        className="chat-activity-panel"
        hidden={!expanded}
        id={`${id}-activity`}
      >
        {expanded ? (
          <ol aria-label="Tool steps" className="chat-activity-list">
            {entries.map(({ activity, details }, index) => {
              const selected = activity.id === selectedId;
              const detailId = `${id}-tool-${index}`;
              return (
                <li key={activity.id}>
                  <ContextActionMenu
                    items={[
                      {
                        id: "copy-output",
                        label: "Copy tool output",
                        disabled: activity.output === undefined,
                        onSelect: () =>
                          void copyContextText(
                            formatToolPayload(activity.output),
                          ),
                      },
                    ]}
                    label={`Tool actions for ${details.label}`}
                    scopeKey={activity.id}
                  >
                    <button
                      aria-controls={detailId}
                      aria-describedby={`${detailId}-state`}
                      aria-expanded={selected}
                      aria-label={`${selected ? "Hide" : "Show"} ${details.label} details`}
                      className="chat-activity-row"
                      data-tool-card="true"
                      data-tool-status={details.status}
                      onClick={() =>
                        setSelectedId(selected ? undefined : activity.id)
                      }
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="chat-activity-mark"
                        data-status={details.status}
                      >
                        <UiIcon icon={statusIcons[details.status]} size="xs" />
                      </span>
                      <span className="chat-activity-title">
                        <strong>{details.label}</strong>
                        {details.target ? (
                          <small title={details.target}>{details.target}</small>
                        ) : null}
                      </span>
                      <span
                        className="chat-activity-row-metadata"
                        data-status={details.status}
                        id={`${detailId}-state`}
                      >
                        {details.exitCode === undefined
                          ? statusLabels[details.status]
                          : `Exit ${details.exitCode}`}
                        {details.duration ? (
                          <small>{details.duration}</small>
                        ) : null}
                      </span>
                      <UiIcon
                        className="chat-activity-chevron"
                        icon={ChevronRight}
                        size="xs"
                      />
                    </button>
                  </ContextActionMenu>
                  <div
                    className="chat-activity-details"
                    data-tool-detail="true"
                    hidden={!selected}
                    id={detailId}
                  >
                    {selected ? (
                      <ToolActivityDetail
                        activity={activity}
                        details={details}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
