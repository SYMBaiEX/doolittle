import { generateEffectiveCode } from "@/runtime/native/service-bridge/autocoder";
import type { AgentExecutionContext } from "../../../chat";
import { stringifyCodegenResponse, withAutocoderWorkflow } from "../support";
import { createAutocoderRunRecord } from "./shared";

const CODEGEN_GENERATE_PREFIX = "/codegen generate ";

export async function handleCodegenGenerateCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (!trimmed.startsWith(CODEGEN_GENERATE_PREFIX)) {
    return undefined;
  }

  const payload = trimmed.replace(CODEGEN_GENERATE_PREFIX, "").trim();
  const [namePart, promptPart] = payload.split("::").map((part) => part.trim());
  if (!namePart || !promptPart) {
    return "Usage: /codegen generate <project-name> :: <prompt>";
  }

  const request = {
    projectName: namePart,
    prompt: promptPart,
    objective: promptPart,
  };

  return withAutocoderWorkflow(
    context,
    {
      title: `Generate ${namePart}`,
      objective: promptPart,
      kind: "generate",
      projectName: namePart,
    },
    "system: code generation completed",
    async (workflow) => {
      const generation = await generateEffectiveCode(context.runtime, request);
      const run = createAutocoderRunRecord(context, workflow, {
        kind: "generate",
        projectName: namePart,
        request,
        result: generation,
      });
      return stringifyCodegenResponse({
        workflowId: workflow.workflowId,
        taskId: workflow.taskId,
        run,
        generation,
      });
    },
  );
}
