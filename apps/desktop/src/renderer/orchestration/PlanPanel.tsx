import { ContextActionMenu } from "@doolittle/ui";
import { ClipboardList, Inbox, ListChecks, SearchX } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import { copyContextText } from "../context-menu-clipboard";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  displayTimestamp,
  ErrorBlock,
  LoadingBlock,
  titleCase,
} from "../lib";
import { orchestrationTimingLabel } from "../orchestration-helpers";
import type {
  DelegationTaskRecord,
  PlanRecord,
} from "../orchestration-resources";
import { statusTier, type WorkTier } from "../work-surface/status";
import {
  DetailFacts,
  DetailHeader,
  FactRow,
  WorkCard,
  WorkCards,
  WorkDetail,
  WorkDisclosure,
  WorkList,
  WorkRail,
  WorkRow,
  WorkSplit,
  WorkTag,
} from "../work-surface/WorkSurface";
import { orchestrationClass as oc } from "./layout";
import type { ResourceState } from "./models";
import { compactDetailValue, normalizeText } from "./models";

function tagTone(tier: WorkTier): "good" | "warn" | "bad" | "neutral" {
  if (tier === "done") return "good";
  if (tier === "attention") return "warn";
  if (tier === "failed") return "bad";
  return "neutral";
}

function searchablePlanText(plan: PlanRecord): string {
  return [plan.title, plan.objective, plan.status]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase();
}

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
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const filter = query.trim().toLocaleLowerCase();
  const filteredPlans = filter
    ? plans.filter((plan) => searchablePlanText(plan).includes(filter))
    : plans;

  if (plansResource.error) {
    return (
      <ErrorBlock error={plansResource.error} retry={plansResource.reload} />
    );
  }
  if (plansResource.loading && plans.length === 0) {
    return <LoadingBlock label="Loading plans…" />;
  }
  if (plans.length === 0) {
    return (
      <WorkbenchSection title="Plans" icon={ListChecks}>
        <WorkbenchEmpty icon={Inbox} title="No plans yet">
          Create a plan to connect tasks and workflows.
        </WorkbenchEmpty>
      </WorkbenchSection>
    );
  }

  return (
    <WorkSplit>
      <WorkRail
        heading="Plans"
        meta={`${plans.length} records`}
        controls={
          <label>
            <span className="sr-only">Search plans</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter plans"
              ref={search}
              type="search"
              value={query}
            />
          </label>
        }
      >
        {filteredPlans.length === 0 ? (
          <WorkbenchEmpty
            actions={
              <WorkbenchAction
                onClick={() => {
                  search.current?.focus();
                  setQuery("");
                }}
              >
                Clear filters
              </WorkbenchAction>
            }
            icon={SearchX}
            title="No matching plans"
          >
            Change the search to see other plans.
          </WorkbenchEmpty>
        ) : (
          <WorkList>
            {filteredPlans.map((plan) => {
              const status = asString(plan.status, "draft");
              const stepCount = asArray(plan.steps).length;
              const summary = normalizeText(asString(plan.objective), 92);
              const title = asString(plan.title, "Untitled plan");
              return (
                <WorkRow
                  key={plan.id}
                  label={title}
                  meta={[
                    ...(summary ? [summary] : []),
                    `${stepCount} step${stepCount === 1 ? "" : "s"}`,
                  ]}
                  onSelect={() => onSelectPlan(plan)}
                  selected={plan.id === selectedPlan?.id}
                  status={titleCase(status)}
                  time={orchestrationTimingLabel({
                    status,
                    updatedAt: asString(plan.updatedAt),
                    createdAt: asString(plan.createdAt),
                  })}
                  title={title}
                  tone={statusTier(status)}
                />
              );
            })}
          </WorkList>
        )}
      </WorkRail>

      <WorkDetail>
        {!selectedPlan ? (
          <WorkbenchEmpty icon={ClipboardList} title="Choose a plan">
            Plan links and steps appear here.
          </WorkbenchEmpty>
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
      </WorkDetail>
    </WorkSplit>
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
  const tier = statusTier(status);
  const steps = asArray(selectedPlan.steps);
  const metadata = asRecord(selectedPlan.metadata);
  return (
    <ContextActionMenu
      label="Plan actions"
      scopeKey={`plan:${selectedPlan.id}:${status}`}
      items={[
        ...(status === "draft"
          ? [
              {
                id: "approve",
                label: "Approve plan",
                disabled:
                  !active || busyKeys[`plan:${selectedPlan.id}:approve`],
                onSelect: () => void onApprovePlan(selectedPlan),
              },
            ]
          : []),
        {
          id: "copy-id",
          label: "Copy plan ID",
          onSelect: () => void copyContextText(selectedPlan.id),
        },
      ]}
    >
      <DetailHeader
        kicker="Execution plan"
        objective={asString(selectedPlan.objective)}
        status={<Badge tone={tagTone(tier)}>{titleCase(status)}</Badge>}
        tags={
          <>
            <WorkTag tone={tagTone(tier)}>
              {orchestrationTimingLabel({
                status,
                updatedAt: asString(selectedPlan.updatedAt),
                createdAt: asString(selectedPlan.createdAt),
              })}
            </WorkTag>
            <WorkTag>
              {selectedPlan.taskId ? "task linked" : "task unlinked"}
            </WorkTag>
            <WorkTag>
              {selectedPlan.workflowId
                ? "workflow linked"
                : "workflow unlinked"}
            </WorkTag>
            <WorkTag>
              {steps.length} step{steps.length === 1 ? "" : "s"}
            </WorkTag>
          </>
        }
        title={asString(selectedPlan.title, "Untitled plan")}
      />
      {status === "draft" ? (
        <div className={oc("orchestration-plan-control")}>
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
        <form className={oc("orchestration-plan-steer")} onSubmit={onSteerPlan}>
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
      <WorkCards>
        <WorkCard kicker="Steps">
          {steps.length > 0 ? (
            <ol className={oc("orchestration-steps")}>
              {steps.map((step) => (
                <li key={`${selectedPlan.id}:step:${asString(step)}`}>
                  {asString(step)}
                </li>
              ))}
            </ol>
          ) : (
            <p className="ws-empty-line">No steps recorded.</p>
          )}
        </WorkCard>
        <WorkCard kicker="Metadata">
          {Object.keys(metadata).length > 0 ? (
            <DetailFacts>
              {Object.entries(metadata).map(([key, value]) => (
                <FactRow key={`${selectedPlan.id}:${key}`} label={key}>
                  {compactDetailValue(value)}
                </FactRow>
              ))}
            </DetailFacts>
          ) : (
            <p className="ws-empty-line">No plan metadata.</p>
          )}
        </WorkCard>
      </WorkCards>
      <WorkDisclosure
        detail="IDs, links, and timestamp diagnostics"
        summary="Plan details"
      >
        <DetailFacts>
          <FactRow label="Plan ID">{selectedPlan.id}</FactRow>
          <FactRow label="Task">
            {asString(selectedPlan.taskId, "not linked")}
          </FactRow>
          <FactRow label="Workflow">
            {asString(selectedPlan.workflowId, "not linked")}
          </FactRow>
          <FactRow label="Created">
            {displayTimestamp(asString(selectedPlan.createdAt))}
          </FactRow>
          <FactRow label="Updated">
            {displayTimestamp(asString(selectedPlan.updatedAt))}
          </FactRow>
        </DetailFacts>
      </WorkDisclosure>
      {planMetaLines.length > 0 ? (
        <WorkDisclosure
          detail="Planner capability flags reported by the runtime"
          summary="Control plane"
        >
          <p className="ws-empty-line">{planMetaLines.join(" · ")}</p>
        </WorkDisclosure>
      ) : null}
    </ContextActionMenu>
  );
}
