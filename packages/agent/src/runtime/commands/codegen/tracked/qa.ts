import { performEffectiveCodeQa } from "@/runtime/native/service-bridge/autocoder";
import type { AgentExecutionContext } from "../../../chat";
import { stringifyCodegenResponse, withAutocoderWorkflow } from "../support";
import { createAutocoderRunRecord } from "./shared";

const CODEGEN_QA_PREFIX = "/codegen qa ";

export async function handleCodegenQaCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (!trimmed.startsWith(CODEGEN_QA_PREFIX)) {
    return undefined;
  }

  const projectPath = trimmed.replace(CODEGEN_QA_PREFIX, "").trim();
  if (!projectPath) {
    return "Usage: /codegen qa <project-path>";
  }

  const projectName = projectPath.split("/").filter(Boolean).at(-1);
  return withAutocoderWorkflow(
    context,
    {
      title: `QA ${projectName ?? "project"}`,
      objective: `QA ${projectPath}`,
      kind: "qa",
      projectName,
    },
    "system: QA completed",
    async (workflow) => {
      const qa = await performEffectiveCodeQa(context.runtime, projectPath);
      const run = createAutocoderRunRecord(context, workflow, {
        kind: "qa",
        projectName,
        request: { projectPath },
        result: qa,
      });
      return stringifyCodegenResponse({
        workflowId: workflow.workflowId,
        taskId: workflow.taskId,
        run,
        qa,
      });
    },
  );
}
