import {
  type CompactCatalogEntry,
  CompactCatalogList,
} from "./components/CompactCatalogList";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  asArray,
  asRecord,
  asString,
  EmptyBlock,
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
    <div className="page">
      <PageHeader
        eyebrow="Runtime"
        title="Compatibility"
        description="Review compatibility diagnostics for provider and runtime readiness."
        actions={
          <button
            className="text-button"
            disabled={!active}
            onClick={refresh}
            type="button"
          >
            Refresh
          </button>
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
        <EmptyBlock
          density="compact"
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
      {active && compatibility.data ? (
        <RawDataDisclosure
          label="Raw compatibility report"
          value={compatibility.data}
        />
      ) : null}
    </div>
  );
}
