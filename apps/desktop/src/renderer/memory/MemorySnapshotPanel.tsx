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
import {
  MEMORY_CARD_CLASS,
  MEMORY_GRID_CLASS,
  MEMORY_HEADING_CLASS,
  MEMORY_PREVIEW_CLASS,
} from "./memory-layout";
import type { MemoryResponse, MemorySummary } from "./models";

const SNAPSHOT_CHARACTER_LIMIT = 1_400;
const PREVIEW_ITEM_LIMIT = 5;

export function hasMemorySnapshot(
  snapshot: string,
  entryCount: number,
): boolean {
  if (!snapshot.trim()) return false;
  return !(entryCount === 0 && /\(\s*empty\s*\)/iu.test(snapshot));
}

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
  const snapshotAvailable = hasMemorySnapshot(snapshot, entryCount);
  const preview = asArray(summary.preview)
    .slice(-PREVIEW_ITEM_LIMIT)
    .map((entry) => asString(entry));
  const empty = entryCount === 0 && preview.length === 0 && !snapshotAvailable;

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
    <div className={MEMORY_GRID_CLASS}>
      <section
        className={`${MEMORY_CARD_CLASS} ${
          empty
            ? "col-span-full grid grid-cols-[minmax(180px,0.5fr)_minmax(0,1.5fr)] items-stretch gap-x-3 gap-y-2 max-[760px]:grid-cols-1 [&>.compact-stat-strip]:self-stretch [&>.compact-stat-strip]:border-0 [&>.compact-stat-strip_.compact-stat-strip__item]:min-h-[46px] [&>.compact-stat-strip_.compact-stat-strip__item]:py-[7px]"
            : ""
        }`}
        data-memory-empty={empty ? "true" : undefined}
      >
        <div
          className={`${MEMORY_HEADING_CLASS} ${
            empty
              ? "m-0 min-h-0 border-r border-[var(--line-subtle)] pr-3 max-[760px]:border-r-0 max-[760px]:pr-0"
              : ""
          }`}
        >
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
          <div className="col-span-full mt-0 grid min-h-[30px] gap-x-3.5 gap-y-2 border-t border-[var(--line-subtle)] pt-2 text-[var(--muted)] max-[760px]:col-auto [&_span]:text-[11px] [&_strong]:flex-none [&_strong]:text-xs [&_strong]:text-[var(--text)]">
            <strong>No stored entries yet</strong>
            <span>
              Memory appears here after a conversation or saved operator detail.
            </span>
          </div>
        ) : null}
      </section>

      {preview.length ? (
        <section className={MEMORY_CARD_CLASS}>
          <div className={MEMORY_HEADING_CLASS}>
            <div>
              <span className="eyebrow">Recent entries</span>
              <h2>Preview</h2>
            </div>
          </div>
          <ul>
            {preview.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {!empty ? (
        <section
          className={`${MEMORY_CARD_CLASS} col-span-full max-[760px]:col-auto`}
        >
          <div className={MEMORY_HEADING_CLASS}>
            <div>
              <span className="eyebrow">Readable snapshot</span>
              <h2>Latest bounded snapshot</h2>
            </div>
            <Notice tone={snapshotAvailable ? "good" : "warn"}>
              {snapshotAvailable ? "Loaded" : "Unavailable"}
            </Notice>
          </div>
          {snapshotAvailable ? (
            <pre className={MEMORY_PREVIEW_CLASS}>
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
