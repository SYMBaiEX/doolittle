import { performEffectiveCodeResearch } from "@/runtime/native/service-bridge/autocoder";
import type { AgentExecutionContext } from "../../../chat";
import { CODEGEN_RESEARCH_USAGE, parseCodegenDescriptor } from "../parsers";
import { stringifyCodegenResponse, withAutocoderWorkflow } from "../support";
import { createAutocoderRunRecord } from "./shared";

const CODEGEN_RESEARCH_PREFIX = "/codegen research ";

export async function handleCodegenResearchCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (!trimmed.startsWith(CODEGEN_RESEARCH_PREFIX)) {
    return undefined;
  }

  const parsed = parseCodegenDescriptor(
    trimmed.replace(CODEGEN_RESEARCH_PREFIX, "").trim(),
  );
  if (!parsed) {
    return CODEGEN_RESEARCH_USAGE;
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
      title: `Research ${parsed.projectName}`,
      objective: parsed.description,
      kind: "research",
      projectName: parsed.projectName,
    },
    "system: research completed",
    async (workflow) => {
      const research = await performEffectiveCodeResearch(
        context.runtime,
        request,
      );
      const run = createAutocoderRunRecord(context, workflow, {
        kind: "research",
        projectName: parsed.projectName,
        request,
        result: research,
      });
      return stringifyCodegenResponse({
        workflowId: workflow.workflowId,
        taskId: workflow.taskId,
        run,
        research,
      });
    },
  );
}
