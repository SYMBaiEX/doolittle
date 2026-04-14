import {
  generateEffectivePrd,
  performEffectiveCodeResearch,
} from "@/runtime/native/service-bridge/autocoder";
import type { AgentExecutionContext } from "../../../chat";
import { CODEGEN_PRD_USAGE, parseCodegenDescriptor } from "../parsers";
import { stringifyCodegenResponse, withAutocoderWorkflow } from "../support";
import { createAutocoderRunRecord } from "./shared";

const CODEGEN_PRD_PREFIX = "/codegen prd ";

export async function handleCodegenPrdCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (!trimmed.startsWith(CODEGEN_PRD_PREFIX)) {
    return undefined;
  }

  const parsed = parseCodegenDescriptor(
    trimmed.replace(CODEGEN_PRD_PREFIX, "").trim(),
  );
  if (!parsed) {
    return CODEGEN_PRD_USAGE;
  }

  const request = {
    projectName: parsed.projectName,
    targetType: parsed.targetType,
    description: parsed.description,
    apis: parsed.apis,
    requirements: parsed.requirements,
  };

  return withAutocoderWorkflow(
    context,
    {
      title: `PRD ${parsed.projectName}`,
      objective: parsed.description,
      kind: "prd",
      projectName: parsed.projectName,
    },
    "system: PRD workflow completed",
    async (workflow) => {
      const research = await performEffectiveCodeResearch(
        context.runtime,
        request,
      );
      const researchRun = createAutocoderRunRecord(context, workflow, {
        kind: "research",
        projectName: parsed.projectName,
        request,
        result: research,
      });
      const prd = await generateEffectivePrd(
        context.runtime,
        request,
        research as Record<string, unknown>,
      );
      const prdRun = createAutocoderRunRecord(context, workflow, {
        kind: "prd",
        projectName: parsed.projectName,
        request,
        result: prd,
        linkedRunIds: [researchRun.id],
        parentRunId: researchRun.id,
      });
      return stringifyCodegenResponse({
        workflowId: workflow.workflowId,
        taskId: workflow.taskId,
        researchRun,
        prdRun,
        research,
        prd,
      });
    },
  );
}
