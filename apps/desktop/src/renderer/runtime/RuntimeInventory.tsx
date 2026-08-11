import type { PluginsResponse } from "../../shared/contracts";
import {
  type ApiResource,
  asArray,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  RawDataDisclosure,
  titleCase,
  type UnknownRecord,
} from "../lib";

export function RuntimeInventory({
  ecosystem,
  insights,
  plugins,
}: {
  ecosystem: ApiResource<UnknownRecord>;
  insights: ApiResource<UnknownRecord>;
  plugins: ApiResource<PluginsResponse>;
}) {
  const catalog = asArray(plugins.data?.catalog).map(asRecord);
  const ecosystemPayload = asRecord(ecosystem.data);
  const insightPayload = asRecord(insights.data);
  const ownershipPayload = asRecord(insightPayload.ownership);

  return (
    <div className="runtime-section-stack">
      <div className="runtime-metrics runtime-metrics--three">
        <MetricCard label="Plugins" value={catalog.length} />
        <MetricCard
          label="Ecosystem fields"
          value={Object.keys(ecosystemPayload).length}
        />
        <MetricCard
          label="Ownership signals"
          value={Object.keys(ownershipPayload).length}
        />
      </div>

      <div className="runtime-inventory-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Plugins</span>
              <h2>Capability catalog</h2>
            </div>
            <Badge>{catalog.length}</Badge>
          </div>
          {plugins.loading ? (
            <LoadingBlock label="Loading plugin catalog…" />
          ) : plugins.error ? (
            <ErrorBlock error={plugins.error} retry={plugins.reload} />
          ) : catalog.length ? (
            <div className="runtime-compact-list">
              {catalog.slice(0, 12).map((entry, index) => (
                <div
                  className="status-row"
                  key={asString(entry.id, String(index))}
                >
                  <div>
                    <strong>
                      {asString(entry.name, asString(entry.id, "Plugin"))}
                    </strong>
                    <small>{asString(entry.id, "No id")}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock title="No plugin entries">
              Runtime is available but has no catalog payload.
            </EmptyBlock>
          )}
        </section>

        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Ecosystem</span>
              <h2>Runtime snapshot</h2>
            </div>
            <Badge>{Object.keys(ecosystemPayload).length}</Badge>
          </div>
          {ecosystem.loading ? (
            <LoadingBlock label="Loading ecosystem snapshot…" />
          ) : ecosystem.error ? (
            <ErrorBlock error={ecosystem.error} retry={ecosystem.reload} />
          ) : (
            <>
              <div className="runtime-compact-list">
                {Object.entries(ecosystemPayload)
                  .slice(0, 8)
                  .map(([key, value]) => (
                    <div className="status-row" key={key}>
                      <div>
                        <strong>{titleCase(key)}</strong>
                        <small>{describeInventoryValue(value)}</small>
                      </div>
                    </div>
                  ))}
              </div>
              <RawDataDisclosure
                label="ElizaOS ecosystem payload"
                value={ecosystem.data}
              />
            </>
          )}
        </section>

        <section className="content-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Operator</span>
              <h2>Ownership insight</h2>
            </div>
            <Badge>{Object.keys(ownershipPayload).length}</Badge>
          </div>
          {insights.loading ? (
            <LoadingBlock label="Loading operator insight…" />
          ) : insights.error ? (
            <ErrorBlock error={insights.error} retry={insights.reload} />
          ) : (
            <>
              <div className="runtime-compact-list">
                {Object.entries(ownershipPayload)
                  .slice(0, 8)
                  .map(([key, value]) => (
                    <div className="status-row" key={key}>
                      <div>
                        <strong>{titleCase(key)}</strong>
                        <small>{describeInventoryValue(value)}</small>
                      </div>
                    </div>
                  ))}
              </div>
              <RawDataDisclosure
                label="Runtime insights payload"
                value={insights.data}
              />
            </>
          )}
        </section>
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
