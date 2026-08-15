import { Button } from "@elizaos/ui/components/ui/button";
import {
  type CompactCatalogEntry,
  CompactCatalogList,
} from "./components/CompactCatalogList";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { COMPATIBILITY_EMPTY_CLASS } from "./diagnostics-layout";
import {
  asArray,
  asRecord,
  asString,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  RawDataDisclosure,
  titleCase,
  type UnknownRecord,
  useApiResource,
} from "./lib";

export function compatibilityCatalogEntries(
  value: unknown,
): CompactCatalogEntry[] {
  return asArray(asRecord(value).checks).map((rawCheck, index) => {
    const check = asRecord(rawCheck);
    const status = asString(check.status, "unknown");
    const normalizedStatus = status.toLowerCase();
    return {
      id: asString(check.id, `${asString(check.name, "check")}-${index}`),
      eyebrow: "Runtime check",
      title: asString(check.name, "Check"),
      description: asString(
        check.message,
        asString(check.detail, "No details"),
      ),
      status: titleCase(status),
      tone: ["pass", "ready", "ok"].includes(normalizedStatus)
        ? "good"
        : normalizedStatus === "warn"
          ? "warn"
          : "bad",
    };
  });
}

export function CompatibilityEmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      aria-labelledby="compatibility-empty-title"
      className={COMPATIBILITY_EMPTY_CLASS}
      data-compatibility-empty="true"
    >
      <span
        aria-hidden="true"
        className="font-[var(--font-mono)] text-[var(--accent)]"
      >
        ○
      </span>
      <div className="grid gap-px">
        <strong
          className="text-[var(--text-control)] text-[var(--text)]"
          id="compatibility-empty-title"
        >
          No compatibility checks reported
        </strong>
        <small className="text-[var(--text-meta)] text-[var(--muted)]">
          The runtime returned no checks payload.
        </small>
      </div>
      <Button
        className="min-h-7 max-[700px]:col-start-2 max-[700px]:justify-self-start"
        onClick={onRetry}
        size="sm"
        type="button"
        variant="secondary"
      >
        Run checks again
      </Button>
    </section>
  );
}

export function CompatibilityPage({ active }: { active: boolean }) {
  const compatibility = useApiResource<UnknownRecord>(
    active ? "/runtime/compatibility" : null,
    [active],
  );
  const checks = compatibilityCatalogEntries(compatibility.data);
  const refresh = () => {
    if (active) compatibility.reload();
  };

  return (
    <div className="page compatibility-page">
      <PageHeader
        eyebrow="Runtime"
        title="Compatibility"
        description="Review compatibility diagnostics for provider and runtime readiness."
        actions={
          <Button
            disabled={!active}
            onClick={refresh}
            size="sm"
            type="button"
            variant="ghost"
          >
            Refresh
          </Button>
        }
      />
      {!active ? (
        <OfflineRouteState>
          Compatibility checks are unavailable until the local runtime is ready.
        </OfflineRouteState>
      ) : compatibility.loading ? (
        <LoadingBlock />
      ) : compatibility.error ? (
        <ErrorBlock error={compatibility.error} retry={compatibility.reload} />
      ) : checks.length ? (
        <CompactCatalogList
          ariaLabel="Runtime compatibility checks"
          entries={checks}
          resetKey={checks.map((check) => check.id).join(":")}
        />
      ) : (
        <CompatibilityEmptyState onRetry={compatibility.reload} />
      )}
      {active && compatibility.data ? (
        <RawDataDisclosure
          label="Raw compatibility report"
          value={compatibility.data}
        />
      ) : null}
    </div>
  );
}
