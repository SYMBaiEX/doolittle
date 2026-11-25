import { Download, Package, ShieldCheck } from "lucide-react";
import {
  CatalogBrowser,
  CatalogDetail,
  CatalogFacts,
  CatalogPolicy,
  CatalogStatus,
} from "../components/CatalogBrowser";
import { WorkbenchAction } from "../components/workbench/Workbench";
import { copyContextText } from "../context-menu-clipboard";
import { titleCase } from "../lib";
import {
  REGISTRY_INSTALL_CAVEAT,
  type RegistryEntry,
  registryInstallKey,
  registryRepositoryLink,
} from "./registry-model";

const REGISTRY_CATALOG_PAGE_SIZE = 12;

export function RegistryCatalogWorkspace({
  entries,
  installing,
  onApproveInstall,
  onCancelInstall,
  onReviewInstall,
  pendingInstall,
  resetKey,
}: {
  entries: readonly RegistryEntry[];
  installing: boolean;
  onApproveInstall: (entry: RegistryEntry) => void;
  onCancelInstall: () => void;
  onReviewInstall: (entry: RegistryEntry) => void;
  pendingInstall: string;
  resetKey: string;
}) {
  return (
    <CatalogBrowser
      getActions={({ entry }, select) => [
        { id: "inspect", label: "Inspect package", onSelect: select },
        {
          id: "copy-package",
          label: "Copy package name",
          onSelect: () => void copyContextText(entry.packageName),
        },
        ...(!entry.installed && entry.installable
          ? [
              {
                id: "review-install",
                label: "Review installation…",
                disabled: installing,
                separatorBefore: true,
                onSelect: () => {
                  select();
                  onReviewInstall(entry);
                },
              },
            ]
          : []),
      ]}
      getRow={({ entry }) => ({
        title: entry.name,
        menuRevision: registryInstallKey(entry),
        meta: (
          <>
            <code>{entry.version}</code>
            <span>{titleCase(entry.trust)}</span>
          </>
        ),
        status: entry.installed ? (
          <CatalogStatus tone="good">Installed</CatalogStatus>
        ) : entry.installable ? (
          <CatalogStatus tone="good">Eligible</CatalogStatus>
        ) : undefined,
      })}
      icon={Package}
      idPrefix="registry"
      items={entries.map((entry) => ({ id: entry.name, entry }))}
      label="Eliza plugin registry"
      listLabel="Registry packages"
      pageSize={REGISTRY_CATALOG_PAGE_SIZE}
      resetKey={resetKey}
    >
      {({ entry }) => {
        const reviewing = pendingInstall === registryInstallKey(entry);
        const repository = registryRepositoryLink(entry.repository);
        return (
          <>
            <CatalogDetail
              description={entry.description}
              icon={Package}
              name={entry.name}
              status={
                <CatalogStatus
                  tone={
                    entry.installed || entry.installable ? "good" : "neutral"
                  }
                >
                  {entry.installed
                    ? "Installed"
                    : entry.installable
                      ? "Eligible"
                      : "Restricted"}
                </CatalogStatus>
              }
            />
            {!entry.installable && !entry.installed ? (
              <CatalogPolicy title="Runtime policy">
                {entry.reasons.length
                  ? entry.reasons.join(" ")
                  : "Runtime policy restricts installation of this package."}
              </CatalogPolicy>
            ) : null}
            <CatalogFacts
              facts={[
                { label: "Package", value: <code>{entry.packageName}</code> },
                { label: "Version", value: entry.version },
                { label: "Support", value: titleCase(entry.support) },
                { label: "Trust", value: titleCase(entry.trust) },
                {
                  label: "Integrity",
                  value: entry.integrityVerified
                    ? "Verified digest"
                    : "Registry metadata only",
                },
                ...(entry.repository
                  ? [
                      {
                        label: "Repository",
                        value: repository ? (
                          <a
                            href={repository.href}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {repository.label}
                          </a>
                        ) : (
                          entry.repository
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            {entry.installable && !entry.installed ? (
              <section
                aria-label={`Install ${entry.name}`}
                className="registry-install-review"
              >
                <div>
                  <strong>
                    {reviewing
                      ? "Confirm exact package"
                      : "Review before installing"}
                  </strong>
                  <p>
                    {reviewing
                      ? REGISTRY_INSTALL_CAVEAT
                      : `${entry.packageName} ${entry.version} requires your approval before installing through Eliza.`}
                  </p>
                </div>
                <div className="registry-install-review__actions">
                  {reviewing ? (
                    <>
                      <WorkbenchAction
                        disabled={installing}
                        emphasis="primary"
                        icon={Download}
                        onClick={() => onApproveInstall(entry)}
                      >
                        {installing
                          ? "Installing…"
                          : `Approve ${entry.version}`}
                      </WorkbenchAction>
                      <WorkbenchAction
                        disabled={installing}
                        emphasis="quiet"
                        onClick={onCancelInstall}
                      >
                        Cancel
                      </WorkbenchAction>
                    </>
                  ) : (
                    <WorkbenchAction
                      disabled={installing}
                      emphasis="secondary"
                      icon={ShieldCheck}
                      onClick={() => onReviewInstall(entry)}
                    >
                      Review install
                    </WorkbenchAction>
                  )}
                </div>
              </section>
            ) : null}
          </>
        );
      }}
    </CatalogBrowser>
  );
}
