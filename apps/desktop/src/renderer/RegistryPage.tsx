import { useMemo, useState } from "react";
import {
  asArray,
  asRecord,
  asString,
  Badge,
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
import "./registry-page.css";

interface RegistryEntry {
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

  const install = async (entry: RegistryEntry) => {
    if (installing || pendingInstall !== entry.name) return;
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
    <div className="page">
      <PageHeader
        eyebrow="Runtime"
        title="Plugin registry"
        description="Search Eliza's registry, inspect provenance, and explicitly approve policy-eligible installs."
        actions={
          <button
            className="text-button"
            onClick={() =>
              setRefreshRequest((current) => ({
                nonce: (current?.nonce ?? 0) + 1,
                query: query.trim(),
              }))
            }
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
          <div className="registry-list">
            {entries.map((entry) => (
              <article className="registry-entry" key={entry.name}>
                <div className="registry-entry__main">
                  <div className="registry-entry__identity">
                    <strong>{entry.name}</strong>
                    <small>{entry.description}</small>
                    <span className="registry-entry__meta">
                      {entry.version} · {entry.support} · {entry.trust}
                    </span>
                  </div>
                  <div className="row-actions">
                    <Badge
                      tone={
                        entry.installed
                          ? "good"
                          : entry.installable
                            ? "neutral"
                            : "warn"
                      }
                    >
                      {entry.installed
                        ? "Installed"
                        : entry.installable
                          ? "Eligible"
                          : "Blocked"}
                    </Badge>
                    {entry.installable && pendingInstall !== entry.name ? (
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
                    ) : null}
                    {entry.installable && pendingInstall === entry.name ? (
                      <>
                        <button
                          className="primary-button"
                          disabled={installing}
                          onClick={() => void install(entry)}
                          type="button"
                        >
                          {installing
                            ? "Installing…"
                            : `Approve ${entry.version}`}
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
                    ) : null}
                  </div>
                </div>
                <details className="registry-entry__details">
                  <summary>Policy &amp; provenance</summary>
                  <dl>
                    <div>
                      <dt>Package</dt>
                      <dd>{entry.packageName}</dd>
                    </div>
                    <div>
                      <dt>Integrity</dt>
                      <dd>
                        {entry.integrityVerified
                          ? "Verified digest"
                          : "Registry metadata only; no verified digest"}
                      </dd>
                    </div>
                    {entry.repository ? (
                      <div>
                        <dt>Repository</dt>
                        <dd>{entry.repository}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {entry.reasons.length ? (
                    <p>{entry.reasons.join(" ")}</p>
                  ) : null}
                </details>
              </article>
            ))}
          </div>
          {registry.data ? (
            <RawDataDisclosure
              label="Inspect registry response"
              value={registry.data}
            />
          ) : null}
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
      {pendingInstall ? (
        <Notice tone="warn">
          Approval requests the reviewed registry version through Eliza's
          official installer. The installed beta SDK does not report an npm
          integrity digest or whether it fell back to a repository source.
        </Notice>
      ) : null}
      {installNotice ? (
        <Notice
          tone={installNotice.startsWith("Install failed") ? "bad" : "good"}
        >
          {installNotice}
        </Notice>
      ) : null}
    </div>
  );
}
