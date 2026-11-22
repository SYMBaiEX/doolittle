import { Package, RefreshCw } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { CatalogFilterBar } from "./components/CatalogFilterBar";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "./components/workbench/Workbench";
import {
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  RawDataDisclosure,
  type UnknownRecord,
  useApiResource,
  useDebouncedValue,
} from "./lib";
import {
  normalizeRegistryEntries,
  type RegistryEntry,
  registryInstallKey,
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
    if (
      !active ||
      installing ||
      !entry.installable ||
      entry.installed ||
      pendingInstall !== registryInstallKey(entry)
    )
      return;
    setInstalling(true);
    setInstallNotice("");
    try {
      const { installRegistryPackage } = await import(
        "./registry/registry-install"
      );
      setInstallNotice(await installRegistryPackage(entry));
      setPendingInstall("");
      registry.reload();
    } catch (cause) {
      setInstallNotice(`Install failed: ${errorMessage(cause)}`);
    } finally {
      setInstalling(false);
    }
  };
  return (
    <WorkbenchSection
      actions={
        <WorkbenchAction
          disabled={!active}
          emphasis="quiet"
          icon={RefreshCw}
          onClick={refreshRegistry}
        >
          Refresh registry
        </WorkbenchAction>
      }
      className="catalog-page"
      description="Check a package’s source, version, and runtime policy before approving an install."
      icon={Package}
      title="Plugin registry"
    >
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
        <LoadingBlock label="Searching the Eliza plugin registry…" />
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
                setPendingInstall(registryInstallKey(entry));
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
        <WorkbenchEmpty
          icon={Package}
          title="No registry entries"
          actions={
            <WorkbenchAction
              emphasis="secondary"
              icon={RefreshCw}
              onClick={registry.reload}
            >
              Search again
            </WorkbenchAction>
          }
        >
          {debouncedQuery
            ? "Try a different package name."
            : "The registry has not returned any packages."}
        </WorkbenchEmpty>
      )}
      {active && installNotice ? (
        <Notice
          tone={installNotice.startsWith("Install failed") ? "bad" : "good"}
        >
          {installNotice}
        </Notice>
      ) : null}
    </WorkbenchSection>
  );
}
