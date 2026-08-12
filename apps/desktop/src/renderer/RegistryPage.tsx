import { useMemo, useState } from "react";
import { CompactCatalogList } from "./components/CompactCatalogList";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  asArray,
  asRecord,
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
import "./registry.css";

export interface RegistryEntry {
  name: string;
  packageName: string;
  description: string;
  version: string;
  repository: string;
  support: string;
  trust: string;
  installed: boolean;
  installable: boolean;
  reasons: string[];
  integrityVerified: boolean;
}

export function registryCatalogPresentation(entry: RegistryEntry) {
  return {
    eyebrow: entry.support === "community" ? undefined : entry.support,
    status: entry.installed
      ? "Installed"
      : entry.installable
        ? "Eligible"
        : "Restricted",
    tone: entry.installed
      ? ("good" as const)
      : entry.installable
        ? ("neutral" as const)
        : ("neutral" as const),
    code: entry.packageName === entry.name ? undefined : entry.packageName,
    meta: `${entry.version} · ${entry.trust}`,
    detailsLabel: "Policy",
  };
}

export function normalizeRegistryEntries(value: unknown): RegistryEntry[] {
  const response = asRecord(value);
  const rows = asArray(
    response.results ?? response.entries ?? response.registries,
  );
  return rows
    .map((value): RegistryEntry | null => {
      const entry = asRecord(value);
      const policy = asRecord(entry.policy);
      const provenance = asRecord(policy.provenance);
      const name = asString(entry.name).trim();
      if (!name) return null;
      return {
        name,
        packageName: asString(provenance.packageName, name).trim(),
        description: asString(entry.description, "No description provided."),
        version: asString(
          provenance.version,
          asString(entry.latestVersion, "No v2 release"),
        ),
        repository: asString(provenance.repository, asString(entry.repository)),
        support: asString(provenance.support, "community"),
        trust: asString(policy.trust, "community"),
        installed: policy.installed === true,
        installable: policy.installable === true,
        reasons: asArray(policy.reasons)
          .map((reason) => asString(reason).trim())
          .filter(Boolean),
        integrityVerified: provenance.integrityVerified === true,
      };
    })
    .filter((entry): entry is RegistryEntry => entry !== null);
}

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
  const catalogEntries = entries.map((entry) => ({
    id: entry.name,
    ...registryCatalogPresentation(entry),
    title: entry.name,
    description: entry.description,
    detailsNote: entry.reasons.join(" "),
    facts: [
      { label: "Package", value: entry.packageName },
      {
        label: "Integrity",
        value: entry.integrityVerified
          ? "Verified digest"
          : "Registry metadata only; no verified digest",
      },
      ...(entry.repository
        ? [{ label: "Repository", value: entry.repository }]
        : []),
    ],
    action: entry.installable ? (
      pendingInstall === entry.name ? (
        <>
          <button
            className="primary-button"
            disabled={installing}
            onClick={() => void install(entry)}
            type="button"
          >
            {installing ? "Installing…" : `Approve ${entry.version}`}
          </button>
          <button
            className="text-button"
            disabled={installing}
            onClick={() => setPendingInstall("")}
            type="button"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          className="secondary-button"
          onClick={() => {
            setPendingInstall(entry.name);
            setInstallNotice("");
          }}
          type="button"
        >
          Review install
        </button>
      )
    ) : undefined,
  }));

  return (
    <div className="page page-registry">
      <PageHeader
        eyebrow="Runtime"
        title="Plugin registry"
        description="Search Eliza's registry, inspect provenance, and explicitly approve policy-eligible installs."
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
        </div>
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
          <CompactCatalogList
            ariaLabel="Eliza plugin registry"
            entries={catalogEntries}
            resetKey={`${debouncedQuery}:${refreshRequest?.nonce ?? 0}`}
          />
          {registry.data ? (
            <RawDataDisclosure
              label="Inspect registry response"
              value={registry.data}
            />
          ) : null}
        </>
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
      {active && pendingInstall ? (
        <Notice tone="warn">
          Approval requests the reviewed registry version through Eliza's
          official installer. The installed beta SDK does not report an npm
          integrity digest or whether it fell back to a repository source.
        </Notice>
      ) : null}
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
