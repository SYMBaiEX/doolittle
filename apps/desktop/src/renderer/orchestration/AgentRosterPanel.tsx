import {
  asNumber,
  asString,
  Badge,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  type UnknownRecord,
} from "../lib";
import {
  orchestrationStatusTier,
  orchestrationTimingLabel,
  taskCapabilityLabel,
} from "../orchestration-helpers";
import type { WorkerRecord } from "../orchestration-resources";
import {
  DetailRow,
  DetailTag,
  SmallEmpty,
  statusTone,
} from "./detail-primitives";
import type { ResourceState } from "./models";
import { normalizeText } from "./models";

export function AgentRosterPanel({
  workersResource,
  workers,
  workerOverview,
  selectedWorker,
  onSelectWorker,
}: {
  workersResource: ResourceState;
  workers: readonly WorkerRecord[];
  workerOverview: UnknownRecord;
  selectedWorker?: WorkerRecord;
  onSelectWorker: (worker: WorkerRecord) => void;
}) {
  return (
    <div className="orchestration-master-detail">
      <aside className="orchestration-master">
        <div className="orchestration-pane-heading">
          <span>Agent roster</span>
          <small>{workers.length} workers</small>
        </div>
        <div className="orchestration-health-strip">
          <span>
            <strong>{asNumber(workerOverview.activeWorkers)}</strong> active
          </span>
          <span>
            <strong>{asNumber(workerOverview.aliveWorkers)}</strong> alive
          </span>
          <span>
            <strong>{asNumber(workerOverview.stalledWorkers)}</strong> stalled
          </span>
        </div>
        <div className="orchestration-scroll">
          {workersResource.error ? (
            <ErrorBlock
              error={workersResource.error}
              retry={workersResource.reload}
            />
          ) : workersResource.loading ? (
            <LoadingBlock />
          ) : workers.length === 0 ? (
            <EmptyBlock title="No active workers">
              Workers appear as delegated tasks execute.
            </EmptyBlock>
          ) : (
            <ul className="orchestration-master-list">
              {workers.map((worker) => {
                const status = asString(worker.status, "idle");
                const tier = orchestrationStatusTier(status);
                return (
                  <li key={worker.id}>
                    <button
                      type="button"
                      className={
                        worker.id === selectedWorker?.id
                          ? `orchestration-master-item selected tier-${tier}`
                          : `orchestration-master-item tier-${tier}`
                      }
                      aria-pressed={worker.id === selectedWorker?.id}
                      onClick={() => onSelectWorker(worker)}
                    >
                      <span className="master-row master-row-top">
                        <span className="master-title-line">
                          <i className="master-status-dot" aria-hidden="true" />
                          <strong>{asString(worker.title, worker.id)}</strong>
                        </span>
                        <Badge tone={statusTone(status)}>{status}</Badge>
                      </span>
                      <span className="master-summary">
                        {normalizeText(
                          asString(worker.objective, "No objective"),
                          92,
                        )}
                      </span>
                      <span className="master-row master-row-bottom">
                        <small>
                          {orchestrationTimingLabel({
                            status,
                            startedAt: asString(worker.startedAt),
                            completedAt: asString(worker.completedAt),
                          })}
                        </small>
                        <small>
                          {worker.stalled
                            ? "Stalled"
                            : worker.alive
                              ? "Heartbeat ok"
                              : "Offline"}
                        </small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
      <article className="orchestration-detail">
        {!selectedWorker ? (
          <EmptyBlock title="Choose an agent">
            Worker health and evidence appear here.
          </EmptyBlock>
        ) : (
          <AgentDetail selectedWorker={selectedWorker} />
        )}
      </article>
    </div>
  );
}

function AgentDetail({ selectedWorker }: { selectedWorker: WorkerRecord }) {
  const status = asString(selectedWorker.status, "idle");
  const workerMode = asString(
    selectedWorker.workerMode,
    asString(selectedWorker.executionMode, "local"),
  );
  return (
    <>
      <div className="orchestration-detail-header">
        <div>
          <span className="detail-kicker">
            {asString(selectedWorker.group, "ungrouped")} /{" "}
            {taskCapabilityLabel(
              selectedWorker.capabilityProfile,
              selectedWorker.kind,
            )}{" "}
            ·{" "}
            {asString(
              selectedWorker.framework,
              selectedWorker.profile || "automatic",
            )}
          </span>
          <h2>{asString(selectedWorker.title, selectedWorker.id)}</h2>
          <p>{asString(selectedWorker.objective, "No objective reported.")}</p>
        </div>
        <Badge tone={statusTone(status)}>{status}</Badge>
      </div>
      <div className="orchestration-detail-tags">
        <DetailTag tone={statusTone(status)}>
          {orchestrationTimingLabel({
            status,
            startedAt: asString(selectedWorker.startedAt),
            completedAt: asString(selectedWorker.completedAt),
          })}
        </DetailTag>
        <DetailTag>{workerMode}</DetailTag>
        <DetailTag tone={selectedWorker.alive ? "good" : "bad"}>
          {selectedWorker.alive ? "worker alive" : "worker offline"}
        </DetailTag>
        <DetailTag tone={selectedWorker.stalled ? "bad" : "good"}>
          {selectedWorker.stalled ? "stalled" : "progressing"}
        </DetailTag>
      </div>
      <div className="orchestration-detail-grid">
        <dl>
          <DetailRow label="Worker ID" value={selectedWorker.id} />
          <DetailRow
            label="Capability"
            value={taskCapabilityLabel(
              selectedWorker.capabilityProfile,
              selectedWorker.kind,
            )}
          />
          <DetailRow
            label="Framework"
            value={asString(selectedWorker.framework, "automatic")}
          />
          <DetailRow
            label="Account provider"
            value={asString(selectedWorker.accountProviderId, "automatic")}
          />
          <DetailRow
            label="Account"
            value={asString(
              selectedWorker.accountLabel,
              asString(selectedWorker.accountId, "automatic"),
            )}
          />
          <DetailRow
            label="Session"
            value={asString(selectedWorker.sessionId, "not assigned")}
          />
          <DetailRow label="PID" value={selectedWorker.workerPid} />
          <DetailRow label="Mode" value={workerMode} />
          <DetailRow
            label="Attempts"
            value={asNumber(selectedWorker.attempts)}
          />
          <DetailRow
            label="Remaining"
            value={asNumber(selectedWorker.attemptsRemaining)}
          />
          <DetailRow label="Parent task" value={selectedWorker.parentTaskId} />
        </dl>
        <div className="orchestration-evidence">
          <span className="detail-kicker">Runtime health</span>
          <div className="orchestration-signal-grid">
            <span className={selectedWorker.alive ? "good" : "bad"}>
              {selectedWorker.alive ? "Alive" : "Not alive"}
            </span>
            <span className={selectedWorker.stalled ? "bad" : "good"}>
              {selectedWorker.stalled ? "Stalled" : "Progressing"}
            </span>
          </div>
          <span className="detail-kicker">Latest artifact</span>
          {selectedWorker.lastOutputPath ? (
            <code>{selectedWorker.lastOutputPath}</code>
          ) : (
            <SmallEmpty>No artifact path reported.</SmallEmpty>
          )}
        </div>
      </div>
    </>
  );
}
