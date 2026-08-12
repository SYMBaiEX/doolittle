import { Button } from "@elizaos/ui/components/ui/button";
import { CompactStatStrip } from "../components/CompactStatStrip";
import {
  type ApiResource,
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
  ErrorBlock,
  formatBoundedPreview,
  LoadingBlock,
  Notice,
} from "../lib";
import type { MemoryResponse, MemorySummary } from "./models";

const SNAPSHOT_CHARACTER_LIMIT = 1_400;
const PREVIEW_ITEM_LIMIT = 5;

export function MemorySnapshotPanel({
  active,
  resource,
  target,
}: {
  active: boolean;
  resource: ApiResource<MemoryResponse>;
  target: "memory" | "user";
}) {
  const targetLabel = target === "memory" ? "Shared memory" : "User memory";
  const summary = asRecord(resource.data?.summary) as MemorySummary;
  const snapshot = asString(resource.data?.snapshot, "");
  const entryCount = asNumber(summary.entries, 0);
  const preview = asArray(summary.preview)
    .slice(-PREVIEW_ITEM_LIMIT)
    .map((entry) => asString(entry));
  const empty = entryCount === 0 && preview.length === 0 && !snapshot;

  if (resource.loading) {
    return <LoadingBlock label={`Loading ${target} memory snapshot…`} />;
  }
  if (resource.error) {
    return <ErrorBlock error={resource.error} retry={resource.reload} />;
  }
  if (!resource.data) {
    return (
      <EmptyBlock
        title={
          active ? "Memory is ready for its first entry" : "Memory is offline"
        }
        actions={
          <Button
            className="secondary-button"
            disabled={!active}
            onClick={resource.reload}
            type="button"
            variant="secondary"
          >
            Refresh memory
          </Button>
        }
      >
        {active
          ? "Start a conversation or save an operator detail, then refresh this workspace."
          : "Restart the local runtime to load this memory target."}
      </EmptyBlock>
    );
  }

  return (
    <div className="memory-content memory-snapshot-grid">
      <section
        className={`content-card memory-summary-card${empty ? " memory-empty-card" : ""}`}
      >
        <div className="card-heading">
          <div>
            <span className="eyebrow">Summary</span>
            <h2>{targetLabel}</h2>
          </div>
          <Badge>{target === "memory" ? "Shared" : "User"}</Badge>
        </div>
        <CompactStatStrip
          label={`${targetLabel} summary`}
          stats={[
            { label: "Entries", value: entryCount },
            { label: "Characters", value: asNumber(summary.characters, 0) },
            {
              label: "Target",
              value:
                asString(summary.target, target) === "memory"
                  ? "Shared"
                  : "User",
            },
          ]}
        />
        {empty ? (
          <div className="memory-empty-state">
            <strong>No stored entries yet</strong>
            <span>
              Memory appears here after a conversation or saved operator detail.
            </span>
          </div>
        ) : null}
      </section>

      {!empty ? (
        <section className="content-card memory-summary-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Recent entries</span>
              <h2>Preview</h2>
            </div>
          </div>
          {preview.length ? (
            <ul>
              {preview.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ) : (
            <EmptyBlock density="compact" title="No entries">
              No memory entries were found.
            </EmptyBlock>
          )}
        </section>
      ) : null}

      {!empty ? (
        <section className="content-card memory-summary-card memory-snapshot-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Readable snapshot</span>
              <h2>Latest bounded snapshot</h2>
            </div>
            <Notice tone={snapshot ? "good" : "warn"}>
              {snapshot ? "Loaded" : "Unavailable"}
            </Notice>
          </div>
          {snapshot ? (
            <pre className="json-preview">
              {formatBoundedPreview(snapshot, SNAPSHOT_CHARACTER_LIMIT)}
            </pre>
          ) : (
            <EmptyBlock density="compact" title="No snapshot">
              Snapshot is empty.
            </EmptyBlock>
          )}
        </section>
      ) : null}
    </div>
  );
}
