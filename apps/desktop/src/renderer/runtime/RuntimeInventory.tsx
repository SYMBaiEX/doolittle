import { Box, Boxes, ShieldCheck } from "lucide-react";
import type { PluginsResponse } from "../../shared/contracts";
import { CompactStatStrip } from "../components/CompactStatStrip";
import { OfflineRouteState } from "../components/OfflineRouteState";
import {
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import {
  type ApiResource,
  asArray,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  RawDataDisclosure,
  titleCase,
  type UnknownRecord,
} from "../lib";
import { DiagnosticStatusRow } from "../runtime-state/DiagnosticWorkspace";

export function RuntimeInventory({
  active = true,
  ecosystem,
  insights,
  plugins,
}: {
  active?: boolean;
  ecosystem: ApiResource<UnknownRecord>;
  insights: ApiResource<UnknownRecord>;
  plugins: ApiResource<PluginsResponse>;
}) {
  if (!active) {
    return (
      <OfflineRouteState>
        Runtime capability inventory is unavailable until the local runtime is
        ready.
      </OfflineRouteState>
    );
  }

  const catalog = asArray(plugins.data?.catalog).map(asRecord);
  const ecosystemPayload = asRecord(ecosystem.data);
  const insightPayload = asRecord(insights.data);
  const ownershipPayload = asRecord(insightPayload.ownership);

  return (
    <div className="grid min-h-0 gap-3">
      <div className="diagnostic-workspace__stats">
        <CompactStatStrip
          label="Runtime inventory summary"
          stats={[
            { label: "Plugins", value: catalog.length },
            {
              label: "Ecosystem fields",
              value: Object.keys(ecosystemPayload).length,
            },
            {
              label: "Ownership signals",
              value: Object.keys(ownershipPayload).length,
            },
          ]}
        />
      </div>
      <div className="diagnostic-workspace__grid">
        <WorkbenchSection
          actions={<Badge>{catalog.length}</Badge>}
          headingLevel={3}
          icon={Box}
          title="Capability catalog"
        >
          {plugins.loading ? (
            <LoadingBlock label="Loading plugin catalog…" />
          ) : plugins.error ? (
            <ErrorBlock error={plugins.error} retry={plugins.reload} />
          ) : catalog.length ? (
            <div className="grid gap-1">
              {catalog.slice(0, 12).map((entry, index) => (
                <DiagnosticStatusRow
                  title={asString(entry.name, asString(entry.id, "Plugin"))}
                  detail={asString(entry.id, "No ID")}
                  key={asString(entry.id, String(index))}
                />
              ))}
            </div>
          ) : (
            <WorkbenchEmpty icon={Box} title="No plugin entries">
              Runtime is available but has no catalog payload.
            </WorkbenchEmpty>
          )}
        </WorkbenchSection>

        <WorkbenchSection
          actions={<Badge>{Object.keys(ecosystemPayload).length}</Badge>}
          headingLevel={3}
          icon={Boxes}
          title="Runtime snapshot"
        >
          {ecosystem.loading ? (
            <LoadingBlock label="Loading ecosystem snapshot…" />
          ) : ecosystem.error ? (
            <ErrorBlock error={ecosystem.error} retry={ecosystem.reload} />
          ) : (
            <>
              <div className="grid gap-1">
                {Object.entries(ecosystemPayload)
                  .slice(0, 8)
                  .map(([key, value]) => (
                    <DiagnosticStatusRow
                      detail={describeInventoryValue(value)}
                      key={key}
                      title={titleCase(key)}
                    />
                  ))}
              </div>
              <RawDataDisclosure
                label="ElizaOS ecosystem payload"
                value={ecosystem.data}
              />
            </>
          )}
        </WorkbenchSection>

        <WorkbenchSection
          actions={<Badge>{Object.keys(ownershipPayload).length}</Badge>}
          headingLevel={3}
          icon={ShieldCheck}
          title="Ownership insight"
        >
          {insights.loading ? (
            <LoadingBlock label="Loading operator insight…" />
          ) : insights.error ? (
            <ErrorBlock error={insights.error} retry={insights.reload} />
          ) : (
            <>
              <div className="grid gap-1">
                {Object.entries(ownershipPayload)
                  .slice(0, 8)
                  .map(([key, value]) => (
                    <DiagnosticStatusRow
                      detail={describeInventoryValue(value)}
                      key={key}
                      title={titleCase(key)}
                    />
                  ))}
              </div>
              <RawDataDisclosure
                label="Runtime insights payload"
                value={insights.data}
              />
            </>
          )}
        </WorkbenchSection>
      </div>
    </div>
  );
}

function describeInventoryValue(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} entries`;
  if (typeof value === "object" && value) {
    return `${Object.keys(asRecord(value)).length} fields`;
  }
  return String(value);
}
