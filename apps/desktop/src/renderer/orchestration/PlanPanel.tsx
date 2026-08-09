import type { FormEvent } from "react";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from "../lib";
import {
  orchestrationStatusTier,
  orchestrationTimingLabel,
} from "../orchestration-helpers";
import type {
  DelegationTaskRecord,
  PlanRecord,
} from "../orchestration-resources";
import {
  DetailRow,
  DetailTag,
  SmallEmpty,
  statusTone,
} from "./detail-primitives";
import type { ResourceState } from "./models";
import { compactDetailValue, normalizeText } from "./models";

export function PlanPanel({
  active,
  plansResource,
  plans,
  selectedPlan,
  linkedPlanTask,
  planCanSteer,
  planMetaLines,
  busyKeys,
  planSteerInstruction,
  onSelectPlan,
  onApprovePlan,
  onSteerPlan,
  onPlanSteerInstructionChange,
}: {
  active: boolean;
  plansResource: ResourceState;
  plans: readonly PlanRecord[];
  selectedPlan?: PlanRecord;
  linkedPlanTask?: DelegationTaskRecord;
  planCanSteer: boolean;
  planMetaLines: readonly string[];
  busyKeys: Readonly<Record<string, boolean>>;
  planSteerInstruction: string;
  onSelectPlan: (plan: PlanRecord) => void;
  onApprovePlan: (plan: PlanRecord) => void | Promise<void>;
  onSteerPlan: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onPlanSteerInstructionChange: (value: string) => void;
}) {
  return (
    <div className="orchestration-master-detail">
      <aside className="orchestration-master">
        <div className="orchestration-pane-heading">
          <span>Plans</span>
          <small>{plans.length} records</small>
        </div>
        <div className="orchestration-scroll">
          {plansResource.error ? (
            <ErrorBlock
              error={plansResource.error}
              retry={plansResource.reload}
            />
          ) : plansResource.loading ? (
            <LoadingBlock />
          ) : plans.length === 0 ? (
            <EmptyBlock title="No plans yet">
              Create a plan to connect tasks and workflows.
            </EmptyBlock>
          ) : (
            <ul className="orchestration-master-list">
              {plans.map((plan) => {
                const status = asString(plan.status, "draft");
                const tier = orchestrationStatusTier(status);
                const stepCount = asArray(plan.steps).length;
                return (
                  <li key={plan.id}>
                    <button
                      type="button"
                      className={
                        plan.id === selectedPlan?.id
                          ? `orchestration-master-item selected tier-${tier}`
                          : `orchestration-master-item tier-${tier}`
                      }
                      aria-pressed={plan.id === selectedPlan?.id}
                      onClick={() => onSelectPlan(plan)}
                    >
                      <span className="master-row master-row-top">
                        <span className="master-title-line">
                          <i className="master-status-dot" aria-hidden="true" />
                          <strong>
                            {asString(plan.title, "Untitled plan")}
                          </strong>
                        </span>
                        <Badge tone={statusTone(status)}>{status}</Badge>
                      </span>
                      <span className="master-summary">
                        {normalizeText(asString(plan.objective), 92)}
                      </span>
                      <span className="master-row master-row-bottom">
                        <small>
                          {orchestrationTimingLabel({
                            status,
                            updatedAt: asString(plan.updatedAt),
                            createdAt: asString(plan.createdAt),
                          })}
                        </small>
                        <small>
                          {stepCount} step{stepCount === 1 ? "" : "s"}
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
        {!selectedPlan ? (
          <EmptyBlock title="Choose a plan">
            Plan links and steps appear here.
          </EmptyBlock>
        ) : (
          <PlanDetail
            active={active}
            busyKeys={busyKeys}
            linkedPlanTask={linkedPlanTask}
            onApprovePlan={onApprovePlan}
            onPlanSteerInstructionChange={onPlanSteerInstructionChange}
            onSteerPlan={onSteerPlan}
            planCanSteer={planCanSteer}
            planMetaLines={planMetaLines}
            planSteerInstruction={planSteerInstruction}
            selectedPlan={selectedPlan}
          />
        )}
      </article>
    </div>
  );
}

function PlanDetail({
  active,
  busyKeys,
  linkedPlanTask,
  onApprovePlan,
  onPlanSteerInstructionChange,
  onSteerPlan,
  planCanSteer,
  planMetaLines,
  planSteerInstruction,
  selectedPlan,
}: {
  active: boolean;
  busyKeys: Readonly<Record<string, boolean>>;
  linkedPlanTask?: DelegationTaskRecord;
  onApprovePlan: (plan: PlanRecord) => void | Promise<void>;
  onPlanSteerInstructionChange: (value: string) => void;
  onSteerPlan: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  planCanSteer: boolean;
  planMetaLines: readonly string[];
  planSteerInstruction: string;
  selectedPlan: PlanRecord;
}) {
  const status = asString(selectedPlan.status, "draft");
  return (
    <>
      <div className="orchestration-detail-header">
        <div>
          <span className="detail-kicker">Execution plan</span>
          <h2>{asString(selectedPlan.title, "Untitled plan")}</h2>
          <p>{asString(selectedPlan.objective)}</p>
        </div>
        <Badge tone={statusTone(status)}>{status}</Badge>
      </div>
      <div className="orchestration-detail-tags">
        <DetailTag tone={statusTone(status)}>
          {orchestrationTimingLabel({
            status,
            updatedAt: asString(selectedPlan.updatedAt),
            createdAt: asString(selectedPlan.createdAt),
          })}
        </DetailTag>
        <DetailTag>
          {selectedPlan.taskId ? "task linked" : "task unlinked"}
        </DetailTag>
        <DetailTag>
          {selectedPlan.workflowId ? "workflow linked" : "workflow unlinked"}
        </DetailTag>
        <DetailTag>{asArray(selectedPlan.steps).length} steps</DetailTag>
      </div>
      {status === "draft" ? (
        <div className="orchestration-plan-control">
          <div>
            <strong>Ready for operator review</strong>
            <span>
              Approval activates this plan but never starts its linked task
              automatically.
            </span>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => void onApprovePlan(selectedPlan)}
            disabled={!active || busyKeys[`plan:${selectedPlan.id}:approve`]}
          >
            {busyKeys[`plan:${selectedPlan.id}:approve`]
              ? "Approving…"
              : "Approve plan"}
          </button>
        </div>
      ) : null}
      {status === "active" ? (
        <form className="orchestration-plan-steer" onSubmit={onSteerPlan}>
          <div>
            <strong>Steer the next run</strong>
            <span>
              {planCanSteer
                ? "This instruction is added to the linked pending task and applies on its next execution or retry."
                : selectedPlan.taskId
                  ? `Steering is available only while the linked local task is pending. Current state: ${asString(
                      linkedPlanTask?.status,
                      linkedPlanTask ? "unknown" : "not local",
                    )}.`
                  : "Link this plan to a local pending task before adding operator steering."}
            </span>
          </div>
          <label>
            <span className="sr-only">Instruction for the linked task</span>
            <textarea
              maxLength={4000}
              rows={2}
              value={planSteerInstruction}
              onChange={(event) =>
                onPlanSteerInstructionChange(event.target.value)
              }
              placeholder="Change scope, constraints, or acceptance checks…"
              disabled={
                !active ||
                !planCanSteer ||
                busyKeys[`plan:${selectedPlan.id}:steer`]
              }
            />
          </label>
          <button
            className="secondary-button"
            type="submit"
            disabled={
              !active ||
              !planCanSteer ||
              !planSteerInstruction.trim() ||
              busyKeys[`plan:${selectedPlan.id}:steer`]
            }
          >
            {busyKeys[`plan:${selectedPlan.id}:steer`]
              ? "Recording…"
              : "Add steering"}
          </button>
        </form>
      ) : null}
      <div className="orchestration-detail-grid">
        <dl>
          <DetailRow label="Plan ID" value={selectedPlan.id} />
          <DetailRow
            label="Task"
            value={asString(selectedPlan.taskId, "not linked")}
          />
          <DetailRow
            label="Workflow"
            value={asString(selectedPlan.workflowId, "not linked")}
          />
          <DetailRow
            label="Created"
            value={displayTimestamp(asString(selectedPlan.createdAt))}
          />
          <DetailRow
            label="Updated"
            value={displayTimestamp(asString(selectedPlan.updatedAt))}
          />
        </dl>
        <div className="orchestration-evidence">
          <span className="detail-kicker">Steps</span>
          {asArray(selectedPlan.steps).length > 0 ? (
            <ol className="orchestration-steps">
              {asArray(selectedPlan.steps).map((step) => (
                <li key={`${selectedPlan.id}:step:${asString(step)}`}>
                  {asString(step)}
                </li>
              ))}
            </ol>
          ) : (
            <SmallEmpty>No steps recorded.</SmallEmpty>
          )}
          <span className="detail-kicker">Metadata</span>
          {Object.keys(asRecord(selectedPlan.metadata)).length > 0 ? (
            <dl className="orchestration-mini-dl">
              {Object.entries(asRecord(selectedPlan.metadata)).map(
                ([key, value]) => (
                  <DetailRow
                    key={`${selectedPlan.id}:${key}`}
                    label={key}
                    value={compactDetailValue(value)}
                  />
                ),
              )}
            </dl>
          ) : (
            <SmallEmpty>No plan metadata.</SmallEmpty>
          )}
        </div>
      </div>
      {planMetaLines.length > 0 ? (
        <div className="orchestration-control-footnote">
          <strong>Control plane</strong>
          <span>{planMetaLines.join(" · ")}</span>
        </div>
      ) : null}
    </>
  );
}
