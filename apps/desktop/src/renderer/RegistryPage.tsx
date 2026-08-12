import { lazy, Suspense, useMemo, useState } from "react";
import { CatalogFilterBar } from "./components/CatalogFilterBar";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  asString,
  desktopRequest,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  PageHeader,
  RawDataDisclosure,
  type UnknownRecord,
  useApiResource,
  useDebouncedValue,
} from "./lib";
import {
  normalizeRegistryEntries,
  type RegistryEntry,
  registryResultLabel,
} from "./registry/registry-model";
import "./registry.css";
import "./catalog-pages.css";

export type { RegistryEntry } from "./registry/registry-model";
export {
  normalizeRegistryEntries,
  REGISTRY_INSTALL_CAVEAT,
  registryCatalogPresentation,
  registryResultLabel,
} from "./registry/registry-model";

const LazyRegistryCatalogWorkspace = lazy(async () => ({
  default: (await import("./registry/RegistryCatalogWorkspace"))
    .RegistryCatalogWorkspace,
}));

export function RegistryPage({ active }: { active: boolean }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim());
  const [refreshRequest, setRefreshRequest] = useState<{
    nonce: number;
    query: string;
  } | null>(null);
  const [pendingInstall, setPendingInstall] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installNotice, setInstallNotice] = useState("");
  const params = useMemo(() => {
    const next = new URLSearchParams();
    if (debouncedQuery) {
      next.set("query", debouncedQuery);
    }
    if (refreshRequest?.query === debouncedQuery) {
      next.set("refresh", "true");
    }
    return next.toString();
  }, [debouncedQuery, refreshRequest]);
  const path = params ? `/runtime/registry?${params}` : "/runtime/registry";
  const registry = useApiResource<UnknownRecord>(active ? path : null, [
    active,
    params,
    refreshRequest?.nonce,
  ]);
  const entries = normalizeRegistryEntries(registry.data);

  const refreshRegistry = () => {
    if (!active) return;
    setRefreshRequest((current) => ({
      nonce: (current?.nonce ?? 0) + 1,
      query: query.trim(),
    }));
  };

  const install = async (entry: RegistryEntry) => {
    if (!active || installing || pendingInstall !== entry.name) return;
    setInstalling(true);
    setInstallNotice("");
    try {
      const result = await desktopRequest<{
        installed?: {
          name?: string;
          version?: string;
          requiresRestart?: boolean;
        };
      }>(
        "/runtime/registry/install",
        "POST",
        {
          name: entry.name,
          packageName: entry.packageName,
          version: entry.version,
          approved: true,
        },
        undefined,
        120_000,
      );
      setInstallNotice(
        `${asString(result.installed?.name, entry.name)} ${asString(
          result.installed?.version,
          entry.version,
        )} installed through Eliza.${
          result.installed?.requiresRestart
            ? " Restart the local runtime to activate it."
            : ""
        }`,
      );
      setPendingInstall("");
      registry.reload();
    } catch (cause) {
      setInstallNotice(`Install failed: ${errorMessage(cause)}`);
    } finally {
      setInstalling(false);
    }
  };
  return (
    <div className="page page-registry">
      <PageHeader
        eyebrow="Runtime"
        title="Plugin registry"
        description="Search Eliza plugins, review provenance, and approve eligible installs."
        actions={
          <button
            className="text-button"
            disabled={!active}
            onClick={refreshRegistry}
            type="button"
          >
            Refresh registry
          </button>
        }
      />
      {active ? (
        <CatalogFilterBar
          onQueryChange={setQuery}
          placeholder="Search plugins"
          query={query}
          resultLabel={registryResultLabel({
            count: entries.length,
            error: registry.error,
            loading: registry.loading,
          })}
          searchLabel="Search the plugin registry"
        />
      ) : null}
      {!active ? (
        <OfflineRouteState>
          Plugin registry search and installs are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      ) : registry.loading ? (
        <LoadingBlock />
      ) : registry.error ? (
        <ErrorBlock error={registry.error} retry={registry.reload} />
      ) : entries.length ? (
        <>
          <Suspense fallback={<LoadingBlock label="Opening registry…" />}>
            <LazyRegistryCatalogWorkspace
              entries={entries}
              installing={installing}
              onApproveInstall={(entry) => void install(entry)}
              onCancelInstall={() => setPendingInstall("")}
              onReviewInstall={(entry) => {
                setPendingInstall(entry.name);
                setInstallNotice("");
              }}
              pendingInstall={pendingInstall}
              resetKey={`${debouncedQuery}:${refreshRequest?.nonce ?? 0}`}
            />
          </Suspense>
          {registry.data ? (
            <RawDataDisclosure
              label="Inspect registry response"
              value={registry.data}
            />
          ) : null}
        </>
      ) : (
        <EmptyBlock
          density="compact"
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
      {active && installNotice ? (
        <Notice
          tone={installNotice.startsWith("Install failed") ? "bad" : "good"}
        >
          {installNotice}
        </Notice>
      ) : null}
    </div>
  );
}
