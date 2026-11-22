import { BookOpen, Brain, FileText, RotateCw, UserRound } from "lucide-react";
import { CompactStatStrip } from "../components/CompactStatStrip";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import {
  type ApiResource,
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  formatBoundedPreview,
  LoadingBlock,
} from "../lib";
import { MEMORY_PREVIEW_CLASS } from "./memory-layout";
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
  const targetLabel =
    target === "memory" ? "Doolittle private memory" : "User memory";
  const targetIcon = target === "memory" ? Brain : UserRound;
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
      <WorkbenchSection headingLevel={3} icon={targetIcon} title={targetLabel}>
        <WorkbenchEmpty
          icon={targetIcon}
          title={
            active ? "Memory is ready for its first entry" : "Memory is offline"
          }
          actions={
            <WorkbenchAction
              disabled={!active}
              icon={RotateCw}
              onClick={resource.reload}
            >
              Refresh memory
            </WorkbenchAction>
          }
        >
          {active
            ? "Start a conversation or save an operator detail, then refresh."
            : "Restart the local runtime to load this memory target."}
        </WorkbenchEmpty>
      </WorkbenchSection>
    );
  }

  return (
    <div className="grid gap-3">
      <WorkbenchSection
        actions={<Badge>{target === "memory" ? "Private" : "User"}</Badge>}
        headingLevel={3}
        icon={targetIcon}
        title={targetLabel}
      >
        <div
          className="grid gap-2"
          data-memory-empty={empty ? "true" : undefined}
        >
          <CompactStatStrip
            label={`${targetLabel} summary`}
            stats={[
              { label: "Entries", value: entryCount },
              { label: "Characters", value: asNumber(summary.characters, 0) },
              {
                label: "Target",
                value:
                  asString(summary.target, target) === "memory"
                    ? "Private"
                    : "User",
              },
            ]}
          />
          {empty ? (
            <WorkbenchEmpty icon={BookOpen} title="No stored entries yet">
              Memory appears after a conversation or saved operator detail.
            </WorkbenchEmpty>
          ) : null}
        </div>
      </WorkbenchSection>

      {!empty ? (
        <div
          className={preview.length ? "diagnostic-workspace__grid" : undefined}
        >
          <WorkbenchSection
            actions={
              <Badge tone={snapshotAvailable ? "good" : "warn"}>
                {snapshotAvailable ? "Loaded" : "Unavailable"}
              </Badge>
            }
            headingLevel={3}
            icon={FileText}
            title="Latest bounded snapshot"
          >
            {snapshotAvailable ? (
              <pre className={MEMORY_PREVIEW_CLASS}>
                {formatBoundedPreview(snapshot, SNAPSHOT_CHARACTER_LIMIT)}
              </pre>
            ) : (
              <WorkbenchEmpty icon={FileText} title="No snapshot">
                The runtime did not return a readable snapshot.
              </WorkbenchEmpty>
            )}
          </WorkbenchSection>
          {preview.length ? (
            <WorkbenchSection
              headingLevel={3}
              icon={BookOpen}
              title="Recent entries"
            >
              <ul className="m-0 grid list-none gap-1 p-0">
                {preview.map((entry, index) => (
                  <li
                    className="rounded-[var(--radius-sm)] bg-[var(--surface-soft)] px-3 py-2 [overflow-wrap:anywhere]"
                    // biome-ignore lint/suspicious/noArrayIndexKey: These text-only preview entries may repeat and arrive without identifiers.
                    key={`${index}:${entry}`}
                  >
                    {entry}
                  </li>
                ))}
              </ul>
            </WorkbenchSection>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
