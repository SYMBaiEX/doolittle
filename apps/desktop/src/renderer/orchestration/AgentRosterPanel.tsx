import { Bot } from "lucide-react";
import {
  asNumber,
  asString,
  Badge,
  ErrorBlock,
  LoadingBlock,
  type UnknownRecord,
} from "../lib";
import {
  orchestrationTimingLabel,
  taskCapabilityLabel,
} from "../orchestration-helpers";
import type { WorkerRecord } from "../orchestration-resources";
import { statusTier, type WorkTier } from "../work-surface/status";
import {
  DetailFacts,
  DetailHeader,
  FactRow,
  WorkCard,
  WorkCards,
  WorkDetail,
  WorkDisclosure,
  WorkEmpty,
  WorkList,
  WorkRail,
  WorkRow,
  WorkSplit,
  WorkSurface,
  WorkTag,
} from "../work-surface/WorkSurface";
import type { ResourceState } from "./models";

function workerTier(worker: WorkerRecord, status: string): WorkTier {
  return worker.stalled ? "attention" : statusTier(status);
}

function tagTone(tier: WorkTier): "good" | "warn" | "bad" | "neutral" {
  if (tier === "done") return "good";
  if (tier === "attention") return "warn";
  if (tier === "failed") return "bad";
  return "neutral";
}

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
    <WorkSurface className="agents-monitor">
      <WorkSplit>
        <WorkRail
          heading="Worker roster"
          meta={`${asNumber(workerOverview.activeWorkers)} active · ${asNumber(
            workerOverview.aliveWorkers,
          )} alive · ${asNumber(workerOverview.stalledWorkers)} stalled`}
        >
          {workersResource.error ? (
            <ErrorBlock
              error={workersResource.error}
              retry={workersResource.reload}
            />
          ) : workersResource.loading ? (
            <LoadingBlock />
          ) : workers.length === 0 ? (
            <WorkEmpty icon={Bot} title="No active workers">
              Workers appear as delegated tasks execute.
            </WorkEmpty>
          ) : (
            <WorkList>
              {workers.map((worker) => {
                const status = asString(worker.status, "idle");
                return (
                  <WorkRow
                    key={worker.id}
                    label={asString(worker.title, worker.id)}
                    meta={[
                      taskCapabilityLabel(
                        worker.capabilityProfile,
                        worker.kind,
                      ),
                      worker.stalled
                        ? "stalled"
                        : worker.alive
                          ? "heartbeat ok"
                          : "offline",
                    ]}
                    onSelect={() => onSelectWorker(worker)}
                    selected={worker.id === selectedWorker?.id}
                    status={status}
                    time={orchestrationTimingLabel({
                      status,
                      startedAt: asString(worker.startedAt),
                      completedAt: asString(worker.completedAt),
                    })}
                    title={asString(worker.title, worker.id)}
                    tone={workerTier(worker, status)}
                  />
                );
              })}
            </WorkList>
          )}
        </WorkRail>
        <WorkDetail>
          {!selectedWorker ? (
            <WorkEmpty icon={Bot} title="Choose a worker">
              Worker health and evidence appear here.
            </WorkEmpty>
          ) : (
            <AgentDetail selectedWorker={selectedWorker} />
          )}
        </WorkDetail>
      </WorkSplit>
    </WorkSurface>
  );
}

function AgentDetail({ selectedWorker }: { selectedWorker: WorkerRecord }) {
  const status = asString(selectedWorker.status, "idle");
  const tier = workerTier(selectedWorker, status);
  const workerMode = asString(
    selectedWorker.workerMode,
    asString(selectedWorker.executionMode, "local"),
  );
  const capability = taskCapabilityLabel(
    selectedWorker.capabilityProfile,
    selectedWorker.kind,
  );
  return (
    <>
      <DetailHeader
        kicker={`${asString(selectedWorker.group, "ungrouped")} / ${capability} · ${asString(
          selectedWorker.framework,
          selectedWorker.profile || "automatic",
        )}`}
        objective={asString(selectedWorker.objective, "No objective reported.")}
        status={<Badge tone={tagTone(tier)}>{status}</Badge>}
        tags={
          <>
            <WorkTag tone={tagTone(tier)}>
              {orchestrationTimingLabel({
                status,
                startedAt: asString(selectedWorker.startedAt),
                completedAt: asString(selectedWorker.completedAt),
              })}
            </WorkTag>
            <WorkTag>{workerMode}</WorkTag>
            <WorkTag tone={selectedWorker.alive ? "good" : "bad"}>
              {selectedWorker.alive ? "worker alive" : "worker offline"}
            </WorkTag>
            <WorkTag tone={selectedWorker.stalled ? "bad" : "good"}>
              {selectedWorker.stalled ? "stalled" : "progressing"}
            </WorkTag>
          </>
        }
        title={asString(selectedWorker.title, selectedWorker.id)}
      />
      <WorkCards>
        <WorkCard kicker="Runtime health">
          <DetailFacts>
            <FactRow label="Heartbeat">
              {selectedWorker.alive ? "Alive" : "Not alive"}
            </FactRow>
            <FactRow label="Progress">
              {selectedWorker.stalled ? "Stalled" : "Progressing"}
            </FactRow>
            <FactRow label="Notes">
              {asNumber(selectedWorker.notesCount)}
            </FactRow>
          </DetailFacts>
        </WorkCard>
        <WorkCard kicker="Latest artifact">
          {selectedWorker.lastOutputPath ? (
            <code>{selectedWorker.lastOutputPath}</code>
          ) : (
            <p className="ws-empty-line">No artifact path reported.</p>
          )}
        </WorkCard>
      </WorkCards>
      <WorkDisclosure
        aside={
          selectedWorker.workerPid
            ? `PID ${selectedWorker.workerPid}`
            : "no PID"
        }
        detail="IDs, session, account, and process details"
        summary="Worker diagnostics"
      >
        <DetailFacts>
          <FactRow label="Worker ID">{selectedWorker.id}</FactRow>
          <FactRow label="Capability">{capability}</FactRow>
          <FactRow label="Framework">
            {asString(selectedWorker.framework, "automatic")}
          </FactRow>
          <FactRow label="Account provider">
            {asString(selectedWorker.accountProviderId, "automatic")}
          </FactRow>
          <FactRow label="Account">
            {asString(
              selectedWorker.accountLabel,
              asString(selectedWorker.accountId, "automatic"),
            )}
          </FactRow>
          <FactRow label="Session">
            {asString(selectedWorker.sessionId, "not assigned")}
          </FactRow>
          <FactRow label="PID">{selectedWorker.workerPid}</FactRow>
          <FactRow label="Mode">{workerMode}</FactRow>
          <FactRow label="Attempts">
            {asNumber(selectedWorker.attempts)}
          </FactRow>
          <FactRow label="Remaining">
            {asNumber(selectedWorker.attemptsRemaining)}
          </FactRow>
          <FactRow label="Parent task">{selectedWorker.parentTaskId}</FactRow>
        </DetailFacts>
      </WorkDisclosure>
    </>
  );
}
