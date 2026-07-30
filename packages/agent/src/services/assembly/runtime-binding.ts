import type { IAgentRuntime } from "@elizaos/core";
import type { DelegationService } from "../delegation/service";
import type { DiagnosticsService } from "../diagnostics/service";
import type { DocumentsService } from "../documents-service";
import type { ExecutionApprovalService } from "../execution-approval/service";
import type { LazySlot } from "../lazy-slot";
import type { OperatorService } from "../operator/service";
import type { SkillsService } from "../skills/service";

export interface RuntimeBindingDependencies {
  executionApprovals: Pick<ExecutionApprovalService, "bindRuntime">;
  delegation: Pick<DelegationService, "bindRuntime">;
  documents: LazySlot<DocumentsService>;
  diagnostics: LazySlot<DiagnosticsService>;
  operator: LazySlot<OperatorService>;
  skills: LazySlot<SkillsService>;
  createDocumentsService(nextRuntime: IAgentRuntime): DocumentsService;
  setBoundRuntime?(nextRuntime: IAgentRuntime): void;
}

export function createRuntimeBinder(
  dependencies: RuntimeBindingDependencies,
): (nextRuntime: IAgentRuntime) => void {
  return (nextRuntime: IAgentRuntime) => {
    dependencies.setBoundRuntime?.(nextRuntime);
    dependencies.delegation.bindRuntime(nextRuntime);
    dependencies.executionApprovals.bindRuntime(nextRuntime);
    dependencies.skills.get().bindRuntime(nextRuntime);
    if (dependencies.documents.peek()) {
      dependencies.documents.set(
        dependencies.createDocumentsService(nextRuntime),
      );
    }
    dependencies.diagnostics.peek()?.attachRuntime(nextRuntime);
    dependencies.operator.peek()?.attachRuntime(nextRuntime);
  };
}
